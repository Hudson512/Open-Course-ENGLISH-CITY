// City packs: every folder in packs/ is compiled when the server starts.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compilePack } from '../tools/pack/compile.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'packs');

// A pack with mistakes is left out (and explained in the log) so one bad city cannot stop the game.
export function loadPacks(root = ROOT) {
  const packs = {};
  if (!fs.existsSync(root)) return packs;
  for (const dir of fs.readdirSync(root).sort()) {
    if (!fs.existsSync(path.join(root, dir, 'city.yaml'))) continue;
    try {
      const pack = compilePack(path.join(root, dir));
      packs[pack.id] = pack;
    } catch (e) {
      console.error(`[packs] ${dir} was not loaded:\n${e.message}`);
    }
  }
  return packs;
}

// What the departures board needs to know about a city.
export const packSummary = p => ({ id: p.id, name: p.name, country: p.country, flag: p.flag, language: p.language, version: p.version });
