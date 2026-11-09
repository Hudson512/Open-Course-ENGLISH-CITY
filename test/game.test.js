import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseModelJSON, normalizeTurn, resolveSettings } from '../server/llm.js';
import { buildMessages, buildSystemPrompt } from '../server/prompts.js';
import { mockTurn } from '../server/mock.js';
import { validateAction, generateDaily, TEMPLATES, jobRequirements } from '../shared/missions.js';
import { findCatalogItem, levelFor } from '../shared/data.js';

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
  const p = buildSystemPrompt({ mission: { templateId: 'shop', params: { place: 'bakery' } }, state: baseState });
  assert.match(p, /"type":"sell"/);
  assert.doesNotMatch(p, /"type":"hire"/);
  assert.match(p, /croissant \$3\.50/);
});

test('taxi fare is clamped to allowed range', () => {
  const m = { templateId: 'arrival_taxi', params: {} };
  assert.equal(validateAction(m, { type: 'agree_price', amount: 5 }, baseState).action.amount, 35);
  assert.equal(validateAction(m, { type: 'agree_price', amount: 500 }, baseState).action.amount, 100);
  assert.equal(validateAction(m, { type: 'sell', item: 'bagel' }, baseState).ok, false);
});

test('sell uses catalog price when LLM invents a price', () => {
  const m = { templateId: 'shop', params: { place: 'bakery' } };
  const v = validateAction(m, { type: 'sell', item: 'croissants', qty: 2, unitPrice: 0.01 }, baseState);
  assert.equal(v.action.item, 'croissant');
  assert.equal(v.cost, 7);
  assert.equal(validateAction(m, { type: 'sell', item: 'laptop', qty: 1 }, baseState).ok, false);
});

test('bank and job require progression', () => {
  assert.equal(validateAction({ templateId: 'open_bank', params: {} }, { type: 'open_account' }, baseState).ok, false);
  assert.ok(jobRequirements(baseState).includes('level_a2'));
  const ready = { ...baseState, xp: 400, home: 'hotel', flags: { phone: true, bank: true } };
  assert.equal(jobRequirements(ready), null);
  const v = validateAction({ templateId: 'job_interview', params: {} }, { type: 'hire', score: 40 }, ready);
  assert.equal(v.action.type, 'reject');
});

test('daily missions are deterministic and valid', () => {
  const a = generateDaily(3, 42), b = generateDaily(3, 42);
  assert.deepEqual(a, b);
  assert.equal(a.length, 3);
  for (const m of a) assert.ok(TEMPLATES[m.templateId]);
});

test('mock NPC completes the taxi scene', () => {
  const r = mockTurn({ mission: { templateId: 'arrival_taxi', params: {} }, state: baseState, history: [{ role: 'player', text: 'Hotel please, 40 dollars' }] });
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
  assert.equal(findCatalogItem('grocery', 'Eggs').key, 'eggs');
  assert.equal(levelFor(950).id, 'B1');
});
