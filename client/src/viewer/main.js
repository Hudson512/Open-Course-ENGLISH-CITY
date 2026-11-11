// The city viewer (viewer.html?city=london): the same city pack seen three ways — the map picture the
// checker draws, a 3D city with Three.js, and walking through it in first person (ray casting).
// Made for people creating cities: change the YAML, restart the server, look again.
import './viewer.css';
import { buildScene } from '../../../shared/scene.js';
import { mapSvg } from '../../../tools/pack/preview.js';
import { RaycastView } from './raycast.js';

const lang = (localStorage.getItem('oceg-settings-v1') && JSON.parse(localStorage.getItem('oceg-settings-v1')).uiLang) || ((navigator.language || 'en').startsWith('pt') ? 'pt' : 'en');
const T = {
  pt: { back: 'Jogo', map: 'Mapa', city3d: 'Cidade 3D', walk: 'Primeira pessoa', loading: 'A carregar…', error: 'Não foi possível abrir a cidade',
    helpMap: 'Os números são células [coluna, linha], os mesmos dos ficheiros YAML. Bola vermelha: onde o jogador chega. Círculos brancos: portas.',
    help3d: 'Arrasta para rodar · roda do rato ou dois dedos para aproximar · botão direito ou Shift + arrastar para deslocar.',
    helpWalk: 'W/S ou setas cima/baixo andar · A/D ou setas esquerda/direita rodar · Q/E deslocar de lado · Shift correr · clica na imagem para olhar com o rato (Esc para sair) · no telemóvel, arrasta no ecrã.',
    noWebgl: 'Este browser não consegue mostrar 3D (WebGL).' },
  en: { back: 'Game', map: 'Map', city3d: '3D city', walk: 'First person', loading: 'Loading…', error: 'Could not open the city',
    helpMap: 'Numbers are cells [column, row], the same as in the YAML files. Red dot: where the player lands. White circles: doors.',
    help3d: 'Drag to turn · mouse wheel or two fingers to zoom · right button or Shift + drag to pan.',
    helpWalk: 'W/S or up/down arrows walk · A/D or left/right arrows turn · Q/E step sideways · Shift run · click the picture to look around with the mouse (Esc to stop) · on a phone, drag on the screen.',
    noWebgl: 'This browser cannot show 3D (WebGL).' }
}[lang];
document.documentElement.lang = lang;
document.querySelectorAll('[data-t]').forEach(el => { el.textContent = T[el.dataset.t]; });

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
// the same mouse speed as in the game's Settings
const mouseSpeed = () => { try { return JSON.parse(localStorage.getItem('oceg-settings-v1') || '{}').mouseSpeed || 1; } catch { return 1; } };
let pack = null, scene = null, mode = null, threeView = null, walkView = null, frame = 0;
const keys = new Set();

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
  return res.json();
}

async function open(id) {
  $('help').textContent = T.loading;
  pack = await getJSON(`/api/packs/${encodeURIComponent(id)}`);
  scene = buildScene(pack);
  threeView?.dispose(); threeView = null; walkView = null;
  $('map').innerHTML = mapSvg(pack);
  params.set('city', id); history.replaceState(null, '', `?${params}`);
  document.title = `${pack.name} — City viewer`;
  show(mode || params.get('view') || 'map');
}

async function show(next) {
  mode = next;
  params.set('view', mode); history.replaceState(null, '', `?${params}`);
  document.querySelectorAll('.vw-tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
  document.querySelectorAll('.vw-view').forEach(v => { v.hidden = v.id !== mode; });
  $('help').textContent = { map: T.helpMap, city3d: T.help3d, walk: T.helpWalk }[mode];
  cancelAnimationFrame(frame);
  if (mode === 'city3d') {
    if (!threeView) {
      try {
        const { ThreeView } = await import('./three-view.js');          // Three.js only loads when it is needed
        threeView = new ThreeView($('city3d'), scene);
      } catch (e) { $('city3d').textContent = `${T.noWebgl} (${e.message})`; return; }
    }
    threeView.resize();
    loop();
  } else if (mode === 'walk') {
    walkView ||= new RaycastView($('walk-canvas'), scene);
    $('walk-canvas').focus?.();
    loop();
  }
}

// ── First person: input ─────────────────────────────────────────
addEventListener('keydown', e => { if (mode === 'walk' && !e.target?.closest?.('select, input')) { keys.add(e.key.toLowerCase()); if (e.key.startsWith('Arrow') || e.key === ' ') e.preventDefault(); } });
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());
let drag = null, look = 0;
// Desktop: click the view to steer with the mouse (Esc gives the pointer back). Phones: drag.
const walkCanvas = $('walk-canvas');
walkCanvas.addEventListener('click', () => { if (matchMedia('(pointer: fine)').matches) walkCanvas.requestPointerLock?.(); });
addEventListener('mousemove', e => { if (document.pointerLockElement === walkCanvas) look += e.movementX; });
$('walk').addEventListener('pointerdown', e => { if (document.pointerLockElement || e.pointerType === 'mouse' && matchMedia('(pointer: fine)').matches) return; drag = { x: e.clientX, y: e.clientY }; $('walk').setPointerCapture(e.pointerId); });
$('walk').addEventListener('pointermove', e => { if (drag) { drag.dx = e.clientX - drag.x; drag.dy = e.clientY - drag.y; } });
const endDrag = () => { drag = null; };
$('walk').addEventListener('pointerup', endDrag);
$('walk').addEventListener('pointercancel', endDrag);

function steer(dt) {
  const k = name => keys.has(name);
  const run = k('shift') ? 2.2 : 1;
  let forward = (k('w') || k('arrowup') ? 1 : 0) - (k('s') || k('arrowdown') ? 1 : 0);
  let turn = (k('d') || k('arrowright') ? 1 : 0) - (k('a') || k('arrowleft') ? 1 : 0);
  const strafe = (k('e') ? 1 : 0) - (k('q') ? 1 : 0);
  if (drag?.dx !== undefined) { turn += Math.max(-1, Math.min(1, drag.dx / 120)); forward -= Math.max(-1, Math.min(1, drag.dy / 120)); }
  walkView.move(forward * 90 * run * dt, strafe * 70 * run * dt, turn * 2.2 * dt + look * 0.003 * mouseSpeed());
  look = 0;
}

function minimap() {
  const c = $('mini'), g = c.getContext('2d');
  const s = 150 / Math.max(scene.width, scene.height);
  c.width = Math.round(scene.width * s); c.height = Math.round(scene.height * s);
  g.fillStyle = '#8bc98f'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#57606f'; for (const r of scene.roads) g.fillRect(r.x * s, r.y * s, r.w * s, r.h * s);
  for (const b of scene.blocks) { g.fillStyle = b.color; g.fillRect(b.x * s, b.y * s, b.w * s, b.h * s); }
  const p = walkView.pos;
  g.fillStyle = '#eb4d4b'; g.beginPath(); g.arc(p.x * s, p.y * s, 3.5, 0, 7); g.fill();
  g.strokeStyle = '#eb4d4b'; g.lineWidth = 2; g.beginPath(); g.moveTo(p.x * s, p.y * s); g.lineTo((p.x + Math.cos(p.a) * 120) * s, (p.y + Math.sin(p.a) * 120) * s); g.stroke();
}

let last = 0;
function loop(now = performance.now()) {
  const dt = Math.min(0.05, (now - (last || now)) / 1000);
  last = now;
  if (mode === 'city3d') threeView.render();
  else if (mode === 'walk') {
    steer(dt);
    walkView.render();
    const f = walkView.facing();
    $('facing').textContent = f ? (f.block.kind === 'place' ? `${f.block.icon} ${f.block.name} · ${f.metres} m` : `${f.metres} m`) : '';
    minimap();
  } else return;
  frame = requestAnimationFrame(loop);
}

// ── Start ───────────────────────────────────────────────────────
// For tests and debugging in a hidden tab (where animation frames do not run): draw one frame by hand.
window.__viewer = { step: t => { cancelAnimationFrame(frame); loop(t); }, get walk() { return walkView; }, get three() { return threeView; } };
document.querySelectorAll('.vw-tabs button').forEach(b => b.addEventListener('click', () => show(b.dataset.mode)));
(async () => {
  try {
    const packs = await getJSON('/api/packs');
    const select = $('city');
    select.append(...packs.map(p => Object.assign(document.createElement('option'), { value: p.id, textContent: `${p.flag} ${p.name}` })));
    const wanted = packs.some(p => p.id === params.get('city')) ? params.get('city') : packs[0]?.id;
    select.value = wanted;
    select.addEventListener('change', () => open(select.value).catch(e => { $('help').textContent = `${T.error}: ${e.message}`; }));
    if (wanted) await open(wanted);
  } catch (e) {
    $('help').textContent = `${T.error}: ${e.message}`;
  }
})();
