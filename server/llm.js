// Provider-agnostic LLM client. Each player can bring their own key.

export const PRESETS = {
  anthropic: { kind: 'anthropic', baseUrl: 'https://api.anthropic.com', model: 'claude-haiku-5-5', envKey: 'ANTHROPIC_API_KEY' },
  openai: { kind: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', envKey: 'OPENAI_API_KEY', json: true },
  gemini: { kind: 'openai', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash', envKey: 'GEMINI_API_KEY', json: true },
  groq: { kind: 'openai', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', envKey: 'GROQ_API_KEY', json: true,
    // Production chat models from https://console.groq.com/docs/models (checked 2026-11-09)
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b'] },
  openrouter: { kind: 'openai', baseUrl: 'https://openrouter.ai/api/v1', model: 'meta-llama/llama-3.3-70b-instruct', envKey: 'OPENROUTER_API_KEY', json: false },
  ollama: { kind: 'openai', baseUrl: 'http://localhost:11434/v1', model: 'llama3.1', envKey: null, json: true, noKey: true },
  custom: { kind: 'openai', baseUrl: 'http://localhost:1234/v1', model: 'local-model', envKey: 'LLM_API_KEY', json: false },
  mock: { kind: 'mock', model: 'offline-mock' }
};

export function resolveSettings(client = {}, env = process.env) {
  const allowClient = String(env.ALLOW_CLIENT_KEYS ?? 'true') !== 'false';
  const clientKey = allowClient ? (client.apiKey || '').trim() : '';
  let provider = (allowClient && client.provider) || env.LLM_PROVIDER || 'mock';
  if (!PRESETS[provider]) provider = 'mock';
  const p = PRESETS[provider];
  const trimUrl = u => String(u || '').trim().replace(/\/$/, '');
  const serverBase = trimUrl(env.LLM_BASE_URL || p.baseUrl);
  const clientBase = allowClient ? trimUrl(client.baseUrl) : '';
  // A client-chosen URL must never receive the server's keys: only the client's own key goes there.
  const customBase = Boolean(clientBase) && clientBase !== serverBase && clientBase !== trimUrl(p.baseUrl);
  const apiKey = customBase ? clientKey : clientKey || (p.envKey && env[p.envKey]) || env.LLM_API_KEY || '';
  const model = (allowClient && client.model) || env.LLM_MODEL || p.model;
  const baseUrl = customBase ? clientBase : serverBase;
  if (p.kind !== 'mock' && !apiKey && !p.noKey) {
    const e = new Error(`No API key for provider "${provider}". Add it in Settings (⚙️) or in the server .env file.`);
    e.status = 401;
    throw e;
  }
  return { provider, kind: p.kind, apiKey, model, baseUrl, json: p.json };
}

export async function chat({ system, messages, settings, maxTokens = 900 }) {
  if (settings.kind === 'anthropic') return anthropic({ system, messages, settings, maxTokens });
  if (settings.kind === 'openai') return openaiCompat({ system, messages, settings });
  throw new Error('mock provider handled elsewhere');
}

async function anthropic({ system, messages, settings, maxTokens }) {
  const res = await fetch(`${settings.baseUrl}/v1/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': settings.apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: settings.model, max_tokens: maxTokens, system, messages }),
    signal: AbortSignal.timeout(60000)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw httpError(res.status, data?.error?.message || JSON.stringify(data));
  return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
}

async function openaiCompat({ system, messages, settings }) {
  const body = { model: settings.model, messages: [{ role: 'system', content: system }, ...messages] };
  if (settings.json) body.response_format = { type: 'json_object' };
  const headers = { 'content-type': 'application/json' };
  if (settings.apiKey) headers.authorization = `Bearer ${settings.apiKey}`;
  let res = await fetch(`${settings.baseUrl}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(90000) });
  let data = await res.json().catch(() => ({}));
  if (!res.ok && body.response_format && res.status === 400) {
    delete body.response_format; // some servers don't support JSON mode
    res = await fetch(`${settings.baseUrl}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(90000) });
    data = await res.json().catch(() => ({}));
  }
  if (!res.ok) throw httpError(res.status, data?.error?.message || JSON.stringify(data));
  return data.choices?.[0]?.message?.content || '';
}

function httpError(status, msg) {
  const e = new Error(`LLM provider error (${status}): ${String(msg).slice(0, 300)}`);
  e.status = status === 401 || status === 403 ? 401 : 502;
  return e;
}

// Robust JSON extraction from model output
export function parseModelJSON(text) {
  if (!text) return null;
  let t = String(text).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  const slice = t.slice(start, end + 1);
  try { return JSON.parse(slice); } catch { /* try to fix trailing commas */ }
  try { return JSON.parse(slice.replace(/,\s*([}\]])/g, '$1')); } catch { return null; }
}

export function normalizeTurn(obj, rawText) {
  if (!obj || typeof obj !== 'object') {
    return { reply: String(rawText || '...').slice(0, 500), emotion: 'neutral', actions: [], feedback: null, suggestions: [], translation: null };
  }
  const fb = obj.feedback && typeof obj.feedback === 'object' && Number.isFinite(Number(obj.feedback.score))
    ? {
        score: Math.max(0, Math.min(100, Math.round(Number(obj.feedback.score)))),
        corrected: obj.feedback.corrected && obj.feedback.corrected !== 'null' ? String(obj.feedback.corrected) : null,
        tips: Array.isArray(obj.feedback.tips) ? obj.feedback.tips.slice(0, 3).map(String) : [],
        newWords: Array.isArray(obj.feedback.newWords) ? obj.feedback.newWords.filter(w => w && w.en).slice(0, 4).map(w => ({ en: String(w.en), meaning: String(w.meaning || '') })) : []
      }
    : null;
  return {
    reply: String(obj.reply || '...'),
    emotion: ['happy', 'neutral', 'annoyed', 'confused', 'surprised'].includes(obj.emotion) ? obj.emotion : 'neutral',
    actions: Array.isArray(obj.actions) ? obj.actions.filter(a => a && typeof a.type === 'string').slice(0, 6) : [],
    feedback: fb,
    suggestions: Array.isArray(obj.suggestions) ? obj.suggestions.slice(0, 3).map(String) : [],
    translation: obj.translation && obj.translation !== 'null' ? String(obj.translation) : null
  };
}
