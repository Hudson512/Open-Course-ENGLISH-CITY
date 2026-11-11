// The city as a 3D scene, built from a compiled city pack. Every way of drawing the city (the 2D game,
// the Three.js view, the first-person ray caster) reads this one description, so they always agree.
//
// Units are the pack's pixels (1 cell = pack.map.cell px, 20 by default). The ground is the x/y plane
// of the 2D map; heights (z) use the same units. A storey is STOREY px tall, a person's eyes EYE px.
export const STOREY = 15;
export const EYE = 8.5;

export const GROUND = { grass: 0, road: 1, park: 2 };

// How many floors a building has when the pack does not say: bigger footprints are taller, and
// decoration varies a little (always the same for the same map) so the skyline is not flat.
export function defaultFloors(block, cell, index = 0) {
  const area = (block.w / cell) * (block.h / cell);
  const base = Math.max(1, Math.min(6, Math.round(Math.sqrt(area) / 4)));
  return block.kind === 'decor' ? base + 1 + ((index * 7 + 3) % 4) : base;
}

// The side of a building a door is on, from the door's position.
export function doorSide(r, door) {
  const d = { top: Math.abs(door.y - r.y), bottom: Math.abs(door.y - (r.y + r.h)), left: Math.abs(door.x - r.x), right: Math.abs(door.x - (r.x + r.w)) };
  return Object.keys(d).reduce((a, b) => (d[b] < d[a] ? b : a));
}

export function buildScene(pack) {
  const { cell, width, height, roads, park, decor = [], spawn, taxiStand } = pack.map;
  const cols = Math.ceil(width / cell), rows = Math.ceil(height / cell);

  const blocks = [];
  for (const p of Object.values(pack.places)) {
    const b = { id: p.id, kind: 'place', x: p.x, y: p.y, w: p.w, h: p.h, color: p.color, roof: p.roof, name: p.name, short: p.short || p.name, icon: p.icon || '' };
    b.floors = p.floors || defaultFloors(b, cell);
    b.door = { x: p.door.x, y: p.door.y, side: doorSide(p, p.door) };
    blocks.push(b);
  }
  decor.forEach((d, i) => {
    const b = { id: `decor-${i + 1}`, kind: 'decor', x: d.x, y: d.y, w: d.w, h: d.h, color: '#a4b0be', roof: '#747d8c' };
    b.floors = d.floors || defaultFloors(b, cell, i);
    blocks.push(b);
  });
  for (const b of blocks) b.top = b.floors * STOREY;

  // What is on the ground in each cell, and which building (if any) stands there.
  const ground = new Uint8Array(cols * rows);
  const solid = new Int16Array(cols * rows).fill(-1);
  const fill = (r, fn) => {
    const x0 = Math.max(0, Math.floor(r.x / cell)), x1 = Math.min(cols, Math.ceil((r.x + r.w) / cell));
    const y0 = Math.max(0, Math.floor(r.y / cell)), y1 = Math.min(rows, Math.ceil((r.y + r.h) / cell));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) fn(y * cols + x);
  };
  if (park) fill(park, i => { ground[i] = GROUND.park; });
  for (const r of roads) fill(r, i => { ground[i] = GROUND.road; });
  blocks.forEach((b, n) => fill(b, i => { solid[i] = n; }));

  const scene = { name: pack.name, cell, cols, rows, width, height, roads, park, blocks, spawn, taxiStand, ground, solid };
  scene.props = props(scene);
  return scene;
}

// The building standing on a point of the ground, or null.
export function blockAt(scene, x, y) {
  const cx = Math.floor(x / scene.cell), cy = Math.floor(y / scene.cell);
  if (cx < 0 || cy < 0 || cx >= scene.cols || cy >= scene.rows) return null;
  const n = scene.solid[cy * scene.cols + cx];
  return n < 0 ? null : scene.blocks[n];
}

// Can someone of radius `r` stand at (x, y)? Outside the map counts as a wall.
export function canStand(scene, x, y, r = 6) {
  if (x - r < 0 || y - r < 0 || x + r > scene.width || y + r > scene.height) return false;
  for (const [dx, dy] of [[-r, -r], [r, -r], [-r, r], [r, r], [0, 0]]) if (blockAt(scene, x + dx, y + dy)) return false;
  return true;
}

// Things standing in the street that are not buildings: trees in the park and street lamps along the
// pavements. Always the same for the same map. → [{ kind: 'tree'|'lamp', x, y }]
export function props(scene) {
  const out = [];
  const { park, roads, cell } = scene;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  if (park) {
    const cx = park.x + park.w / 2, cy = park.y + park.h / 2;
    const pond = { x: park.x + park.w * 0.75, y: park.y + park.h * 0.26, rx: park.w * 0.14 + 12, ry: park.h * 0.1 + 12 };
    const wanted = Math.max(6, Math.round(park.w * park.h / 9000));
    for (let tries = 0; out.length < wanted && tries < wanted * 20; tries++) {
      const x = park.x + 16 + rnd() * (park.w - 32), y = park.y + 16 + rnd() * (park.h - 32);
      if (Math.abs(x - cx) < 22 || Math.abs(y - cy) < 22) continue;                       // keep the paths clear
      if (((x - pond.x) / pond.rx) ** 2 + ((y - pond.y) / pond.ry) ** 2 < 1) continue;     // and the pond
      if (out.some(t => Math.hypot(t.x - x, t.y - y) < 26)) continue;
      out.push({ kind: 'tree', x, y });
    }
  }
  const free = (x, y) => !blockAt(scene, x, y) && !roads.some(r => x > r.x - 2 && x < r.x + r.w + 2 && y > r.y - 2 && y < r.y + r.h + 2)
    && !(park && x > park.x && x < park.x + park.w && y > park.y && y < park.y + park.h);
  const gapAt = cell * 7, off = 4;                                                         // on the pavement, near the kerb
  for (const r of roads) {
    const along = r.w > r.h;
    for (let t = gapAt / 2; t < (along ? scene.width : scene.height); t += gapAt) {
      for (const p of along ? [[t, r.y - off], [t, r.y + r.h + off]] : [[r.x - off, t], [r.x + r.w + off, t]]) {
        if (free(p[0], p[1])) out.push({ kind: 'lamp', x: p[0], y: p[1] });
      }
    }
  }
  return out;
}
