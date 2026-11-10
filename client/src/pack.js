// The city being played: a compiled city pack (docs/city-pack-spec.md) fetched from the server.
// Everything the game draws and every rule it applies comes from here.
let pack = null;

export const getPack = () => pack;

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
  return res.json();
}

// The cities on the departures board.
export const listPacks = () => get('/api/packs');

export async function loadPack(id) {
  if (pack?.id !== id) pack = await get(`/api/packs/${encodeURIComponent(id)}`);
  return pack;
}

// '#74b9ff' → 0x74b9ff (what Phaser wants)
export const hex = c => parseInt(String(c).replace('#', ''), 16);

export const fmtMoney = n => `${n < 0 ? '−' : ''}${pack?.currency.symbol || '$'}${Math.abs(n).toFixed(2)}`;

// A place by id — the park counts as a place people can be sent to.
export function placeById(id) {
  if (!pack || !id) return null;
  return pack.places[id] || (pack.map.park?.id === id ? { icon: '🌳', ...pack.map.park } : null);
}

// Where to stand to "be" at a place: its door, or the middle of the park.
export function placePoint(place) {
  if (!place) return null;
  return place.door || { x: place.x + place.w / 2, y: place.y + place.h / 2 };
}

// The first mission of the pack that matches, e.g. the one used to chat with pedestrians.
const findMission = fn => Object.keys(pack.missions).find(id => fn(pack.missions[id])) || null;
export const socialMission = () => findMission(m => m.with_person);
export const visitMission = () => findMission(m => m.at === 'any');

// The place where the player lands (its character is met at the taxi stand, not at the door).
export const arrivalPlace = () => pack.missions[pack.start.mission]?.at || null;

// Every "document" the city can give the player (flags set by actions or by things bought).
export function packFlags() {
  const out = new Set();
  const scan = effects => (effects || []).forEach(e => e.set_flag && out.add(e.set_flag));
  Object.values(pack.actions).forEach(a => scan(a.effects));
  for (const p of Object.values(pack.places)) Object.values({ ...p.sells, ...p.services }).forEach(i => scan(i.effects));
  return [...out];
}
