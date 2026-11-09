import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveSettings, chat, parseModelJSON, normalizeTurn, PRESETS } from './llm.js';
import { buildSystemPrompt, buildMessages, buildCheckPrompt } from './prompts.js';
import { mockTurn } from './mock.js';
import { attachMultiplayer } from './multiplayer.js';
import { TEMPLATES, resolve } from '../shared/missions.js';
import { postgresStore, validId, validToken } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';

// `store` (see db.js) enables server-side saves; without it the game is localStorage-only.
export function createApp({ store = null } = {}) {
  const app = express();
  app.use(express.json({ limit: '200kb' }));

  app.get('/api/config', (req, res) => {
    const provider = process.env.LLM_PROVIDER || 'mock';
    const p = PRESETS[provider] || PRESETS.mock;
    res.json({
      serverProvider: provider,
      serverModel: process.env.LLM_MODEL || p.model,
      serverHasKey: Boolean((p.envKey && process.env[p.envKey]) || process.env.LLM_API_KEY || p.noKey || p.kind === 'mock'),
      persistence: Boolean(store),
      allowClientKeys: String(process.env.ALLOW_CLIENT_KEYS ?? 'true') !== 'false',
      presets: Object.fromEntries(Object.entries(PRESETS).map(([k, v]) => [k, { model: v.model, models: v.models || [], baseUrl: v.baseUrl || '', needsKey: !v.noKey && v.kind !== 'mock' }]))
    });
  });

  // One NPC turn: reply + game actions + language feedback
  app.post('/api/npc/turn', async (req, res) => {
    try {
      const { mission, state, history, settings: clientSettings } = req.body || {};
      if (!mission || !TEMPLATES[mission.templateId]) return res.status(400).json({ error: 'invalid mission' });
      const settings = resolveSettings(clientSettings);
      let turn;
      if (settings.kind === 'mock') {
        turn = mockTurn({ mission, state, history });
      } else {
        const system = buildSystemPrompt({ mission, state });
        const messages = buildMessages(history);
        const text = await chat({ system, messages, settings });
        turn = normalizeTurn(parseModelJSON(text), text);
      }
      const allowed = resolve(TEMPLATES[mission.templateId], 'actions', mission.params) || [];
      turn.actions = (turn.actions || []).filter(a => allowed.includes(a.type));
      turn.provider = settings.provider;
      res.json(turn);
    } catch (e) {
      console.error('[npc/turn]', e.message);
      res.status(e.status || 500).json({ error: e.message });
    }
  });

  // Grammar check for messages sent to real players (optional)
  app.post('/api/chat/check', async (req, res) => {
    try {
      const { text, nativeLang, settings: clientSettings } = req.body || {};
      const settings = resolveSettings(clientSettings);
      if (settings.kind === 'mock') return res.json({ score: 70, corrected: null, tips: [], newWords: [] });
      const out = await chat({ system: buildCheckPrompt(nativeLang), messages: [{ role: 'user', content: String(text || '').slice(0, 400) }], settings, maxTokens: 300 });
      const obj = parseModelJSON(out) || {};
      res.json({ score: Number(obj.score) || 0, corrected: obj.corrected || null, tips: obj.tips || [], newWords: obj.newWords || [] });
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message });
    }
  });

  // Quick connectivity test from Settings
  app.post('/api/llm/test', async (req, res) => {
    try {
      const settings = resolveSettings(req.body?.settings);
      if (settings.kind === 'mock') return res.json({ ok: true, provider: 'mock', sample: 'Offline mode works.' });
      const out = await chat({ system: 'Reply with a short friendly greeting from a New York taxi driver (max 12 words).', messages: [{ role: 'user', content: 'Hi!' }], settings, maxTokens: 60 });
      res.json({ ok: true, provider: settings.provider, model: settings.model, sample: out.slice(0, 200) });
    } catch (e) {
      res.status(e.status || 500).json({ ok: false, error: e.message });
    }
  });

  // Server-side saves. A save is owned by whoever created it: the secret token never leaves
  // the player's browser except to prove ownership here.
  const saveGuard = (req, res, token) => {
    if (!store) return res.status(503).json({ error: 'persistence disabled' });
    if (!validId(req.params.id) || !validToken(token)) return res.status(400).json({ error: 'invalid save id or token' });
    return null;
  };
  app.put('/api/save/:id', async (req, res) => {
    const { token, data } = req.body || {};
    if (saveGuard(req, res, token)) return;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return res.status(400).json({ error: 'invalid save data' });
    try {
      if (!await store.put(req.params.id, token, data)) return res.status(403).json({ error: 'wrong token' });
      res.json({ ok: true });
    } catch (e) {
      console.error('[save]', e.message);
      res.status(500).json({ error: 'could not save' });
    }
  });
  app.get('/api/save/:id', async (req, res) => {
    const token = req.get('x-save-token');
    if (saveGuard(req, res, token)) return;
    try {
      const row = await store.get(req.params.id, token);
      if (row === null) return res.status(404).json({ error: 'save not found' });
      if (row === false) return res.status(403).json({ error: 'wrong token' });
      res.json(row);
    } catch (e) {
      console.error('[save]', e.message);
      res.status(500).json({ error: 'could not load' });
    }
  });

  const dist = path.join(__dirname, '..', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
  } else {
    app.get('/', (req, res) => res.send('Client not built. Run <code>npm start</code> (build + serve) or <code>npm run dev</code> and open http://localhost:5173'));
  }
  return app;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const store = process.env.DATABASE_URL ? await postgresStore(process.env.DATABASE_URL) : null;
  const server = http.createServer(createApp({ store }));
  attachMultiplayer(server);
  server.listen(PORT, HOST, () => {
    const provider = process.env.LLM_PROVIDER || 'mock';
    console.log(`\n🗽  OpenCourse English City running → http://localhost:${PORT}`);
    console.log(`    LLM provider (server default): ${provider}${provider === 'mock' ? ' (offline — add a key in .env or in the game Settings)' : ''}`);
    console.log(`    Saves: ${store ? 'Postgres (server-side)' : 'browser only (set DATABASE_URL to persist on the server)'}`);
    console.log(`    Friends on your network can join at http://<your-ip>:${PORT}\n`);
  });
}
