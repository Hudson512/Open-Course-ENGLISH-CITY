// Talks to the local game server. Settings (provider + key) live in localStorage.
const SETTINGS_KEY = 'oceg-settings-v1';

const DEFAULTS = {
  provider: '', // '' = use the server default (.env)
  apiKey: '', model: '', baseUrl: '',
  voice: true, mic: true, handsFree: false, autoTranslate: true, checkChat: false,
  uiLang: (navigator.language || 'pt').startsWith('pt') ? 'pt' : 'en'
};

let settings = { ...DEFAULTS };
try { settings = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch { /* */ }

export function getSettings() { return settings; }
export function saveSettings(patch) {
  settings = { ...settings, ...patch };
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* */ }
  return settings;
}

function llmSettings() {
  const { provider, apiKey, model, baseUrl } = settings;
  return provider ? { provider, apiKey, model, baseUrl } : {};
}

async function post(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({ error: 'Invalid server response' }));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const api = {
  config: () => fetch('/api/config').then(r => r.json()),
  // One turn of a character. `onReply(text)` is called as soon as the character's line is known,
  // usually well before the rest (corrections, suggestions, actions) that the promise resolves with.
  async npcTurn(mission, state, history, onReply) {
    const res = await fetch('/api/npc/turn', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pack: state.pack, mission, state: snapshot(state), history, settings: llmSettings(), stream: true })
    });
    if (!/ndjson/.test(res.headers.get('content-type') || '') || !res.body) {      // an error, or everything at once
      const data = await res.json().catch(() => ({ error: 'Invalid server response' }));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      return data;
    }
    let turn = null, buffer = '';
    const read = line => {
      if (!line.trim()) return;
      const msg = JSON.parse(line);
      if (msg.type === 'reply') onReply?.(msg.reply);
      else if (msg.type === 'turn') turn = msg;
      else if (msg.type === 'error') throw new Error(msg.error);
    };
    const reader = res.body.getReader(), decoder = new TextDecoder();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      lines.forEach(read);
    }
    read(buffer);
    if (!turn) throw new Error('Invalid server response');
    return turn;
  },
  checkChat: (text, nativeLang) => post('/api/chat/check', { text, nativeLang, settings: llmSettings() }),
  test: s => post('/api/llm/test', { settings: s })

};

// Only what the NPC needs to know
function snapshot(s) {
  return { player: s.player, xp: s.xp, money: s.money, home: s.home, flags: s.flags, choices: s.choices, log: s.log, job: s.job, time: s.time, stats: s.stats };
}
