// First person inside the game (key V, or 🎥 in the HUD): the ray caster from the city viewer drawn over
// the top-down world. The game itself keeps running underneath — walking, walls, doors, cars hitting,
// missions, dialogues — so everything works the same in every view; this only shows it differently.
import { buildScene } from '../../shared/scene.js';
import { RaycastView } from './viewer/raycast.js';

const MINI_W = 200;

// What another player just said, in a bubble above their head (as in the view from above).
export function wrapText(text, max = 28, lines = 3) {
  const out = [];
  let line = '';
  for (const word of String(text).split(/\s+/)) {
    if (!word) continue;
    if ((line + ' ' + word).trim().length > max && line) { out.push(line); line = word; } else line = (line + ' ' + word).trim();
    if (out.length === lines) break;
  }
  if (line && out.length < lines) out.push(line);
  if (out.join(' ').length < String(text).trim().length) out[out.length - 1] = out[out.length - 1].replace(/.?$/, '…');
  return out;
}

export function speechBubble(g, text, x, bottom, size, W) {
  const lines = wrapText(text);
  g.font = `${size}px system-ui, sans-serif`;
  const w = Math.max(...lines.map(l => g.measureText(l).width)) + size, h = lines.length * size * 1.25 + size * 0.6;
  const left = Math.max(2, Math.min(W - w - 2, x - w / 2)), top = bottom - h - size * 0.4;
  g.fillStyle = 'rgba(255,255,255,0.94)';
  g.beginPath(); g.roundRect(left, top, w, h, size * 0.5); g.fill();
  g.beginPath(); g.moveTo(x - size * 0.4, top + h); g.lineTo(x, bottom); g.lineTo(x + size * 0.4, top + h); g.fill();
  g.fillStyle = '#111'; g.textAlign = 'left'; g.textBaseline = 'top';
  lines.forEach((l, i) => g.fillText(l, left + size / 2, top + size * 0.3 + i * size * 1.25));
  g.textAlign = 'center'; g.textBaseline = 'bottom';
}

export const hexColour = n => (typeof n === 'string' ? n : `#${(n >>> 0 & 0xffffff).toString(16).padStart(6, '0')}`);

// The full-screen layer every non-map view lives in: the picture, a crosshair (first person), a compass
// towards the tracked mission and a minimap in the corner.
export class ViewLayer {
  constructor(scene, { crosshair = true } = {}) {
    this.scene = scene;
    this.root = document.createElement('div');
    this.root.className = 'fp hidden';
    this.root.innerHTML = '<div class="fp-stage"></div>' + (crosshair ? '<div class="fp-cross">+</div>' : '')
      + '<div class="fp-compass hidden"><span class="fp-arrow">➤</span><span class="fp-dist"></span></div>'
      + '<canvas class="fp-mini"></canvas>';
    document.getElementById('game').after(this.root);
    this.stage = this.root.querySelector('.fp-stage');
    this.compass = this.root.querySelector('.fp-compass');
    this.arrow = this.root.querySelector('.fp-arrow');
    this.dist = this.root.querySelector('.fp-dist');
    this.mini = this.root.querySelector('.fp-mini');
    this.miniBase = this.drawMiniBase();
  }

  get shown() { return !this.root.classList.contains('hidden'); }
  show(on) { this.root.classList.toggle('hidden', !on); }

  // The map for the corner, drawn once.
  drawMiniBase() {
    const { scene: s } = this;
    const k = MINI_W / s.width;
    const c = document.createElement('canvas');
    c.width = MINI_W; c.height = Math.round(s.height * k);
    const g = c.getContext('2d');
    g.fillStyle = '#6fae6f'; g.fillRect(0, 0, c.width, c.height);
    if (s.park) { g.fillStyle = '#57b37e'; g.fillRect(s.park.x * k, s.park.y * k, s.park.w * k, s.park.h * k); }
    g.fillStyle = '#4c5563'; for (const r of s.roads) g.fillRect(r.x * k, r.y * k, r.w * k, r.h * k);
    for (const b of s.blocks) { g.fillStyle = b.color; g.fillRect(b.x * k, b.y * k, b.w * k, b.h * k); }
    this.mini.width = c.width; this.mini.height = c.height;
    return c;
  }

  // Minimap with me, the target and the other players, and the compass towards the target.
  update({ me, target = null, others = [] }) {
    const m = this.mini.getContext('2d'), k = MINI_W / this.scene.width;
    m.drawImage(this.miniBase, 0, 0);
    for (const o of others) { m.fillStyle = '#22d3ee'; m.beginPath(); m.arc(o.x * k, o.y * k, 3, 0, 7); m.fill(); }
    if (target) { m.fillStyle = '#ffd32a'; m.beginPath(); m.arc(target.x * k, target.y * k, 4.5, 0, 7); m.fill(); }
    m.fillStyle = '#ff3b3b'; m.strokeStyle = '#fff'; m.lineWidth = 1.5;
    m.beginPath(); m.moveTo(me.x * k + Math.cos(me.a) * 9, me.y * k + Math.sin(me.a) * 9);
    m.lineTo(me.x * k + Math.cos(me.a + 2.5) * 6, me.y * k + Math.sin(me.a + 2.5) * 6);
    m.lineTo(me.x * k + Math.cos(me.a - 2.5) * 6, me.y * k + Math.sin(me.a - 2.5) * 6);
    m.closePath(); m.fill(); m.stroke();

    if (target) {
      const d = Math.hypot(target.x - me.x, target.y - me.y);
      const turn = Math.atan2(target.y - me.y, target.x - me.x) - me.a;
      this.compass.classList.toggle('hidden', d < 60);
      this.arrow.style.transform = `rotate(${turn - Math.PI / 2}rad)`;
      this.dist.textContent = `${Math.round(d / 5)} m`;
    } else this.compass.classList.add('hidden');
  }

  destroy() { this.root.remove(); }
}

export class FirstPerson {
  constructor(pack) {
    this.scene = buildScene(pack);
    this.layer = new ViewLayer(this.scene);
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'fp-view';
    this.layer.stage.append(this.canvas);
    this.view = new RaycastView(this.canvas, this.scene);
  }

  show(on) { this.layer.show(on); if (on) this.view.resize(); }

  // One frame. `me` = { x, y, a }; `moving` = people and cars; `night` = 0…0.5 darkness;
  // `target` = where the tracked mission is ({ x, y }) or null; `others` = other players' dots.
  frame({ me, moving, night = 0, target = null, others = [] }) {
    Object.assign(this.view.pos, me);
    const labels = this.view.render(moving);
    const g = this.view.ctx, { width: W, height: H } = this.canvas;
    if (night > 0) { g.fillStyle = `rgba(10,22,64,${night})`; g.fillRect(0, 0, W, H); }
    g.textAlign = 'center'; g.textBaseline = 'bottom';
    for (const l of labels) {
      const px = Math.round(l.size * W / 900);
      g.font = `600 ${px}px system-ui, sans-serif`;
      g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.7)'; g.strokeText(l.text, l.x, l.y);
      g.fillStyle = '#fffbe6'; g.fillText(l.text, l.x, l.y);
      if (l.say) speechBubble(g, l.say, l.x, l.y - px - 4, Math.max(10, Math.round(W / 70)), W);
    }
    this.layer.update({ me, target, others });
  }

  destroy() { this.layer.destroy(); }
}
