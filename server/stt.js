// Listening: the player's microphone, streamed through this server to Deepgram Flux speech-to-text
// (https://developers.deepgram.com/docs/flux/quickstart). The browser connects to /ws/listen here and
// the server connects to Deepgram with the API key, so the key never reaches the browser and any
// Deepgram key works (temporary browser tokens would need a key with the Member role).
import { WebSocketServer } from 'ws';

const FLUX_URL = 'wss://api.deepgram.com/v2/listen';
const RATES = [8000, 16000, 24000, 44100, 48000];
const MAX_SESSION_MS = 10 * 60 * 1000;       // one conversation; the browser reconnects for the next
const MAX_BACKLOG = 200;                     // audio chunks kept while Deepgram is still answering the call

// How long to wait before deciding the player has finished (hands-free). Beginners pause more.
export function patienceFor(level) {
  if (level === 'A1' || level === 'A2') return { eot_threshold: 0.9, eot_timeout_ms: 8000 };
  if (level === 'B1') return { eot_threshold: 0.8, eot_timeout_ms: 6000 };
  return { eot_threshold: 0.7, eot_timeout_ms: 5000 };
}

// What the browser asked for (/ws/listen?rate=16000&mode=free&level=A1&keyterm=…) → the Deepgram URL.
// Only these few things can be chosen from outside; null means the request makes no sense.
export function fluxUrl(query) {
  const rate = Number(query.get('rate'));
  if (!RATES.includes(rate)) return null;
  const q = new URLSearchParams({ model: 'flux-general-en', encoding: 'linear16', sample_rate: String(rate) });
  if (query.get('mode') === 'free') for (const [k, v] of Object.entries(patienceFor(query.get('level')))) q.set(k, String(v));
  for (const term of query.getAll('keyterm').slice(0, 20)) {
    const clean = term.replace(/[^\p{L}\p{N} '-]/gu, '').trim();
    if (clean.length > 1 && clean.length <= 40) q.append('keyterm', clean);
  }
  return `${FLUX_URL}?${q}`;
}

// A websocket server (to be given upgrade requests for /ws/listen) that relays each browser
// connection to its own Deepgram connection: audio one way, transcripts the other.
export function listeningServer(voices) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
  wss.on('connection', (client, req) => {
    const url = voices?.listen && fluxUrl(new URL(req.url, 'http://x').searchParams);
    if (!url) return client.close(1008, voices?.listen ? 'bad request' : 'listening disabled');

    const upstream = voices.listen(url);
    const backlog = [];
    const timer = setTimeout(() => client.close(1000, 'session too long'), MAX_SESSION_MS);
    const hangUp = () => {
      clearTimeout(timer);
      for (const s of [client, upstream]) { try { if (s.readyState <= 1) s.close(); } catch { /* already closed */ } }
    };

    client.on('message', (data, isBinary) => {
      const msg = isBinary ? data : data.toString();
      if (upstream.readyState === 1) upstream.send(msg);
      else if (backlog.length < MAX_BACKLOG) backlog.push(msg);
    });
    upstream.on('open', () => { for (const m of backlog.splice(0)) upstream.send(m); });
    upstream.on('message', (data, isBinary) => { if (client.readyState === 1) client.send(isBinary ? data : data.toString()); });
    upstream.on('error', e => {
      console.error('[stt]', e.message);
      if (client.readyState === 1) client.send(JSON.stringify({ type: 'Error', code: 'UPSTREAM', description: 'voice service unreachable' }));
      hangUp();
    });
    upstream.on('close', hangUp);
    client.on('close', hangUp);
    client.on('error', hangUp);
  });
  return wss;
}
