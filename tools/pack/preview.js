// A picture of a city's map (SVG), drawn from the compiled pack: roads, park, buildings, doors,
// where the player lands, and a ruler in cells — the same [column, row] numbers used in map.yaml
// and places.yaml. `npm run pack` writes it to packs/<id>/preview.svg, so a map can be checked
// (and reviewed in a pull request) without starting the game.

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n = v => Math.round(v * 100) / 100;

// Black or white, whichever reads better on the colour.
function inkFor(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#1e272e' : '#ffffff';
}

export function mapSvg(pack) {
  const { cell: C, width: W, height: H, roads, park, decor, spawn, taxiStand } = pack.map;
  const M = 44;                                  // margin for the ruler
  const out = [];
  const rect = (r, attrs) => `<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}" ${attrs}/>`;
  const text = (x, y, s, attrs = '') => `<text x="${n(x)}" y="${n(y)}" ${attrs}>${esc(s)}</text>`;

  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-M} ${-M - 40} ${W + M + 12} ${H + M + 52}" font-family="system-ui, 'Segoe UI', Helvetica, Arial, sans-serif">`);
  out.push(`<title>${esc(pack.name)} — map preview</title>`);
  out.push(`<rect x="${-M}" y="${-M - 40}" width="${W + M + 12}" height="${H + M + 52}" fill="#f5f6fa"/>`);
  out.push(text(0, -M - 8, `${pack.flag || ''} ${pack.name} — ${W / C} × ${H / C} cells (1 cell = ${C} px)`.trim(), 'font-size="28" font-weight="700" fill="#2f3542"'));

  // ground
  out.push(rect({ x: 0, y: 0, w: W, h: H }, 'fill="#8bc98f"'));
  if (park) out.push(rect(park, 'fill="#52b788" stroke="#40916c" stroke-width="3" rx="10"'));
  for (const r of roads) out.push(rect(r, 'fill="#57606f"'));
  for (const r of roads) {                       // centre line
    const horizontal = r.w > r.h;
    out.push(horizontal
      ? `<line x1="${r.x}" y1="${n(r.y + r.h / 2)}" x2="${r.x + r.w}" y2="${n(r.y + r.h / 2)}" stroke="#f1f2f6" stroke-width="3" stroke-dasharray="24 20"/>`
      : `<line x1="${n(r.x + r.w / 2)}" y1="${r.y}" x2="${n(r.x + r.w / 2)}" y2="${r.y + r.h}" stroke="#f1f2f6" stroke-width="3" stroke-dasharray="24 20"/>`);
  }

  // grid every 10 cells, with the cell numbers used in the YAML files
  const step = 10 * C;
  for (let x = 0; x <= W; x += step) {
    out.push(`<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="#000" stroke-opacity="0.13" stroke-width="1.5"/>`);
    out.push(text(x, -12, x / C, 'font-size="20" fill="#57606f" text-anchor="middle"'));
  }
  for (let y = 0; y <= H; y += step) {
    out.push(`<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#000" stroke-opacity="0.13" stroke-width="1.5"/>`);
    out.push(text(-10, y + 7, y / C, 'font-size="20" fill="#57606f" text-anchor="end"'));
  }
  out.push(rect({ x: 0, y: 0, w: W, h: H }, 'fill="none" stroke="#2f3542" stroke-width="3"'));

  // buildings you cannot enter
  for (const d of decor) out.push(rect(d, 'fill="#a4b0be" stroke="#747d8c" stroke-width="2" rx="4"'));
  if (park) out.push(text(park.x + park.w / 2, park.y + park.h / 2 + 9, `🌳 ${park.name}`, 'font-size="26" font-weight="600" fill="#ffffff" text-anchor="middle"'));

  // places: building, id, name and door
  for (const p of Object.values(pack.places)) {
    const ink = inkFor(p.color);
    out.push(rect(p, `fill="${p.color}" stroke="${p.roof}" stroke-width="6" rx="6"`));
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    const size = Math.max(15, Math.min(24, p.w / Math.max(6, p.id.length) * 1.5));
    out.push(text(cx, cy - 6, `${p.icon || ''} ${p.short || p.name}`.trim(), `font-size="${n(size)}" font-weight="700" fill="${ink}" text-anchor="middle"`));
    out.push(text(cx, cy + size, p.id, `font-size="${n(size * 0.8)}" fill="${ink}" fill-opacity="0.8" text-anchor="middle" font-family="ui-monospace, Menlo, Consolas, monospace"`));
    out.push(`<circle cx="${n(p.door.x)}" cy="${n(p.door.y)}" r="9" fill="#ffffff" stroke="#2f3542" stroke-width="3"><title>door of ${esc(p.id)}</title></circle>`);
  }

  // where the game starts
  if (taxiStand) {
    out.push(`<rect x="${n(taxiStand.x - 16)}" y="${n(taxiStand.y - 16)}" width="32" height="32" rx="6" fill="#f9ca24" stroke="#2f3542" stroke-width="3"/>`);
    out.push(text(taxiStand.x, taxiStand.y + 7, '🚕', 'font-size="20" text-anchor="middle"'));
  }
  out.push(`<circle cx="${n(spawn.x)}" cy="${n(spawn.y)}" r="14" fill="#eb4d4b" stroke="#ffffff" stroke-width="4"><title>spawn: where the player lands</title></circle>`);

  // legend
  const ly = H + 30;
  out.push(`<circle cx="14" cy="${ly - 7}" r="11" fill="#eb4d4b" stroke="#ffffff" stroke-width="3"/>` + text(34, ly, 'spawn', 'font-size="20" fill="#2f3542"'));
  out.push(`<circle cx="130" cy="${ly - 7}" r="8" fill="#ffffff" stroke="#2f3542" stroke-width="3"/>` + text(148, ly, 'door', 'font-size="20" fill="#2f3542"'));
  out.push(`<rect x="222" y="${ly - 19}" width="24" height="24" rx="5" fill="#f9ca24" stroke="#2f3542" stroke-width="2"/>` + text(256, ly, 'taxi stand', 'font-size="20" fill="#2f3542"'));
  out.push(`<rect x="380" y="${ly - 19}" width="24" height="24" rx="4" fill="#a4b0be" stroke="#747d8c" stroke-width="2"/>` + text(414, ly, 'decoration (cannot be entered)', 'font-size="20" fill="#2f3542"'));
  out.push(text(W, ly, 'numbers = cells: [column, row]', 'font-size="20" fill="#57606f" text-anchor="end"'));

  out.push('</svg>');
  return out.join('\n') + '\n';
}
