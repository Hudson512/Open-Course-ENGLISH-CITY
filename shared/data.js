// Game data that is the same in every city, shared by client and server.

// Cities still to come on the departure board. The playable ones are the city packs in packs/.
export const DESTINATIONS = [
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

// Professions the player can pick. Each city pack says where they work and what they earn (jobs).
export const PROFESSIONS = [
  { id: 'software_developer', en: 'Software developer', pt: 'Programador(a)' },
  { id: 'nurse', en: 'Nurse', pt: 'Enfermeiro(a)' },
  { id: 'teacher', en: 'Teacher', pt: 'Professor(a)' },
  { id: 'accountant', en: 'Accountant', pt: 'Contabilista' },
  { id: 'chef', en: 'Chef / Cook', pt: 'Cozinheiro(a)' },
  { id: 'sales', en: 'Sales / Retail', pt: 'Vendas / Comércio' },
  { id: 'engineer', en: 'Engineer', pt: 'Engenheiro(a)' },
  { id: 'designer', en: 'Designer', pt: 'Designer' },
  { id: 'barber', en: 'Barber / Hairdresser', pt: 'Barbeiro(a) / Cabeleireiro(a)' },
  { id: 'other', en: 'Other', pt: 'Outra' }
];

export function professionById(id) {
  return PROFESSIONS.find(p => p.id === id) || PROFESSIONS[PROFESSIONS.length - 1];
}
