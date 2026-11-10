// Listening with Deepgram Flux (https://developers.deepgram.com/docs/flux/quickstart): the player's
// microphone is streamed, through the game server, to Deepgram, which writes down what is said and
// notices when a turn ends.
// Used when the server has a Deepgram key; otherwise the browser's recogniser is used (speech.js).
//
// Two ways of talking:
//   hold to talk   the text is delivered once, when stop() is called (the player let go of the button)
//   hands-free     every finished turn is delivered as it happens, until stop()/cancel()
import { getPack } from './pack.js';

const CHUNK_MS = 80;                         // the chunk size Deepgram recommends
const TAIL_CHUNKS = 8;                        // 0.64 s of silence sent after the player lets go
const FINAL_WAIT_MS = 1500;                  // after letting go: how long to wait for the last words

// The game server relays the microphone to Deepgram (server/stt.js); this is its address.
export function listenUrl({ sampleRate, level, keyterms = [], handsFree = false }, host = location.host, secure = location.protocol === 'https:') {
  const q = new URLSearchParams({ rate: String(sampleRate), mode: handsFree ? 'free' : 'hold', level: level || '' });
  for (const term of keyterms.slice(0, 20)) q.append('keyterm', term);
  return `${secure ? 'wss' : 'ws'}://${host}/ws/listen?${q}`;
}

// Words the recogniser should expect here: the place's items and the mission's vocabulary.
export function keytermsFor(info) {
  const clean = s => String(s).replace(/…|\.\.\.|[?!]/g, '').split(' / ')[0].trim();
  const items = Object.keys({ ...info?.place?.sells, ...info?.place?.services });
  const names = [info?.place?.name, info?.character?.name, getPack()?.name];
  return [...new Set([...items, ...(info?.vocab || []), ...names].filter(Boolean).map(clean).filter(s => s.length > 2 && s.length < 40))];
}

// ── Microphone → 16-bit PCM chunks ──────────────────────────────
const WORKLET = `registerProcessor('pcm-tap', class extends AudioWorkletProcessor {
  process(inputs) { const ch = inputs[0][0]; if (ch) this.port.postMessage(ch.slice(0)); return true; }
});`;

// Float samples at `rate` → Int16 at 16 kHz when the rate divides evenly (48 kHz), else unchanged.
export function toPcm16(samples, rate) {
  const step = rate % 16000 === 0 ? rate / 16000 : 1;
  const out = new Int16Array(Math.floor(samples.length / step));
  for (let i = 0; i < out.length; i++) {
    let sum = 0;
    for (let j = 0; j < step; j++) sum += samples[i * step + j];
    const v = Math.max(-1, Math.min(1, sum / step));
    out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  return out;
}
export const outputRate = rate => (rate % 16000 === 0 ? 16000 : rate);

export const canCapture = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof AudioWorkletNode !== 'undefined';

// Starts the microphone and calls onChunk(ArrayBuffer) about every 80 ms. → { sampleRate, stop }
async function captureMic(onChunk) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  const ctx = new AudioContext();
  const moduleUrl = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
  try { await ctx.audioWorklet.addModule(moduleUrl); } finally { URL.revokeObjectURL(moduleUrl); }
  const source = ctx.createMediaStreamSource(stream);
  const tap = new AudioWorkletNode(ctx, 'pcm-tap');
  const need = Math.round(ctx.sampleRate * CHUNK_MS / 1000);
  let pending = new Float32Array(0);
  tap.port.onmessage = e => {
    const joined = new Float32Array(pending.length + e.data.length);
    joined.set(pending); joined.set(e.data, pending.length);
    pending = joined;
    while (pending.length >= need) {
      onChunk(toPcm16(pending.subarray(0, need), ctx.sampleRate).buffer);
      pending = pending.slice(need);
    }
  };
  source.connect(tap);
  return {
    sampleRate: outputRate(ctx.sampleRate),
    stop() { tap.port.onmessage = null; source.disconnect(); stream.getTracks().forEach(tr => tr.stop()); ctx.close().catch(() => {}); }
  };
}

const openSocket = url => new WebSocket(url);

// ── One listening session ───────────────────────────────────────
//   onPartial(text)  what has been heard so far in this message
//   onDone(text)     hold to talk: once, after stop()
//   onTurn(text)     hands-free: each time the player finishes a turn
//   onError(code)
// Returns { stop, cancel, pause }. pause(true) stops listening for a while without hanging up
// (hands-free: while the character is thinking or speaking, so it does not hear itself).
// `deps` lets the tests replace the microphone, the socket and the clock.
export function listenFlux({ handsFree = false, level, keyterms, onPartial, onDone, onTurn, onError }, deps = {}) {
  const capture = deps.capture || captureMic;
  const socket = deps.socket || openSocket;
  const wait = deps.wait || ((fn, ms) => setTimeout(fn, ms));

  let ws = null, mic = null;
  let open = false, closed = false, stopping = false, paused = false;
  const backlog = [];            // audio recorded before the connection was ready
  let said = '';                 // finished turns of this message (hold to talk)
  let round = '';                // the turn being spoken now

  const join = (a, b) => (a && b ? `${a} ${b}` : a || b).trim();
  const shutdown = () => {
    if (closed) return false;
    closed = true;
    mic?.stop();
    try { if (ws && open) ws.send(JSON.stringify({ type: 'CloseStream' })); ws?.close(); } catch { /* already closed */ }
    return true;
  };
  const fail = code => { if (shutdown()) onError?.(code); };
  const finish = () => { if (shutdown()) onDone?.(join(said, round)); };

  const onChunk = buf => {
    if (closed || stopping) return;
    const data = paused ? new ArrayBuffer(buf.byteLength) : buf;   // silence keeps the line open
    if (open) ws.send(data); else if (!paused) backlog.push(data);
  };

  const onMessage = raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.type === 'Error') return fail(m.code || 'flux-error');
    if (m.type === 'Warning' && m.code === 'FORCE_END_TURN_NO_ACTIVE_TURN' && stopping) return finish();   // nothing more to wait for
    if (m.type !== 'TurnInfo' || closed) return;
    const text = String(m.transcript || '').trim();
    if (m.event === 'EndOfTurn') {
      if (handsFree) { round = ''; if (text && !paused) onTurn?.(text); return; }
      said = join(said, text); round = '';
      if (stopping) return finish();
    } else {
      round = text;
    }
    if (!paused) onPartial?.(join(said, round));
  };

  (async () => {
    try {
      mic = await capture(onChunk);
      if (closed) return mic.stop();
      if (stopping) { mic.stop(); return finish(); }   // let go before the microphone even started
      ws = socket(listenUrl({ sampleRate: mic.sampleRate, level, keyterms, handsFree }));
      ws.binaryType = 'arraybuffer';
      ws.onopen = () => {
        open = true;
        for (const b of backlog.splice(0)) ws.send(b);
        if (stopping) endTurn();
      };
      ws.onmessage = e => { if (typeof e.data === 'string') onMessage(e.data); };
      ws.onerror = () => fail('flux-connection');
      ws.onclose = () => { if (stopping) finish(); else fail('flux-closed'); };
    } catch (e) {
      fail(e?.name === 'NotAllowedError' || e?.name === 'SecurityError' ? 'not-allowed' : e?.name === 'NotFoundError' ? 'no-microphone' : (e?.message || 'flux-error'));
    }
  })();

  // The player let go: ask for the last words, then deliver.
  // A little silence first, so the words still on their way are not cut off.
  function endTurn() {
    const quiet = new ArrayBuffer(Math.round(mic.sampleRate * CHUNK_MS / 1000) * 2);
    for (let i = 0; i < TAIL_CHUNKS; i++) ws.send(quiet);
    ws.send(JSON.stringify({ type: 'ForceEndTurn' }));
    wait(finish, FINAL_WAIT_MS);
  }

  return {
    stop() {
      if (closed || stopping) return;
      if (handsFree) return void shutdown();
      stopping = true;
      mic?.stop();
      if (open) endTurn(); else wait(finish, 4000);   // still connecting: onopen sends what was recorded
    },
    cancel() { shutdown(); },
    pause(on) { paused = !!on; if (paused) { round = ''; backlog.length = 0; } }
  };
}
