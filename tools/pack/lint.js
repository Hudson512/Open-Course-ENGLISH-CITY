// Advice about a city that compiles: things that work but will probably disappoint players.
// Mistakes that would break the game are errors in compile.js; these are only warnings,
// printed by `npm run pack`. Each one says where to look and what to do.

const UI_LANGUAGES = ['pt'];                  // besides English, which is required
const itemsOf = place => ({ ...place.sells, ...place.services });

export function lintPack(pack) {
  const warnings = [];
  const W = (where, msg) => warnings.push(`${where.join(' › ')}: ${msg}`);
  const places = Object.values(pack.places);
  const missions = Object.entries(pack.missions);
  const money = n => `${pack.currency.symbol}${n}`;

  // texts the player reads, in every interface language
  for (const [id, m] of missions) {
    const texts = [['title', m.title], ['goal', m.goal], ...Object.entries(m.variants || {}).flatMap(([v, x]) => [[`variants › ${v} › title`, x.title], [`variants › ${v} › goal`, x.goal]])];
    for (const [field, t] of texts) {
      if (t == null) continue;
      for (const lang of UI_LANGUAGES) if (typeof t === 'string' || !t[lang]) W(['missions.yaml', id, field], `no "${lang}" text; players using that language will read the English one`);
    }
  }

  // places
  const usedAt = new Set(missions.map(([, m]) => m.at).filter(Boolean));
  const workplaces = new Set(Object.values(pack.jobs).map(j => j.workplace));
  const variantSpots = new Set(missions.flatMap(([, m]) => Object.keys(m.variants || {})));
  const poolSpots = new Set((pack.daily.pool || []).map(e => e.with?.place).filter(Boolean));
  for (const p of places) {
    const items = Object.entries(itemsOf(p));
    if (items.length && !p.vocabulary?.length) W(['places.yaml', p.id], 'sells things but has no "vocabulary"; players get no hints here');
    for (const [name, it] of items) if (!(it.price > 0) && !it.customer_sets_price) W(['places.yaml', p.id, name], 'the price is zero or less');
    const used = usedAt.has(p.id) || workplaces.has(p.id) || variantSpots.has(p.id) || poolSpots.has(p.id) || items.length || p.lodging;
    if (!used) W(['places.yaml', p.id], 'no mission happens here, nothing is sold and nobody works here; give players a reason to come in');
    if (p.w < 100 || p.h < 100) W(['places.yaml', p.id, 'building'], 'smaller than 5 × 5 cells; the name will not fit on the building');
  }

  // can a newcomer pay for the first day?
  const taxi = Object.values(pack.actions).find(a => a.kind === 'price');
  const homes = places.filter(p => p.lodging);
  if (homes.length) {
    const cheapest = Math.min(...homes.map(p => p.lodging.min));
    const needs = (taxi?.max || 0) + cheapest;
    if (pack.start.money < needs) W(['city.yaml', 'start', 'money'], `${money(pack.start.money)} may not cover the dearest ride (${money(taxi?.max || 0)}) plus the cheapest stay (${money(cheapest)})`);
  } else W(['places.yaml'], 'no place has a "lodging" block; the player has nowhere to live');

  // the street
  if (pack.people.length < 4) W(['people.yaml'], `only ${pack.people.length} ${pack.people.length === 1 ? 'person' : 'people'} in the street; four or more make the city feel alive`);
  if (!missions.some(([, m]) => m.with_person)) W(['missions.yaml'], 'no mission has "with_person: true"; players cannot talk to people in the street');
  if (!missions.some(([, m]) => m.at === 'any')) W(['missions.yaml'], 'no mission has "at: any"; walking into a place with no mission there does nothing');
  if ((pack.daily.pool || []).length < (pack.daily.count || 0) + 2) W(['city.yaml', 'daily', 'pool'], 'few entries for the number of daily missions; the same ones will come back every day');

  return warnings;
}
