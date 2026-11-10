// Talks to the local game server. Settings (provider + key) live in localStorage.
const SETTINGS_KEY = 'oceg-settings-v1';

const DEFAULTS = {
  provider: '', // '' = use the server default (.env)
  apiKey: '', model: '', baseUrl: '',
  voice: true, mic: true, autoTranslate: true, checkChat: false,
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
  npcTurn: (mission, state, history) => post('/api/npc/turn', { pack: state.pack, mission, state: snapshot(state), history, settings: llmSettings() }),
  checkChat: (text, nativeLang) => post('/api/chat/check', { text, nativeLang, settings: llmSettings() }),
  test: s => post('/api/llm/test', { settings: s })
};

// Only what the NPC needs to know
function snapshot(s) {
  return { player: s.player, xp: s.xp, money: s.money, home: s.home, flags: s.flags, choices: s.choices, log: s.log, job: s.job, time: s.time, stats: s.stats };
}
