// Lightweight WebSocket multiplayer: presence, positions and proximity chat.
import { WebSocketServer } from 'ws';

const CHAT_RADIUS = 450;
const TICK_MS = 100;

export function attachMultiplayer(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  const players = new Map(); // id -> {ws, id, name, x, y, level, color, room, dir}

  const send = (ws, msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };

  wss.on('connection', ws => {
    let me = null;
    ws.on('message', raw => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      if (msg.t === 'join') {
        const id = String(msg.id || Math.random().toString(36).slice(2)).slice(0, 40);
        const old = players.get(id);
        if (old && old.ws !== ws) old.ws.close();
        me = {
          ws, id, name: clean(msg.name, 20) || 'Player', level: clean(msg.level, 3) || 'A1',
          color: Number(msg.color) || 0xffffff, room: clean(msg.room, 20) || 'lobby',
          x: Number(msg.x) || 0, y: Number(msg.y) || 0, from: clean(msg.from, 30)
        };
        players.set(id, me);
        send(ws, { t: 'welcome', id, online: players.size });
        broadcast(me.room, { t: 'system', text: `${me.name} (${me.from || '?'}) arrived in the city.` }, id);
      } else if (!me) {
        return;
      } else if (msg.t === 'move') {
        me.x = Number(msg.x) || me.x; me.y = Number(msg.y) || me.y; me.dir = Number(msg.dir) || 0;
        if (msg.level) me.level = clean(msg.level, 3);
      } else if (msg.t === 'chat') {
        const text = clean(msg.text, 300);
        if (!text) return;
        const payload = { t: 'chat', from: me.id, name: me.name, text, at: Date.now() };
        let heard = 0;
        for (const p of players.values()) {
          if (p.room !== me.room) continue;
          if (p.id === me.id || Math.hypot(p.x - me.x, p.y - me.y) <= CHAT_RADIUS) {
            send(p.ws, payload);
            if (p.id !== me.id) heard++;
          }
        }
        send(ws, { t: 'chat_ack', heard });
      }
    });
    ws.on('close', () => {
      if (me && players.get(me.id)?.ws === ws) {
        players.delete(me.id);
        broadcast(me.room, { t: 'leave', id: me.id });
      }
    });
  });

  function broadcast(room, msg, exceptId) {
    for (const p of players.values()) if (p.room === room && p.id !== exceptId) send(p.ws, msg);
  }

  setInterval(() => {
    const byRoom = {};
    for (const p of players.values()) (byRoom[p.room] ||= []).push({ id: p.id, name: p.name, x: Math.round(p.x), y: Math.round(p.y), level: p.level, color: p.color, dir: p.dir });
    for (const p of players.values()) send(p.ws, { t: 'state', players: byRoom[p.room].filter(o => o.id !== p.id) });
  }, TICK_MS).unref();

  return { count: () => players.size };
}

function clean(s, max) {
  return String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
}
