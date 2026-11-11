// Maps: every door can be walked to, the map picture is up to date, and the advice is useful.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPack, compileSources, compilePack, PackError } from '../tools/pack/compile.js';
import { lintPack } from '../tools/pack/lint.js';
import { mapSvg } from '../tools/pack/preview.js';

const packsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'packs');
const cities = fs.readdirSync(packsDir).filter(d => fs.existsSync(path.join(packsDir, d, 'city.yaml')));
const maple = () => readPack(path.join(packsDir, 'maple-city')).sources;
const problems = sources => { try { compileSources(sources); return []; } catch (e) { assert.ok(e instanceof PackError); return e.message.split('\n').slice(1).map(l => l.trim()); } };

test('map: a place closed in by other buildings is caught', () => {
  const src = maple();
  // a courtyard of decoration with no way in, and the phone store inside it
  src.map.decor[0] = { at: [2, 2], size: [11, 1] };
  src.map.decor.push({ at: [2, 3], size: [1, 12] }, { at: [12, 3], size: [1, 12] }, { at: [3, 14], size: [9, 1] });
  src.places.phone_store.building = { ...src.places.phone_store.building, at: [4, 4], size: [7, 9], door: 'bottom' };
  const found = problems(src);
  assert.equal(found.length, 1, found.join('\n'));
  assert.match(found[0], /^places\.yaml › phone_store › building: nobody can walk from where the player lands to the door of "phone_store"/);

  // the same courtyard with a gap in the wall is fine
  src.map.decor.pop();
  src.map.decor.push({ at: [3, 14], size: [4, 1] });
  assert.deepEqual(problems(src), []);
});

test('map: a passage too narrow for the player does not count as a way in', () => {
  const src = maple();
  src.map.decor[0] = { at: [2, 2], size: [11, 1] };
  src.map.decor.push({ at: [2, 3], size: [1, 12] }, { at: [12, 3], size: [1, 12] }, { at: [3, 14], size: [8.5, 1] });   // a gap of half a cell
  src.places.phone_store.building = { ...src.places.phone_store.building, at: [4, 4], size: [7, 9], door: 'bottom' };
  assert.match(problems(src).join('\n'), /phone_store.*nobody can walk/);
});

test('map: the cities that ship with the game have no problems and no advice pending', () => {
  for (const id of cities) assert.deepEqual(lintPack(compilePack(path.join(packsDir, id))), [], id);
});

test('map: advice points at what will disappoint players', () => {
  const pack = structuredClone(compilePack(path.join(packsDir, 'maple-city')));
  assert.deepEqual(lintPack(pack), []);
  pack.missions.get_phone.title = { en: 'Get a phone number' };
  delete pack.places.bakery.vocabulary;
  pack.places.cafe.sells.coffee.price = 0;
  pack.start.money = 100;
  pack.people.length = 2;
  delete pack.missions.smalltalk.with_person;
  pack.places.statue = { id: 'statue', name: 'Statue', x: 0, y: 0, w: 60, h: 60 };
  const advice = lintPack(pack);
  const has = re => assert.ok(advice.some(a => re.test(a)), `${re}\n${advice.join('\n')}`);
  has(/^missions\.yaml › get_phone › title: no "pt" text/);
  has(/^places\.yaml › bakery: sells things but has no "vocabulary"/);
  has(/^places\.yaml › cafe › coffee: the price is zero or less/);
  has(/^city\.yaml › start › money: \$100 may not cover the dearest ride \(\$100\) plus the cheapest stay \(\$85\)/);
  has(/^people\.yaml: only 2 people in the street/);
  has(/^missions\.yaml: no mission has "with_person: true"/);
  has(/^places\.yaml › statue: no mission happens here/);
  has(/^places\.yaml › statue › building: smaller than 5 × 5 cells/);
  assert.equal(advice.length, 8, advice.join('\n'));
});

test('map: the picture shows every place and is the one saved next to the pack', () => {
  for (const id of cities) {
    const pack = compilePack(path.join(packsDir, id));
    const svg = mapSvg(pack);
    assert.equal(svg, mapSvg(pack));                                   // same pack, same picture
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    for (const p of Object.values(pack.places)) assert.ok(svg.includes(`>${p.id}</text>`) && svg.includes(`door of ${p.id}`), `${id}: ${p.id}`);
    assert.ok(svg.includes(`${pack.map.width / pack.map.cell} × ${pack.map.height / pack.map.cell} cells`));
    const saved = path.join(packsDir, id, 'preview.svg');
    assert.ok(fs.existsSync(saved), `${id}: no preview.svg — run "npm run pack" and commit it`);
    assert.equal(fs.readFileSync(saved, 'utf8'), svg, `${id}: preview.svg is out of date — run "npm run pack" and commit it`);
  }
});

test('map: names with special characters cannot break the picture', () => {
  const pack = structuredClone(compilePack(path.join(packsDir, 'london')));
  pack.name = 'Tom & Jerry\'s <City>';
  pack.places.pub.short = '"The" <Pub> & Grill';
  const svg = mapSvg(pack);
  assert.ok(svg.includes('Tom &amp; Jerry\'s &lt;City&gt;') && svg.includes('&quot;The&quot; &lt;Pub&gt; &amp; Grill'));
  assert.ok(!svg.includes('<Pub>') && !svg.includes('<City>'));
});
