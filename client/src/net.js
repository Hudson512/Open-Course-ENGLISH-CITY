// Multiplayer client (presence + proximity chat). Fails silently when offline.
import { bus } from './state.js';

let ws = null;
let me = null;
let retry = 0;
let lastSent = 0;
export const others = new Map(); // id -> {name, x, y, level, color}
export let online = false;

export function connect(profile) {
  me = profile;
  open();
}

function open() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  try { ws = new WebSocket(`${proto}://${location.host}/ws`); } catch { return schedule(); }
  ws.onopen = () => {
    online = true; retry = 0;
    ws.send(JSON.stringify({ t: 'join', ...me }));
    bus.emit('net', { online: true });
  };
  ws.onmessage = ev => {
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (m.t === 'state') {
      const seen = new Set();
      for (const p of m.players) { seen.add(p.id); others.set(p.id, { ...(others.get(p.id) || {}), ...p }); }
      for (const id of [...others.keys()]) if (!seen.has(id)) others.delete(id);
      bus.emit('players', others);
    } else if (m.t === 'chat') bus.emit('chat', m);
    else if (m.t === 'chat_ack') bus.emit('chat_ack', m);
    else if (m.t === 'system') bus.emit('chat', { name: '📢', text: m.text, system: true });
    else if (m.t === 'leave') { others.delete(m.id); bus.emit('players', others); }
  };
  ws.onclose = () => { online = false; bus.emit('net', { online: false }); schedule(); };
  ws.onerror = () => ws.close();
}

function schedule() { retry = Math.min(retry + 1, 6); setTimeout(open, 1000 * 2 ** retry); }

export function sendMove(x, y, dir, level) {
  const now = performance.now();
  if (!online || now - lastSent < 120) return;
  lastSent = now;
  ws.send(JSON.stringify({ t: 'move', x, y, dir, level }));
}

export function sendChat(text) {
  if (!online) return false;
  ws.send(JSON.stringify({ t: 'chat', text }));
  return true;
}

export function myId() { return me?.id; }
