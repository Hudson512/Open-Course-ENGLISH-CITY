// The ground of a city painted as a picture: grass, pavements, roads with lane markings and zebra
// crossings, and the park with its paths and pond. The 3D view lays it under the buildings and the
// first-person view reads its pixels, so both show the same streets.
import { GROUND } from '../../../shared/scene.js';

export const PAVEMENT = 9;              // px of pavement on each side of a road

// A tiny, repeatable random generator, so the same city always gets the same speckles.
function random(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

// → a canvas `scale` pixels per map pixel (scale 0.5 = one pixel every 2 px of map).
export function paintGround(scene, scale = 0.5) {
  const { width, height, roads, park } = scene;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(width * scale)); c.height = Math.max(1, Math.round(height * scale));
  const g = c.getContext('2d');
  g.scale(scale, scale);
  const rnd = random(width * 31 + height);

  // grass, with a little texture so distance and movement can be felt
  g.fillStyle = '#6fae6f'; g.fillRect(0, 0, width, height);
  for (let i = 0; i < width * height / 60; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(40,90,40,0.16)' : 'rgba(200,240,170,0.12)';
    g.fillRect(rnd() * width, rnd() * height, 2 + rnd() * 4, 2 + rnd() * 4);
  }

  // park: lawn, paths and a pond
  if (park) {
    g.fillStyle = '#57b37e'; g.fillRect(park.x, park.y, park.w, park.h);
    for (let i = 0; i < park.w * park.h / 80; i++) {
      g.fillStyle = rnd() < 0.5 ? 'rgba(30,90,50,0.18)' : 'rgba(210,250,190,0.14)';
      g.fillRect(park.x + rnd() * park.w, park.y + rnd() * park.h, 2 + rnd() * 3, 2 + rnd() * 3);
    }
    const cx = park.x + park.w / 2, cy = park.y + park.h / 2;
    g.fillStyle = '#e3d5a8';
    g.fillRect(cx - 9, park.y, 18, park.h); g.fillRect(park.x, cy - 9, park.w, 18);
    g.beginPath(); g.arc(cx, cy, 34, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#4ea8de';
    g.beginPath(); g.ellipse(park.x + park.w * 0.75, park.y + park.h * 0.26, park.w * 0.14, park.h * 0.1, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#3d8bc4'; g.lineWidth = 3; g.stroke();
  }

  // pavements first (a road widened on both sides), then the roads on top
  g.fillStyle = '#c9cdd3';
  for (const r of roads) {
    if (r.w > r.h) g.fillRect(0, r.y - PAVEMENT, width, r.h + PAVEMENT * 2);
    else g.fillRect(r.x - PAVEMENT, 0, r.w + PAVEMENT * 2, height);
  }
  g.fillStyle = 'rgba(0,0,0,0.08)';                         // paving slabs
  for (const r of roads) {
    if (r.w > r.h) for (let x = 0; x < width; x += 14) { g.fillRect(x, r.y - PAVEMENT, 1, PAVEMENT); g.fillRect(x, r.y + r.h, 1, PAVEMENT); }
    else for (let y = 0; y < height; y += 14) { g.fillRect(r.x - PAVEMENT, y, PAVEMENT, 1); g.fillRect(r.x + r.w, y, PAVEMENT, 1); }
  }
  g.fillStyle = '#9aa1ab';                                  // kerbs: the road's edge, under the road itself
  for (const r of roads) g.fillRect(r.x - 1.5, r.y - 1.5, r.w + 3, r.h + 3);
  g.fillStyle = '#4c5563';
  for (const r of roads) g.fillRect(r.x, r.y, r.w, r.h);
  for (let i = 0; i < width * height / 400; i++) {          // a little wear on the tarmac
    const x = rnd() * width, y = rnd() * height;
    g.fillStyle = 'rgba(0,0,0,0.07)'; g.fillRect(x, y, 2 + rnd() * 6, 1 + rnd() * 2);
  }
  const across = roads.filter(r => r.w > r.h), down = roads.filter(r => r.w <= r.h);
  const crossings = [];
  for (const a of across) for (const d of down) crossings.push({ x: d.x, y: a.y, w: d.w, h: a.h });
  const inCrossing = (x, y) => crossings.some(k => x > k.x - 4 && x < k.x + k.w + 4 && y > k.y - 4 && y < k.y + k.h + 4);

  // lane markings: dashed centre lines, broken where roads cross
  g.fillStyle = '#eef0f3';
  for (const r of across) for (let x = 6; x < width; x += 44) if (!inCrossing(x + 12, r.y + r.h / 2)) g.fillRect(x, r.y + r.h / 2 - 1.5, 24, 3);
  for (const r of down) for (let y = 6; y < height; y += 44) if (!inCrossing(r.x + r.w / 2, y + 12)) g.fillRect(r.x + r.w / 2 - 1.5, y, 3, 24);

  // zebra crossings on every side of every junction
  g.fillStyle = '#f5f6f8';
  for (const k of crossings) {
    for (let x = k.x + 3; x < k.x + k.w - 4; x += 9) { g.fillRect(x, k.y - PAVEMENT - 14, 5, 12); g.fillRect(x, k.y + k.h + PAVEMENT + 2, 5, 12); }
    for (let y = k.y + 3; y < k.y + k.h - 4; y += 9) { g.fillRect(k.x - PAVEMENT - 14, y, 12, 5); g.fillRect(k.x + k.w + PAVEMENT + 2, y, 12, 5); }
  }
  // a doormat-coloured step in front of every door
  g.fillStyle = '#b8a78f';
  for (const b of scene.blocks) if (b.door) g.fillRect(b.door.x - 8, b.door.y - 8, 16, 16);
  return c;
}

// The same picture as an array of colours, for reading pixel by pixel.
export function groundPixels(scene, scale) {
  const c = paintGround(scene, scale);
  const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  return { width: c.width, height: c.height, scale, px: new Uint32Array(data.buffer) };
}

export { GROUND };
