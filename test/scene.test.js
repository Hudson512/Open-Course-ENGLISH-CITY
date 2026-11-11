// The city as a 3D scene (shared/scene.js) and the first-person ray caster built on it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compilePack, readPack, compileSources, PackError } from '../tools/pack/compile.js';
import { buildScene, blockAt, canStand, doorSide, defaultFloors, GROUND, STOREY } from '../shared/scene.js';
import { cast } from '../client/src/viewer/raycast.js';

const packsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'packs');
const london = compilePack(path.join(packsDir, 'london'));
const scene = buildScene(london);

test('scene: every building of the pack is there, as tall as its floors', () => {
  assert.equal(scene.blocks.filter(b => b.kind === 'place').length, Object.keys(london.places).length);
  assert.equal(scene.blocks.filter(b => b.kind === 'decor').length, london.map.decor.length);
  const offices = scene.blocks.find(b => b.id === 'offices');
  assert.deepEqual([offices.floors, offices.top], [9, 9 * STOREY]);          // floors: 9 in places.yaml
  for (const b of scene.blocks) assert.ok(b.floors >= 1 && b.top === b.floors * STOREY, b.id);
  assert.equal(scene.blocks.find(b => b.id === 'hostel').door.side, 'top');
  assert.equal(scene.blocks.find(b => b.id === 'airport').door.side, 'right');
  assert.deepEqual(buildScene(london).blocks.map(b => b.floors), scene.blocks.map(b => b.floors));   // same map, same skyline
});

test('scene: the ground knows roads, park and grass, and where buildings stand', () => {
  const cellAt = (col, row) => scene.ground[row * scene.cols + col];
  assert.equal(cellAt(5, 14), GROUND.road);                                  // the road at rows 12–16
  assert.equal(cellAt(30, 60), GROUND.park);                                 // Kingsway Green
  assert.equal(cellAt(1, 1), GROUND.grass);
  assert.equal(blockAt(scene, 26 * 20, 20 * 20).id, 'hostel');
  assert.equal(blockAt(scene, 20 * 20, 30 * 20), null);                      // on the road
  assert.equal(blockAt(scene, -5, 10), null);
  assert.ok(canStand(scene, scene.spawn.x, scene.spawn.y));
  assert.ok(!canStand(scene, 26 * 20, 20 * 20));                             // inside the hostel
  assert.ok(!canStand(scene, 2, 300));                                       // too close to the edge of the map
});

test('scene: helpers', () => {
  const r = { x: 100, y: 100, w: 50, h: 40 };
  assert.equal(doorSide(r, { x: 125, y: 82 }), 'top');
  assert.equal(doorSide(r, { x: 168, y: 120 }), 'right');
  assert.equal(doorSide(r, { x: 125, y: 158 }), 'bottom');
  assert.equal(doorSide(r, { x: 82, y: 120 }), 'left');
  assert.equal(defaultFloors({ kind: 'place', w: 160, h: 160 }, 20), 2);
  assert.ok(defaultFloors({ kind: 'decor', w: 160, h: 160 }, 20, 1) > 2);
});

test('raycast: a ray stops at the first wall, and keeps going to see taller buildings behind', () => {
  // standing on the road in front of the hostel (top side at row 18), looking down (+y) at it
  const x = 29 * 20, y = 14 * 20;
  const hits = cast(scene, x, y, Math.PI / 2);
  assert.equal(hits[0].block.id, 'hostel');
  assert.equal(hits[0].side, 'y');
  assert.ok(Math.abs(hits[0].dist - (18 * 20 - y)) < 0.01, `${hits[0].dist}`);
  assert.ok(hits.length > 1 && hits[1].block.id === 'bakery');               // the bakery is behind it
  assert.ok(hits.every((h, i) => i === 0 || h.dist > hits[i - 1].dist));
  // looking along the road there is nothing to hit for a long way
  assert.equal(cast(scene, x, y, 0, 500).length, 0);
});

test('raycast: walls do not bulge (distance is measured along the view direction)', () => {
  const x = 29 * 20, y = 14 * 20, wall = 18 * 20 - y;
  for (const off of [-0.3, -0.1, 0.1, 0.3]) {
    const h = cast(scene, x, y, Math.PI / 2 + off, 1400, Math.PI / 2)[0];
    assert.equal(h.block.id, 'hostel');
    assert.ok(Math.abs(h.dist - wall) < 0.01, `${off}: ${h.dist}`);
  }
});

test('compiler: floors must be a sensible whole number', () => {
  const { sources } = readPack(path.join(packsDir, 'london'));
  sources.places.pub.building.floors = 0;
  sources.map.decor[0].floors = 2.5;
  assert.throws(() => compileSources(sources), e => e instanceof PackError
    && /places\.yaml › pub › building › floors: expected a whole number of floors from 1 to 40/.test(e.message)
    && /map\.yaml › decor › #1 › floors/.test(e.message));
});
