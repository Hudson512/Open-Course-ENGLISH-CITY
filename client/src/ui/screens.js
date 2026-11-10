// Full-screen menus: title, passenger check-in, departures board, flight, game over.
import { h, $, clear } from './dom.js';
import { t } from '../i18n.js';
import { DESTINATIONS, HOME_CITIES, NATIVE_LANGUAGES, PROFESSIONS } from '../../../shared/data.js';
import { getSettings } from '../api.js';
import { getLang } from '../i18n.js';

const screen = () => $('#screen');
function show(...children) { const s = screen(); clear(s).append(...children); s.classList.remove('hidden'); }
export function hideScreen() { const s = screen(); s.classList.add('hidden'); clear(s); }

export function titleScreen({ canContinue, onNew, onContinue, onSettings, notice }) {
  show(h('div', { class: 'title-screen' },
    h('div', { class: 'skyline' }),
    h('div', { class: 'logo' }, h('span', { class: 'logo-small' }, 'OpenCourse'), h('span', { class: 'logo-big' }, 'ENGLISH CITY'), h('span', { class: 'logo-sub' }, t('tagline'))),
    h('div', { class: 'title-buttons' },
      canContinue ? h('button', { class: 'primary big', onclick: onContinue }, `▶ ${t('continue')}`) : null,
      h('button', { class: canContinue ? 'ghost big' : 'primary big', onclick: onNew }, `✈️ ${t('newGame')}`),
      h('button', { class: 'ghost', onclick: onSettings }, `⚙️ ${t('settings')}`),
      notice ? h('div', { class: 'error' }, notice) : null),
    h('div', { class: 'title-foot' }, 'Open source · MIT · Bring your own API key · ', h('a', { href: 'https://github.com', target: '_blank' }, 'GitHub'))));
}

const COLORS = [0xff4757, 0x1e90ff, 0x2ed573, 0xffa502, 0xa55eea, 0xff6b81, 0x00d2d3, 0xf8e71c];

export function createScreen({ onDone, onBack }) {
  const lang = getLang();
  let color = COLORS[Math.floor(Math.random() * COLORS.length)];
  const name = h('input', { maxlength: 18, placeholder: 'Ana', required: true });
  const city = h('input', { list: 'cities', placeholder: 'Luanda' });
  const cities = h('datalist', { id: 'cities' }, HOME_CITIES.map(c => h('option', { value: c })));
  const native = h('select', {}, NATIVE_LANGUAGES.map(l => h('option', { value: l.id, selected: l.id === 'pt' }, l.name)));
  const prof = h('select', {}, PROFESSIONS.map(p => h('option', { value: p.id }, lang === 'pt' ? p.pt : p.en)));
  const detail = h('input', { maxlength: 60 });
  const swatches = h('div', { class: 'swatches' }, COLORS.map(c => {
    const b = h('button', { class: `swatch ${c === color ? 'on' : ''}`, style: { background: '#' + c.toString(16).padStart(6, '0') }, onclick: e => { e.preventDefault(); color = c; swatches.querySelectorAll('.swatch').forEach(x => x.classList.remove('on')); b.classList.add('on'); } });
    return b;
  }));
  const err = h('div', { class: 'error' });
  const field = (label, el) => h('label', { class: 'field' }, h('span', {}, label), el);
  show(h('div', { class: 'card-screen' }, h('div', { class: 'panel form-card' },
    h('div', { class: 'boarding-pass-head' }, '🛂 ', t('createTitle')),
    field(t('name'), name), field(t('homeCity'), city), cities, field(t('nativeLang'), native),
    field(t('profession'), prof), field(t('professionDetail'), detail), field('🎨', swatches), err,
    h('div', { class: 'row' },
      h('button', { class: 'ghost', onclick: onBack }, '←'),
      h('button', { class: 'primary', onclick: () => {
        if (!name.value.trim()) { err.textContent = `${t('name')}?`; name.focus(); return; }
        onDone({ name: name.value.trim(), homeCity: city.value.trim() || 'Luanda', nativeLang: native.value, profession: prof.value, professionDetail: detail.value.trim(), color });
      } }, t('nextBoard'))))));
  name.focus();
}

// `packs` are the cities the server has (open flights); the rest of the board is "coming soon".
export function departuresScreen(player, { packs = [], onBoard }) {
  const langName = code => { try { return new Intl.DisplayNames([getLang()], { type: 'language' }).of(code); } catch { return code; } };
  const open = packs.map(p => ({ id: p.id, flag: p.flag, city: p.name, name: p.country, language: langName(p.language), enabled: true }));
  const rows = [...open, ...DESTINATIONS].map((d, i) => h('tr', { class: d.enabled ? 'on' : 'off', onclick: () => d.enabled && board(d) },
    h('td', {}, `OC${(101 + i * 37)}`),
    h('td', {}, `${d.flag} ${d.city}, ${d.name}`),
    h('td', {}, d.language),
    h('td', {}, h('span', { class: `status ${d.enabled ? 'boarding' : 'soon'}` }, d.enabled ? t('boarding') : t('soon'))),
    h('td', {}, d.enabled ? h('button', { class: 'primary small' }, t('flyTo')) : '')));
  show(h('div', { class: 'card-screen airport-bg' }, h('div', { class: 'board' },
    h('div', { class: 'board-head' }, `✈ ${player.homeCity} International Airport — ${t('departures')}`, h('span', { class: 'board-clock' }, new Date().toTimeString().slice(0, 5))),
    h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Flight'), h('th', {}, t('destination')), h('th', {}, t('language')), h('th', {}, t('status')), h('th', {}, ''))), h('tbody', {}, rows)))));

  function board(d) {
    show(h('div', { class: 'flight' },
      h('div', { class: 'flight-text' }, `${t('flying')} ${d.city}, ${d.name} ${d.flag}`),
      h('div', { class: 'flight-path' }, h('span', { class: 'from' }, player.homeCity), h('div', { class: 'plane' }, '✈️'), h('span', { class: 'to' }, d.city)),
      h('div', { class: 'flight-sub' }, `${t('landing')} ${d.city}…`)));
    setTimeout(() => onBoard(d), 3600);
  }
}

export function gameOverScreen(state, { onRestart }) {
  show(h('div', { class: 'card-screen' }, h('div', { class: 'panel form-card center' },
    h('h1', {}, `😵 ${t('gameOver')}`), h('p', {}, t('gameOverText')),
    h('p', {}, `XP ${state.xp} · ${Object.keys(state.vocab).length} 📒 · ${state.stats_total.missions} ✔ · ${t('day')} ${state.time.day}`),
    h('button', { class: 'primary big', onclick: onRestart }, t('restart')))));
}

export { getSettings };
