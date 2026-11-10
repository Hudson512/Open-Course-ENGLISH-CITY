// The Maple City pack must describe the same city the game has hard-coded today,
// and the compiler must explain mistakes in words a non-programmer can act on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPack, compileSources, compilePack, PackError } from '../tools/pack/compile.js';
import { renderMission, check, priceList } from '../shared/pack.js';
import { loadPacks, packSummary } from '../server/packs.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'packs', 'maple-city');
const pack = compilePack(dir);
const state = (extra = {}) => ({
  xp: 0, home: null, flags: {}, job: null, time: { day: 1 }, player: { profession: 'nurse' }, ...extra
});

// ── Maple City, the city that ships with the game ───────────────
test('pack: Maple City compiles to what the engine reads', () => {
  assert.deepEqual([pack.id, pack.name, pack.country, pack.currency.symbol], ['maple-city', 'Maple City', 'United States', '$']);
  assert.deepEqual(pack.start, { money: 600, mission: 'arrival_taxi' });
  assert.deepEqual(pack.story, ['arrival_taxi', 'lodging', 'get_phone', 'open_bank', 'job_interview']);
  assert.deepEqual([pack.map.width, pack.map.height, pack.map.roads.length, pack.map.decor.length], [2400, 1900, 6, 14]);
  assert.deepEqual(pack.map.park, { id: 'park', name: 'Central Park', x: 440, y: 1040, w: 520, h: 420 });
  assert.equal(Object.keys(pack.places).length, 13);
  for (const p of Object.values(pack.places)) {
    assert.ok(p.character?.name && p.character.persona, p.id);
    assert.match(p.color, /^#[0-9a-f]{6}$/, p.id);
    assert.ok(p.door.x > 0 && p.door.x < pack.map.width && p.door.y > 0 && p.door.y < pack.map.height, p.id);
  }
  const taxi = pack.actions.agree_price;
  assert.deepEqual([taxi.kind, taxi.start, taxi.min, taxi.max], ['price', 75, 35, 100]);
  assert.deepEqual(pack.places.diner.sells.tip.customer_sets_price, [1, 20]);
  assert.deepEqual(pack.places.hotel.lodging, { per: 'night', price: 110, min: 85, max: 140, max_nights: 14 });
  assert.equal(pack.places.bakery.sells.croissant.price, 3.5);
  assert.equal(pack.jobs.other.workplace, 'offices');
  assert.ok(pack.people.length >= 4);
});

// ── London, the second city: nothing in the engine is about Maple City ──
test('pack: London compiles, with its own map, money, ids and flags', () => {
  const london = compilePack(path.join(dir, '..', 'london'));
  assert.deepEqual([london.id, london.country, london.language, london.currency.symbol], ['london', 'United Kingdom', 'en-GB', '£']);
  assert.deepEqual(london.start, { money: 500, mission: 'arrival_cab' });
  assert.deepEqual(london.story, ['arrival_cab', 'move_in', 'get_sim', 'get_oyster', 'bank_account', 'job_interview']);
  assert.deepEqual([london.map.width, london.map.height], [2200, 1800]);
  assert.equal(Object.keys(london.places).length, 14);
  assert.deepEqual(london.places.tube.sells['Oyster card'].effects, [{ set_flag: 'oyster' }]);
  for (const job of Object.values(london.jobs)) assert.ok(london.places[job.workplace], job.title);

  // The cab ride decides where the next mission happens, and prices are shown in pounds.
  const cab = renderMission(london, 'arrival_cab', { state: state() });
  assert.match(cab.goal.en, /Wanderers Hostel \(£35\/night\).*Albion Road Flatshare \(£160\/week\)/s);
  const moveIn = renderMission(london, 'move_in', { state: state(), choice: { first_home: 'flat' } });
  assert.equal(moveIn.placeId, 'flat');
  assert.match(moveIn.brief, /£160 per week/);
});

test('compiler: a character voice must be a real Deepgram voice name', () => {
  const { sources } = readPack(path.join(dir, '..', 'london'));
  sources.places.hostel.character.voice.deepgram = 'robot';
  assert.throws(() => compileSources(sources), e => e instanceof PackError && /places\.yaml › hostel › character › voice › deepgram: expected a Deepgram Aura-2 voice/.test(e.message));
});

test('packs: every city in packs/ is loaded for the departures board', () => {
  const all = loadPacks();
  assert.deepEqual(Object.keys(all), ['london', 'maple-city']);
  assert.deepEqual(packSummary(all.london), { id: 'london', name: 'London', country: 'United Kingdom', flag: '🇬🇧', language: 'en-GB', version: '1.0.0' });
});

const items = [{ item: 'bagel', qty: 2 }, { item: 'coffee', qty: 1 }];

test('pack: missions are rendered for the player, the place and the choices made', () => {
  const shop = renderMission(pack, 'shop', { with: { place: 'bakery', items }, state: state() });
  assert.equal(shop.placeId, 'bakery');
  assert.equal(shop.character.name, pack.places.bakery.character.name);
  assert.match(shop.goal.en, /2.*bagel/);
  assert.deepEqual(shop.vocabulary, pack.places.bakery.vocabulary);
  assert.equal(renderMission(pack, 'lodging', { choice: { lodging_place: 'apartment' }, state: state() }).placeId, 'apartment');
  const work = renderMission(pack, 'work_shift', { state: state({ job: { title: 'Nurse Assistant', workplace: 'clinic' } }) });
  assert.equal(work.placeId, 'clinic');
  const mike = pack.people[0];
  const talk = renderMission(pack, 'smalltalk', { person: mike, state: state() });
  assert.equal(talk.character, mike);
  assert.equal(talk.placeId, null);
  const visit = renderMission(pack, 'visit', { place: 'cafe', state: state() });
  assert.deepEqual(visit.allow.map(a => pack.actions[a].kind).sort(), ['end', 'sell']);
  const cut = renderMission(pack, 'visit', { place: 'barber', state: state() });
  assert.deepEqual(cut.allow.map(a => pack.actions[a].kind).sort(), ['end', 'service']);
  assert.equal(priceList(pack, pack.places.bank), '');
});

test('pack: reworded briefs keep the numbers that matter', () => {
  const brief = (id, env, s = state()) => renderMission(pack, id, { ...env, state: s }).brief;
  const hotel = brief('lodging', { choice: { lodging_place: 'hotel' } });
  assert.match(hotel, /\$110 per night/);
  assert.match(hotel, /\$95 for 5\+ nights/);
  const apt = brief('lodging', { choice: { lodging_place: 'apartment' } });
  assert.match(apt, /\$180 per week/);
  assert.match(apt, /go down to \$150/);
  const interview = brief('job_interview', {}, state({ player: { profession: 'chef', professionDetail: 'pastry' } }));
  assert.match(interview, /"Line Cook" position \(field: Chef \/ Cook — pastry\)/);
});

test('pack: conditions decide when a mission is finished and who may start it', () => {
  const m = pack.missions;
  const done = (...types) => types.map(type => ({ type }));
  assert.equal(check(m.arrival_taxi.complete, { done: done('agree_price') }), false);
  assert.equal(check(m.arrival_taxi.complete, { done: done('agree_price', 'set_destination') }), true);
  assert.equal(check(m.lodging.complete, { done: done('rent') }), true);
  assert.equal(check(m.job_interview.complete, { done: done('reject') }), false);
  assert.equal(check(m.job_interview.complete, { done: done('hire') }), true);
  const bought = n => [{ type: 'sell', item: 'bagel', qty: n }, { type: 'sell', item: 'coffee', qty: 1 }];
  assert.equal(check(m.shop.complete, { done: bought(1), with: { items } }), false);
  assert.equal(check(m.shop.complete, { done: [...bought(1), { type: 'sell', item: 'bagel', qty: 1 }], with: { items } }), true);
  for (const [turns, ok] of [[0, false], [3, false], [4, true], [9, true]]) assert.equal(check(m.smalltalk.complete, { meta: { turns } }), ok);
  // the phone mission ends on the flag the SIM card sets, not on the item name
  assert.equal(check(m.get_phone.complete, { state: state() }), false);
  assert.equal(check(m.get_phone.complete, { state: state({ flags: { phone: true } }) }), true);
  assert.equal(check(m.chat_people.complete, { meta: { counts: { smalltalk: 1 } }, with: { count: 2 } }), false);
  assert.equal(check(m.chat_people.complete, { meta: { counts: { smalltalk: 2 } }, with: { count: 2 } }), true);
  const ready = state({ xp: 300, home: 'hotel', flags: { phone: true, bank: true } });
  assert.equal(check(m.job_interview.requires, { state: ready }), true);
  for (const s of [state(), { ...ready, xp: 299 }, { ...ready, home: null }, { ...ready, flags: { phone: true } }, { ...ready, job: {} }]) {
    assert.equal(check(m.job_interview.requires, { state: s }), false);
  }
});

// ── Mistakes are explained ──────────────────────────────────────
// Break one thing in a fresh copy of the pack and return what the compiler says.
function problems(breakIt) {
  const { sources } = readPack(dir);
  breakIt(sources);
  try { compileSources(sources); } catch (e) {
    assert.ok(e instanceof PackError, e.stack);
    return e.errors;
  }
  return [];
}
const says = (errors, where, text) => assert.ok(errors.some(e => e.startsWith(where + ':') && e.includes(text)),
  `expected "${where}: …${text}…" in:\n${errors.join('\n') || '(no problems reported)'}`);

test('compiler: an untouched pack has no problems', () => {
  assert.deepEqual(problems(() => {}), []);
});

test('compiler: shape mistakes name the file, the entry and the fix', () => {
  says(problems(s => { delete s.places.bakery.character.persona; }),
    'places.yaml › bakery › character', 'missing "persona" (a sentence or two describing who this is)');
  says(problems(s => { s.places.bakery.colour = 'red'; }), 'places.yaml › bakery', 'unknown field "colour". Known: name, short');
  says(problems(s => { s.places.cafe.sells.latte.price = 'cheap'; }), 'places.yaml › cafe › sells › latte › price', 'expected a number, found "cheap"');
  says(problems(s => { s.places.cafe.building.color = 'brown'; }), 'places.yaml › cafe › building › color', 'a color like');
  says(problems(s => { s.places['Corner Shop'] = s.places.cafe; }), 'places.yaml › Corner Shop', 'lowercase letters');
  says(problems(s => { s.actions.sell.kind = 'give'; }), 'actions.yaml › sell › kind', 'expected one of: price, choose');
  says(problems(s => { s.missions.open_bank.complete = { done: 'open_account' }; }), 'missions.yaml › open_bank › complete', 'unknown condition "done"');
  says(problems(s => { s.places.bank.sells = { loan: { price: 5, effects: [{ give: 'x' }] } }; }), 'places.yaml › bank › sells › loan › effects › #1', 'an effect is one of');
  assert.equal(problems(s => { delete s.city.name; s.map.cell = 'big'; }).length, 2, 'all shape problems are reported together');
});

test('compiler: names that point nowhere are caught', () => {
  says(problems(s => { s.missions.get_phone.allow = ['sel', 'end']; }), 'missions.yaml › get_phone › allow', 'unknown action "sel". Known: agree_price');
  says(problems(s => { s.missions.get_phone.at = 'phone_shop'; }), 'missions.yaml › get_phone › at', '"phone_shop" is not a place');
  says(problems(s => { s.city.story.push('wedding'); }), 'city.yaml › story', 'unknown mission "wedding"');
  says(problems(s => { s.city.jobs.nurse.workplace = 'hospital'; }), 'city.yaml › jobs › nurse', '"hospital" is not a place');
  says(problems(s => { s.city.jobs.pilot = s.city.jobs.nurse; }), 'city.yaml › jobs', 'unknown profession "pilot"');
  says(problems(s => { s.city.daily.pool[0].with.items.plus = ['pizza']; }), 'city.yaml › daily › pool › #1 › with › items › plus', '"pizza" is not sold at bakery');
  says(problems(s => { s.city.daily.pool[0].with.items.pick = 40; }), 'city.yaml › daily › pool › #1 › with › items', 'only 9 at bakery match');
  says(problems(s => { delete s.actions.set_destination; }), 'missions.yaml › lodging › at', 'no "choose" action saves into "lodging_place"');
});

test('compiler: {{…}} that cannot be filled in are caught', () => {
  says(problems(s => { s.missions.get_phone.goal.en = 'Go to {{place.nmae}}.'; }), 'missions.yaml › get_phone › goal › en', '{{place.nmae}} does not exist for place "phone_store"');
  says(problems(s => { s.missions.arrival_taxi.brief = 'Fare {{money action.agree_price.strat}}'; }), 'missions.yaml › arrival_taxi › brief', 'does not exist in actions.yaml');
  says(problems(s => { s.missions.arrival_taxi.brief = 'Pay {{money city.name}}'; }), 'missions.yaml › arrival_taxi › brief', 'is not a number');
  says(problems(s => { s.missions.open_bank.title.en = 'Hi {{player.name}}'; }), 'missions.yaml › open_bank › title › en', 'is not known. Known: player.profession.name');
  says(problems(s => { s.missions.open_bank.title.en = 'Hi {{person.name}}'; }), 'missions.yaml › open_bank › title › en', 'needs "with_person: true"');
  says(problems(s => { s.missions.open_bank.title.en = 'Buy {{list with.items}}'; }), 'missions.yaml › open_bank › title › en', 'daily pool');
  says(problems(s => { s.missions.work_shift.brief = 'Today: {{rotate chores}}'; }), 'missions.yaml › work_shift › brief', 'needs a list called "chores"');
  says(problems(s => { s.missions.open_bank.title.en = 'Open {{city.name'; }), 'missions.yaml › open_bank › title › en', 'unfinished {{…}}');
  says(problems(s => { s.missions.lodging.variants.hotel.brief = 'Rate {{money place.lodging.nightly}}'; }), 'missions.yaml › lodging › variants › hotel › brief', 'does not exist for place "hotel"');
  // a text shared by several places must work at every one of them
  says(problems(s => { s.missions.shop.goal.en = 'Stay at {{place.lodging.price}}'; }), 'missions.yaml › shop › goal › en', 'does not exist for place "bakery"');
});

test('compiler: map mistakes are caught', () => {
  says(problems(s => { s.places.bakery.building.at = [14, 35]; }), 'places.yaml › bakery › building', '"bakery" overlaps the road at column 15');
  says(problems(s => { s.places.barber.building.at = s.places.bakery.building.at; }), 'places.yaml › bakery › building', '"bakery" overlaps "barber"');
  says(problems(s => { s.places.bakery.building.at = [118, 35]; }), 'places.yaml › bakery › building', 'outside the map (120 × 95 cells)');
  says(problems(s => { s.places.hotel.building.door = 'bottom'; }), 'places.yaml › hotel › building', 'does not face a road');
  says(problems(s => { s.map.spawn = [25, 37]; }), 'map.yaml › spawn', 'is inside "bakery"');
  says(problems(s => { s.map.roads.push({ width: 5 }); }), 'map.yaml › roads › #7', 'either "row" (horizontal) or "col" (vertical)');
});

test('compiler: missions that could never be finished are caught', () => {
  says(problems(s => { s.missions.open_bank.allow = ['end']; }), 'missions.yaml › open_bank › complete', 'waits for "open_account", which is not in "allow"');
  says(problems(s => { s.missions.get_phone.at = 'bakery'; }), 'missions.yaml › get_phone › complete', 'nothing here can set the flag "phone" at "bakery"');
  says(problems(s => { s.actions.open_account.effects = [{ set_flag: 'account' }]; }), 'actions.yaml › hire › requires', 'reads the flag "bank", but nothing in the pack sets it');
  says(problems(s => { delete s.places.apartment.lodging; }), 'missions.yaml › lodging › allow', '"rent" needs a "lodging" block on place "apartment"');
  says(problems(s => { delete s.missions.lodging.variants.apartment.goal; }), 'missions.yaml › lodging', 'missing "goal" for "apartment"');
  says(problems(s => { s.actions.agree_price.start = 20; }), 'actions.yaml › agree_price', 'start must be between min and max');
  says(problems(s => { delete s.actions.set_destination.options; }), 'actions.yaml › set_destination', 'kind "choose" needs "options"');
});

test('compiler: broken YAML is reported with the file name', () => {
  const { errors } = readPack(path.join(dir, '..', 'no-such-city'));
  assert.ok(errors.includes('city.yaml: file is missing'));
  assert.ok(!errors.some(e => e.startsWith('people.yaml')), 'people.yaml is optional');
});
