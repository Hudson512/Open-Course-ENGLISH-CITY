// Modal panels: missions, inventory, notebook, phone (taxi), settings, location menus.
import { h, $, clear, esc } from './dom.js';
import { getPack, fmtMoney, arrivalPlace, visitMission, socialMission } from '../pack.js';
import * as S from '../state.js';
import { t, tr, setLang } from '../i18n.js';
import { api, getSettings, saveSettings } from '../api.js';
import { dueCards } from '../../../shared/course.js';

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
      const loc = info.place;
      const c = S.missionCounter(m);
      const counter = c ? ` (${c.progress}/${c.target})` : '';
      return h('div', { class: `mission-card ${tracked?.uid === m.uid ? 'tracked' : ''}` },
        h('div', { class: 'mission-kind' }, m.kind === 'story' ? `⭐ ${t('story')}` : m.kind === 'job' ? '💼 Job' : `📅 ${t('daily')}`),
        h('div', { class: 'mission-title' }, info.title + counter),
        h('div', { class: 'mission-goal' }, info.goal),
        h('div', { class: 'mission-meta' },
          loc ? h('span', {}, `${loc.icon} ${loc.name}`) : h('span', {}, `🌆 ${getPack().name}`),
          h('span', {}, `+${info.reward?.xp || 0} XP`),
          info.blocked ? h('span', { class: 'blocked' }, `🔒 ${reqText(info.blocked)}`) : null),
        h('button', { class: tracked?.uid === m.uid ? 'ghost small' : 'primary small', onclick: () => { S.setTracked(m.uid); missionsPanel(); } }, tracked?.uid === m.uid ? `📍 ${t('tracking')}` : t('track')));
    }),
    h('p', { class: 'muted' }, `${t('day')} ${s.time.day} · ${s.stats_total.missions} ✔ · ${Object.keys(s.vocab).length} 📒`));
  modal(`📋 ${t('missions')}`, body);
}

// What is missing, in words. Cities can invent requirements: unknown ones are shown as written.
export function reqText(codes) {
  return [].concat(codes).map(c => { const k = 'req_' + c, s = t(k); return s === k ? String(c).replace(/_/g, ' ') : s; }).join(', ');
}

// ── Inventory ───────────────────────────────────────────────────
export function inventoryPanel() {
  const s = S.getState();
  const home = s.rent && getPack().places[s.rent.place];
  const body = h('div', {},
    h('div', { class: 'wallet' }, h('b', {}, fmtMoney(s.money)), s.flags.bank ? ' · 🏦 ✓' : '', s.job ? ` · 💼 ${s.job.title} (${fmtMoney(s.job.wage)}/day)` : ''),
    s.rent ? h('p', { class: 'muted' }, `🏠 ${home?.name || s.rent.place} — ${fmtMoney(s.rent.price)}/${home?.lodging?.per || 'week'} · paid until day ${s.rent.paidUntilDay}`) : h('p', { class: 'muted' }, `🏠 ${t('noHome')}`),
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
  // the cards whose time has come first (spaced repetition), then the least known
  const today = S.getState().time.day;
  const waiting = dueCards(S.getState().vocab, today);
  const due = (waiting.length ? waiting : words.filter(([, v]) => v.meaning).sort((a, b) => a[1].box - b[1].box)).slice(0, 12);
  let i = 0;
  const card = h('div', { class: 'flashcard' });
  const show = () => {
    if (i >= due.length) { clear(card).append(h('h3', {}, '🎉'), h('button', { class: 'primary', onclick: () => notebookPanel() }, t('notebook'))); return; }
    const [w, v] = due[i];
    const back = h('div', { class: 'back hidden' }, v.meaning);
    clear(card).append(h('div', { class: 'muted' }, `${i + 1}/${due.length}`), h('div', { class: 'front' }, w), back,
      h('div', { class: 'row' },
        h('button', { class: 'ghost', onclick: () => back.classList.remove('hidden') }, t('reveal')),
        h('button', { class: 'ghost', onclick: () => { v.box = 0; v.reviewed = today; i++; S.save(); show(); } }, t('notYet')),
        h('button', { class: 'primary', onclick: () => { v.box = Math.min(5, (v.box || 0) + 1); v.reviewed = today; S.addXP(2); i++; S.save(); show(); } }, t('knew'))));
  };
  show();
  modal(`🃏 ${t('review')}`, card);
}

// ── Phone: taxi app ─────────────────────────────────────────────
export function phonePanel({ onTaxi, notes = [] }) {
  const s = S.getState();
  const school = getPack().places[getPack().school];
  const note = n => n.kind === 'lesson'
    ? h('div', { class: `note ${n.forMission ? 'urgent' : ''}` }, h('span', {}, '📚'),
        h('div', {}, h('b', {}, (n.forMission ? t('noteLessonUrgent') : t('noteLesson')).replace('{lesson}', tr(n.lesson.title))), h('small', {}, `${n.lesson.level} · ${school ? school.name : ''}`)),
        school ? h('button', { class: 'primary small', onclick: () => { S.guideTo(school.id); closeModal(); S.bus.emit('toast', { text: `🧭 ${t('goToSchool')}: ${school.name}` }); } }, t('goToSchool')) : null)
    : h('div', { class: 'note' }, h('span', {}, '🃏'), h('div', {}, h('b', {}, t('noteReview').replace('{n}', n.count))),
        h('button', { class: 'primary small', onclick: () => notebookPanel('review') }, t('reviewNow')));
  const body = h('div', { class: 'phone' },
    h('h3', {}, `📝 ${t('notes')}`),
    h('div', { class: 'notes' }, notes.length ? notes.map(note) : h('p', { class: 'muted' }, t('noNotes'))),
    h('div', { class: 'phone-apps' },
      app('📋', t('missions'), missionsPanel), app('🎒', t('inventory'), inventoryPanel),
      app('📒', t('notebook'), () => notebookPanel()), app('⚙️', t('settings'), settingsPanel)),
    h('h3', {}, `🚕 ${t('taxi')}`),
    s.flags.phone
      ? h('div', { class: 'taxi-list' }, Object.values(getPack().places).filter(l => l.id !== arrivalPlace()).map(l => {
          const d = Math.hypot(l.door.x - s.position.x, l.door.y - s.position.y);
          const cost = Math.round(6 + d / 120);
          return h('button', { class: 'taxi-item', onclick: () => { if (!S.pay(cost)) return S.bus.emit('toast', { text: t('payFail'), kind: 'bad' }); S.advanceTime(Math.round(5 + d / 80)); closeModal(); onTaxi(l); } },
            `${l.icon} ${l.name}`, h('small', {}, fmtMoney(cost)));
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
    chk('voice', t('voice')), chk('mic', t('mic')), chk('handsFree', t('handsFree')), chk('autoTranslate', t('showTranslation')), chk('checkChat', t('checkChat')),
    field(t('mouseSpeed'), mouseSpeed(st)),
    field(t('uiLang'), lang),
    ...(cfg.persistence ? cloudSection() : []),
    S.getState() ? h('button', { class: 'danger small', onclick: () => { if (confirm(t('confirmReset'))) { S.wipe(); location.reload(); } } }, `🗑 ${t('resetSave')}`) : null);
  modal(`⚙️ ${t('settings')}`, body);
}
function cloudSection() {
  const msg = h('div', { class: 'muted' });
  const code = h('input', { readonly: true, value: S.saveCode(), onfocus: e => e.target.select() });
  const restore = h('input', { placeholder: 'p_xxxxxxxx.…', autocomplete: 'off' });
  return [
    h('h3', {}, `☁️ ${t('cloudTitle')}`),
    h('p', { class: 'note' }, t('cloudNote')),
    S.getState() ? field(t('saveCode'), code) : null,
    S.getState() ? h('button', { class: 'ghost small', onclick: async () => {
      try { await navigator.clipboard.writeText(code.value); } catch { code.select(); }
      msg.textContent = (await S.syncNow()) ? `✅ ${t('cloudSynced')}` : `❌ ${t('cloudFailed')}`;
    } }, t('copySync')) : null,
    field(t('restoreCode'), restore),
    h('button', { class: 'ghost small', onclick: async () => {
      if (S.getState() && !confirm(t('confirmRestore'))) return;
      try { await S.restoreFromServer(restore.value); location.reload(); } catch (e) { msg.textContent = `❌ ${e.message}`; }
    } }, t('restore')),
    msg
  ];
}
const field = (label, input) => h('label', { class: 'field' }, h('span', {}, label), input);

// How fast the mouse turns you in first person: a slider from slow to fast, saved as you move it.
function mouseSpeed(st) {
  const value = h('output', {}, `${(st.mouseSpeed ?? 1).toFixed(1)}×`);
  const slider = h('input', { type: 'range', min: 0.3, max: 3, step: 0.1, value: st.mouseSpeed ?? 1,
    oninput: e => { const v = Number(e.target.value); saveSettings({ mouseSpeed: v }); value.textContent = `${v.toFixed(1)}×`; } });
  return h('span', { class: 'range-row' }, slider, value);
}

// ── Location menu ───────────────────────────────────────────────
export function locationMenu(locId, { onStart, onSleep }) {
  const s = S.getState();
  const loc = getPack().places[locId];
  const opts = [];
  for (const m of S.activeMissions()) {
    if (S.missionPlace(m) !== locId) continue;
    const info = S.missionInfo(m);
    opts.push(h('button', { class: `opt ${info.blocked ? 'disabled' : 'mission'}`, disabled: !!info.blocked, onclick: () => { closeModal(); onStart(m); } },
      h('b', {}, `${m.kind === 'story' ? '⭐' : m.kind === 'job' ? '💼' : '📅'} ${info.title}`),
      h('small', {}, info.blocked ? `🔒 ${t('reqMissing')}: ${reqText(info.blocked)}` : info.goal)));
  }
  if (s.home === locId) {
    opts.push(h('button', { class: 'opt', onclick: () => { closeModal(); onSleep(); } }, h('b', {}, `🛏️ ${t('sleepNow')}`), h('small', {}, `⚡ ${Math.round(s.stats.energy)}`)));
    if (s.inventory.some(i => i.food)) opts.push(h('button', { class: 'opt', onclick: () => inventoryPanel() }, h('b', {}, `🍽️ ${t('eat')}`), h('small', {}, s.inventory.filter(i => i.food).map(i => i.item).join(', '))));
  }
  // Outside missions: shop freely where something is sold, otherwise just chat with whoever is there.
  const npc = loc.character;
  const stock = Object.keys({ ...loc.sells, ...loc.services });
  if (stock.length && visitMission()) {
    opts.push(h('button', { class: 'opt', onclick: () => { closeModal(); onStart({ uid: `free-${locId}`, templateId: visitMission(), params: { place: locId }, kind: 'free' }); } },
      h('b', {}, `${npc?.emoji || '💬'} ${t('freeTalk')} — ${npc?.name || ''}`), h('small', {}, stock.slice(0, 4).join(', ') + '…')));
  } else if (npc && socialMission() && (locId !== arrivalPlace() || s.missions.storyIndex > 0)) {
    opts.push(h('button', { class: 'opt', onclick: () => { closeModal(); onStart({ uid: `talk-${locId}`, templateId: socialMission(), params: { name: npc.name, persona: `${npc.role}. ${npc.persona}`, emoji: npc.emoji, voice: npc.voice, role: npc.role }, kind: 'free' }); } },
      h('b', {}, `${npc.emoji} ${t('talk')} ${npc.name}`), h('small', {}, npc.role)));
  }
  modal(`${loc.icon} ${loc.name}`, h('div', { class: 'opts' }, opts));
}
