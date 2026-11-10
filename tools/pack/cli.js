#!/usr/bin/env node
// Compile city packs:  npm run pack              (every pack in packs/)
//                      npm run pack -- maple-city
// Writes packs/dist/<id>.json and exits with 1 if any pack has problems.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compilePack, PackError } from './compile.js';

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
    console.log(`✓ ${id}: ${Object.keys(pack.places).length} places, ${pack.people.length} people, ` +
      `${Object.keys(pack.missions).length} missions → packs/dist/${id}.json`);
  } catch (e) {
    failed = true;
    console.error(e instanceof PackError ? `✗ ${e.message}` : e);
  }
}
if (!ids.length) console.log('No packs found in packs/.');
process.exit(failed ? 1 : 0);
