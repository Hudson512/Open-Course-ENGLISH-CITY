// Static game data shared by client and server.

export const CITY = { name: 'Maple City', country: 'USA', currency: '$' };

// Destinations shown on the departure board. Only USA is playable for now.
export const DESTINATIONS = [
  { id: 'usa', flag: '🇺🇸', name: 'United States', city: 'Maple City', language: 'English (US)', enabled: true },
  { id: 'uk', flag: '🇬🇧', name: 'United Kingdom', city: 'London', language: 'English (UK)', enabled: false },
  { id: 'canada', flag: '🇨🇦', name: 'Canada', city: 'Toronto', language: 'English (CA)', enabled: false },
  { id: 'australia', flag: '🇦🇺', name: 'Australia', city: 'Sydney', language: 'English (AU)', enabled: false },
  { id: 'france', flag: '🇫🇷', name: 'France', city: 'Paris', language: 'Français', enabled: false },
  { id: 'spain', flag: '🇪🇸', name: 'Spain', city: 'Madrid', language: 'Español', enabled: false }
];

export const HOME_CITIES = ['Luanda', 'Maputo', 'São Paulo', 'Rio de Janeiro', 'Lisboa', 'Porto', 'Praia', 'Bissau', 'São Tomé', 'Dili', 'Salvador', 'Belo Horizonte'];

export const NATIVE_LANGUAGES = [
  { id: 'pt', name: 'Português' },
  { id: 'es', name: 'Español' },
  { id: 'fr', name: 'Français' },
  { id: 'en', name: 'English' }
];

// CEFR levels unlocked by XP
export const LEVELS = [
  { id: 'A1', xp: 0, label: 'Beginner' },
  { id: 'A2', xp: 300, label: 'Elementary' },
  { id: 'B1', xp: 900, label: 'Intermediate' },
  { id: 'B2', xp: 2000, label: 'Upper-intermediate' },
  { id: 'C1', xp: 4000, label: 'Advanced' },
  { id: 'C2', xp: 7000, label: 'Proficient' }
];

export function levelFor(xp) {
  let lvl = LEVELS[0];
  for (const l of LEVELS) if (xp >= l.xp) lvl = l;
  const idx = LEVELS.indexOf(lvl);
  const next = LEVELS[idx + 1];
  return { ...lvl, index: idx, next, progress: next ? (xp - lvl.xp) / (next.xp - lvl.xp) : 1 };
}

export const PROFESSIONS = [
  { id: 'software_developer', en: 'Software developer', pt: 'Programador(a)', wage: 220, workplace: 'offices', jobTitle: 'Junior Software Developer' },
  { id: 'nurse', en: 'Nurse', pt: 'Enfermeiro(a)', wage: 190, workplace: 'clinic', jobTitle: 'Nurse Assistant' },
  { id: 'teacher', en: 'Teacher', pt: 'Professor(a)', wage: 170, workplace: 'offices', jobTitle: 'Teaching Assistant' },
  { id: 'accountant', en: 'Accountant', pt: 'Contabilista', wage: 200, workplace: 'bank', jobTitle: 'Junior Accountant' },
  { id: 'chef', en: 'Chef / Cook', pt: 'Cozinheiro(a)', wage: 150, workplace: 'diner', jobTitle: 'Line Cook' },
  { id: 'sales', en: 'Sales / Retail', pt: 'Vendas / Comércio', wage: 140, workplace: 'grocery', jobTitle: 'Sales Associate' },
  { id: 'engineer', en: 'Engineer', pt: 'Engenheiro(a)', wage: 230, workplace: 'offices', jobTitle: 'Junior Engineer' },
  { id: 'designer', en: 'Designer', pt: 'Designer', wage: 190, workplace: 'offices', jobTitle: 'Junior Designer' },
  { id: 'barber', en: 'Barber / Hairdresser', pt: 'Barbeiro(a) / Cabeleireiro(a)', wage: 130, workplace: 'barber', jobTitle: 'Barber' },
  { id: 'other', en: 'Other', pt: 'Outra', wage: 140, workplace: 'offices', jobTitle: 'Office Assistant' }
];

export function professionById(id) {
  return PROFESSIONS.find(p => p.id === id) || PROFESSIONS[PROFESSIONS.length - 1];
}

// Shop catalogs. price in USD, food = hunger restored, eatNow = consumed on the spot.
export const CATALOG = {
  bakery: {
    'bagel': { price: 2.5, food: 15 },
    'croissant': { price: 3.5, food: 18 },
    'loaf of bread': { price: 4.5, food: 35 },
    'sourdough bread': { price: 6.5, food: 40 },
    'blueberry muffin': { price: 3.25, food: 18 },
    'donut': { price: 2.0, food: 12 },
    'chocolate chip cookie': { price: 1.75, food: 8 },
    'cinnamon roll': { price: 3.75, food: 20 },
    'coffee': { price: 2.25, food: 2, energy: 10, eatNow: true }
  },
  grocery: {
    'milk': { price: 3.99, food: 15 },
    'eggs': { price: 4.49, food: 30 },
    'rice': { price: 3.29, food: 35 },
    'pasta': { price: 1.99, food: 30 },
    'apples': { price: 2.99, food: 15 },
    'bananas': { price: 1.49, food: 15 },
    'chicken breast': { price: 7.99, food: 40 },
    'cheese': { price: 5.49, food: 20 },
    'cereal': { price: 4.29, food: 20 },
    'orange juice': { price: 4.99, food: 10 },
    'tomato sauce': { price: 2.49, food: 8 },
    'bread': { price: 3.49, food: 30 },
    'bottled water': { price: 5.99, food: 3 },
    'toothpaste': { price: 3.29 },
    'soap': { price: 2.49 },
    'toilet paper': { price: 6.99 }
  },
  cafe: {
    'coffee': { price: 2.95, food: 2, energy: 12, eatNow: true },
    'latte': { price: 4.75, food: 5, energy: 12, eatNow: true },
    'cappuccino': { price: 4.5, food: 5, energy: 12, eatNow: true },
    'iced tea': { price: 3.0, food: 2, eatNow: true },
    'hot chocolate': { price: 3.95, food: 8, eatNow: true },
    'bagel with cream cheese': { price: 3.75, food: 20, eatNow: true },
    'turkey sandwich': { price: 8.5, food: 40, eatNow: true },
    'muffin': { price: 3.25, food: 18, eatNow: true }
  },
  diner: {
    'cheeseburger': { price: 11.5, food: 55, eatNow: true },
    'pancakes': { price: 9.0, food: 45, eatNow: true },
    'grilled chicken salad': { price: 12.0, food: 45, eatNow: true },
    'mac and cheese': { price: 10.0, food: 50, eatNow: true },
    'club sandwich': { price: 11.0, food: 50, eatNow: true },
    'french fries': { price: 4.0, food: 20, eatNow: true },
    'soda': { price: 2.5, food: 3, eatNow: true },
    'apple pie': { price: 5.5, food: 20, eatNow: true },
    'tip': { price: 2.0 }
  },
  phone_store: {
    'prepaid SIM card': { price: 15, sim: true },
    'monthly phone plan': { price: 40, sim: true },
    'phone charger': { price: 19.99 },
    'phone case': { price: 14.99 }
  },
  barber: {
    'haircut': { price: 25 },
    'beard trim': { price: 15 },
    'haircut and beard trim': { price: 35 },
    'shave': { price: 20 },
    'buzz cut': { price: 18 }
  },
  clinic: {
    'consultation': { price: 60, health: 40 },
    'medicine': { price: 18, health: 20 },
    'check-up': { price: 45, health: 25 }
  }
};

export const LODGING = {
  hotel: { id: 'hotel', name: 'Hotel Sunrise', nightly: 110, min: 85, max: 140 },
  apartment: { id: 'apartment', name: 'Oak Street Apartments', weekly: 180, min: 150, max: 230 }
};

export const TAXI = { start: 75, min: 35, max: 100 };

export const START_MONEY = 600;

export function findCatalogItem(location, name) {
  const cat = CATALOG[location];
  if (!cat || !name) return null;
  const n = String(name).toLowerCase().trim();
  if (cat[n]) return { key: n, ...cat[n] };
  // fuzzy: plural / partial
  const singular = n.replace(/(es|s)$/, '');
  for (const key of Object.keys(cat)) {
    const k = key.toLowerCase();
    if (k === singular || k.includes(n) || n.includes(k) || k.includes(singular)) return { key, ...cat[key] };
  }
  return null;
}
