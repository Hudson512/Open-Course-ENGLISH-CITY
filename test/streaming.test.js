// Low latency: the character's line reaches the player while the AI is still writing the rest,
// and its audio can be fetched with a plain GET so the browser plays it as it arrives.
// The AI providers are replaced by small local servers that answer in each provider's streaming format.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Readable } from 'node:stream';
import { chatStream, partialReply } from '../server/llm.js';
import { createApp } from '../server/index.js';
import { compilePack } from '../tools/pack/compile.js';

const pack = compilePack(new URL('../packs/maple-city', import.meta.url).pathname);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const listen = server => new Promise(r => server.listen(0, () => r(`http://127.0.0.1:${server.address().port}`)));

const ANSWER = '{"reply":"Two croissants, coming right up! \\"For here\\" or to go?","emotion":"happy","actions":[{"type":"sell","item":"croissant","qty":2,"unitPrice":3.5},{"type":"hire"}],'
  + '"feedback":{"score":72,"corrected":"Can I have two croissants, please?","tips":["Usa please"],"newWords":[]},"suggestions":["To go, please."],"translation":null}';
const REPLY = 'Two croissants, coming right up! "For here" or to go?';

// A pretend AI provider. `format` is how it streams; `pauseAfter` text → it stops for a moment there,
// like a real model that is still writing the corrections after the character's line.
function fakeProvider({ format, pauseAfter = '"emotion"', pauseMs = 0, refuseJsonMode = false, plain = false }) {
  const seen = [];
  const server = http.createServer(async (req, res) => {
    let raw = ''; for await (const c of req) raw += c;
    const body = JSON.parse(raw);
    seen.push({ url: req.url, auth: req.headers.authorization || req.headers['x-api-key'], body });
    if (refuseJsonMode && body.response_format) { res.writeHead(400, { 'content-type': 'application/json' }); return res.end('{"error":{"message":"json mode not supported"}}'); }
    if (plain || !body.stream) {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(format === 'anthropic' ? { content: [{ type: 'text', text: ANSWER }] } : { choices: [{ message: { content: ANSWER } }] }));
    }
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const event = text => (format === 'anthropic'
      ? `event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text } })}\n\n`
      : `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
    if (format === 'anthropic') res.write('event: message_start\ndata: {"type":"message_start"}\n\n');
    const cut = ANSWER.indexOf(pauseAfter);
    const pieces = [...ANSWER.slice(0, cut).match(/.{1,7}/gs), null, ...ANSWER.slice(cut).match(/.{1,40}/gs)];
    let carry = '';
    for (const piece of pieces) {
      if (piece === null) { res.write(carry); carry = ''; await sleep(pauseMs); continue; }
      const ev = carry + event(piece);
      const half = Math.floor(ev.length / 2);          // events arrive split across network chunks
      res.write(ev.slice(0, half)); carry = ev.slice(half);
    }
    res.end(carry + (format === 'anthropic' ? 'event: message_stop\ndata: {"type":"message_stop"}\n\n' : 'data: [DONE]\n\n'));
  });
  return { server, seen };
}

test('the character\'s line is found inside an answer that is still being written', () => {
  assert.equal(partialReply('{"emotion":"hap'), null);
  assert.deepEqual(partialReply('{"reply":"Two cro'), { text: 'Two cro', done: false });
  assert.deepEqual(partialReply('{ "reply" : "He said \\"hi\\" \\u00e9\\n ok", "emotion"'), { text: 'He said "hi" é\n ok', done: true });
  assert.deepEqual(partialReply('{"reply":"half an escape \\'), { text: 'half an escape ', done: false });
  assert.deepEqual(partialReply('{"reply":"half a code \\u00'), { text: 'half a code ', done: false });
  assert.deepEqual(partialReply('```json\n{"reply":""'), { text: '', done: true });
  assert.deepEqual(partialReply(ANSWER), { text: REPLY, done: true });
});

for (const format of ['anthropic', 'openai']) {
  test(`streaming from a provider that speaks the ${format} format`, async () => {
    const fake = fakeProvider({ format });
    const base = await listen(fake.server);
    try {
      const steps = [];
      const settings = { kind: format, baseUrl: base, apiKey: 'k-123', model: 'm', json: format === 'openai' };
      const text = await chatStream({ system: 'SYS', messages: [{ role: 'user', content: 'hi' }], settings, onText: t => steps.push(t) });
      assert.equal(text, ANSWER);
      assert.ok(steps.length > 10);                                   // it really came bit by bit
      assert.ok(steps.every((s, i) => ANSWER.startsWith(s) && (i === 0 || s.length > steps[i - 1].length)));
      const asked = fake.seen[0];
      assert.equal(asked.body.stream, true);
      if (format === 'anthropic') assert.deepEqual([asked.url, asked.auth, asked.body.system], ['/v1/messages', 'k-123', 'SYS']);
      else assert.deepEqual([asked.url, asked.auth, asked.body.messages[0], asked.body.response_format], ['/chat/completions', 'Bearer k-123', { role: 'system', content: 'SYS' }, { type: 'json_object' }]);
    } finally { fake.server.close(); }
  });
}

test('streaming copes with providers that refuse JSON mode, do not stream, or fail', async () => {
  const picky = fakeProvider({ format: 'openai', refuseJsonMode: true });
  const whole = fakeProvider({ format: 'openai', plain: true });
  const down = http.createServer((req, res) => { res.writeHead(401, { 'content-type': 'application/json' }); res.end('{"error":{"message":"bad key"}}'); });
  const [a, b, c] = await Promise.all([listen(picky.server), listen(whole.server), listen(down)]);
  try {
    const ask = baseUrl => chatStream({ system: 's', messages: [], settings: { kind: 'openai', baseUrl, apiKey: 'k', model: 'm', json: true } });
    assert.equal(await ask(a), ANSWER);
    assert.deepEqual(picky.seen.map(s => Boolean(s.body.response_format)), [true, false]);   // asked again without it
    assert.equal(await ask(b), ANSWER);
    await assert.rejects(ask(c), e => e.status === 401 && /bad key/.test(e.message));
  } finally { picky.server.close(); whole.server.close(); down.close(); }
});

test('a turn is sent in two steps: the line first, the rest when it is ready', async () => {
  const fake = fakeProvider({ format: 'openai', pauseMs: 400 });
  const base = await listen(fake.server);
  const app = createApp({ packs: { [pack.id]: pack }, voices: null }).listen(0);
  const turn = (extra = {}) => fetch(`http://127.0.0.1:${app.address().port}/api/npc/turn`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pack: pack.id, mission: { templateId: 'visit', params: { place: 'bakery' } }, state: {}, history: [{ role: 'player', text: 'Two croissants please' }], settings: { provider: 'custom', apiKey: 'k', baseUrl: base }, ...extra })
  });
  try {
    const res = await turn({ stream: true });
    assert.match(res.headers.get('content-type'), /ndjson/);
    assert.equal(res.headers.get('x-accel-buffering'), 'no');                 // nginx must not hold the first line back
    const got = []; let buffer = ''; const t0 = Date.now();
    for await (const chunk of res.body) {
      buffer += Buffer.from(chunk).toString();
      const lines = buffer.split('\n'); buffer = lines.pop();
      for (const l of lines) got.push({ at: Date.now() - t0, ...JSON.parse(l) });
    }
    assert.deepEqual(got.map(g => g.type), ['reply', 'turn']);
    assert.equal(got[0].reply, REPLY);
    assert.ok(got[1].at - got[0].at >= 350, `the line came ${got[1].at - got[0].at} ms before the rest`);
    assert.equal(got[1].reply, REPLY);
    assert.deepEqual(got[1].actions.map(a => a.type), ['sell']);              // "hire" is not allowed in a bakery visit
    assert.equal(got[1].feedback.score, 72);

    const whole = await turn();                                               // without `stream`: one JSON answer, as before
    assert.match(whole.headers.get('content-type'), /application\/json/);
    assert.equal((await whole.json()).reply, REPLY);

    const offline = await turn({ stream: true, settings: { provider: 'mock' } });
    const lines = (await offline.text()).trim().split('\n').map(l => JSON.parse(l));
    assert.deepEqual(lines.map(l => l.type), ['turn']);
    assert.ok(lines[0].reply);

    const noKey = await turn({ stream: true, settings: { provider: 'openai' } });   // a problem before anything was sent
    assert.equal(noKey.status, 401);
    assert.match((await noKey.json()).error, /No API key/);
  } finally { app.close(); fake.server.close(); }
});

test('a problem in the middle of a streamed turn is reported as a last line', async () => {
  const broken = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: '{"reply":"Hello there!",' } }] })}\n\n`);
    res.end('data: {"error":{"message":"overloaded"}}\n\n');
  });
  const base = await listen(broken);
  const app = createApp({ packs: { [pack.id]: pack }, voices: null }).listen(0);
  try {
    const res = await fetch(`http://127.0.0.1:${app.address().port}/api/npc/turn`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pack: pack.id, mission: { templateId: 'visit', params: { place: 'bakery' } }, state: {}, history: [], settings: { provider: 'custom', apiKey: 'k', baseUrl: base }, stream: true })
    });
    const lines = (await res.text()).trim().split('\n').map(l => JSON.parse(l));
    assert.deepEqual(lines.map(l => l.type), ['reply', 'error']);
    assert.match(lines[1].error, /overloaded/);
  } finally { app.close(); broken.close(); }
});

test('voices: a line can be fetched with GET, so the browser plays it while it arrives', async () => {
  const asked = [];
  const voices = { speak: async (text, model) => { asked.push([model, text]); return { ok: true, status: 200, type: 'audio/mpeg', stream: Readable.from([Buffer.from('MP3')]) }; } };
  const london = compilePack(new URL('../packs/london', import.meta.url).pathname);
  const app = createApp({ packs: { london }, voices }).listen(0);
  const base = `http://127.0.0.1:${app.address().port}/api/tts`;
  try {
    const q = new URLSearchParams({ pack: 'london', name: 'Terry', gender: 'male', text: 'Hop in, then!' });
    const res = await fetch(`${base}?${q}`);
    assert.deepEqual([res.status, res.headers.get('content-type'), res.headers.get('x-voice'), await res.text()], [200, 'audio/mpeg', 'aura-2-draco-en', 'MP3']);
    assert.equal(res.headers.get('cache-control'), 'private, max-age=86400');   // 🔊 replays from the browser's cache
    assert.deepEqual(asked[0], ['aura-2-draco-en', 'Hop in, then!']);
    assert.equal((await fetch(`${base}?${new URLSearchParams({ pack: 'london', gender: 'female', deepgram: 'aura-2-theia-en', text: 'Hi' })}`)).headers.get('x-voice'), 'aura-2-theia-en');
    assert.equal((await fetch(`${base}?pack=london`)).status, 400);
    assert.equal((await fetch(`${base}?text=${'a'.repeat(701)}`)).status, 413);
    assert.equal((await fetch(base, { method: 'DELETE' })).status, 405);
  } finally { app.close(); }
});
