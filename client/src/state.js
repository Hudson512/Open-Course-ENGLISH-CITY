// Game state, persistence, survival simulation and application of NPC actions.
import { START_MONEY, levelFor, professionById, findCatalogItem, LODGING } from '../../shared/data.js';
import { TEMPLATES, STORY, generateDaily, validateAction, resolve, round2 } from '../../shared/missions.js';
import { SPAWN, locationById } from '../../shared/world.js';
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
  try { state = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { state = null; }
  if (state) { ensureDaily(); if (!state.token) state.token = newToken(); }
  return state;
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
  state = { ...(await res.json()).data, id, token };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch { /* quota */ }
  return state;
}
if (typeof window !== 'undefined') window.addEventListener('pagehide', () => { if (syncTimer) syncNow({ keepalive: true }); });

export function newGame(player) {
  state = {
    version: 1,
    id: 'p_' + Math.random().toString(36).slice(2, 10).padEnd(8, '0'),
    token: newToken(),
    player, destination: 'usa',
    stats: { health: 100, hunger: 70, energy: 75, social: 50 },
    money: START_MONEY, xp: 0,
    time: { day: 1, minutes: 14 * 60 },
    home: null, rent: null,
    flags: { phone: false, bank: false, faints: 0 },
    job: null,
    inventory: [],
    vocab: {},
    missions: { storyIndex: 0, story: { uid: 'story-0', templateId: 'arrival_taxi', params: {} }, daily: [], dailyDay: 0, trackedUid: 'story-0', chattedToday: [] },
    position: { ...SPAWN },
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
    const L = LODGING[state.rent.place];
    const amount = state.rent.place === 'hotel' ? state.rent.price : state.rent.price;
    if (state.money >= amount) {
      state.money = round2(state.money - amount);
      state.rent.paidUntilDay += state.rent.place === 'hotel' ? 1 : 7;
      toast(`${t('rentPaid')}: ${L.name} −$${amount.toFixed(2)}`);
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
  const clinic = locationById('clinic');
  state.position = { ...clinic.door };
  bus.emit('teleport', state.position);
  toast(`${t('fainted')} $${bill}`, 'bad');
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
export function ensureDaily() {
  if (state.missions.dailyDay !== state.time.day) {
    state.missions.daily = generateDaily(state.time.day, hashCode(state.id));
    state.missions.dailyDay = state.time.day;
  }
}

export function activeMissions() {
  const out = [];
  if (state.missions.story) out.push({ ...state.missions.story, kind: 'story' });
  if (state.job && state.job.lastWorkedDay !== state.time.day) {
    out.push({ uid: `work-${state.time.day}`, templateId: 'work_shift', params: { workplace: state.job.workplace }, kind: 'job' });
  }
  for (const d of state.missions.daily) if (!d.done) out.push({ ...d, kind: 'daily' });
  return out;
}

export function missionTarget(m) {
  const tpl = TEMPLATES[m.templateId];
  const loc = resolve(tpl, 'location', m.params);
  if (!loc) return null;
  if (loc === 'park') return { x: 700, y: 1250 };
  return locationById(loc)?.door || null;
}

export function missionInfo(m) {
  const tpl = TEMPLATES[m.templateId];
  return {
    title: tr(resolve(tpl, 'title', m.params, state)),
    goal: tr(resolve(tpl, 'goal', m.params, state)),
    location: resolve(tpl, 'location', m.params),
    reward: resolve(tpl, 'reward', m.params),
    blocked: tpl.requires ? tpl.requires(state) : null,
    vocab: resolve(tpl, 'vocab', m.params) || []
  };
}

export function isComplete(m, done, meta) {
  const tpl = TEMPLATES[m.templateId];
  return tpl.isComplete ? tpl.isComplete(m.params || {}, done, meta) : false;
}

export function completeMission(m) {
  const tpl = TEMPLATES[m.templateId];
  const reward = resolve(tpl, 'reward', m.params) || { xp: 20, social: 2 };
  state.stats.social = clamp(state.stats.social + (reward.social || 0));
  state.stats_total.missions++;
  addXP(reward.xp || 0);
  if (m.kind === 'story' || m.uid === state.missions.story?.uid) advanceStory(m);
  const d = state.missions.daily.find(x => x.uid === m.uid);
  if (d) d.done = true;
  bus.emit('mission', { mission: m, reward });
  save(); changed();
  return reward;
}

function advanceStory(m, extra = {}) {
  const i = state.missions.storyIndex + 1;
  state.missions.storyIndex = i;
  const id = STORY[i];
  if (!id) { state.missions.story = null; toast(t('storyDone'), 'good'); return; }
  const params = id === 'lodging' ? { place: extra.place || state.pendingDestination || 'hotel' } : {};
  state.missions.story = { uid: `story-${i}`, templateId: id, params };
  if (state.missions.trackedUid === m.uid) state.missions.trackedUid = state.missions.story.uid;
}

// Daily missions that are counters (talk to N pedestrians, chat with real players)
export function bumpCounter(key) {
  for (const d of state.missions.daily) {
    const tpl = TEMPLATES[d.templateId];
    if (d.done || tpl.progressKey !== key) continue;
    d.progress = (d.progress || 0) + 1;
    const target = key === 'online_chat' ? 3 : d.params.count || 2;
    if (d.progress >= target) completeMission({ ...d, kind: 'daily' });
  }
  changed();
}

// ── Applying NPC actions ────────────────────────────────────────
// Returns [{ok, action, note}] — `note` is fed back to the NPC as a [GAME: …] event.
export function applyActions(mission, actions) {
  const results = [];
  for (const raw of actions) {
    const v = validateAction(mission, raw, state);
    if (!v.ok) { results.push({ ok: false, action: raw, note: `Action "${raw.type}" failed: ${v.reason}.` }); continue; }
    const a = v.action;
    if (v.cost > 0) {
      if (state.money < v.cost) {
        results.push({ ok: false, action: a, note: `Payment of $${v.cost.toFixed(2)} DECLINED — the player only has $${state.money.toFixed(2)}.`, payFail: true });
        continue;
      }
      state.money = round2(state.money - v.cost);
    }
    let note = v.cost > 0 ? `Payment of $${v.cost.toFixed(2)} succeeded (${a.type}${a.item ? ': ' + a.qty + ' ' + a.item : ''}).` : `Done: ${a.type}.`;
    switch (a.type) {
      case 'set_destination': state.pendingDestination = a.place; break;
      case 'rent':
        state.home = a.place;
        state.rent = { place: a.place, price: a.price, paidUntilDay: state.time.day + (a.place === 'hotel' ? a.nights : 7) };
        break;
      case 'sell':
      case 'service': {
        const it = findCatalogItem(resolve(TEMPLATES[mission.templateId], 'location', mission.params), a.item) || {};
        if (it.sim) state.flags.phone = true;
        if (it.health) state.stats.health = clamp(state.stats.health + it.health);
        if (mission.templateId === 'barber_cut' || resolve(TEMPLATES[mission.templateId], 'location', mission.params) === 'barber') {
          state.stats.social = clamp(state.stats.social + 12);
        }
        if (it.food || it.energy) {
          if (it.eatNow) {
            state.stats.hunger = clamp(state.stats.hunger + (it.food || 0) * a.qty);
            state.stats.energy = clamp(state.stats.energy + (it.energy || 0) * a.qty);
          } else addItem(a.item, a.qty, it.food || 0);
        } else if (!it.sim && !it.health && a.item !== 'tip' && a.type === 'sell') addItem(a.item, a.qty, 0);
        break;
      }
      case 'open_account': state.flags.bank = true; break;
      case 'hire': {
        const prof = professionById(state.player.profession);
        state.job = { title: a.jobTitle || prof.jobTitle, wage: prof.wage, workplace: prof.workplace, since: state.time.day, lastWorkedDay: null };
        toast(`${t('hired')} ${state.job.title} 💼`, 'good');
        note = `The player is now hired as ${state.job.title}.`;
        break;
      }
      case 'reject':
        state.flags.lastInterviewDay = state.time.day;
        toast(t('rejected'), 'warn');
        break;
      case 'work_done': {
        const pay = round2(state.job.wage * (0.6 + a.performance / 250));
        state.money = round2(state.money + pay);
        state.job.lastWorkedDay = state.time.day;
        state.stats.energy = clamp(state.stats.energy - 25);
        advanceTime(7 * 60);
        toast(`${t('paid')} $${pay.toFixed(2)} 💵`, 'good');
        note = `Shift finished. The player was paid $${pay.toFixed(2)}.`;
        break;
      }
    }
    results.push({ ok: true, action: a, cost: v.cost, note });
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
