// Browser speech: NPC voices (speechSynthesis) and microphone input (SpeechRecognition).
// The accent follows the city being played (`language` in city.yaml, e.g. en-GB in London).
import { getPack } from './pack.js';

const cityLang = () => getPack()?.language || 'en-US';
let voices = [];
const loadVoices = () => { voices = (window.speechSynthesis?.getVoices() || []).filter(v => /^en/i.test(v.lang)); };
if (window.speechSynthesis) { loadVoices(); window.speechSynthesis.onvoiceschanged = loadVoices; }

const FEMALE = /female|samantha|zira|aria|jenny|susan|karen|victoria|allison|ava|joanna|salli|kendra|kimberly|emma|google us english|google uk english female|libby|sonia|maisie|hazel|kate|serena|martha/i;
const MALE = /male|david|mark|guy|alex|fred|daniel|matthew|joey|justin|tom|aaron|christopher|ryan|george|oliver|arthur|thomas/i;

export function speak(text, { gender = 'female', rate = 1, level = 'B1' } = {}) {
  if (!window.speechSynthesis || !text) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/[*_#]/g, ''));
  const lang = cityLang();
  u.lang = lang;
  const slow = { A1: 0.8, A2: 0.88, B1: 0.95 }[level] || 1;
  u.rate = rate * slow;
  const local = voices.filter(v => v.lang.replace('_', '-').toLowerCase() === lang.toLowerCase());
  const pool = local.length ? local : voices;
  const re = gender === 'male' ? MALE : FEMALE;
  u.voice = pool.find(v => re.test(v.name) && !(gender === 'male' ? FEMALE : MALE).test(v.name)) || pool[0] || null;
  window.speechSynthesis.speak(u);
}
export function stopSpeaking() { window.speechSynthesis?.cancel(); }

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
