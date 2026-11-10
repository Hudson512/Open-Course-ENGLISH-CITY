// Game rules that work on any compiled city pack (docs/city-pack-spec.md).
// Used by the client (to apply what the AI decided) and the server (prompts, offline mode).
// A mission in play is { uid, templateId (a mission id of the pack), params }.
import { check, renderMission } from './pack.js';

export const round2 = n => Math.round(n * 100) / 100;
const num = (v, d) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// The mission with its texts filled in for this player, place and character resolved.
export function viewMission(pack, mission, state = {}) {
  if (!pack.missions[mission?.templateId]) return null;
  const p = mission.params || {};
  return renderMission(pack, mission.templateId, { state, with: p, choice: state.choices || {}, person: p, place: p.place });
}

// ── Requirements ────────────────────────────────────────────────
// The simple conditions inside `cond` that are not met.
function unmet(cond, ctx, out = []) {
  if (!cond || check(cond, ctx)) return out;
  if (cond.all) cond.all.forEach(c => unmet(c, ctx, out));
  else out.push(cond);
  return out;
}
const reqCode = c => (c.level ? 'level_' + String(c.level).toLowerCase()
  : c.has || c.flag || (c.not ? 'not_' + (c.not.has || c.not.flag || 'ready') : 'ready'));

// Why a mission cannot be played right now: a list of short codes, or null when it can.
export function blocked(pack, id, state = {}) {
  const m = pack.missions[id];
  const day = state.time?.day;
  const codes = unmet(m.requires, { state }).map(reqCode);
  if (m.retry === 'next_day' && state.log?.tried?.[id] === day) codes.push('tomorrow');
  if (m.once_per === 'day' && state.log?.done?.[id] === day) codes.push('done_today');
  return codes.length ? codes : null;
}

// Is the mission finished?  done = actions accepted so far, meta = { turns, counts }
export function isComplete(pack, mission, state, done = [], meta = {}) {
  const cond = pack.missions[mission.templateId]?.complete;
  return cond ? check(cond, { state, done, meta, with: mission.params || {} }) : false;
}

// ── Items ───────────────────────────────────────────────────────
export function catalogOf(place, kind) {
  return kind === 'sell' ? place?.sells || {} : kind === 'service' ? place?.services || {} : { ...place?.sells, ...place?.services };
}

// Find what the AI meant: exact name first, then plural / partial matches.
export function findItem(place, name, kind) {
  const cat = catalogOf(place, kind);
  if (!name) return null;
  const n = String(name).toLowerCase().trim();
  const exact = Object.keys(cat).find(k => k.toLowerCase() === n);
  if (exact) return { key: exact, ...cat[exact] };
  const singular = n.replace(/(es|s)$/, '');
  for (const key of Object.keys(cat)) {
    const k = key.toLowerCase();
    if (k === singular || k.includes(n) || n.includes(k) || k.includes(singular)) return { key, ...cat[key] };
  }
  return null;
}

// ── What the AI is told about each action ───────────────────────
const SHAPES = {
  price: () => '"amount":<number>',
  choose: a => `"value":${Object.keys(a.options).map(o => `"${o}"`).join('|')}`,
  rent: (a, view) => (view.place?.lodging?.per === 'night' ? '"price":<number per night>,"nights":<int>' : '"price":<number per week>'),
  sell: () => '"item":"<exact item name from the price list>","qty":<int>,"unitPrice":<number>',
  service: () => '"item":"<exact service name from the price list>","price":<number>',
  grant: () => '',
  hire: () => '"score":<0-100>,"jobTitle":"<string>"',
  reject: () => '"score":<0-100>,"reason":"<short reason>"',
  work_done: () => '"performance":<0-100>',
  end: () => ''
};

export function actionDoc(pack, id, view) {
  const a = pack.actions[id];
  const shape = SHAPES[a.kind](a, view);
  const names = a.kind === 'choose'
    ? Object.keys(a.options).filter(o => pack.places[o]).map(o => `${pack.places[o].name} = "${o}"`).join(', ') : '';
  return `{"type":"${id}"${shape ? ',' + shape : ''}} — ${a.tell_ai || ''}${names ? ` (${names})` : ''}`;
}

// ── Action validation ───────────────────────────────────────────
// The AI proposes, the game decides. Returns { ok, action (cleaned up), kind, cost, effects, item, reason }.
export function validateAction(pack, mission, raw, state = {}) {
  const view = viewMission(pack, mission, state);
  const a = { ...raw };
  const def = pack.actions[a.type];
  if (!view || !def || !view.allow.includes(a.type)) return { ok: false, reason: `action ${a.type} not allowed here` };
  const kind = def.kind;
  const ok = (extra = {}) => ({ ok: true, action: a, kind, cost: 0, effects: def.effects || [], ...extra });
  if (kind === 'end') return ok();

  const codes = blocked(pack, mission.templateId, state);
  if (codes) return { ok: false, reason: `requirements missing: ${codes.join(',')}` };
  const failed = unmet(def.requires, { state });
  if (failed.length) return { ok: false, reason: failed.map(c => c.else).filter(Boolean).join('; ') || 'requirements not met' };

  switch (kind) {
    case 'price':
      a.amount = clamp(Math.round(num(a.amount, def.start)), def.min, def.max);
      return ok({ cost: a.amount });
    case 'choose': {
      const said = String(a.value ?? a.place ?? '').toLowerCase();
      a.value = Object.keys(def.options).find(o => o === said)
        || Object.keys(def.options).find(o => def.options[o].some(w => said.includes(String(w).toLowerCase()))) || null;
      delete a.place;
      if (!a.value || !said) return { ok: false, reason: 'unknown choice' };
      return ok();
    }
    case 'rent': {
      const L = view.place?.lodging;
      if (!L) return { ok: false, reason: 'this place has no rooms' };
      a.place = view.placeId;
      a.price = clamp(num(a.price, L.price), L.min, L.max);
      a.nights = L.per === 'night' ? clamp(Math.round(num(a.nights, 1)), 1, L.max_nights || 14) : 7;
      return ok({ cost: round2(L.per === 'night' ? a.price * a.nights : a.price) });
    }
    case 'sell':
    case 'service': {
      const it = findItem(view.place, a.item, kind);
      if (!it) return { ok: false, reason: `item "${a.item}" is not sold here` };
      a.item = it.key;
      a.qty = kind === 'service' ? 1 : clamp(Math.round(num(a.qty, 1)), 1, def.max_qty || 12);
      const tol = def.price_tolerance ?? 0.3;
      let unit = num(kind === 'service' ? a.price : a.unitPrice, it.price);
      if (unit < it.price * (1 - tol) || unit > it.price * (1 + tol)) unit = it.price;
      if (it.customer_sets_price) unit = clamp(num(a.unitPrice ?? a.price, it.price), ...it.customer_sets_price);
      a.unitPrice = round2(unit);
      return ok({ cost: round2(unit * a.qty), item: it, effects: [...(def.effects || []), ...(it.effects || [])] });
    }
    case 'grant':
      return ok();
    case 'hire': {
      a.score = clamp(Math.round(num(a.score, 0)), 0, 100);
      if (a.score < (def.pass_score ?? 60)) {
        const no = view.allow.find(id => pack.actions[id].kind === 'reject') || 'reject';
        return { ok: true, kind: 'reject', cost: 0, effects: [], action: { type: no, score: a.score, reason: `score below ${def.pass_score ?? 60}` } };
      }
      return ok();
    }
    case 'reject':
      a.score = clamp(Math.round(num(a.score, 0)), 0, 100);
      return ok();
    case 'work_done':
      if (!state.job) return { ok: false, reason: 'the player has no job' };
      a.performance = clamp(Math.round(num(a.performance, def.default_performance ?? 70)), 0, 100);
      return ok();
    default:
      return { ok: false, reason: 'unknown action' };
  }
}

// Effects written in the pack (on actions and on items) change the player's state.
export function applyEffects(state, effects = []) {
  for (const e of effects) {
    if (e.set_flag) state.flags[e.set_flag] = true;
    if (e.clear_flag) delete state.flags[e.clear_flag];
    if (e.money) state.money = round2(state.money + e.money);
    if (e.xp) state.xp = Math.max(0, (state.xp || 0) + e.xp);
    for (const [k, v] of Object.entries(e.stat || {})) {
      if (k in state.stats) state.stats[k] = clamp(state.stats[k] + v, 0, 100);
    }
  }
}

// ── Daily missions (the same for every player on the same day) ──
function rng(seed) {
  let t = seed >>> 0;
  return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}
const OPS = { '>': (a, b) => a > b, '<': (a, b) => a < b, '>=': (a, b) => a >= b, '<=': (a, b) => a <= b };

function pickItems(r, place, rule) {
  const cat = catalogOf(place);
  const [, prop, op, n] = /^(\w+)(?:\s*(>=|<=|>|<)\s*(\d+(?:\.\d+)?))?$/.exec(rule.where ?? 'price') || [];
  const keys = Object.keys(cat).filter(k => (op ? OPS[op](cat[k][prop] ?? 0, Number(n)) : !!cat[k][prop]));
  const out = [];
  while (out.length < rule.pick && keys.length) {
    const item = keys.splice(Math.floor(r() * keys.length), 1)[0];
    const [lo, hi] = rule.qty || [1, 1];
    out.push({ item, qty: hi > lo ? lo + Math.floor(r() * (hi - lo + 1)) : lo });
  }
  return [...out, ...(rule.plus || []).map(item => ({ item, qty: 1 }))];
}

export function generateDaily(pack, day, seedBase = 1) {
  const r = rng(day * 7919 + seedBase);
  const pool = pack.daily?.pool || [];
  const chosen = new Set();
  const out = [];
  while (out.length < Math.min(pack.daily?.count || 0, pool.length)) {
    const i = Math.floor(r() * pool.length);
    if (chosen.has(i)) continue;
    chosen.add(i);
    const params = {};
    for (const [k, v] of Object.entries(pool[i].with || {})) {
      params[k] = v?.one_of ? v.one_of[Math.floor(r() * v.one_of.length)]
        : v?.pick ? pickItems(r, pack.places[pool[i].with.place], v) : v;
    }
    out.push({ uid: `d${day}-${i}`, templateId: pool[i].mission, params, day, progress: 0 });
  }
  return out;
}
