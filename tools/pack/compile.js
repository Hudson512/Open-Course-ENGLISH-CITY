// City pack compiler: reads the YAML files of a pack, checks them and returns one JSON object
// for the game. Format: docs/city-pack-spec.md. A pack is data only; nothing in it is executed.
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { LEVELS, PROFESSIONS } from '../../shared/data.js';
import { templateTags } from '../../shared/pack.js';

export const FORMAT = 1;
const FILES = ['city', 'map', 'places', 'people', 'actions', 'missions'];
const DOOR_GAP = 18;            // px between a wall and the point where the player stands
const SIDES = ['top', 'bottom', 'left', 'right'];
const MISSION_KINDS = ['story', 'job', 'daily', 'social', 'free'];
// Behaviours built into the engine, with the settings each one needs / accepts.
const ACTION_KINDS = {
  price: { needs: ['start', 'min', 'max'] },
  choose: { needs: ['into', 'options'] },
  rent: {},
  sell: { accepts: ['price_tolerance', 'max_qty'] },
  service: { accepts: ['price_tolerance'] },
  grant: { needs: ['effects'], accepts: ['requires'] },
  hire: { accepts: ['pass_score', 'requires'] },
  reject: {},
  work_done: { accepts: ['default_performance'] },
  end: {}
};
const PLAYER_PATHS = ['profession.name', 'profession.label', 'job.title', 'job.workplace',
  'job_offer.title', 'job_offer.wage', 'job_offer.workplace'];
const ROOTS = ['city', 'place', 'player', 'home', 'choice', 'with', 'action', 'person'];

export class PackError extends Error {
  constructor(id, errors) {
    super(`City pack "${id}" has ${errors.length} problem${errors.length > 1 ? 's' : ''}:\n` + errors.map(e => '  ' + e).join('\n'));
    this.name = 'PackError';
    this.errors = errors;
  }
}

// ── Reading ─────────────────────────────────────────────────────
const trimDeep = v => (typeof v === 'string' ? v.trim()
  : Array.isArray(v) ? v.map(trimDeep)
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, trimDeep(x)])) : v);

// Returns { id, sources: { city, map, … }, errors } without judging the content yet.
export function readPack(dir) {
  const sources = {};
  const errors = [];
  for (const name of FILES) {
    const file = path.join(dir, name + '.yaml');
    if (!fs.existsSync(file)) {
      if (name === 'people') sources.people = [];
      else errors.push(`${name}.yaml: file is missing`);
      continue;
    }
    const doc = YAML.parseDocument(fs.readFileSync(file, 'utf8'));
    for (const e of doc.errors) errors.push(`${name}.yaml: ${e.message.split('\n')[0]}`);
    if (!doc.errors.length) sources[name] = trimDeep(doc.toJS());
  }
  return { id: path.basename(path.resolve(dir)), sources, errors };
}

export function compilePack(dir) {
  const { id, sources, errors } = readPack(dir);
  if (errors.length) throw new PackError(id, errors);
  return compileSources(sources, id);
}

// ── Shape checks ────────────────────────────────────────────────
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const show = v => (v === null || v === undefined ? 'nothing' : Array.isArray(v) ? 'a list' : isObj(v) ? 'a block' : JSON.stringify(v));
const expect = (ok, what) => (v, p, E) => { if (!ok(v)) E(p, `expected ${what}, found ${show(v)}`); };
const str = expect(v => typeof v === 'string' && v !== '', 'text');
const num = expect(v => typeof v === 'number' && Number.isFinite(v), 'a number');
const int = expect(Number.isInteger, 'a whole number');
const bool = expect(v => typeof v === 'boolean', 'true or false');
const any = () => {};
const oneOf = (...vals) => expect(v => vals.includes(v), `one of: ${vals.join(', ')}`);
const pair = expect(v => Array.isArray(v) && v.length === 2 && v.every(n => typeof n === 'number'), 'two numbers like [10, 20]');
const color = expect(v => /^#[0-9a-f]{6}$/i.test(v), 'a color like "#fdcb6e"');
const list = item => (v, p, E) => {
  if (!Array.isArray(v)) return E(p, `expected a list, found ${show(v)}`);
  v.forEach((x, i) => item(x, [...p, `#${i + 1}`], E));
};
const mapOf = (item, ids = false) => (v, p, E) => {
  if (!isObj(v)) return E(p, `expected a block of named entries, found ${show(v)}`);
  for (const [k, x] of Object.entries(v)) {
    if (ids && !/^[a-z][a-z0-9_]*$/.test(k)) E([...p, k], 'ids use lowercase letters, digits and _ only, starting with a letter');
    item(x, [...p, k], E);
  }
};
// fields: name → validator (optional field) or [validator, hint] (required field)
const obj = fields => (v, p, E) => {
  const known = Object.keys(fields);
  if (!isObj(v)) return E(p, `expected a block with ${known.join(', ')}; found ${show(v)}`);
  for (const k of Object.keys(v)) if (!fields[k]) E(p, `unknown field "${k}". Known: ${known.join(', ')}`);
  for (const [k, f] of Object.entries(fields)) {
    const [validate, hint] = [].concat(f);
    if (v[k] === undefined || v[k] === null) { if (hint !== undefined) E(p, `missing "${k}"${hint ? ` (${hint})` : ''}`); }
    else validate(v[k], [...p, k], E);
  }
};

const i18n = (v, p, E) => {
  if (typeof v === 'string' && v) return;
  if (!isObj(v) || typeof v.en !== 'string') return E(p, 'expected text, or one text per language with at least "en"');
  mapOf(str)(v, p, E);
};

const COND_KEYS = ['all', 'any', 'not', 'has', 'flag', 'level', 'did', 'bought', 'turns', 'count'];
function cond(v, p, E) {
  if (!isObj(v)) return E(p, `expected a condition such as { has: home }, found ${show(v)}`);
  const main = Object.keys(v).filter(k => COND_KEYS.includes(k));
  const extra = Object.keys(v).filter(k => !COND_KEYS.includes(k) && !['else', 'item', 'at_least'].includes(k));
  if (extra.length) E(p, `unknown condition "${extra[0]}". Known: ${COND_KEYS.join(', ')}`);
  if (main.length !== 1) return E(p, `a condition needs exactly one of: ${COND_KEYS.join(', ')}`);
  const k = main[0], x = v[k], q = [...p, k];
  if (k === 'all' || k === 'any') list(cond)(x, q, E);
  else if (k === 'not') cond(x, q, E);
  else if (k === 'has') oneOf('home', 'job')(x, q, E);
  else if (k === 'level') oneOf(...LEVELS.map(l => l.id))(x, q, E);
  else if (k === 'turns') int(x, q, E);
  else str(x, q, E);
  if (k === 'count' && typeof v.at_least !== 'number' && typeof v.at_least !== 'string') E(p, '"count" needs "at_least" (a number, or a parameter such as with.count)');
  if (v.else !== undefined) str(v.else, [...p, 'else'], E);
}

const EFFECTS = { set_flag: str, clear_flag: str, money: num, xp: num, stat: mapOf(num) };
function effect(v, p, E) {
  const keys = isObj(v) ? Object.keys(v) : [];
  if (keys.length !== 1 || !EFFECTS[keys[0]]) return E(p, `an effect is one of: ${Object.keys(EFFECTS).join(', ')} — for example { set_flag: phone }`);
  EFFECTS[keys[0]](v[keys[0]], [...p, keys[0]], E);
}

const item = obj({
  price: [num, 'what it costs'], food: num, energy: num, health: num, consume: oneOf('now'),
  effects: list(effect), customer_sets_price: pair
});
const voice = obj({ gender: oneOf('male', 'female'), rate: num });
const briefPart = (v, p, E) => (typeof v === 'string' ? str(v, p, E)
  : obj({ when: [cond, 'the condition that picks the sentence'], text: [str, 'the sentence when it is true'], else: str })(v, p, E));
const brief = (v, p, E) => (Array.isArray(v) ? list(briefPart)(v, p, E) : str(v, p, E));
const texts = { title: i18n, goal: i18n, brief };

const SHAPES = {
  city: obj({
    pack: [int, 'the format version, currently 1'], id: [str, 'a short id such as maple-city'], version: any,
    name: [str, 'the city name'], country: [str, ''], flag: str, language: [str, 'what characters speak, e.g. en-US'],
    currency: [obj({ symbol: [str, 'e.g. "$"'], code: str }), 'symbol and code'],
    start: [obj({ money: [num, 'money the player arrives with'], mission: str }), 'starting money'],
    story: [list(str), 'the story missions, in order'],
    daily: obj({ count: [int, 'missions per day'], pool: [list(obj({ mission: [str, 'a mission id'], with: mapOf(any) })), 'missions to pick from'] }),
    jobs: [mapOf(obj({ workplace: [str, 'a place id'], wage: [num, 'pay per shift'], title: [str, 'job title'] })), 'where each profession works']
  }),
  map: obj({
    cell: [int, 'pixels per cell, e.g. 20'], size: [pair, '[columns, rows]'],
    roads: [list(obj({ row: num, col: num, width: [num, 'in cells'] })), 'at least one road'],
    park: obj({ name: [str, ''], at: [pair, ''], size: [pair, ''] }),
    decor: list(obj({ at: [pair, ''], size: [pair, ''] })),
    spawn: [pair, 'where the player appears'], taxi_stand: pair
  }),
  places: mapOf(obj({
    name: [str, 'the full name'], short: [str, 'a one- or two-word name'], icon: str,
    building: [obj({
      at: [pair, '[column, row] of the top-left corner'], size: [pair, '[columns, rows]'],
      door: [(v, p, E) => (Array.isArray(v) ? pair(v, p, E) : oneOf(...SIDES)(v, p, E)), 'the side facing the street: top, bottom, left or right'],
      color, roof: color
    }), 'where it is on the map'],
    character: [obj({
      id: str, name: [str, 'first name shown in the game'], emoji: str, voice,
      role: [str, 'their job, in a few words'], persona: [str, 'a sentence or two describing who this is']
    }), 'who works here'],
    lodging: obj({ per: [oneOf('night', 'week'), ''], price: [num, ''], min: [num, ''], max: [num, ''], max_nights: int }),
    sells: mapOf(item), services: mapOf(item), vocabulary: list(str), interior: any
  }), true),
  people: list(obj({
    name: [str, ''], emoji: str, color, voice, persona: [str, 'a sentence or two describing who this is']
  })),
  actions: mapOf(obj({
    kind: [oneOf(...Object.keys(ACTION_KINDS)), 'the engine behaviour this action uses'],
    tell_ai: [str, 'when the character should use it'],
    start: num, min: num, max: num, into: str, options: mapOf(list(str)), price_tolerance: num, max_qty: int,
    requires: cond, effects: list(effect), pass_score: num, default_performance: num
  }), true),
  missions: mapOf(obj({
    kind: [oneOf(...MISSION_KINDS), ''], at: str, character: str, ...texts,
    variants: mapOf(obj(texts)), lists: mapOf(list(str)), allow: list(str), vocabulary: list(str),
    complete: cond, requires: cond, reward: obj({ xp: num, social: num }),
    once_per: oneOf('day'), retry: oneOf('next_day'), with_person: bool
  }), true)
};

// ── Helpers for the content checks ──────────────────────────────
const dig = (o, keys) => keys.reduce((v, k) => (v == null ? undefined : v[k]), o);
const known = ids => (ids.length ? ` Known: ${ids.join(', ')}` : '');
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const gap = (pt, r) => Math.hypot(Math.max(r.x - pt.x, 0, pt.x - (r.x + r.w)), Math.max(r.y - pt.y, 0, pt.y - (r.y + r.h)));

function walkCond(c, fn) {
  if (!isObj(c)) return;
  fn(c);
  for (const k of ['all', 'any']) if (Array.isArray(c[k])) c[k].forEach(x => walkCond(x, fn));
  if (c.not) walkCond(c.not, fn);
}
const flagsSet = effects => (effects || []).filter(e => e.set_flag).map(e => e.set_flag);
const itemsOf = place => ({ ...place?.sells, ...place?.services });

// ── Compile ─────────────────────────────────────────────────────
export function compileSources(src, id = src.city?.id || 'pack') {
  const errors = [];
  const E = (where, msg) => errors.push(`${where.join(' › ')}: ${msg}`);
  const stop = () => { if (errors.length) throw new PackError(id, errors); };

  for (const name of FILES) SHAPES[name](src[name], [`${name}.yaml`], E);
  stop();   // content checks below assume the shapes are right

  const { city, map: m, places, people, actions, missions } = src;
  const placeIds = Object.keys(places), actionIds = Object.keys(actions), missionIds = Object.keys(missions);

  // city
  if (city.pack !== FORMAT) E(['city.yaml', 'pack'], `this game reads format ${FORMAT}, the pack says ${city.pack}`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(city.id)) E(['city.yaml', 'id'], 'use lowercase letters, digits and dashes, e.g. maple-city');
  for (const [prof, job] of Object.entries(city.jobs)) {
    if (!PROFESSIONS.some(p => p.id === prof)) E(['city.yaml', 'jobs'], `unknown profession "${prof}".${known(PROFESSIONS.map(p => p.id))}`);
    if (!places[job.workplace]) E(['city.yaml', 'jobs', prof], `workplace "${job.workplace}" is not a place.${known(placeIds)}`);
  }
  if (!city.jobs.other) E(['city.yaml', 'jobs'], 'missing "other" (the job for professions this city does not list)');
  city.story.forEach(s => {
    if (!missions[s]) E(['city.yaml', 'story'], `unknown mission "${s}".${known(missionIds)}`);
    else if (missions[s].kind !== 'story') E(['city.yaml', 'story'], `"${s}" has kind "${missions[s].kind}"; story missions need kind: story`);
  });
  if (city.start.mission && !missions[city.start.mission]) E(['city.yaml', 'start', 'mission'], `unknown mission "${city.start.mission}".${known(missionIds)}`);

  // map → pixels
  const C = m.cell, W = m.size[0] * C, H = m.size[1] * C;
  const px = n => Math.round(n * C);
  const rect = r => ({ x: px(r.at[0]), y: px(r.at[1]), w: px(r.size[0]), h: px(r.size[1]) });
  const roads = m.roads.map((r, i) => {
    if ((r.row === undefined) === (r.col === undefined)) E(['map.yaml', 'roads', `#${i + 1}`], 'a road needs either "row" (horizontal) or "col" (vertical)');
    return r.row !== undefined
      ? { x: 0, y: px(r.row), w: W, h: px(r.width), label: `row ${r.row}` }
      : { x: px(r.col ?? 0), y: 0, w: px(r.width), h: H, label: `column ${r.col}` };
  });
  const solids = [];      // everything that takes up ground: [label, rect, where]
  const outPlaces = {};
  for (const [pid, p] of Object.entries(places)) {
    const b = rect(p.building), d = p.building.door, at = ['places.yaml', pid, 'building'];
    const door = Array.isArray(d) ? { x: px(d[0]), y: px(d[1]) } : {
      top: { x: b.x + b.w / 2, y: b.y - DOOR_GAP }, bottom: { x: b.x + b.w / 2, y: b.y + b.h + DOOR_GAP },
      left: { x: b.x - DOOR_GAP, y: b.y + b.h / 2 }, right: { x: b.x + b.w + DOOR_GAP, y: b.y + b.h / 2 }
    }[d];
    if (!roads.some(r => gap(door, r) <= 2 * C)) E(at, `the door (${Array.isArray(d) ? d.join(', ') : d} side) does not face a road. Pick the side next to a street, or move the building within 2 cells of one`);
    solids.push([`"${pid}"`, b, at, door]);
    const { building, ...rest } = p;
    outPlaces[pid] = { id: pid, ...rest, ...b, door, color: building.color || '#b2bec3', roof: building.roof || '#636e72',
      character: { id: pid, ...p.character } };
    if (p.lodging && !(p.lodging.min <= p.lodging.price && p.lodging.price <= p.lodging.max)) E(['places.yaml', pid, 'lodging'], 'price must be between min and max');
    if (['name', 'short', 'icon', 'character', 'lodging', 'sells', 'services', 'vocabulary'].includes(pid)) E(['places.yaml', pid], 'this word is reserved, choose another id');
  }
  const park = m.park ? { id: 'park', name: m.park.name, ...rect(m.park) } : null;
  if (park) solids.push(['the park', park, ['map.yaml', 'park']]);
  const decor = (m.decor || []).map((d, i) => { const r = rect(d); solids.push([`decor #${i + 1}`, r, ['map.yaml', 'decor', `#${i + 1}`]]); return r; });
  solids.forEach(([label, r, at, door], i) => {
    if (r.w <= 0 || r.h <= 0) return E(at, 'size must be bigger than zero');
    if (r.x < 0 || r.y < 0 || r.x + r.w > W || r.y + r.h > H) E(at, `${label} is outside the map (${m.size[0]} × ${m.size[1]} cells)`);
    for (const road of roads) if (overlaps(r, road)) E(at, `${label} overlaps the road at ${road.label}. Move it off the road`);
    for (const [other, o] of solids.slice(i + 1)) if (overlaps(r, o)) E(at, `${label} overlaps ${other}. Move one of them`);
    if (door) for (const [other, o] of solids) if (o !== r && overlaps({ x: door.x, y: door.y, w: 1, h: 1 }, o)) E(at, `the door of ${label} is blocked by ${other}`);
  });
  const point = (v, name) => {
    const pt = { x: px(v[0]), y: px(v[1]) };
    if (pt.x < 0 || pt.y < 0 || pt.x > W || pt.y > H) E(['map.yaml', name], 'is outside the map');
    for (const [label, r] of solids) if (label !== 'the park' && overlaps({ ...pt, w: 1, h: 1 }, r)) E(['map.yaml', name], `is inside ${label}`);
    return pt;
  };
  const spawn = point(m.spawn, 'spawn');
  const taxiStand = m.taxi_stand ? point(m.taxi_stand, 'taxi_stand') : null;

  // actions
  const choices = {};         // choice name → option ids
  const setters = new Set();  // flags something in the pack can set
  for (const p of Object.values(places)) for (const it of Object.values(itemsOf(p))) flagsSet(it.effects).forEach(f => setters.add(f));
  const needed = [];          // [flag, where] for every flag some condition reads
  const readFlags = (c, where) => walkCond(c, x => { if (typeof x.flag === 'string') needed.push([x.flag, where]); });
  for (const [aid, a] of Object.entries(actions)) {
    const at = ['actions.yaml', aid], spec = ACTION_KINDS[a.kind];
    for (const k of spec.needs || []) if (a[k] === undefined) E(at, `kind "${a.kind}" needs "${k}"`);
    for (const k of Object.keys(a)) if (!['kind', 'tell_ai', ...(spec.needs || []), ...(spec.accepts || [])].includes(k)) E(at, `"${k}" has no meaning for kind "${a.kind}"`);
    if (a.kind === 'price' && !(a.min <= a.start && a.start <= a.max)) E(at, 'start must be between min and max');
    if (a.kind === 'choose' && a.into && a.options) choices[a.into] = Object.keys(a.options);
    flagsSet(a.effects).forEach(f => setters.add(f));
    readFlags(a.requires, [...at, 'requires']);
  }

  // daily pool: which parameters each mission receives
  const poolWith = {};        // mission id → list of `with` blocks
  (city.daily?.pool || []).forEach((entry, i) => {
    const at = ['city.yaml', 'daily', 'pool', `#${i + 1}`], w = entry.with || {};
    if (!missions[entry.mission]) return E(at, `unknown mission "${entry.mission}".${known(missionIds)}`);
    if (missions[entry.mission].kind !== 'daily') E(at, `"${entry.mission}" has kind "${missions[entry.mission].kind}"; the daily pool needs kind: daily`);
    (poolWith[entry.mission] ||= []).push(w);
    if (w.place !== undefined && !places[w.place]) return E(at, `"${w.place}" is not a place.${known(placeIds)}`);
    for (const [k, v] of Object.entries(w)) {
      if (!isObj(v)) continue;
      if (Array.isArray(v.one_of) && v.one_of.length) continue;
      if (k !== 'items' || !Number.isInteger(v.pick)) { E([...at, 'with', k], 'expected a value, { one_of: [...] }, or for items { pick: <how many> }'); continue; }
      const stock = itemsOf(places[w.place]);
      const where = /^(\w+)(?:\s*(>=|<=|>|<)\s*(\d+(?:\.\d+)?))?$/.exec(v.where ?? 'price');
      if (!w.place) E(at, 'picking items needs "place" in the same block');
      if (!where) E([...at, 'with', 'items', 'where'], 'expected a property such as food, or a comparison such as "food > 30"');
      for (const extra of v.plus || []) if (!stock[extra]) E([...at, 'with', 'items', 'plus'], `"${extra}" is not sold at ${w.place}.${known(Object.keys(stock))}`);
      if (where) {
        const [, prop, op, n] = where;
        const fits = Object.values(stock).filter(it => (op ? { '>': it[prop] > n, '<': it[prop] < n, '>=': it[prop] >= n, '<=': it[prop] <= n }[op] : it[prop])).length;
        if (fits < v.pick) E([...at, 'with', 'items'], `asks for ${v.pick} item(s) but only ${fits} at ${w.place} match`);
      }
    }
  });
  if (city.daily && city.daily.count > city.daily.pool.length) E(['city.yaml', 'daily'], `count is ${city.daily.count} but the pool has only ${city.daily.pool.length} entries`);

  // missions
  const cityInfo = { id: city.id, name: city.name, country: city.country, flag: city.flag, language: city.language, currency: city.currency };
  for (const [mid, mi] of Object.entries(missions)) {
    const at = ['missions.yaml', mid];

    // where can this mission happen?
    let spots = [null];
    if (mi.at === 'any') spots = placeIds;
    else if (mi.at === 'park') { if (!park) E([...at, 'at'], 'this city has no park in map.yaml'); spots = ['park']; }
    else if (mi.at && !mi.at.includes('{{')) { if (!places[mi.at]) E([...at, 'at'], `"${mi.at}" is not a place.${known(placeIds)}`); else spots = [mi.at]; }
    else if (mi.at) {
      const [tag] = templateTags(mi.at), key = tag?.arg || '';
      if (!tag || tag.raw !== mi.at || tag.helper) E([...at, 'at'], 'expected a place id, {{choice.<name>}}, {{with.place}} or {{player.job.workplace}}');
      else if (key.startsWith('choice.')) {
        spots = choices[key.slice(7)] || [];
        if (!choices[key.slice(7)]) E([...at, 'at'], `no "choose" action saves into "${key.slice(7)}".${known(Object.keys(choices))}`);
        for (const s of spots) if (!places[s]) E([...at, 'at'], `option "${s}" of that choice is not a place`);
      } else if (key === 'with.place') {
        spots = [...new Set((poolWith[mid] || []).map(w => w.place).filter(Boolean))];
        if (!spots.length) E([...at, 'at'], 'no entry of the daily pool in city.yaml gives this mission a place');
      } else if (key === 'player.job.workplace') spots = [...new Set(Object.values(city.jobs).map(j => j.workplace))];
      else E([...at, 'at'], 'expected a place id, {{choice.<name>}}, {{with.place}} or {{player.job.workplace}}');
      spots = spots.filter(s => places[s]);
    }
    for (const v of Object.keys(mi.variants || {})) if (!spots.includes(v)) E([...at, 'variants'], `"${v}" is not a place this mission can happen at.${known(spots.filter(Boolean))}`);
    if (mi.character && !places[mi.character]) E([...at, 'character'], `"${mi.character}" is not a place.${known(placeIds)}`);

    // every {{…}} must point at something that exists, wherever the mission happens
    const checkText = (text, where, spot) => {
      if (String(text).replace(/\{\{\s*[^{}]+?\s*\}\}/g, '').match(/\{\{|\}\}/)) E(where, 'has an unfinished {{…}}');
      for (const t of templateTags(text)) {
        const bad = msg => E(where, `${t.raw} ${msg}`);
        if (t.extra) { bad('has too many words'); continue; }
        if (t.helper === 'price_list') continue;
        if (!t.arg) { bad('needs a value after the helper name'); continue; }
        if (t.helper === 'rotate') { if (!mi.lists?.[t.arg]) bad(`needs a list called "${t.arg}" under "lists" in this mission`); continue; }
        const [root, ...rest] = t.arg.split('.');
        const here = spot === 'park' ? park : places[spot];
        let value;      // undefined = cannot be known before the game runs
        if (root === 'city') { value = dig(cityInfo, rest); if (value === undefined) bad(`does not exist.${known(Object.keys(cityInfo).map(k => 'city.' + k))}`); }
        else if (root === 'action') { value = dig(actions, rest); if (value === undefined) bad('does not exist in actions.yaml'); }
        else if (root === 'place') {
          if (places[rest[0]]) { value = dig(places[rest[0]], rest.slice(1)); if (value === undefined) bad(`does not exist for place "${rest[0]}"`); }
          else if (!here) bad(mi.at ? 'cannot be checked because "at" is wrong' : 'needs the mission to have a place ("at")');
          else { value = dig(here, rest); if (value === undefined) bad(`does not exist for place "${spot}"`); }
        }
        else if (root === 'player') { if (!PLAYER_PATHS.includes(rest.join('.'))) bad(`is not known.${known(PLAYER_PATHS.map(k => 'player.' + k))}`); }
        else if (root === 'home') { if (!['name', 'short'].includes(rest.join('.'))) bad('is not known. Known: home.name, home.short'); }
        else if (root === 'person') {
          if (!mi.with_person) bad('needs "with_person: true" in this mission');
          else if (!['name', 'persona'].includes(rest.join('.'))) bad('is not known. Known: person.name, person.persona');
        }
        else if (root === 'choice') { if (!choices[rest.join('.')]) bad(`is not saved by any "choose" action.${known(Object.keys(choices).map(k => 'choice.' + k))}`); }
        else if (root === 'with') {
          if (!poolWith[mid]) bad('needs this mission to be in the daily pool of city.yaml, which provides the value');
          else if (poolWith[mid].some(w => w[rest[0]] === undefined)) bad(`is not given by every daily pool entry for "${mid}"`);
        }
        else bad(`starts with an unknown word.${known(ROOTS)}`);
        if (t.helper === 'money' && value !== undefined && typeof value !== 'number') bad('is not a number');
        if (t.helper === 'list' && root !== 'with') bad('must list a mission parameter, e.g. {{list with.items}}');
      }
    };
    const strings = (v, where) => (v === undefined ? [] : typeof v === 'string' ? [[v, where]]
      : Array.isArray(v) ? v.flatMap((part, i) => (typeof part === 'string' ? [[part, [...where, `#${i + 1}`]]]
        : [[part.text, [...where, `#${i + 1}`]], ...(part.else ? [[part.else, [...where, `#${i + 1}`]]] : [])]))
      : Object.entries(v).map(([lang, s]) => [s, [...where, lang]]));
    for (const spot of spots) {
      const variant = mi.variants?.[spot];
      for (const f of ['title', 'goal', 'brief']) {
        const v = variant?.[f] ?? mi[f];
        const where = variant?.[f] !== undefined ? [...at, 'variants', spot, f] : [...at, f];
        if (v === undefined) {
          if (f !== 'brief') E(at, `missing "${f}"${spot && mi.variants ? ` for "${spot}" (add it to the mission or to that variant)` : ''}`);
          else if (mi.allow) E(at, `missing "brief" (instructions for the AI)${spot && mi.variants ? ` for "${spot}"` : ''}`);
        }
        for (const [s, w] of strings(v, where)) checkText(s, w, spot);
        if (Array.isArray(v)) v.forEach((part, i) => { if (isObj(part)) readFlags(part.when, [...where, `#${i + 1}`, 'when']); });
      }
    }

    // actions and completion
    const allow = mi.allow || [];
    for (const a of allow) if (!actions[a]) E([...at, 'allow'], `unknown action "${a}".${known(actionIds)}`);
    const kinds = allow.filter(a => actions[a]).map(a => actions[a].kind);
    if (kinds.includes('rent')) for (const s of spots) if (!places[s]?.lodging) E([...at, 'allow'], `"rent" needs a "lodging" block on place "${s}"`);
    readFlags(mi.requires, [...at, 'requires']);
    if (mi.kind === 'story' && !mi.complete) E(at, 'missing "complete" (how the game knows a story mission is done)');
    walkCond(mi.complete, c => {
      const where = [...at, 'complete'];
      if (c.did !== undefined && !allow.includes(c.did)) E(where, `waits for "${c.did}", which is not in "allow" — the mission could never be finished`);
      if (c.bought !== undefined && !kinds.some(k => k === 'sell' || k === 'service')) E(where, '"bought" needs sell or service in "allow"');
      if (c.turns !== undefined && !mi.brief && !mi.variants) E(where, '"turns" needs a conversation ("brief")');
      if (typeof c.flag === 'string') {
        const viaAction = allow.some(a => flagsSet(actions[a]?.effects).includes(c.flag));
        for (const s of spots) {
          const viaItem = kinds.some(k => k === 'sell' || k === 'service') && Object.values(itemsOf(places[s])).some(it => flagsSet(it.effects).includes(c.flag));
          if (!viaAction && !viaItem) E(where, `nothing here can set the flag "${c.flag}"${s ? ` at "${s}"` : ''} — the mission could never be finished`);
        }
      }
      for (const key of ['bought', 'at_least']) {
        if (typeof c[key] !== 'string') continue;
        const [root, name] = c[key].split('.');
        if (root !== 'with' || !name) E(where, `"${key}" must name a mission parameter, e.g. with.${key === 'bought' ? 'items' : 'count'}`);
        else if (!poolWith[mid] || poolWith[mid].some(w => w[name] === undefined)) E(where, `${c[key]} is not given by every daily pool entry for "${mid}"`);
      }
    });
  }
  for (const [flag, where] of needed) if (!setters.has(flag)) E(where, `reads the flag "${flag}", but nothing in the pack sets it.${known([...setters])}`);

  stop();
  return {
    format: FORMAT, ...cityInfo, version: String(city.version ?? '1'), start: city.start, story: city.story,
    daily: city.daily || { count: 0, pool: [] }, jobs: city.jobs,
    map: { cell: C, width: W, height: H, roads: roads.map(({ label, ...r }) => r), park, decor, spawn, taxiStand },
    places: outPlaces, people, actions, missions
  };
}
