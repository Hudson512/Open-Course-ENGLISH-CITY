// Character voices with Deepgram Aura-2 text-to-speech (optional: set DEEPGRAM_API_KEY).
// Without a key the game keeps using the browser's own voices.
// Docs: https://developers.deepgram.com/docs/text-to-speech
import { Readable } from 'node:stream';

// Aura-2 voices by accent (https://developers.deepgram.com/docs/tts-models).
// A character with no voice of its own gets one of these for its city's language and its gender.
const VOICES = {
  'en-US': {
    female: ['thalia', 'andromeda', 'asteria', 'athena', 'aurora', 'callista', 'cora', 'cordelia', 'delia', 'electra', 'harmonia', 'helena', 'hera', 'iris', 'juno', 'luna', 'minerva', 'ophelia', 'phoebe', 'selene', 'vesta'],
    male: ['apollo', 'arcas', 'aries', 'atlas', 'hermes', 'jupiter', 'mars', 'neptune', 'odysseus', 'orion', 'orpheus', 'pluto', 'saturn', 'zeus']
  },
  'en-GB': { female: ['pandora'], male: ['draco'] },
  'en-AU': { female: ['theia'], male: ['hyperion'] },
  'en-PH': { female: ['amalthea'], male: ['apollo'] }
};

export const MAX_TTS_CHARS = 700;            // a character's line is short; Deepgram's own limit is 2000
const MODEL = /^aura-2-[a-z]+-[a-z]{2}$/;    // the only thing a pack or a player may ask for

// The same character always gets the same voice: the name picks one from the list.
export function pickVoice({ language = 'en-US', gender = 'female', name = '', model } = {}) {
  if (model && MODEL.test(model)) return model;
  const accent = VOICES[language] || VOICES['en-US'];
  const list = accent[gender === 'male' ? 'male' : 'female'];
  let n = 0;
  for (const ch of String(name)) n = (n * 31 + ch.codePointAt(0)) >>> 0;
  return `aura-2-${list[n % list.length]}-en`;
}

// Returns null without a key, so the server can say "no voices here" and the game falls back.
export function deepgramVoices(key = process.env.DEEPGRAM_API_KEY, fetchFn = fetch) {
  if (!key) return null;
  return {
    // → { ok, status, type, stream } with the audio as MP3
    async speak(text, model) {
      const res = await fetchFn(`https://api.deepgram.com/v1/speak?model=${encodeURIComponent(model)}`, {
        method: 'POST',
        headers: { authorization: `Token ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({ text })
      });
      return { ok: res.ok, status: res.status, type: res.headers.get('content-type') || 'audio/mpeg', stream: res.ok && res.body ? Readable.fromWeb(res.body) : null };
    }
  };
}
