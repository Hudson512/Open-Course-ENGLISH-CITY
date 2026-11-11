#!/usr/bin/env node
// Check and compile city packs:  npm run pack              (every pack in packs/)
//                                npm run pack -- maple-city
// For each city it writes packs/dist/<id>.json (what the game loads) and packs/<id>/preview.svg
// (a picture of the map, to look at and to review in pull requests), and prints advice.
// Exits with 1 if any pack has mistakes. Advice (⚠) never fails the check.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compilePack, PackError } from './compile.js';
import { lintPack } from './lint.js';
import { mapSvg } from './preview.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'packs');
const out = path.join(root, 'dist');
const ids = process.argv.slice(2).length ? process.argv.slice(2)
  : fs.readdirSync(root).filter(d => fs.existsSync(path.join(root, d, 'city.yaml')));

let failed = false;
for (const id of ids) {
  try {
    const pack = compilePack(path.join(root, id));
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, `${id}.json`), JSON.stringify(pack));
    fs.writeFileSync(path.join(root, id, 'preview.svg'), mapSvg(pack));
    console.log(`✓ ${id}: ${Object.keys(pack.places).length} places, ${pack.people.length} people, ` +
      `${Object.keys(pack.missions).length} missions → packs/dist/${id}.json, map picture → packs/${id}/preview.svg`);
    for (const w of lintPack(pack)) console.log(`  ⚠ ${w}`);
  } catch (e) {
    failed = true;
    console.error(e instanceof PackError ? `✗ ${e.message}` : e);
  }
}
if (!ids.length) console.log('No packs found in packs/.');
process.exit(failed ? 1 : 0);
