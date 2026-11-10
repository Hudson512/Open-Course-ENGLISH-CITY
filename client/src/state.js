// Game state, persistence, survival simulation and application of NPC actions.
import { levelFor } from '../../shared/data.js';
import { viewMission, blocked, isComplete as missionComplete, validateAction, applyEffects, generateDaily, round2 } from '../../shared/engine.js';
import { getPack, fmtMoney, placeById, placePoint } from './pack.js';
import { t, tr } from './i18n.js';

const SAVE_KEY = 'oceg-save-v1';
const listeners = new Set();
let state = null;

export const bus = {
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  emit(type, data) { for (const fn of listeners) fn(type, data); }
};
const changed = () => bus.emit('change');
const toast = (text, kind = 'info') => bus.emit('toast', { text, kind });

export function getState() { return state; }
export function hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; } }
export function save() {
  if (!state) return;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch { /* quota */ }
  scheduleSync();
}
export function load() {
  try { state = migrate(JSON.parse(localStorage.getItem(SAVE_KEY))); } catch { state = null; }
  if (state && !state.token) state.token = newToken();
  return state;
}

// Saves made before cities were packs: the only city was Maple City.
function migrate(s) {
  if (!s || s.pack) return s;
  s.pack = 'maple-city';
  s.choices = { lodging_place: s.pendingDestination || s.home || 'hotel' };
  s.log = { done: {}, tried: {} };
  if (s.flags?.lastInterviewDay) s.log.tried.job_interview = s.flags.lastInterviewDay;
  if (s.job?.lastWorkedDay) s.log.done.work_shift = s.job.lastWorkedDay;
  delete s.destination; delete s.pendingDestination; delete s.flags?.lastInterviewDay;
  return s;
}
export function wipe() { try { localStorage.removeItem(SAVE_KEY); } catch { /* */ } state = null; }

// ── Server-side backup (only when the server has a database) ────
// localStorage stays the primary copy. The server copy is keyed by the player id and
// protected by a secret token; "id.token" is the save code used to restore elsewhere.
const SYNC_DELAY = 4000;
let syncTimer = null, syncOff = false;
const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
export const saveCode = () => (state ? `${state.id}.${state.token}` : '');

function scheduleSync() {
  if (syncOff || syncTimer) return;
  syncTimer = setTimeout(() => { syncTimer = null; syncNow(); }, SYNC_DELAY);
}
export async function syncNow({ keepalive = false } = {}) {
  if (!state || syncOff) return false;
  clearTimeout(syncTimer); syncTimer = null;
  const { token, ...data } = state;
  try {
    const res = await fetch(`/api/save/${state.id}`, { method: 'PUT', keepalive, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, data }) });
    if (res.status === 503) syncOff = true; // server has no database
    return res.ok;
  } catch { return false; /* offline: the next save retries */ }
}
export async function restoreFromServer(code) {
  const [id, token] = String(code).trim().split('.');
  const res = await fetch(`/api/save/${encodeURIComponent(id)}`, { headers: { 'x-save-token': token || '' } });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
  state = migrate({ ...(await res.json()).data, id, token });
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch { /* quota */ }
  return state;
}
if (typeof window !== 'undefined') window.addEventListener('pagehide', () => { if (syncTimer) syncNow({ keepalive: true }); });

// Start a new life in the city that is loaded (see pack.js).
export function newGame(player) {
  const pack = getPack();
  const first = Math.max(0, pack.story.indexOf(pack.start.mission));
  state = {
    version: 2,
    id: 'p_' + Math.random().toString(36).slice(2, 10).padEnd(8, '0'),
    token: newToken(),
    player, pack: pack.id,
    stats: { health: 100, hunger: 70, energy: 75, social: 50 },
    money: pack.start.money, xp: 0,
    time: { day: 1, minutes: 14 * 60 },
    home: null, rent: null,
    flags: { faints: 0 },
    choices: {}, // what the player decided along the way, e.g. where to stay
    log: { done: {}, tried: {} }, // mission id → the day it was last finished / failed
    job: null,
    inventory: [],
    vocab: {},
    missions: { storyIndex: first, story: { uid: `story-${first}`, templateId: pack.story[first], params: {} }, daily: [], dailyDay: 0, trackedUid: `story-${first}`, chattedToday: [] },
    position: { ...pack.map.spawn },
    stats_total: { messages: 0, missions: 0, words: 0 },
    gameOver: false
  };
  ensureDaily();
  save();
  changed();
  return state;
}

// ── Time & survival ─────────────────────────────────────────────
let warnCooldown = 0;
export function tick(gameMinutes, { running = false } = {}) {
  if (!state || state.gameOver) return;
  const s = state.stats;
  s.hunger = clamp(s.hunger - 0.06 * gameMinutes);
  s.energy = clamp(s.energy - (running ? 0.12 : 0.05) * gameMinutes);
  s.social = clamp(s.social - 0.025 * gameMinutes);
  if (s.hunger <= 0 || s.energy <= 0) s.health = clamp(s.health - 0.12 * gameMinutes);
  else if (s.hunger > 40 && s.energy > 30) s.health = clamp(s.health + 0.03 * gameMinutes);
  if (s.social < 15) s.health = clamp(s.health - 0.01 * gameMinutes);
  advanceTime(gameMinutes);
  warnCooldown -= gameMinutes;
  if (warnCooldown <= 0) {
    if (s.hunger < 15) { toast(t('lowHunger'), 'warn'); warnCooldown = 120; }
    else if (s.energy < 15) { toast(t('lowEnergy'), 'warn'); warnCooldown = 120; }
    else if (s.social < 15) { toast(t('lowSocial'), 'warn'); warnCooldown = 180; }
  }
  if (s.health <= 0) faint();
}

export function advanceTime(min) {
  state.time.minutes += min;
  while (state.time.minutes >= 24 * 60) {
    state.time.minutes -= 24 * 60;
    state.time.day += 1;
    onNewDay();
  }
}

function onNewDay() {
  ensureDaily();
  state.missions.chattedToday = [];
  // Rent
  if (state.rent && state.time.day >= state.rent.paidUntilDay) {
    const place = getPack().places[state.rent.place];
    const amount = state.rent.price;
    if (state.money >= amount) {
      state.money = round2(state.money - amount);
      state.rent.paidUntilDay += place?.lodging?.per === 'night' ? 1 : 7;
      toast(`${t('rentPaid')}: ${place?.name || ''} −${fmtMoney(amount)}`);
    } else {
      toast(t('evicted'), 'bad');
      state.home = null; state.rent = null;
    }
  }
  bus.emit('newday', state.time.day);
}

function faint() {
  const bill = 150;
  state.flags.faints = (state.flags.faints || 0) + 1;
  state.money = round2(state.money - bill);
  Object.assign(state.stats, { health: 55, hunger: 50, energy: 60 });
  advanceTime(8 * 60);
  // wake up wherever the city treats people, or back where the player first arrived
  const pack = getPack();
  const clinic = Object.values(pack.places).find(p => Object.values(p.services || {}).some(i => i.health));
  state.position = { ...(clinic?.door || pack.map.spawn) };
  bus.emit('teleport', state.position);
  toast(`${t('fainted')} ${fmtMoney(bill)}`, 'bad');
  if (state.flags.faints >= 3) { state.gameOver = true; bus.emit('gameover'); }
  save(); changed();
}

export function sleep() {
  const s = state.stats;
  const m = state.time.minutes;
  const toMorning = m < 7 * 60 ? 7 * 60 - m : 24 * 60 - m + 7 * 60;
  const quality = state.home ? 1 : 0.5;
  advanceTime(toMorning);
  s.energy = clamp(s.energy + 100 * quality);
  s.hunger = clamp(s.hunger - 15);
  s.health = clamp(s.health + 10 * quality);
  save(); changed();
}

// ── XP / vocabulary ─────────────────────────────────────────────
export function addXP(n) {
  const before = levelFor(state.xp).id;
  state.xp = Math.max(0, Math.round(state.xp + n));
  const after = levelFor(state.xp).id;
  if (after !== before) { toast(`${t('levelUp')} ${after} 🎉`, 'good'); bus.emit('levelup', after); }
  changed();
}

export function addWords(words = [], source = '') {
  for (const w of words) {
    const key = String(w.en || '').trim();
    if (!key || key.length > 60) continue;
    const v = state.vocab[key];
    if (v) { v.seen++; if (w.meaning) v.meaning = w.meaning; }
    else { state.vocab[key] = { meaning: w.meaning || '', seen: 1, box: 0, day: state.time.day, source }; state.stats_total.words++; }
  }
  changed();
}

export function markUsedVocab(text, vocab = []) {
  const lower = text.toLowerCase();
  const used = vocab.filter(v => {
    const k = v.toLowerCase().replace(/…|\.\.\./g, '').replace(/[?!]/g, '').trim();
    return k.length > 2 && lower.includes(k);
  });
  for (const u of used) {
    const v = state.vocab[u] || (state.vocab[u] = { meaning: '', seen: 0, box: 0, day: state.time.day, source: 'mission' });
    v.used = (v.used || 0) + 1;
  }
  return used;
}

// ── Missions ────────────────────────────────────────────────────
// A mission in play is { uid, templateId (a mission of the city pack), params }.
export function ensureDaily() {
  if (state.missions.dailyDay !== state.time.day) {
    state.missions.daily = generateDaily(getPack(), state.time.day, hashCode(state.id));
    state.missions.dailyDay = state.time.day;
  }
}

export function activeMissions() {
  const pack = getPack();
  const known = m => !!pack.missions[m.templateId];
  const out = [];
  if (state.missions.story && known(state.missions.story)) out.push({ ...state.missions.story, kind: 'story' });
  // the player's job, on the days it can still be done
  for (const [id, m] of Object.entries(pack.missions)) {
    if (m.kind === 'job' && !blocked(pack, id, state)) out.push({ uid: `work-${state.time.day}`, templateId: id, params: {}, kind: 'job', day: state.time.day });
  }
  for (const d of state.missions.daily) if (!d.done && known(d)) out.push({ ...d, kind: 'daily' });
  return out;
}

const view = m => viewMission(getPack(), m, state);
export const missionPlace = m => view(m)?.placeId || null;
export const missionTarget = m => placePoint(placeById(missionPlace(m)));

export function missionInfo(m) {
  const v = view(m);
  if (!v) return { title: m.templateId, goal: '', location: null, place: null, character: null, reward: null, blocked: null, vocab: [] };
  return {
    title: tr(v.title), goal: tr(v.goal),
    location: v.placeId, place: placeById(v.placeId), character: v.character,
    reward: v.reward,
    blocked: blocked(getPack(), m.templateId, state),
    vocab: v.vocabulary
  };
}

// Missions that count things (talk to N people…): how far along, and how many are needed.
export function missionCounter(m) {
  const c = getPack().missions[m.templateId]?.complete;
  if (!c?.count) return null;
  const target = typeof c.at_least === 'number' ? c.at_least : Number(m.params?.[String(c.at_least).split('.').pop()]);
  return { name: c.count, progress: m.progress || 0, target };
}

export function isComplete(m, done, meta) {
  return missionComplete(getPack(), m, state, done, meta);
}

export function completeMission(m) {
  const reward = view(m)?.reward || { xp: 20, social: 2 };
  state.stats.social = clamp(state.stats.social + (reward.social || 0));
  state.stats_total.missions++;
  state.log.done[m.templateId] = m.day || state.time.day;
  addXP(reward.xp || 0);
  if (m.kind === 'story' || m.uid === state.missions.story?.uid) advanceStory(m);
  const d = state.missions.daily.find(x => x.uid === m.uid);
  if (d) d.done = true;
  bus.emit('mission', { mission: m, reward });
  save(); changed();
  return reward;
}

function advanceStory(m) {
  const i = state.missions.storyIndex + 1;
  state.missions.storyIndex = i;
  const id = getPack().story[i];
  if (!id) { state.missions.story = null; toast(t('storyDone'), 'good'); return; }
  state.missions.story = { uid: `story-${i}`, templateId: id, params: {} };
  if (state.missions.trackedUid === m.uid) state.missions.trackedUid = state.missions.story.uid;
}

// Something countable happened ('smalltalk' with a pedestrian, 'online_messages' to real players).
export function bumpCounter(name) {
  for (const d of state.missions.daily) {
    if (d.done || missionCounter(d)?.name !== name) continue;
    d.progress = (d.progress || 0) + 1;
    if (isComplete(d, [], { counts: { [name]: d.progress } })) completeMission({ ...d, kind: 'daily' });
  }
  changed();
}

// ── Applying NPC actions ────────────────────────────────────────
// Returns [{ok, action, kind, cost, note}] — `note` is fed back to the NPC as a [GAME: …] event.
export function applyActions(mission, actions) {
  const pack = getPack();
  const results = [];
  for (const raw of actions) {
    const v = validateAction(pack, mission, raw, state);
    if (!v.ok) { results.push({ ok: false, action: raw, note: `Action "${raw.type}" failed: ${v.reason}.` }); continue; }
    const a = v.action;
    if (v.cost > 0) {
      if (state.money < v.cost) {
        results.push({ ok: false, action: a, note: `Payment of ${fmtMoney(v.cost)} DECLINED — the player only has ${fmtMoney(state.money)}.`, payFail: true });
        continue;
      }
      state.money = round2(state.money - v.cost);
    }
    let note = v.cost > 0 ? `Payment of ${fmtMoney(v.cost)} succeeded (${a.type}${a.item ? ': ' + a.qty + ' ' + a.item : ''}).` : `Done: ${a.type}.`;
    applyEffects(state, v.effects);
    switch (v.kind) {
      case 'choose': state.choices[pack.actions[a.type].into] = a.value; break;
      case 'rent':
        state.home = a.place;
        state.rent = { place: a.place, price: a.price, paidUntilDay: state.time.day + a.nights };
        break;
      case 'sell':
      case 'service': {
        const it = v.item;
        if (it.health) state.stats.health = clamp(state.stats.health + it.health);
        if (it.food || it.energy) {
          if (it.consume === 'now') {
            state.stats.hunger = clamp(state.stats.hunger + (it.food || 0) * a.qty);
            state.stats.energy = clamp(state.stats.energy + (it.energy || 0) * a.qty);
          } else addItem(a.item, a.qty, it.food || 0);
        } else if (v.kind === 'sell' && !it.health && !it.effects && !it.customer_sets_price) addItem(a.item, a.qty, 0);
        break;
      }
      case 'hire': {
        const offer = pack.jobs[state.player.profession] || pack.jobs.other;
        state.job = { title: a.jobTitle || offer.title, wage: offer.wage, workplace: offer.workplace, since: state.time.day };
        toast(`${t('hired')} ${state.job.title} 💼`, 'good');
        note = `The player is now hired as ${state.job.title}.`;
        break;
      }
      case 'reject':
        state.log.tried[mission.templateId] = state.time.day;
        toast(t('rejected'), 'warn');
        break;
      case 'work_done': {
        const pay = round2(state.job.wage * (0.6 + a.performance / 250));
        state.money = round2(state.money + pay);
        state.stats.energy = clamp(state.stats.energy - 25);
        advanceTime(7 * 60);
        toast(`${t('paid')} ${fmtMoney(pay)} 💵`, 'good');
        note = `Shift finished. The player was paid ${fmtMoney(pay)}.`;
        break;
      }
    }
    results.push({ ok: true, action: a, kind: v.kind, cost: v.cost, note });
  }
  save(); changed();
  return results;
}

function addItem(item, qty, food) {
  const ex = state.inventory.find(i => i.item === item);
  if (ex) ex.qty += qty; else state.inventory.push({ item, qty, food });
}

export function eatItem(item) {
  const ex = state.inventory.find(i => i.item === item);
  if (!ex || !ex.food) return;
  ex.qty--;
  state.stats.hunger = clamp(state.stats.hunger + ex.food);
  if (ex.qty <= 0) state.inventory = state.inventory.filter(i => i !== ex);
  advanceTime(10);
  save(); changed();
}

export function pay(amount) {
  if (state.money < amount) return false;
  state.money = round2(state.money - amount);
  changed();
  return true;
}

export function setPosition(x, y) { if (state) state.position = { x: Math.round(x), y: Math.round(y) }; }
export function setTracked(uid) { state.missions.trackedUid = uid; changed(); }
export function trackedMission() {
  const all = activeMissions();
  return all.find(m => m.uid === state.missions.trackedUid) || all[0] || null;
}

export function clamp(v, lo = 0, hi = 100) { return Math.min(hi, Math.max(lo, v)); }
function hashCode(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); }
export { levelFor };
