// Speech: character voices and microphone input (SpeechRecognition).
// Voices come from the server when it has natural ones (Deepgram, see server/tts.js); otherwise,
// or if that fails, from the browser (speechSynthesis).
// The accent follows the city being played (`language` in city.yaml, e.g. en-GB in London).
import { getPack } from './pack.js';
import { api } from './api.js';

const cityLang = () => getPack()?.language || 'en-US';
const slowFor = level => ({ A1: 0.8, A2: 0.88, B1: 0.95 }[level] || 1);   // beginners hear it slower

// ── Voices from the server ──────────────────────────────────────
let serverVoices = null;                     // null = not asked yet
const hasServerVoices = async () => {
  if (serverVoices === null) serverVoices = await api.config().then(c => Boolean(c.voices), () => false);
  return serverVoices;
};
hasServerVoices();

const clips = new Map();                     // line already heard → its audio, so 🔊 replays for free
const MAX_CLIPS = 40;
let player = null;                           // the <audio> playing now
let pending = null;                          // the request for the line about to play
let turn = 0;                                // every speak()/stopSpeaking() starts a new turn

async function speakFromServer(text, { gender, deepgram, name, rate, level }, mine) {
  const key = [getPack()?.id, name, gender, deepgram, text].join('|');
  let url = clips.get(key);
  if (!url) {
    pending = new AbortController();
    const blob = await api.tts(text, { gender, deepgram }, name, getPack()?.id, pending.signal);
    if (mine !== turn) return;               // the player moved on while it was loading
    url = URL.createObjectURL(blob);
    clips.set(key, url);
    if (clips.size > MAX_CLIPS) { const [old, oldUrl] = clips.entries().next().value; clips.delete(old); URL.revokeObjectURL(oldUrl); }
  }
  player = new Audio(url);
  player.playbackRate = Math.min(1.3, Math.max(0.7, rate * slowFor(level)));
  await player.play();
}

// ── Voices from the browser ─────────────────────────────────────
let voices = [];
const loadVoices = () => { voices = (window.speechSynthesis?.getVoices() || []).filter(v => /^en/i.test(v.lang)); };
if (window.speechSynthesis) { loadVoices(); window.speechSynthesis.onvoiceschanged = loadVoices; }

const FEMALE = /female|samantha|zira|aria|jenny|susan|karen|victoria|allison|ava|joanna|salli|kendra|kimberly|emma|google us english|google uk english female|libby|sonia|maisie|hazel|kate|serena|martha/i;
const MALE = /male|david|mark|guy|alex|fred|daniel|matthew|joey|justin|tom|aaron|christopher|ryan|george|oliver|arthur|thomas/i;

function speakFromBrowser(text, { gender, rate, level }) {
  if (!window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(text);
  const lang = cityLang();
  u.lang = lang;
  u.rate = rate * slowFor(level);
  const local = voices.filter(v => v.lang.replace('_', '-').toLowerCase() === lang.toLowerCase());
  const pool = local.length ? local : voices;
  const re = gender === 'male' ? MALE : FEMALE;
  u.voice = pool.find(v => re.test(v.name) && !(gender === 'male' ? FEMALE : MALE).test(v.name)) || pool[0] || null;
  window.speechSynthesis.speak(u);
}

// `voice` is the character's voice block from the pack ({ gender, rate, deepgram }) plus its name.
export async function speak(text, { gender = 'female', rate = 1, level = 'B1', deepgram, name = '' } = {}) {
  text = String(text || '').replace(/[*_#]/g, '').trim();
  if (!text) return;
  stopSpeaking();
  const mine = turn;
  const voice = { gender, rate, level, deepgram, name };
  if (await hasServerVoices()) {
    try { if (mine === turn) await speakFromServer(text, voice, mine); return; }
    catch (e) { if (e.name === 'AbortError' || mine !== turn) return; }   // stopped on purpose
  }
  if (mine === turn) speakFromBrowser(text, voice);
}

export function stopSpeaking() {
  turn++;
  pending?.abort(); pending = null;
  if (player) { player.pause(); player = null; }
  window.speechSynthesis?.cancel();
}

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const micSupported = !!SR;

export function listen({ onPartial, onFinal, onEnd, onError }) {
  if (!SR) { onError?.('not-supported'); return null; }
  const r = new SR();
  r.lang = cityLang();
  r.interimResults = true;
  r.maxAlternatives = 1;
  let finalText = '';
  r.onresult = e => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      if (res.isFinal) finalText += res[0].transcript; else interim += res[0].transcript;
    }
    onPartial?.(finalText + interim);
  };
  r.onerror = e => onError?.(e.error);
  r.onend = () => { if (finalText) onFinal?.(finalText.trim()); onEnd?.(); };
  r.start();
  return r;
}
