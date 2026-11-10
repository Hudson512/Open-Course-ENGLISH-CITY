// Hold-to-talk: what the player says is delivered once, when they let go — never on a pause.
// The browser's speech recogniser is replaced by a pretend one that the test drives by hand.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const made = [];                              // every recogniser the game created
class FakeRecognition {
  constructor() { made.push(this); this.running = false; }
  start() { this.running = true; }
  stop() { this.running = false; queueMicrotask(() => this.onend?.()); }
  abort() { this.running = false; queueMicrotask(() => this.onend?.()); }
  // helpers for the test
  hear(...parts) { this.onresult?.({ results: parts.map(p => [{ transcript: p }]) }); }
  silence() { this.onerror?.({ error: 'no-speech' }); this.running = false; this.onend?.(); }   // the browser gives up
}

globalThis.window = { SpeechRecognition: FakeRecognition };
globalThis.navigator ??= { language: 'en' };
globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.fetch = async () => { throw new Error('offline'); };
const { listen, micSupported } = await import('../client/src/speech.js');
const tick = () => new Promise(r => setTimeout(r, 0));

function hold() {
  made.length = 0;
  const log = { partial: [], done: [], errors: [] };
  const rec = listen({ onPartial: t => log.partial.push(t), onDone: t => log.done.push(t), onError: e => log.errors.push(e) });
  return { rec, log };
}

test('mic: a long pause does not send; releasing sends everything said', async () => {
  assert.equal(micSupported, true);
  const { rec, log } = hold();
  assert.equal(made[0].continuous, true);
  made[0].hear('I would like');
  made[0].silence();                          // the learner stops to think
  await tick();
  assert.deepEqual(log.done, []);             // nothing was sent
  assert.equal(made.length, 2);               // and the game is still listening
  assert.equal(made[1].running, true);
  made[1].hear('a room for');
  made[1].hear('a room for ', 'two nights');
  assert.equal(log.partial.at(-1), 'I would like a room for two nights');
  made[1].silence();
  await tick();
  made[2].hear('please');
  rec.stop();                                 // the player lets go of the button
  await tick();
  assert.deepEqual(log.done, ['I would like a room for two nights please']);
  assert.equal(made.length, 3);               // no new round after letting go
  rec.stop(); await tick();
  assert.equal(log.done.length, 1);           // delivered once only
  assert.deepEqual(log.errors, []);
});

test('mic: releasing without speaking delivers an empty text, cancelling delivers nothing', async () => {
  const quiet = hold();
  quiet.rec.stop(); await tick();
  assert.deepEqual(quiet.log.done, ['']);

  const dropped = hold();
  made[0].hear('never mind');
  dropped.rec.cancel(); await tick();
  assert.deepEqual(dropped.log.done, []);
  assert.equal(made.length, 1);
});

test('mic: a real problem (no permission) stops the recording and is reported', async () => {
  const { log } = hold();
  made[0].onerror({ error: 'not-allowed' });
  made[0].running = false; made[0].onend();
  await tick();
  assert.deepEqual(log.errors, ['not-allowed']);
  assert.deepEqual(log.done, []);
  assert.equal(made.length, 1);               // it does not keep retrying
});
