// Modal panels: missions, inventory, notebook, phone (taxi), settings, location menus.
import { h, $, clear, fmtMoney, esc } from './dom.js';
import * as S from '../state.js';
import { t, tr, setLang } from '../i18n.js';
import { api, getSettings, saveSettings } from '../api.js';
import { LOCATIONS, locationById } from '../../../shared/world.js';
import { NPCS } from '../../../shared/npcs.js';
import { LOCATION_NPC, missionLocation } from '../../../shared/missions.js';
import { CATALOG } from '../../../shared/data.js';

let openModal = null;
export const modalOpen = () => !!openModal;

export function closeModal() {
  if (!openModal) return;
  openModal.remove();
  openModal = null;
}

function modal(title, body, { wide = false } = {}) {
  closeModal();
  const el = h('div', { class: 'modal-back', onclick: e => { if (e.target === el) closeModal(); } },
    h('div', { class: `modal panel ${wide ? 'wide' : ''}` },
      h('div', { class: 'modal-head' }, h('h2', {}, title), h('button', { class: 'ghost close', onclick: closeModal }, '✕')),
      h('div', { class: 'modal-body' }, body)));
  $('#overlay').append(el);
  openModal = el;
  return el;
}

// ── Missions ────────────────────────────────────────────────────
export function missionsPanel() {
  const s = S.getState();
  const list = S.activeMissions();
  const tracked = S.trackedMission();
  const body = h('div', { class: 'mission-list' },
    list.map(m => {
      const info = S.missionInfo(m);
      const loc = info.location && locationById(info.location);
      const counter = m.templateId === 'chat_people' ? ` (${m.progress || 0}/${m.params.count})` : m.templateId === 'online_chat' ? ` (${m.progress || 0}/3)` : '';
      return h('div', { class: `mission-card ${tracked?.uid === m.uid ? 'tracked' : ''}` },
        h('div', { class: 'mission-kind' }, m.kind === 'story' ? `⭐ ${t('story')}` : m.kind === 'job' ? '💼 Job' : `📅 ${t('daily')}`),
        h('div', { class: 'mission-title' }, info.title + counter),
        h('div', { class: 'mission-goal' }, info.goal),
        h('div', { class: 'mission-meta' },
          loc ? h('span', {}, `${loc.icon} ${loc.name}`) : h('span', {}, '🌆 Maple City'),
          h('span', {}, `+${info.reward?.xp || 0} XP`),
          info.blocked ? h('span', { class: 'blocked' }, `🔒 ${reqText(info.blocked)}`) : null),
        h('button', { class: tracked?.uid === m.uid ? 'ghost small' : 'primary small', onclick: () => { S.setTracked(m.uid); missionsPanel(); } }, tracked?.uid === m.uid ? `📍 ${t('tracking')}` : t('track')));
    }),
    h('p', { class: 'muted' }, `${t('day')} ${s.time.day} · ${s.stats_total.missions} ✔ · ${Object.keys(s.vocab).length} 📒`));
  modal(`📋 ${t('missions')}`, body);
}

export function reqText(code) {
  return String(code).split(',').map(c => t('req_' + c)).join(', ');
}

// ── Inventory ───────────────────────────────────────────────────
export function inventoryPanel() {
  const s = S.getState();
  const body = h('div', {},
    h('div', { class: 'wallet' }, h('b', {}, fmtMoney(s.money)), s.flags.bank ? ' · 🏦 First National Bank' : '', s.job ? ` · 💼 ${s.job.title} ($${s.job.wage}/day)` : ''),
    s.rent ? h('p', { class: 'muted' }, `🏠 ${s.rent.place === 'hotel' ? 'Hotel Sunrise' : 'Oak Street Apartments'} — $${s.rent.price}${s.rent.place === 'hotel' ? '/night' : '/week'} · paid until day ${s.rent.paidUntilDay}`) : h('p', { class: 'muted' }, `🏠 ${t('noHome')}`),
    s.inventory.length ? h('div', { class: 'inv' }, s.inventory.map(i => h('div', { class: 'inv-item' },
      h('span', {}, `${i.qty}× ${i.item}`),
      i.food ? h('button', { class: 'small primary', onclick: () => { S.eatItem(i.item); inventoryPanel(); } }, `${t('eat')} (+${i.food} 🍔)`) : null)))
      : h('p', { class: 'muted' }, t('empty')));
  modal(`🎒 ${t('inventory')}`, body);
}

// ── Notebook (vocabulary + flashcards) ──────────────────────────
export function notebookPanel(mode = 'list') {
  const s = S.getState();
  const words = Object.entries(s.vocab).sort((a, b) => (b[1].day - a[1].day) || a[0].localeCompare(b[0]));
  if (!words.length) return modal(`📒 ${t('notebook')}`, h('p', {}, t('noWords')));
  if (mode === 'review') return reviewCard(words);
  const search = h('input', { placeholder: '🔍', oninput: () => render() });
  const list = h('div', { class: 'vocab-list' });
  const render = () => {
    const q = search.value.toLowerCase();
    clear(list).append(words.filter(([w, v]) => !q || w.toLowerCase().includes(q) || v.meaning.toLowerCase().includes(q)).map(([w, v]) =>
      h('div', { class: 'vocab-row' }, h('b', {}, w), h('span', {}, v.meaning || '—'), h('small', {}, `${'★'.repeat(Math.min(5, v.box))}${v.used ? ' · used ' + v.used : ''}`))));
  };
  render();
  modal(`📒 ${t('notebook')} (${words.length})`, h('div', {}, h('div', { class: 'row' }, search, h('button', { class: 'primary', onclick: () => notebookPanel('review') }, `🃏 ${t('review')}`)), list), { wide: true });
}

function reviewCard(words) {
  const due = words.filter(([, v]) => v.meaning).sort((a, b) => a[1].box - b[1].box || Math.random() - 0.5).slice(0, 10);
  let i = 0;
  const card = h('div', { class: 'flashcard' });
  const show = () => {
    if (i >= due.length) { clear(card).append(h('h3', {}, '🎉'), h('button', { class: 'primary', onclick: () => notebookPanel() }, t('notebook'))); return; }
    const [w, v] = due[i];
    const back = h('div', { class: 'back hidden' }, v.meaning);
    clear(card).append(h('div', { class: 'muted' }, `${i + 1}/${due.length}`), h('div', { class: 'front' }, w), back,
      h('div', { class: 'row' },
        h('button', { class: 'ghost', onclick: () => back.classList.remove('hidden') }, t('reveal')),
        h('button', { class: 'ghost', onclick: () => { v.box = Math.max(0, v.box - 1); i++; show(); } }, t('notYet')),
        h('button', { class: 'primary', onclick: () => { v.box = Math.min(5, v.box + 1); S.addXP(2); i++; S.save(); show(); } }, t('knew'))));
  };
  show();
  modal(`🃏 ${t('review')}`, card);
}

// ── Phone: taxi app ─────────────────────────────────────────────
export function phonePanel({ onTaxi }) {
  const s = S.getState();
  const body = h('div', { class: 'phone' },
    h('div', { class: 'phone-apps' },
      app('📋', t('missions'), missionsPanel), app('🎒', t('inventory'), inventoryPanel),
      app('📒', t('notebook'), () => notebookPanel()), app('⚙️', t('settings'), settingsPanel)),
    h('h3', {}, `🚕 ${t('taxi')}`),
    s.flags.phone
      ? h('div', { class: 'taxi-list' }, LOCATIONS.filter(l => l.id !== 'airport').map(l => {
          const d = Math.hypot(l.door.x - s.position.x, l.door.y - s.position.y);
          const cost = Math.round(6 + d / 120);
          return h('button', { class: 'taxi-item', onclick: () => { if (!S.pay(cost)) return S.bus.emit('toast', { text: t('payFail'), kind: 'bad' }); S.advanceTime(Math.round(5 + d / 80)); closeModal(); onTaxi(l); } },
            `${l.icon} ${l.name}`, h('small', {}, `$${cost}`));
        }))
      : h('p', { class: 'muted' }, t('taxiNeedsPhone')));
  modal(`📱 ${t('phone')}`, body);
}
const app = (icon, label, fn) => h('button', { class: 'app', onclick: fn }, h('span', {}, icon), h('small', {}, label));

// ── Settings ────────────────────────────────────────────────────
export async function settingsPanel() {
  const st = getSettings();
  let cfg = { presets: {} };
  try { cfg = await api.config(); } catch { /* server offline */ }
  const providers = ['', 'anthropic', 'openai', 'gemini', 'groq', 'openrouter', 'ollama', 'custom', 'mock'];
  const provider = h('select', {}, providers.map(p => h('option', { value: p, selected: st.provider === p }, p === '' ? `server .env (${cfg.serverProvider || '?'})` : p)));
  const key = h('input', { type: 'password', value: st.apiKey, placeholder: 'sk-… / AIza… / gsk_…', autocomplete: 'off' });
  const modelList = h('datalist', { id: 'model-suggestions' });
  const model = h('input', { value: st.model, placeholder: '', list: 'model-suggestions' });
  const baseUrl = h('input', { value: st.baseUrl, placeholder: '' });
  const status = h('div', { class: 'muted' });
  const updatePh = () => {
    const pr = cfg.presets?.[provider.value];
    model.placeholder = pr?.model || cfg.serverModel || '';
    clear(modelList).append(...(pr?.models || []).map(m => h('option', { value: m })));
    baseUrl.placeholder = pr?.baseUrl || '';
    key.disabled = pr ? !pr.needsKey && provider.value !== 'custom' : !!provider.value;
  };
  provider.onchange = updatePh; updatePh();
  const chk = (k, label) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: st[k], onchange: e => saveSettings({ [k]: e.target.checked }) }), label);
  const lang = h('select', { onchange: e => { saveSettings({ uiLang: e.target.value }); setLang(e.target.value); location.reload(); } },
    [['pt', 'Português'], ['en', 'English']].map(([v, l]) => h('option', { value: v, selected: st.uiLang === v }, l)));
  const values = () => ({ provider: provider.value, apiKey: key.value.trim(), model: model.value.trim(), baseUrl: baseUrl.value.trim() });

  const body = h('div', { class: 'settings' },
    h('h3', {}, `🤖 ${t('providerTitle')}`),
    field(t('provider'), provider), field(t('apiKey'), key), field(t('model'), model), modelList, field(t('baseUrl'), baseUrl),
    h('p', { class: 'note' }, '🔐 ', t('keyNote')),
    cfg.allowClientKeys === false ? h('p', { class: 'note warn' }, 'ALLOW_CLIENT_KEYS=false — the server uses its own .env key.') : null,
    h('div', { class: 'row' },
      h('button', { class: 'ghost', onclick: async () => {
        status.textContent = '…';
        try { const r = await api.test(values()); status.textContent = `✅ ${r.provider} ${r.model || ''}: "${r.sample}"`; } catch (e) { status.textContent = `❌ ${e.message}`; }
      } }, t('test')),
      h('button', { class: 'primary', onclick: () => { saveSettings(values()); status.textContent = '✅ ' + t('save'); } }, t('save'))),
    status,
    h('h3', {}, '🎧 Audio & UI'),
    chk('voice', t('voice')), chk('mic', t('mic')), chk('autoTranslate', t('showTranslation')), chk('checkChat', t('checkChat')),
    field(t('uiLang'), lang),
    S.getState() ? h('button', { class: 'danger small', onclick: () => { if (confirm(t('confirmReset'))) { S.wipe(); location.reload(); } } }, `🗑 ${t('resetSave')}`) : null);
  modal(`⚙️ ${t('settings')}`, body);
}
const field = (label, input) => h('label', { class: 'field' }, h('span', {}, label), input);

// ── Location menu ───────────────────────────────────────────────
const SHOPS = ['bakery', 'grocery', 'cafe', 'diner', 'phone_store', 'barber', 'clinic'];

export function locationMenu(locId, { onStart, onSleep }) {
  const s = S.getState();
  const loc = locationById(locId);
  const opts = [];
  for (const m of S.activeMissions()) {
    if (missionLocation(m) !== locId) continue;
    const info = S.missionInfo(m);
    opts.push(h('button', { class: `opt ${info.blocked ? 'disabled' : 'mission'}`, disabled: !!info.blocked, onclick: () => { closeModal(); onStart(m); } },
      h('b', {}, `${m.kind === 'story' ? '⭐' : m.kind === 'job' ? '💼' : '📅'} ${info.title}`),
      h('small', {}, info.blocked ? `🔒 ${t('reqMissing')}: ${reqText(info.blocked)}` : info.goal)));
  }
  if (s.home === locId) {
    opts.push(h('button', { class: 'opt', onclick: () => { closeModal(); onSleep(); } }, h('b', {}, `🛏️ ${t('sleepNow')}`), h('small', {}, `⚡ ${Math.round(s.stats.energy)}`)));
    if (s.inventory.some(i => i.food)) opts.push(h('button', { class: 'opt', onclick: () => inventoryPanel() }, h('b', {}, `🍽️ ${t('eat')}`), h('small', {}, s.inventory.filter(i => i.food).map(i => i.item).join(', '))));
  }
  const npcId = LOCATION_NPC[locId];
  const npc = NPCS[npcId];
  if (SHOPS.includes(locId)) {
    const sample = Object.keys(CATALOG[locId] || {}).slice(0, 4).join(', ');
    opts.push(h('button', { class: 'opt', onclick: () => { closeModal(); onStart({ uid: `free-${locId}`, templateId: 'shop', params: { place: locId }, kind: 'free' }); } },
      h('b', {}, `${npc?.emoji || '💬'} ${t('freeTalk')} — ${npc?.name || ''}`), h('small', {}, sample + '…')));
  } else if (npc && (locId !== 'airport' || s.missions.storyIndex > 0)) {
    opts.push(h('button', { class: 'opt', onclick: () => { closeModal(); onStart({ uid: `talk-${npcId}`, templateId: 'smalltalk', params: { name: npc.name, persona: `${npc.role}. ${npc.persona}`, emoji: npc.emoji, gender: npc.voice?.gender, role: npc.role }, kind: 'free' }); } },
      h('b', {}, `${npc.emoji} ${t('talk')} ${npc.name}`), h('small', {}, npc.role)));
  }
  modal(`${loc.icon} ${loc.name}`, h('div', { class: 'opts' }, opts));
}
