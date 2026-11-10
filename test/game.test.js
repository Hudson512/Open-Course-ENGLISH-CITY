import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseModelJSON, normalizeTurn, resolveSettings } from '../server/llm.js';
import { buildMessages, buildSystemPrompt } from '../server/prompts.js';
import { mockTurn } from '../server/mock.js';
import { validateAction, generateDaily, blocked, findItem } from '../shared/engine.js';
import { levelFor } from '../shared/data.js';
import { createApp } from '../server/index.js';
import { memoryStore } from '../server/db.js';
import { compilePack } from '../tools/pack/compile.js';

// The rules are tested on the city that ships with the game.
const pack = compilePack(new URL('../packs/maple-city', import.meta.url).pathname);
const packs = { [pack.id]: pack };

const baseState = { xp: 0, money: 100, home: null, flags: { phone: false, bank: false }, job: null, time: { day: 1, minutes: 600 }, player: { name: 'Ana', profession: 'nurse', nativeLang: 'pt' } };

test('parses JSON wrapped in prose or code fences', () => {
  assert.equal(parseModelJSON('```json\n{"reply":"Hi"}\n```').reply, 'Hi');
  assert.equal(parseModelJSON('Sure! {"reply":"Hey","actions":[],}').reply, 'Hey');
  assert.equal(parseModelJSON('no json here'), null);
});

test('normalizeTurn falls back to raw text and clamps score', () => {
  const t = normalizeTurn(null, 'Hello there');
  assert.equal(t.reply, 'Hello there');
  const t2 = normalizeTurn({ reply: 'ok', feedback: { score: 140, tips: 'x' }, actions: [{ type: 'sell' }, 'bad'] });
  assert.equal(t2.feedback.score, 100);
  assert.equal(t2.actions.length, 1);
});

test('messages alternate and start with user', () => {
  const m = buildMessages([{ role: 'npc', text: 'Hi' }, { role: 'player', text: 'Hello' }, { role: 'game', text: 'Paid' }]);
  assert.equal(m[0].role, 'user');
  for (let i = 1; i < m.length; i++) assert.notEqual(m[i].role, m[i - 1].role);
  assert.equal(m.at(-1).role, 'user');
});

test('system prompt contains allowed actions only', () => {
  const p = buildSystemPrompt({ pack, mission: { templateId: 'visit', params: { place: 'bakery' } }, state: baseState });
  assert.match(p, /"type":"sell"/);
  assert.doesNotMatch(p, /"type":"hire"/);
  assert.match(p, /croissant \$3\.50/);
});

test('taxi fare is clamped to allowed range', () => {
  const m = { templateId: 'arrival_taxi', params: {} };
  assert.equal(validateAction(pack, m, { type: 'agree_price', amount: 5 }, baseState).action.amount, 35);
  assert.equal(validateAction(pack, m, { type: 'agree_price', amount: 500 }, baseState).action.amount, 100);
  assert.equal(validateAction(pack, m, { type: 'sell', item: 'bagel' }, baseState).ok, false);
});

test('sell uses catalog price when LLM invents a price', () => {
  const m = { templateId: 'visit', params: { place: 'bakery' } };
  const v = validateAction(pack, m, { type: 'sell', item: 'croissants', qty: 2, unitPrice: 0.01 }, baseState);
  assert.equal(v.action.item, 'croissant');
  assert.equal(v.cost, 7);
  assert.equal(validateAction(pack, m, { type: 'sell', item: 'laptop', qty: 1 }, baseState).ok, false);
});

test('bank and job require progression', () => {
  assert.equal(validateAction(pack, { templateId: 'open_bank', params: {} }, { type: 'open_account' }, baseState).ok, false);
  assert.deepEqual(blocked(pack, 'job_interview', baseState), ['level_a2', 'home', 'phone', 'bank']);
  const ready = { ...baseState, xp: 400, home: 'hotel', flags: { phone: true, bank: true } };
  assert.equal(blocked(pack, 'job_interview', ready), null);
  const v = validateAction(pack, { templateId: 'job_interview', params: {} }, { type: 'hire', score: 40 }, ready);
  assert.equal(v.action.type, 'reject');
});

test('a mission can be limited to once a day, or to one try a day', () => {
  const worker = { ...baseState, job: { workplace: 'clinic', wage: 150 }, time: { day: 4 } };
  assert.equal(blocked(pack, 'work_shift', worker), null);
  assert.deepEqual(blocked(pack, 'work_shift', { ...worker, log: { done: { work_shift: 4 } } }), ['done_today']);
  assert.equal(blocked(pack, 'work_shift', { ...worker, log: { done: { work_shift: 3 } } }), null);
  assert.deepEqual(blocked(pack, 'work_shift', baseState), ['job']);
  const ready = { ...baseState, xp: 400, home: 'hotel', flags: { phone: true, bank: true }, log: { tried: { job_interview: 1 } } };
  assert.deepEqual(blocked(pack, 'job_interview', ready), ['tomorrow']);
});

test('what is bought changes the player only through the pack', () => {
  const sim = Object.keys(pack.places.phone_store.sells).find(k => pack.places.phone_store.sells[k].effects);
  const v = validateAction(pack, { templateId: 'get_phone', params: {} }, { type: 'sell', item: sim, qty: 1 }, baseState);
  assert.equal(v.ok, true);
  assert.deepEqual(v.effects, [{ set_flag: 'phone' }]);
  const cut = validateAction(pack, { templateId: 'visit', params: { place: 'barber' } }, { type: 'service', item: Object.keys(pack.places.barber.services)[0] }, baseState);
  assert.deepEqual(cut.effects, [{ stat: { social: 12 } }]);
});

test('daily missions are deterministic and valid', () => {
  const a = generateDaily(pack, 3, 42), b = generateDaily(pack, 3, 42);
  assert.deepEqual(a, b);
  assert.equal(a.length, 3);
  for (const m of a) assert.ok(pack.missions[m.templateId]);
});

test('mock NPC completes the taxi scene', () => {
  const r = mockTurn({ pack, mission: { templateId: 'arrival_taxi', params: {} }, state: baseState, history: [{ role: 'player', text: 'Hotel please, 40 dollars' }] });
  assert.deepEqual(r.actions.map(a => a.type).sort(), ['agree_price', 'set_destination']);
});

test('settings resolution requires a key for cloud providers', () => {
  assert.throws(() => resolveSettings({ provider: 'anthropic' }, { ALLOW_CLIENT_KEYS: 'true' }), /No API key/);
  assert.equal(resolveSettings({ provider: 'anthropic', apiKey: 'k' }, {}).model, 'claude-haiku-5-5');
  assert.equal(resolveSettings({ provider: 'anthropic', apiKey: 'k' }, { ALLOW_CLIENT_KEYS: 'false', LLM_PROVIDER: 'ollama' }).provider, 'ollama');
  assert.equal(resolveSettings({}, {}).provider, 'mock');
});

test('a client-chosen base URL never receives the server keys', () => {
  const env = { ANTHROPIC_API_KEY: 'server-secret', LLM_API_KEY: 'server-secret-2' };
  assert.throws(() => resolveSettings({ provider: 'anthropic', baseUrl: 'https://evil.example' }, env), /No API key/);
  assert.equal(resolveSettings({ provider: 'ollama', baseUrl: 'https://evil.example' }, env).apiKey, '');
  const own = resolveSettings({ provider: 'custom', baseUrl: 'http://my-box:1234/v1/', apiKey: 'mine' }, env);
  assert.deepEqual([own.apiKey, own.baseUrl], ['mine', 'http://my-box:1234/v1']);
  // the provider's own URL typed explicitly still uses the server key
  const same = resolveSettings({ provider: 'anthropic', baseUrl: 'https://api.anthropic.com/' }, env);
  assert.deepEqual([same.apiKey, same.baseUrl], ['server-secret', 'https://api.anthropic.com']);
});

test('helpers', () => {
  assert.equal(findItem(pack.places.grocery, 'Eggs').key, 'eggs');
  assert.equal(levelFor(950).id, 'B1');
});

test('saves round-trip and are protected by the owner token', async () => {
  const server = createApp({ store: memoryStore(), packs }).listen(0);
  try {
    const base = `http://127.0.0.1:${server.address().port}/api/save/`;
    const tokenA = 'a'.repeat(32), tokenB = 'b'.repeat(32);
    const put = (id, token, data) => fetch(base + id, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, data }) });
    const get = (id, token) => fetch(base + id, { headers: { 'x-save-token': token } });
    assert.equal((await put('p_abc12345', tokenA, { xp: 10 })).status, 200);
    assert.equal((await put('p_abc12345', tokenA, { xp: 25 })).status, 200);
    assert.equal((await put('p_abc12345', tokenB, { xp: 999 })).status, 403);
    assert.equal((await put('NOT-AN-ID', tokenA, { xp: 1 })).status, 400);
    assert.equal((await put('p_abc12345', tokenA, 'nope')).status, 400);
    assert.equal((await (await get('p_abc12345', tokenA)).json()).data.xp, 25);
    assert.equal((await get('p_abc12345', tokenB)).status, 403);
    assert.equal((await get('p_missing1', tokenA)).status, 404);
  } finally { server.close(); }
});

test('without a store the save API reports persistence is off', async () => {
  const server = createApp({ packs }).listen(0);
  try {
    const port = server.address().port;
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/save/p_abc12345`, { headers: { 'x-save-token': 'a'.repeat(32) } })).status, 503);
    assert.equal((await (await fetch(`http://127.0.0.1:${port}/api/config`)).json()).persistence, false);
  } finally { server.close(); }
});

test('the server hands out cities and plays missions of the city asked for', async () => {
  const server = createApp({ packs }).listen(0);
  try {
    const base = `http://127.0.0.1:${server.address().port}/api`;
    assert.deepEqual((await (await fetch(`${base}/packs`)).json()).map(p => [p.id, p.name]), [['maple-city', 'Maple City']]);
    assert.equal((await (await fetch(`${base}/packs/maple-city`)).json()).places.bakery.name, pack.places.bakery.name);
    assert.equal((await fetch(`${base}/packs/atlantis`)).status, 404);
    const turn = body => fetch(`${base}/npc/turn`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state: baseState, history: [], settings: { provider: 'mock' }, ...body }) });
    const ok = await turn({ pack: 'maple-city', mission: { templateId: 'arrival_taxi', params: {} } });
    assert.equal(ok.status, 200);
    assert.match((await ok.json()).reply, /Maple City/);
    assert.equal((await turn({ pack: 'atlantis', mission: { templateId: 'arrival_taxi', params: {} } })).status, 400);
    assert.equal((await turn({ pack: 'maple-city', mission: { templateId: 'nope', params: {} } })).status, 400);
  } finally { server.close(); }
});
