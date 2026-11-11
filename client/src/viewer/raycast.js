// First person, the way Wolfenstein 3D did it: for every column of the screen one ray walks across the
// map's grid until it meets a building, and the distance says how tall to draw that slice of wall.
// Buildings here have different heights, so a ray keeps going after the first wall it meets: a tall
// building behind a low one still shows above it. Columns are drawn far to near.
//
// On top of that classic idea: the ground is the painted street (ground.js), façades have window
// frames, shop fronts and awnings, the sky has clouds, trees and street lamps are drawn as flat
// pictures facing the player (like Wolfenstein's guards), and the picture size follows the screen
// and the speed of the machine.
//
// cast() is plain arithmetic (tested in Node); RaycastView draws with it.
import { EYE, STOREY, canStand } from '../../../shared/scene.js';
import { groundPixels } from './ground.js';

const MAX_HITS = 6;

// Every building face a ray meets, nearest first: { block, dist, side: 'x'|'y', u } where `dist` is
// measured along the view direction (so walls do not bulge) and `u` is the position along the wall.
export function cast(scene, x, y, angle, maxDist = 1400, viewAngle = angle) {
  const { cell, cols, rows, solid, blocks } = scene;
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const fix = Math.cos(angle - viewAngle);
  let cx = Math.floor(x / cell), cy = Math.floor(y / cell);
  const stepX = dx < 0 ? -1 : 1, stepY = dy < 0 ? -1 : 1;
  const tDx = dx === 0 ? Infinity : Math.abs(cell / dx), tDy = dy === 0 ? Infinity : Math.abs(cell / dy);
  let tX = dx === 0 ? Infinity : ((dx < 0 ? x - cx * cell : (cx + 1) * cell - x) / Math.abs(dx));
  let tY = dy === 0 ? Infinity : ((dy < 0 ? y - cy * cell : (cy + 1) * cell - y) / Math.abs(dy));
  const hits = [];
  let last = cx >= 0 && cy >= 0 && cx < cols && cy < rows ? solid[cy * cols + cx] : -1;
  for (;;) {
    let t, side;
    if (tX < tY) { t = tX; tX += tDx; cx += stepX; side = 'x'; } else { t = tY; tY += tDy; cy += stepY; side = 'y'; }
    if (t > maxDist || cx < 0 || cy < 0 || cx >= cols || cy >= rows) break;
    const n = solid[cy * cols + cx];
    if (n >= 0 && n !== last) {
      const hx = x + dx * t, hy = y + dy * t;
      hits.push({ block: blocks[n], index: n, dist: Math.max(0.5, t * fix), side, u: side === 'x' ? hy : hx, hx, hy, t });
      if (hits.length >= MAX_HITS) break;
    }
    last = n;
  }
  return hits;
}

// Is a point on a building's wall part of its door? (within a cell of the door, on the door's side)
function doorOffset(block, hit, cell) {
  const d = block.door;
  if (!d) return null;
  const vertical = d.side === 'left' || d.side === 'right';
  if ((hit.side === 'x') !== vertical) return null;
  const off = ((vertical ? hit.hy : hit.hx) - (vertical ? d.y : d.x)) / cell;     // -0.5 … 0.5 across the door
  return Math.abs(off) < 0.55 ? off : null;
}

const rgb = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const FOG = [205, 222, 238];

// ── Pictures drawn once ─────────────────────────────────────────
function picture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  return { w, h, px: new Uint32Array(c.getContext('2d').getImageData(0, 0, w, h).data.buffer) };
}
const TREE = () => picture(64, 96, (g, w, h) => {
  g.fillStyle = '#6b4a2f'; g.fillRect(w / 2 - 4, h * 0.55, 8, h * 0.45);
  for (const [x, y, r, c] of [[32, 34, 26, '#2f6b45'], [20, 44, 18, '#2a6040'], [44, 44, 18, '#2a6040'], [32, 22, 18, '#3c8556'], [26, 30, 10, '#4c9a66'], [40, 26, 8, '#58a870']]) {
    g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
});
const LAMP = () => picture(16, 96, (g, w, h) => {
  g.fillStyle = '#2f3640'; g.fillRect(6, 10, 4, h - 10); g.fillRect(4, h - 6, 8, 6);
  g.fillStyle = '#3d4450'; g.fillRect(2, 4, 12, 7);
  g.fillStyle = '#ffe8a3'; g.fillRect(3, 10, 10, 3);
});
// People and cars come in many colours: one picture per colour, made when first needed.
const PERSON = colour => picture(32, 72, (g, w) => {
  g.fillStyle = '#2d3436'; g.fillRect(9, 44, 6, 26); g.fillRect(17, 44, 6, 26);          // legs
  g.fillStyle = colour; g.fillRect(6, 20, 20, 27); g.fillRect(2, 22, 5, 18); g.fillRect(25, 22, 5, 18);   // body and arms
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(6, 40, 20, 7);
  g.fillStyle = '#e0ac7e'; g.beginPath(); g.arc(w / 2, 11, 9, 0, Math.PI * 2); g.fill();   // head
  g.fillStyle = '#3b2a20'; g.beginPath(); g.arc(w / 2, 8, 9, Math.PI, 0); g.fill();         // hair
});
const CAR = colour => picture(96, 40, (g, w, h) => {
  g.fillStyle = colour;
  g.beginPath(); g.roundRect(2, 14, w - 4, 18, 5); g.fill();                                 // body
  g.beginPath(); g.roundRect(22, 3, 52, 15, 6); g.fill();                                    // cabin
  g.fillStyle = '#1b2631'; g.fillRect(27, 6, 19, 10); g.fillRect(50, 6, 19, 10);           // windows
  g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(2, 26, w - 4, 6);
  g.fillStyle = '#111'; for (const x of [22, 74]) { g.beginPath(); g.arc(x, 33, 7, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#fff6a0'; g.fillRect(w - 6, 17, 4, 5);
  g.fillStyle = '#e74c3c'; g.fillRect(2, 17, 4, 5);
});
const SPRITES = {
  tree: { make: TREE, w: 30, h: 44 }, lamp: { make: LAMP, w: 5, h: 30 },
  person: { make: PERSON, w: 5, h: 11 }, car: { make: CAR, w: 22, h: 9 }
};

function skyPanorama() {
  return picture(1024, 160, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#5da9f0'); grad.addColorStop(0.65, '#a9d3f7'); grad.addColorStop(1, '#dcecf8');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    let s = 11; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 26; i++) {                         // soft clouds, wrapping around the horizon
      const cx = rnd() * w, cy = 20 + rnd() * (h * 0.55), size = 18 + rnd() * 30;
      for (let j = 0; j < 7; j++) {
        const x = cx + (rnd() - 0.5) * size * 2.6, y = cy + (rnd() - 0.5) * size * 0.5, r = size * (0.45 + rnd() * 0.5);
        g.fillStyle = `rgba(255,255,255,${0.35 + rnd() * 0.3})`;
        for (const ox of [-w, 0, w]) { g.beginPath(); g.ellipse(x + ox, y, r * 1.5, r * 0.7, 0, 0, Math.PI * 2); g.fill(); }
      }
    }
  });
}

export class RaycastView {
  constructor(canvas, scene) {
    this.canvas = canvas;
    this.scene = scene;
    this.ctx = canvas.getContext('2d');
    this.fov = Math.PI * 0.4;                              // 72° across
    this.maxDist = 1600;
    this.quality = 0.55;                                   // share of the screen's pixels drawn; adapts to the machine
    this.frameMs = [];
    this.colors = scene.blocks.map(b => ({ wall: rgb(b.color), roof: rgb(b.roof) }));
    this.near = groundPixels(scene, 0.5);                  // the street, sharp up close…
    this.far = groundPixels(scene, 0.125);                 // …and smoothed far away (no shimmering)
    this.sky = skyPanorama();
    this.pictures = new Map();                             // 'tree', 'person:#e84393'… → picture
    const s = scene.spawn;
    this.pos = { x: s.x, y: s.y, a: 0 };
    this.lookToward(scene.width / 2, scene.height / 2);
    this.resize();
  }

  lookToward(x, y) { this.pos.a = Math.atan2(y - this.pos.y, x - this.pos.x); }

  // Match the picture to the size of the screen (and the speed of the machine).
  resize() {
    const box = this.canvas.parentElement || this.canvas;
    const cssW = box.clientWidth || 800, cssH = box.clientHeight || 450;
    const k = Math.min(1, (window.devicePixelRatio || 1) * this.quality);
    const W = Math.max(240, Math.min(1280, Math.round(cssW * k)));
    const H = Math.max(135, Math.round(W * cssH / cssW));
    if (W === this.canvas.width && H === this.canvas.height && this.img) return;
    this.canvas.width = W; this.canvas.height = H;
    this.img = this.ctx.createImageData(W, H);
    this.px = new Uint32Array(this.img.data.buffer);
    this.zbuf = new Float32Array(W);
    this.proj = (W / 2) / Math.tan(this.fov / 2);
  }

  // Walk/turn by the given amounts, sliding along walls instead of stopping dead.
  move(forward, strafe, turn) {
    const p = this.pos;
    p.a += turn;
    const nx = p.x + Math.cos(p.a) * forward + Math.cos(p.a + Math.PI / 2) * strafe;
    const ny = p.y + Math.sin(p.a) * forward + Math.sin(p.a + Math.PI / 2) * strafe;
    if (canStand(this.scene, nx, p.y)) p.x = nx;
    if (canStand(this.scene, p.x, ny)) p.y = ny;
  }

  // What the player is looking at, for the label under the crosshair.
  facing() {
    const hit = cast(this.scene, this.pos.x, this.pos.y, this.pos.a, this.maxDist)[0];
    return hit ? { block: hit.block, metres: Math.round(hit.dist / 5) } : null;
  }

  // `moving`: people, cars and other players this frame — [{ kind: 'person'|'car', x, y, color, label? }].
  // Returns the names to write above the people that are close and in sight: [{ x, y, text, size }].
  render(moving = []) {
    const t0 = performance.now();
    this.resize();
    const { canvas: { width: W, height: H }, px, scene, proj, pos, maxDist, zbuf } = this;
    const horizon = H / 2;
    const fogAt = d => Math.min(0.92, (d / maxDist) ** 1.3);
    const put = (i, r, g, b, fog) => {
      px[i] = (255 << 24) | ((b + (FOG[2] - b) * fog) << 16) | ((g + (FOG[1] - g) * fog) << 8) | (r + (FOG[0] - r) * fog);
    };

    // sky: a panorama that turns with the player
    const sky = this.sky, TAU = Math.PI * 2;
    for (let x = 0; x < W; x++) {
      const a = pos.a + Math.atan((x - W / 2) / proj);
      const u = Math.floor((((a % TAU) + TAU) % TAU) / TAU * sky.w);
      for (let y = 0; y < horizon; y++) px[y * W + x] = sky.px[Math.min(sky.h - 1, Math.floor(y / horizon * sky.h)) * sky.w + u];
    }

    // ground: every row below the horizon is at one distance; walk across it reading the street picture
    const left = pos.a - this.fov / 2, right = pos.a + this.fov / 2;
    const lx = Math.cos(left), ly = Math.sin(left), rx = Math.cos(right), ry = Math.sin(right);
    const fixEdge = 1 / Math.cos(this.fov / 2);
    for (let y = Math.ceil(horizon); y < H; y++) {
      const dist = EYE * proj / (y - horizon + 0.5);
      const d = dist * fixEdge, fog = fogAt(dist);
      const tex = dist > 260 ? this.far : this.near, k = tex.scale;
      let wx = (pos.x + lx * d) * k, wy = (pos.y + ly * d) * k;
      const sx = (rx - lx) * d * k / W, sy = (ry - ly) * d * k / W;
      const row = y * W;
      for (let x = 0; x < W; x++, wx += sx, wy += sy) {
        const ix = wx | 0, iy = wy | 0;
        if (ix < 0 || iy < 0 || ix >= tex.width || iy >= tex.height) { put(row + x, 111, 174, 111, fog); continue; }
        const c = tex.px[iy * tex.width + ix];
        put(row + x, c & 255, (c >> 8) & 255, (c >> 16) & 255, fog);
      }
    }

    // walls, column by column
    const cell = scene.cell;
    for (let x = 0; x < W; x++) {
      const a = pos.a + Math.atan((x - W / 2) / proj);
      const hits = cast(scene, pos.x, pos.y, a, maxDist, pos.a);
      zbuf[x] = hits.length ? hits[0].dist : Infinity;
      for (let i = hits.length - 1; i >= 0; i--) this.wallColumn(x, hits[i], horizon, cell, fogAt(hits[i].dist), put);
    }

    const labels = this.drawProps(horizon, fogAt, put, moving);
    this.ctx.putImageData(this.img, 0, 0);
    this.adapt(performance.now() - t0);
    return labels;
  }

  // One slice of a façade: windows with frames, floors, a shop front and awning on the ground floor of
  // places, the door, a cornice and the roof edge, with a soft shadow where the wall meets the ground.
  wallColumn(x, h, horizon, cell, fog, put) {
    const { canvas: { width: W, height: H } } = this;
    const b = h.block, col = this.colors[h.index], place = b.kind === 'place';
    const scale = this.proj / h.dist;
    const top = Math.max(0, Math.floor(horizon - (b.top - EYE) * scale));
    const bottom = Math.min(H - 1, Math.ceil(horizon + EYE * scale));
    const light = h.side === 'x' ? 0.8 : 1;
    const door = place ? doorOffset(b, h, cell) : null;
    const cellNo = Math.floor(h.u / cell);
    const uIn = h.u / cell - cellNo;                                   // 0…1 across one cell of wall
    const [wr, wg, wb] = col.wall, [rr, rg, rb] = col.roof;
    for (let y = top; y <= bottom; y++) {
      const z = EYE + (horizon - y) / scale;                           // height of this pixel on the wall
      const floor = Math.floor(z / STOREY), zIn = z / STOREY - floor;
      let r = wr, g = wg, bl = wb, k = light;
      if (z > b.top - 1.6) { r = rr; g = rg; bl = rb; }                // roof edge
      else if (z > b.top - 3.2) k *= 0.72;                             // cornice shadow
      else if (door !== null && z < STOREY * 0.78) {
        const frame = Math.abs(door) > 0.4 || z > STOREY * 0.72;
        if (frame) { r = 236; g = 232; bl = 222; } else { r = 74; g = 48; bl = 34; if (Math.abs(door) < 0.05) { r = 52; g = 34; bl = 24; } }
      } else if (door !== null && floor === 0 && zIn > 0.8) { r = rr; g = rg; bl = rb; k *= 1.1; }   // sign over the door
      else if (floor === 0 && place) {
        if (zIn > 0.8) {                                               // striped awning
          const stripe = Math.floor(uIn * 6) % 2 === 0;
          if (stripe) { r = rr; g = rg; bl = rb; } else { r = 245; g = 242; bl = 235; }
          k *= zIn > 0.95 ? 0.75 : 1;
        } else if (uIn > 0.06 && uIn < 0.94 && zIn > 0.14 && zIn < 0.72) {   // shop window
          const shine = 1 - (zIn - 0.14) / 0.58;
          r = 120 + shine * 70; g = 150 + shine * 60; bl = 170 + shine * 55;
        } else if (uIn > 0.03 && uIn < 0.97 && zIn > 0.1 && zIn < 0.76) { r = 240; g = 238; bl = 230; }   // its frame
      } else if (zIn < 0.05 && floor > 0) k *= 0.82;                   // line between floors
      else if (uIn > 0.27 && uIn < 0.73 && zIn > 0.3 && zIn < 0.82) { // window
        if (uIn > 0.31 && uIn < 0.69 && zIn > 0.35 && zIn < 0.78) {
          const lit = place && ((cellNo * 7 + floor * 13 + h.index) % 5) !== 0;
          const shine = (zIn - 0.35) / 0.43;
          if (lit) { r = 255; g = 226 + shine * 20; bl = 150 + shine * 40; } else { r = 70 + shine * 60; g = 96 + shine * 70; bl = 122 + shine * 80; }
          if (uIn > 0.49 && uIn < 0.51) { r *= 0.6; g *= 0.6; bl *= 0.6; }   // the window's middle bar
        } else { r = Math.min(255, wr * 0.55 + 120); g = Math.min(255, wg * 0.55 + 120); bl = Math.min(255, wb * 0.55 + 120); }   // frame
      } else if (zIn > 0.24 && zIn < 0.3 && uIn > 0.25 && uIn < 0.75) k *= 0.7;   // window sill shadow
      if (z < 1.4) k *= 0.62;                                          // plinth
      else if (z < 7) k *= 0.78 + 0.22 * (z / 7);                      // shadow near the ground
      put(y * W + x, (r * k) | 0, (g * k) | 0, (bl * k) | 0, fog);
    }
  }

  // Trees and street lamps: flat pictures always facing the player, hidden behind nearer walls.
  drawProps(horizon, fogAt, put, moving = []) {
    const { canvas: { width: W, height: H }, pos, proj, zbuf, maxDist, scene } = this;
    const ca = Math.cos(pos.a), sa = Math.sin(pos.a);
    const seen = [];
    const labels = [];
    for (const p of moving.length ? scene.props.concat(moving) : scene.props) {
      const dx = p.x - pos.x, dy = p.y - pos.y;
      const depth = dx * ca + dy * sa;
      if (depth < 4 || depth > maxDist) continue;
      const side = -dx * sa + dy * ca;
      if (Math.abs(side) > depth * 1.2 + 40) continue;
      seen.push({ p, depth, side });
    }
    seen.sort((a, b) => b.depth - a.depth);
    for (const { p, depth, side } of seen) {
      const key = p.color ? `${p.kind}:${p.color}` : p.kind;
      let pic = this.pictures.get(key);
      if (!pic) { const s = SPRITES[p.kind]; if (!s) continue; pic = { ...s, img: s.make(p.color) }; this.pictures.set(key, pic); }
      const img = pic.img;
      const scale = proj / depth;
      const sw = pic.w * scale, sh = pic.h * scale;
      const cx = W / 2 + side * scale;
      const bottom = horizon + EYE * scale, top = bottom - sh;
      const x0 = Math.max(0, Math.floor(cx - sw / 2)), x1 = Math.min(W - 1, Math.ceil(cx + sw / 2));
      const y0 = Math.max(0, Math.floor(top)), y1 = Math.min(H - 1, Math.ceil(bottom));
      const fog = fogAt(depth);
      for (let x = x0; x <= x1; x++) {
        if (zbuf[x] < depth) continue;
        const u = Math.min(img.w - 1, Math.floor((x - (cx - sw / 2)) / sw * img.w));
        if (u < 0) continue;
        for (let y = y0; y <= y1; y++) {
          const v = Math.min(img.h - 1, Math.floor((y - top) / sh * img.h));
          const c = img.px[v * img.w + u];
          if ((c >>> 24) < 128) continue;
          put(y * W + x, c & 255, (c >> 8) & 255, (c >> 16) & 255, fog);
        }
      }
      if (p.label && depth < 260 && cx > 0 && cx < W && zbuf[Math.round(cx)] > depth) labels.push({ x: cx, y: top - 3, text: p.label, size: Math.max(9, Math.min(16, 900 / depth)) });
    }
    return labels;
  }

  // Draw fewer pixels on a slow machine, more on a fast one.
  adapt(ms) {
    this.frameMs.push(ms);
    if (this.frameMs.length < 20) return;
    const avg = this.frameMs.reduce((a, b) => a + b) / this.frameMs.length;
    this.frameMs.length = 0;
    if (avg > 14 && this.quality > 0.3) this.quality *= 0.85;
    else if (avg < 7 && this.quality < 1) this.quality = Math.min(1, this.quality * 1.15);
  }
}
