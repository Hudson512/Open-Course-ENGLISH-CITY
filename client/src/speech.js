// Speech: character voices and microphone input (SpeechRecognition).
// Voices come from the server when it has natural ones (Deepgram, see server/tts.js); otherwise,
// or if that fails, from the browser (speechSynthesis).
// The accent follows the city being played (`language` in city.yaml, e.g. en-GB in London).
import { getPack } from './pack.js';
import { api } from './api.js';

const cityLang = () => getPack()?.language || 'en-US';
const slowFor = level => ({ A1: 0.8, A2: 0.88, B1: 0.95 }[level] || 1);   // beginners hear it slower

// ── Voices from the server ──────────────────────────────────────
const serverConfig = api.config().catch(() => ({}));   // asked once: what the server can do
const hasServerVoices = async () => Boolean((await serverConfig).voices);
// Can the server listen to the microphone (Deepgram Flux, see flux.js)?
export const serverListens = async () => Boolean((await serverConfig).listening);

let player = null;                           // the <audio> playing now
let turn = 0;                                // every speak()/stopSpeaking() starts a new turn

// The address of a line's audio. The browser starts playing as soon as the first sound arrives and
// keeps the file, so the 🔊 button replays it without asking the server again.
export function voiceUrl(text, { gender, deepgram, name }, pack = getPack()?.id) {
  const q = new URLSearchParams({ pack: pack || '', name: name || '', gender: gender || 'female' });
  if (deepgram) q.set('deepgram', deepgram);
  q.set('text', text);
  return `/api/tts?${q}`;
}

async function speakFromServer(text, voice) {
  const audio = player = new Audio(voiceUrl(text, voice));
  audio.playbackRate = Math.min(1.3, Math.max(0.7, voice.rate * slowFor(voice.level)));
  await audio.play();                        // fails if the server cannot say it → the browser's voice takes over
  await new Promise(done => { audio.onended = audio.onerror = audio.onpause = done; });   // until it ends or is stopped
}

// ── Voices from the browser ─────────────────────────────────────
let voices = [];
const loadVoices = () => { voices = (window.speechSynthesis?.getVoices() || []).filter(v => /^en/i.test(v.lang)); };
if (window.speechSynthesis) { loadVoices(); window.speechSynthesis.onvoiceschanged = loadVoices; }

const FEMALE = /female|samantha|zira|aria|jenny|susan|karen|victoria|allison|ava|joanna|salli|kendra|kimberly|emma|google us english|google uk english female|libby|sonia|maisie|hazel|kate|serena|martha/i;
const MALE = /male|david|mark|guy|alex|fred|daniel|matthew|joey|justin|tom|aaron|christopher|ryan|george|oliver|arthur|thomas/i;

function speakFromBrowser(text, { gender, rate, level }) {
  if (!window.speechSynthesis) return null;
  const u = new SpeechSynthesisUtterance(text);
  const lang = cityLang();
  u.lang = lang;
  u.rate = rate * slowFor(level);
  const local = voices.filter(v => v.lang.replace('_', '-').toLowerCase() === lang.toLowerCase());
  const pool = local.length ? local : voices;
  const re = gender === 'male' ? MALE : FEMALE;
  u.voice = pool.find(v => re.test(v.name) && !(gender === 'male' ? FEMALE : MALE).test(v.name)) || pool[0] || null;
  window.speechSynthesis.speak(u);
  return new Promise(done => { u.onend = u.onerror = done; });
}

// `voice` is the character's voice block from the pack ({ gender, rate, deepgram }) plus its name.
// The promise resolves when the line has been spoken (or was stopped).
export async function speak(text, { gender = 'female', rate = 1, level = 'B1', deepgram, name = '' } = {}) {
  text = String(text || '').replace(/[*_#]/g, '').trim();
  if (!text) return;
  stopSpeaking();
  const mine = turn;
  const voice = { gender, rate, level, deepgram, name };
  if (await hasServerVoices()) {
    try { if (mine === turn) await speakFromServer(text, voice); return; }
    catch (e) { if (e.name === 'AbortError' || mine !== turn) return; }   // stopped on purpose
  }
  if (mine === turn) await speakFromBrowser(text, voice);
}

export function stopSpeaking() {
  turn++;
  if (player) { player.pause(); player.removeAttribute('src'); player.load?.(); player = null; }   // also stops the download
  window.speechSynthesis?.cancel();
}

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const micSupported = !!SR;

// Hold-to-talk: recording goes on until stop() is called, however long the speaker pauses.
// The browser's recogniser gives up after a few seconds of silence, so while the player is still
// holding the button it is started again and the text is kept.
//   onPartial(text)  what has been heard so far
//   onDone(text)     once, after stop(): everything that was said ('' if nothing)
// Returns { stop, cancel }: stop() finishes and delivers the text, cancel() throws it away.
export function listen({ onPartial, onDone, onError }) {
  if (!SR) { onError?.('not-supported'); return null; }
  let held = true, cancelled = false, finished = false;
  let said = '';                 // finished sentences from earlier rounds
  let round = '';                // what the current round has heard (final + still changing)
  let r = null;

  const join = (a, b) => (a && b ? `${a} ${b}` : a || b).trim();
  const finish = () => {
    if (finished) return;
    finished = true;
    if (!cancelled) onDone?.(join(said, round));
  };
  const start = () => {
    r = new SR();
    r.lang = cityLang();
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.onresult = e => {
      let text = '';
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      round = text.trim();
      onPartial?.(join(said, round));
    };
    r.onerror = e => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;   // a pause, or our own stop
      held = false; cancelled = true;
      onError?.(e.error);
    };
    r.onend = () => {
      if (!held) return finish();
      said = join(said, round); round = '';
      try { start(); } catch { held = false; finish(); }
    };
    r.start();
  };
  try { start(); } catch (e) { onError?.(e.name || 'error'); return null; }

  return {
    stop() { if (!held) return; held = false; try { r.stop(); } catch { finish(); } },
    cancel() { cancelled = true; held = false; try { r.abort(); } catch { /* already stopped */ } }
  };
}
