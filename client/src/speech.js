// Browser speech: NPC voices (speechSynthesis) and microphone input (SpeechRecognition).
let voices = [];
const loadVoices = () => { voices = (window.speechSynthesis?.getVoices() || []).filter(v => /^en(-|_)US/i.test(v.lang) || /^en/i.test(v.lang)); };
if (window.speechSynthesis) { loadVoices(); window.speechSynthesis.onvoiceschanged = loadVoices; }

const FEMALE = /female|samantha|zira|aria|jenny|susan|karen|victoria|allison|ava|joanna|salli|kendra|kimberly|emma|google us english/i;
const MALE = /male|david|mark|guy|alex|fred|daniel|matthew|joey|justin|tom|aaron|christopher/i;

export function speak(text, { gender = 'female', rate = 1, level = 'B1' } = {}) {
  if (!window.speechSynthesis || !text) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/[*_#]/g, ''));
  u.lang = 'en-US';
  const slow = { A1: 0.8, A2: 0.88, B1: 0.95 }[level] || 1;
  u.rate = rate * slow;
  const us = voices.filter(v => /en(-|_)US/i.test(v.lang));
  const pool = us.length ? us : voices;
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
  r.lang = 'en-US';
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
