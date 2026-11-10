// Listening with Deepgram Flux: the server relay (server/stt.js) and the browser session
// (client/src/flux.js), with a pretend Deepgram and a pretend microphone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import WebSocket, { WebSocketServer } from 'ws';
import { fluxUrl, patienceFor } from '../server/stt.js';
import { attachSockets, createApp } from '../server/index.js';

globalThis.window ??= {};
globalThis.localStorage ??= { getItem: () => null, setItem() {} };
const { listenFlux, listenUrl, toPcm16, outputRate } = await import('../client/src/flux.js');

const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 2000) => { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('timed out'); await tick(5); } };

// ── Server ──────────────────────────────────────────────────────
test('listening: only a few things can be asked of Deepgram, and beginners get more patience', () => {
  const ask = q => fluxUrl(new URLSearchParams(q));
  const hold = new URL(ask('rate=16000&mode=hold&level=A1&keyterm=Oyster+card&keyterm=x&keyterm=%3Cscript%3E&model=nova-3'));
  assert.equal(hold.origin + hold.pathname, 'wss://api.deepgram.com/v2/listen');
  assert.deepEqual([...hold.searchParams.entries()], [['model', 'flux-general-en'], ['encoding', 'linear16'], ['sample_rate', '16000'], ['keyterm', 'Oyster card'], ['keyterm', 'script']]);
  const free = new URL(ask('rate=48000&mode=free&level=A1')).searchParams;
  assert.deepEqual([free.get('eot_threshold'), free.get('eot_timeout_ms')], ['0.9', '8000']);
  assert.ok(patienceFor('A1').eot_timeout_ms > patienceFor('B1').eot_timeout_ms && patienceFor('B1').eot_timeout_ms > patienceFor('C1').eot_timeout_ms);
  assert.equal(ask('rate=12345'), null);
  assert.equal(ask(''), null);
  assert.equal(new URL(ask('rate=16000&' + Array.from({ length: 30 }, (_, i) => `keyterm=word${i}`).join('&'))).searchParams.getAll('keyterm').length, 20);
});

test('listening: the server relays the microphone to Deepgram and the transcripts back', async () => {
  // a pretend Deepgram: remembers what it was asked and sent, and answers with a transcript
  const heard = { urls: [], audio: 0, texts: [] };
  const deepgram = new WebSocketServer({ port: 0 });
  deepgram.on('connection', (ws, req) => {
    heard.urls.push(req.url);
    ws.send(JSON.stringify({ type: 'Connected' }));
    ws.on('message', (data, isBinary) => {
      if (isBinary) { heard.audio += data.length; return; }
      heard.texts.push(JSON.parse(data.toString()).type);
      ws.send(JSON.stringify({ type: 'TurnInfo', event: 'EndOfTurn', trigger: 'manual', transcript: 'two nights please' }));
    });
  });
  await new Promise(r => deepgram.on('listening', r));
  const voices = { listen: url => new WebSocket(`ws://127.0.0.1:${deepgram.address().port}/v2/listen${new URL(url).search}`) };

  const server = http.createServer(createApp({ packs: {}, voices }));
  attachSockets(server, { voices });
  await new Promise(r => server.listen(0, r));
  const base = `ws://127.0.0.1:${server.address().port}`;
  try {
    const got = [];
    const ws = new WebSocket(`${base}/ws/listen?rate=16000&mode=hold&keyterm=flat+white`);
    ws.on('message', d => got.push(JSON.parse(d.toString())));
    await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
    ws.send(new Uint8Array(2560)); ws.send(new Uint8Array(2560));       // sent before Deepgram answered: kept
    ws.send(JSON.stringify({ type: 'ForceEndTurn' }));
    await until(() => got.some(m => m.event === 'EndOfTurn'));
    assert.deepEqual(got.map(m => m.type), ['Connected', 'TurnInfo']);
    assert.equal(got[1].transcript, 'two nights please');
    assert.deepEqual([heard.audio, heard.texts], [5120, ['ForceEndTurn']]);
    assert.equal(heard.urls[0], '/v2/listen?model=flux-general-en&encoding=linear16&sample_rate=16000&keyterm=flat+white');
    ws.close();
    await until(() => deepgram.clients.size === 0);                     // hanging up here hangs up there

    const bad = new WebSocket(`${base}/ws/listen?rate=7`);
    const code = await new Promise(res => bad.on('close', res));
    assert.equal(code, 1008);
    assert.equal(heard.urls.length, 1);                                 // Deepgram was never called for it

    const city = new WebSocket(`${base}/ws`);                           // the multiplayer city still answers
    await new Promise((res, rej) => { city.on('open', res); city.on('error', rej); });
    city.close();
    const nowhere = new WebSocket(`${base}/ws/elsewhere`);
    await new Promise(res => nowhere.on('error', res));

    assert.equal((await (await fetch(`http://127.0.0.1:${server.address().port}/api/config`)).json()).listening, true);
  } finally { server.closeAllConnections?.(); server.close(); deepgram.close(); }
});

test('listening: without a Deepgram key the server says so', async () => {
  const server = http.createServer(createApp({ packs: {}, voices: null }));
  attachSockets(server, { voices: null });
  await new Promise(r => server.listen(0, r));
  try {
    const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}/ws/listen?rate=16000`);
    assert.equal(await new Promise(res => ws.on('close', res)), 1008);
    assert.equal((await (await fetch(`http://127.0.0.1:${server.address().port}/api/config`)).json()).listening, false);
  } finally { server.closeAllConnections?.(); server.close(); }
});

// ── Browser session ─────────────────────────────────────────────
// A pretend microphone and socket that the test drives by hand.
function rig(options) {
  const log = { partial: [], done: [], turns: [], errors: [], sent: [], url: null, micStopped: false, timers: [] };
  let chunk = null;
  const socket = { sent: log.sent, send(d) { log.sent.push(typeof d === 'string' ? JSON.parse(d).type : d.byteLength); }, close() { socket.closed = true; } };
  const deps = {
    capture: async onChunk => { chunk = onChunk; return { sampleRate: 16000, stop() { log.micStopped = true; } }; },
    socket: url => { log.url = url; return socket; },
    wait: (fn, ms) => log.timers.push({ fn, ms })
  };
  const rec = listenFlux({ ...options, onPartial: t => log.partial.push(t), onDone: t => log.done.push(t), onTurn: t => log.turns.push(t), onError: e => log.errors.push(e) }, deps);
  const turn = (event, transcript, extra = {}) => socket.onmessage({ data: JSON.stringify({ type: 'TurnInfo', event, transcript, ...extra }) });
  return { rec, log, socket, turn, speak: (bytes = 2560) => chunk(new ArrayBuffer(bytes)) };
}
globalThis.location = { host: 'game.test', protocol: 'http:' };

test('flux: hold to talk keeps everything said across pauses and sends it on release', async () => {
  const { rec, log, socket, turn, speak } = rig({ level: 'A1', keyterms: ['Oyster card'] });
  await tick();
  assert.equal(log.url, 'ws://game.test/ws/listen?rate=16000&mode=hold&level=A1&keyterm=Oyster+card');
  speak(); speak();                                    // spoken before the connection is ready
  socket.onopen();
  assert.deepEqual(log.sent, [2560, 2560]);            // …and not lost
  turn('StartOfTurn', 'Hello');
  turn('Update', 'Hello I would like a room for');
  turn('EndOfTurn', 'Hello. I would like a room for', { trigger: 'model' });   // a pause: Deepgram ends the turn
  assert.deepEqual(log.done, []);                      // but nothing is sent to the character
  turn('Update', 'two nights');
  assert.equal(log.partial.at(-1), 'Hello. I would like a room for two nights');
  rec.stop();                                          // the player lets go
  assert.equal(log.sent.at(-1), 'ForceEndTurn');
  assert.equal(log.micStopped, true);
  turn('EndOfTurn', 'Two nights, please.', { trigger: 'manual' });
  assert.deepEqual(log.done, ['Hello. I would like a room for Two nights, please.']);
  assert.deepEqual([log.sent.at(-1), socket.closed], ['CloseStream', true]);
  log.timers.forEach(t => t.fn());                     // the safety timer finds it already delivered
  assert.equal(log.done.length, 1);
  assert.deepEqual(log.errors, []);
});

test('flux: if the last words never arrive, what was heard is still delivered', async () => {
  const { rec, log, socket, turn } = rig({});
  await tick(); socket.onopen();
  turn('Update', 'good morning');
  rec.stop();
  assert.deepEqual(log.done, []);
  log.timers.at(-1).fn();                              // 1.5 s later
  assert.deepEqual(log.done, ['good morning']);
});

test('flux: letting go after the turn already ended delivers at once', async () => {
  const { rec, log, socket, turn } = rig({});
  await tick(); socket.onopen();
  turn('EndOfTurn', 'Good morning.', { trigger: 'model' });
  rec.stop();
  assert.deepEqual(log.sent.slice(-2), [2560, 'ForceEndTurn']);      // a little silence, then the request
  socket.onmessage({ data: JSON.stringify({ type: 'Warning', code: 'FORCE_END_TURN_NO_ACTIVE_TURN' }) });
  assert.deepEqual(log.done, ['Good morning.']);
});

test('flux: hands-free delivers each finished turn and listens to nothing while paused', async () => {
  const { rec, log, socket, turn, speak } = rig({ handsFree: true, level: 'A2' });
  await tick(); socket.onopen();
  assert.match(log.url, /mode=free&level=A2/);
  turn('Update', 'a flat white');
  turn('EndOfTurn', 'A flat white, please.');
  assert.deepEqual(log.turns, ['A flat white, please.']);
  rec.pause(true);                                     // the character is answering
  speak();
  assert.equal(log.sent.at(-1), 2560);                 // silence keeps the line open
  turn('EndOfTurn', 'Sure, coming right up');          // its own voice, picked up by the microphone
  assert.equal(log.turns.length, 1);
  rec.pause(false);
  turn('EndOfTurn', 'Thank you.');
  assert.deepEqual(log.turns, ['A flat white, please.', 'Thank you.']);
  rec.stop();
  assert.deepEqual([socket.closed, log.micStopped, log.done], [true, true, []]);
});

test('flux: problems are reported once and the microphone is released', async () => {
  const dropped = rig({}); await tick(); dropped.socket.onopen();
  dropped.socket.onclose();
  dropped.socket.onerror?.();
  assert.deepEqual([dropped.log.errors, dropped.log.micStopped], [['flux-closed'], true]);

  const refused = rig({}); await tick(); refused.socket.onopen();
  refused.socket.onmessage({ data: JSON.stringify({ type: 'Error', code: 'UPSTREAM' }) });
  assert.deepEqual(refused.log.errors, ['UPSTREAM']);

  const log = { errors: [] };
  listenFlux({ onError: e => log.errors.push(e) }, { capture: async () => { throw Object.assign(new Error('no'), { name: 'NotAllowedError' }); } });
  await tick();
  assert.deepEqual(log.errors, ['not-allowed']);
});

test('flux: microphone samples become 16 kHz, 16-bit audio', () => {
  assert.equal(outputRate(48000), 16000);
  assert.equal(outputRate(44100), 44100);
  const pcm = toPcm16(Float32Array.from([0.3, 0.3, 0.3, -1, -1, -1, 2, 2, 2]), 48000);
  assert.deepEqual([...pcm], [Math.trunc(0.3 * 0x7fff), -0x8000, 0x7fff]);
  assert.equal(toPcm16(new Float32Array(441), 44100).length, 441);
  assert.equal(listenUrl({ sampleRate: 16000, handsFree: true, level: 'B1' }, 'play.example', true), 'wss://play.example/ws/listen?rate=16000&mode=free&level=B1');
});
