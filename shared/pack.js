// Runtime side of city packs (docs/city-pack-spec.md): text templates and conditions.
// Pure functions over a *compiled* pack, usable by both client and server.
import { LEVELS, levelFor, professionById } from './data.js';

const TAG = /\{\{\s*([^{}]+?)\s*\}\}/g;
export const HELPERS = ['money', 'list', 'rotate', 'price_list'];

// Every {{…}} in a text, split into helper and argument. Used by the compiler to check them.
export function templateTags(text) {
  return [...String(text).matchAll(TAG)].map(m => {
    const parts = m[1].split(/\s+/);
    const helper = HELPERS.includes(parts[0]) ? parts.shift() : null;
    return { raw: m[0], helper, arg: parts[0] || null, extra: parts.length > 1 };
  });
}

const dig = (obj, keys) => keys.reduce((v, k) => (v == null ? undefined : v[k]), obj);

// `place.hotel.name` reads a named place; `place.name` reads the mission's own place.
function lookup(scope, path, places) {
  const [root, ...rest] = path.split('.');
  if (root === 'place' && rest.length && places[rest[0]]) return dig(places[rest[0]], rest.slice(1));
  return dig(scope[root], rest);
}

export function money(pack, n) {
  const v = Number(n);
  return pack.currency.symbol + (Number.isInteger(v) ? v : v.toFixed(2));
}

export function priceList(pack, place) {
  const items = Object.entries({ ...place?.sells, ...place?.services });
  if (!items.length) return '';
  return 'PRICE LIST (use these exact item names): ' +
    items.map(([k, v]) => `${k} ${pack.currency.symbol}${v.price.toFixed(2)}`).join('; ') + '.';
}

const listText = v => (Array.isArray(v) ? v : []).map(i => (typeof i === 'object' ? `${i.qty} ${i.item}` : i)).join(', ');

function renderString(text, r) {
  const val = p => lookup(r.scope, p, r.pack.places);
  return String(text).replace(TAG, (raw, inner) => {
    const [a, b] = inner.split(/\s+/);
    switch (a) {
      case 'money': return money(r.pack, val(b));
      case 'list': return listText(val(b));
      case 'rotate': { const l = r.lists[b] || []; return l.length ? l[r.day % l.length] : ''; }
      case 'price_list': return priceList(r.pack, r.scope.place);
      default: { const v = val(a); return v == null ? '' : String(v); }
    }
  }).replace(/\s+/g, ' ').trim();
}

// Is a condition true?  ctx = { state, done (actions performed), meta ({ turns, counts }), with }
export function check(cond, ctx = {}) {
  if (!cond) return true;
  const { state = {}, done = [], meta = {} } = ctx;
  if (cond.all) return cond.all.every(c => check(c, ctx));
  if (cond.any) return cond.any.some(c => check(c, ctx));
  if (cond.not) return !check(cond.not, ctx);
  if (cond.has) return !!state[cond.has];
  if (cond.flag) return !!state.flags?.[cond.flag];
  if (cond.level) return levelFor(state.xp || 0).index >= LEVELS.findIndex(l => l.id === cond.level);
  if (cond.did) {
    const words = cond.item ? [].concat(cond.item).map(w => String(w).toLowerCase()) : null;
    return done.some(a => a.type === cond.did && (!words || words.some(w => String(a.item || '').toLowerCase().includes(w))));
  }
  if (cond.bought) {
    const wanted = dig(ctx, cond.bought.split('.')) || [];
    return wanted.length > 0 && wanted.every(req => done
      .filter(a => (a.type === 'sell' || a.type === 'service') && a.item === req.item)
      .reduce((n, a) => n + (a.qty || 1), 0) >= req.qty);
  }
  if (cond.turns) return (meta.turns || 0) >= cond.turns;
  if (cond.count) {
    const need = typeof cond.at_least === 'number' ? cond.at_least : Number(dig(ctx, String(cond.at_least).split('.')));
    return (meta.counts?.[cond.count] || 0) >= need;
  }
  return false;
}

// A mission as the game needs it right now: texts filled in, place and character resolved.
//   env = { state, with (mission parameters), choice, person (pedestrian), place (for `at: any`) }
export function renderMission(pack, id, env = {}) {
  const m = pack.missions[id];
  const state = env.state || {};
  const prof = professionById(state.player?.profession);
  const offer = pack.jobs[prof.id] || pack.jobs.other;
  const detail = state.player?.professionDetail;
  const scope = {
    city: pack, action: pack.actions, with: env.with || {}, choice: env.choice || {}, person: env.person || {},
    home: pack.places[state.home] || null,
    player: {
      profession: { name: prof.en, label: prof.en + (detail ? ' — ' + detail : '') },
      job_offer: offer,
      job: state.job ? { title: state.job.title || offer.title, workplace: state.job.workplace || offer.workplace } : null
    },
    place: null
  };
  const r = { pack, scope, lists: m.lists || {}, day: state.time?.day || 1 };
  const placeId = m.at === 'any' ? env.place : m.at ? renderString(m.at, r) : null;
  const place = placeId === 'park' ? pack.map.park : pack.places[placeId] || null;
  scope.place = place;

  const v = { ...m, ...m.variants?.[placeId] };
  const text = t => (t == null ? null : typeof t === 'string' ? renderString(t, r)
    : Object.fromEntries(Object.entries(t).map(([lang, s]) => [lang, renderString(s, r)])));
  const ctx = { state, with: scope.with };
  const brief = v.brief == null ? null : renderString([].concat(v.brief)
    .map(part => (typeof part === 'string' ? part : check(part.when, ctx) ? part.text : part.else || '')).join(' '), r);
  // A shop cannot perform services and a barber cannot sell goods, whatever the mission allows.
  const offered = a => !place || (a === 'sell' ? !!place.sells : a === 'service' ? !!place.services : true);

  return {
    id, kind: m.kind, placeId, place,
    character: m.with_person ? env.person || null : (pack.places[m.character] || place)?.character || null,
    title: text(v.title), goal: text(v.goal), brief,
    allow: (m.allow || []).filter(offered),
    vocabulary: m.vocabulary || place?.vocabulary || [],
    reward: m.reward || null
  };
}
