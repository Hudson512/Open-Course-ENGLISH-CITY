// Heads-up display: stats, clock, tracked mission, prompts, toasts.
import { h, $, clear, fmtTime } from './dom.js';
import { getPack, fmtMoney, packFlags } from '../pack.js';
import { getState, levelFor, trackedMission, missionInfo, bus } from '../state.js';
import { t } from '../i18n.js';
import { online, others } from '../net.js';

let root, statsEl, missionEl, promptEl, toastsEl, netEl;
let scheduled = false;

export function mountHUD() {
  root = $('#hud');
  clear(root);
  statsEl = h('div', { class: 'hud-stats panel' });
  missionEl = h('div', { class: 'hud-mission panel', onclick: () => bus.emit('open-panel', 'missions') });
  promptEl = h('div', { class: 'hud-prompt hidden' });
  toastsEl = h('div', { class: 'toasts' });
  netEl = h('div', { class: 'hud-net' });
  const help = h('div', { class: 'hud-help' }, t('controls'));
  setTimeout(() => help.classList.add('fade'), 25000);
  const buttons = h('div', { class: 'hud-buttons' },
    btn('📋', t('missions'), 'missions'), btn('🎒', t('inventory'), 'inventory'),
    btn('📒', t('notebook'), 'notebook'), btn('📱', t('phone'), 'phone'), btn('⚙️', t('settings'), 'settings'));
  root.append(statsEl, missionEl, promptEl, toastsEl, netEl, buttons, help, h('div', { class: 'minimap-frame' }));
  root.classList.remove('hidden');
  render();
}

function btn(icon, label, panel) {
  return h('button', { class: 'icon-btn', title: label, onclick: () => bus.emit('open-panel', panel) }, icon);
}

export function scheduleRender() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => { scheduled = false; render(); });
}

function bar(label, value, cls) {
  return h('div', { class: 'stat' },
    h('span', { class: 'stat-label' }, label),
    h('div', { class: 'bar' }, h('div', { class: `fill ${cls} ${value < 20 ? 'low' : ''}`, style: { width: `${Math.max(0, value)}%` } })),
    h('span', { class: 'stat-val' }, Math.round(value)));
}

const FLAG_ICONS = { phone: '📱', bank: '🏦' };

function render() {
  const s = getState();
  if (!s || !statsEl) return;
  const lvl = levelFor(s.xp);
  clear(statsEl).append(
    h('div', { class: 'hud-top' },
      h('div', { class: 'avatar', style: { background: '#' + (s.player.color >>> 0).toString(16).padStart(6, '0') } }, s.player.name[0]?.toUpperCase()),
      h('div', { class: 'hud-id' },
        h('div', { class: 'hud-name' }, s.player.name),
        h('div', { class: 'hud-level' }, h('b', { class: 'cefr' }, lvl.id), ` ${s.xp} XP`),
        h('div', { class: 'xpbar' }, h('div', { style: { width: `${lvl.progress * 100}%` } }))),
      h('div', { class: 'hud-right' },
        h('div', { class: `money ${s.money < 50 ? 'low' : ''}` }, fmtMoney(s.money)),
        h('div', { class: 'clock' }, `${t('day')} ${s.time.day} · ${fmtTime(s.time.minutes)}`))),
    bar('❤️', s.stats.health, 'health'),
    bar('🍔', s.stats.hunger, 'hunger'),
    bar('⚡', s.stats.energy, 'energy'),
    bar('💬', s.stats.social, 'social'),
    h('div', { class: 'docs' },
      doc('🏠', s.home ? (getPack().places[s.home]?.short || '✓') : '—', !!s.home),
      // the "documents" this city can give: phone, bank account…
      ...packFlags().map(f => doc(FLAG_ICONS[f] || '📄', s.flags[f] ? f[0].toUpperCase() + f.slice(1) : '—', !!s.flags[f])),
      doc('💼', s.job ? s.job.title : '—', !!s.job))
  );

  const m = trackedMission();
  clear(missionEl);
  if (m) {
    const info = missionInfo(m);
    const loc = info.place;
    missionEl.append(
      h('div', { class: 'mission-kind' }, m.kind === 'story' ? `⭐ ${t('story')}` : m.kind === 'job' ? '💼' : `📅 ${t('daily')}`, h('span', { class: 'mission-more' }, 'M ▸')),
      h('div', { class: 'mission-title' }, info.title),
      h('div', { class: 'mission-goal' }, info.goal),
      ...(loc ? [h('div', { class: 'mission-loc' }, `${loc.icon} ${loc.name}`)] : [])
    );
  } else missionEl.append(h('div', { class: 'mission-title' }, '—'));

  netEl.textContent = online ? `🟢 ${others.size + 1} ${t('online')} · ${t('chatHint')}` : `⚪ ${t('offline')}`;
}

export function showPrompt(text) {
  if (!promptEl) return;
  if (!text) { promptEl.classList.add('hidden'); return; }
  promptEl.classList.remove('hidden');
  if (promptEl.dataset.text !== text) {
    promptEl.dataset.text = text;
    clear(promptEl).append(h('kbd', {}, 'E'), ' ', text);
  }
}

export function toast(text, kind = 'info') {
  if (!toastsEl) return;
  const el = h('div', { class: `toast ${kind}` }, text);
  toastsEl.append(el);
  while (toastsEl.children.length > 4) toastsEl.firstChild.remove();
  setTimeout(() => el.classList.add('out'), 4200);
  setTimeout(() => el.remove(), 4800);
}

function doc(icon, label, ok) {
  return h('span', { class: `doc ${ok ? 'ok' : ''}`, title: label }, icon, h('small', {}, label));
}
