// Mission templates, action contract between the LLM and the game, and validation.
import { CATALOG, LODGING, TAXI, findCatalogItem, levelFor, professionById } from './data.js';
import { locationById } from './world.js';

const money = n => `$${Number(n).toFixed(2)}`;

// Which NPC works at each location
export const LOCATION_NPC = {
  airport: 'taxi_driver', hotel: 'hotel_clerk', apartment: 'landlord', bakery: 'baker', barber: 'barber',
  grocery: 'grocer', cafe: 'barista', diner: 'waitress', phone_store: 'phone_clerk', bank: 'bank_teller',
  clinic: 'doctor', job_center: 'recruiter', offices: 'manager'
};

// Documentation of every action the LLM may emit. Only those allowed by the mission are shown.
export const ACTION_DOCS = {
  agree_price: '{"type":"agree_price","amount":<number>} — emit ONCE when you and the passenger have clearly agreed on the fare.',
  set_destination: '{"type":"set_destination","place":"hotel"|"apartment"} — emit when the passenger has told you clearly where to go (Hotel Sunrise = "hotel", Oak Street Apartments = "apartment").',
  rent: '{"type":"rent","place":"hotel"|"apartment","price":<number per night (hotel) or per week (apartment)>,"nights":<int, hotel only>} — emit when the stay is agreed and the guest/tenant confirms payment.',
  sell: '{"type":"sell","item":"<exact item name from the price list>","qty":<int>,"unitPrice":<number>} — emit one per item ONLY after the customer clearly asked for it and the order is confirmed. The customer pays.',
  service: '{"type":"service","item":"<exact service name from the price list>","price":<number>} — emit when the service is finished and the customer agrees to pay.',
  open_account: '{"type":"open_account"} — emit when all requirements are met and the customer confirmed the account details.',
  hire: '{"type":"hire","score":<0-100>,"jobTitle":"<string>"} — at the END of a good interview (score >= 60).',
  reject: '{"type":"reject","score":<0-100>,"reason":"<short reason>"} — at the end of a weak interview (score < 60). The candidate can try again tomorrow.',
  work_done: '{"type":"work_done","performance":<0-100>} — at the end of the work situation, rating how well the employee communicated.',
  end: '{"type":"end"} — the conversation is naturally over (goodbye said / player leaves).'
};

const SHOP_VOCAB = {
  bakery: ['for here or to go', 'a loaf of', 'freshly baked', 'a dozen', 'I\'d like…', 'How much is…?', 'receipt', 'change'],
  grocery: ['aisle', 'checkout', 'cart', 'paper or plastic', 'on sale', 'dairy', 'produce', 'a pound of'],
  cafe: ['small / medium / large', 'to go', 'oat milk', 'decaf', 'I\'ll have…', 'Can I get…?', 'name for the cup'],
  diner: ['table for one', 'menu', 'the check, please', 'medium rare', 'side of fries', 'refill', 'tip', 'to-go box'],
  phone_store: ['prepaid', 'data plan', 'unlimited', 'unlocked phone', 'SIM card', 'coverage', 'contract', 'per month'],
  barber: ['trim', 'fade', 'clippers', 'scissors', 'a little off the top', 'short on the sides', 'beard', 'part'],
  clinic: ['appointment', 'symptoms', 'fever', 'headache', 'sore throat', 'prescription', 'allergic to', 'pharmacy']
};

const catalogText = loc => {
  const cat = CATALOG[loc];
  if (!cat) return '';
  return 'PRICE LIST (use these exact item names): ' + Object.entries(cat).map(([k, v]) => `${k} ${money(v.price)}`).join('; ') + '.';
};

const itemsText = items => items.map(i => `${i.qty} ${i.item}`).join(', ');

export const TEMPLATES = {
  arrival_taxi: {
    location: 'airport', npc: 'taxi_driver', kind: 'story',
    title: () => ({ en: 'Get a taxi from the airport', pt: 'Apanhe um táxi no aeroporto' }),
    goal: () => ({
      en: 'Talk to the taxi driver, choose Hotel Sunrise ($110/night) or Oak Street Apartments ($180/week), and negotiate the fare.',
      pt: 'Fala com o taxista, escolhe o Hotel Sunrise ($110/noite) ou o Oak Street Apartments ($180/semana) e negoceia o preço da corrida.'
    }),
    objective: () => `The passenger just landed in Maple City with luggage and needs a ride to either Hotel Sunrise (downtown, $110/night, easy check-in) or Oak Street Apartments ($180/week, cheaper for a long stay but the landlord asks questions). You first ask where they are going. Your opening price is $${TAXI.start}. Your secret minimum is $${TAXI.min}. Haggle realistically: lower the price in small steps only when the passenger negotiates politely in English (gives a counteroffer, a reason, mentions other taxis or the bus). Mention the luggage/trunk. When both the destination and price are agreed, emit set_destination and agree_price and say something like "Hop in!".`,
    actions: ['agree_price', 'set_destination', 'end'],
    vocab: ['fare', 'How much to…?', 'That\'s too expensive', 'Can you do…?', 'deal', 'luggage', 'trunk', 'downtown', 'receipt'],
    reward: { xp: 80, social: 5 },
    isComplete: (p, done) => has(done, 'agree_price') && has(done, 'set_destination')
  },

  lodging: {
    location: p => p.place, npc: p => (p.place === 'hotel' ? 'hotel_clerk' : 'landlord'), kind: 'story',
    title: p => (p.place === 'hotel' ? { en: 'Check in at Hotel Sunrise', pt: 'Faz o check-in no Hotel Sunrise' } : { en: 'Rent a room at Oak Street', pt: 'Aluga um quarto no Oak Street' }),
    goal: p => (p.place === 'hotel'
      ? { en: 'Check in: say your name, how many nights, and pay.', pt: 'Check-in: diz o teu nome, quantas noites vais ficar e paga.' }
      : { en: 'Convince the landlord to rent you a room: talk about yourself, your plans and the price.', pt: 'Convence o senhorio a alugar-te um quarto: fala de ti, dos teus planos e do preço.' }),
    objective: p => (p.place === 'hotel'
      ? `A new guest arrives at the front desk. Room rate is $${LODGING.hotel.nightly} per night (you can offer $${LODGING.hotel.min + 10} for 5+ nights). Ask for their name, number of nights, ID (passport is fine) and confirm payment by card. Mention check-out time (11 am) and free breakfast 7-10 am. Then emit rent with place "hotel".`
      : `A newcomer wants to rent a furnished room. Rent is $${LODGING.apartment.weekly} per week, paid weekly in advance. You can go down to $${LODGING.apartment.min} if they make a good impression (explain why they came, their profession, that they are quiet and responsible). Ask questions before agreeing, explain the house rules, then emit rent with place "apartment".`),
    actions: ['rent', 'end'],
    vocab: ['check in', 'check out', 'reservation', 'per night', 'deposit', 'lease', 'rent', 'utilities included', 'tenant', 'landlord'],
    reward: { xp: 70, social: 5 },
    isComplete: (p, done) => has(done, 'rent')
  },

  get_phone: {
    location: 'phone_store', npc: 'phone_clerk', kind: 'story',
    title: () => ({ en: 'Get a US phone number', pt: 'Arranja um número de telefone americano' }),
    goal: () => ({ en: 'Buy a prepaid SIM card or a monthly plan at PhoneHub.', pt: 'Compra um cartão SIM pré-pago ou um plano mensal na PhoneHub.' }),
    objective: () => `The customer needs a US phone number. Ask if their phone is unlocked, explain prepaid SIM ($15, includes first 2 weeks) vs monthly plan ($40, unlimited calls/texts, 15 GB). Try to upsell a phone case once. ${catalogText('phone_store')}`,
    actions: ['sell', 'end'],
    vocab: SHOP_VOCAB.phone_store,
    reward: { xp: 60, social: 3 },
    isComplete: (p, done) => done.some(a => a.type === 'sell' && /sim|plan/i.test(a.item))
  },

  open_bank: {
    location: 'bank', npc: 'bank_teller', kind: 'story',
    title: () => ({ en: 'Open a bank account', pt: 'Abre uma conta bancária' }),
    goal: () => ({ en: 'Open a checking account. You need an address and a US phone number.', pt: 'Abre uma conta corrente. Precisas de morada e de um número de telefone americano.' }),
    objective: (p, s) => `The customer wants to open a checking account. Requirements: passport (they have it), a US address (${s?.home ? 'they live at ' + (s.home === 'hotel' ? 'Hotel Sunrise' : 'Oak Street Apartments') : 'they DO NOT have one yet'}), and a US phone number (${s?.flags?.phone ? 'they have one' : 'they DO NOT have one yet'}). If a requirement is missing, politely explain what they need and do not open the account. Otherwise ask for details (full name, date of birth, occupation), explain the debit card and the $10 monthly fee (waived with direct deposit), then emit open_account.`,
    actions: ['open_account', 'end'],
    vocab: ['checking account', 'savings account', 'debit card', 'PIN', 'deposit', 'withdraw', 'fee', 'direct deposit', 'ID'],
    reward: { xp: 70, social: 3 },
    isComplete: (p, done) => has(done, 'open_account')
  },

  job_interview: {
    location: 'job_center', npc: 'recruiter', kind: 'story',
    title: () => ({ en: 'Job interview', pt: 'Entrevista de emprego' }),
    goal: () => ({ en: 'Pass a job interview in your field. Requires level A2, an address, a phone and a bank account.', pt: 'Passa numa entrevista de emprego na tua área. Requer nível A2, morada, telefone e conta bancária.' }),
    objective: (p, s) => {
      const prof = professionById(s?.player?.profession);
      return `Interview the candidate for a "${prof.jobTitle}" position (field: ${prof.en}${s?.player?.professionDetail ? ' — ' + s.player.professionDetail : ''}). Ask ONE question per turn: tell me about yourself, experience, why this job, strengths/weaknesses, 1-2 practical questions about the field, availability. After 5-7 questions, decide. Judge communication in English AND content. Emit hire (score >= 60) or reject (score < 60) with honest feedback. Candidate requirements already checked by the game: ${jobReqText(s)}.`;
    },
    actions: ['hire', 'reject', 'end'],
    vocab: ['résumé', 'experience', 'strengths', 'weakness', 'teamwork', 'deadline', 'full-time', 'salary', 'I\'m a quick learner'],
    reward: { xp: 150, social: 10 },
    isComplete: (p, done) => has(done, 'hire'),
    requires: s => jobRequirements(s)
  },

  work_shift: {
    location: p => p.workplace, npc: 'manager', kind: 'job',
    title: () => ({ en: 'Work shift', pt: 'Turno de trabalho' }),
    goal: () => ({ en: 'Handle today\'s situation at work in English to get paid.', pt: 'Resolve a situação de hoje no trabalho, em inglês, para receberes o salário.' }),
    objective: (p, s) => {
      const prof = professionById(s?.player?.profession);
      const situations = ['a morning stand-up meeting: ask what they did yesterday and plan today', 'an unhappy client/customer complaint the employee must handle politely', 'explaining a task step by step to a new colleague', 'negotiating a deadline that is too tight', 'writing (saying) a short professional email/message to a client', 'a problem that needs to be reported to the manager'];
      const sit = situations[(s?.time?.day || 1) % situations.length];
      return `The employee works as "${s?.job?.title || prof.jobTitle}" (${prof.en}). Today's situation: ${sit}. Play it out realistically in 4-6 turns (you may play the client or colleague when needed). Then emit work_done with performance.`;
    },
    actions: ['work_done', 'end'],
    vocab: ['ASAP', 'deadline', 'follow up', 'schedule', 'meeting', 'issue', 'update', 'Let me check', 'I\'ll take care of it'],
    reward: { xp: 90, social: 8 },
    isComplete: (p, done) => has(done, 'work_done'),
    requires: s => (!s.job ? 'no_job' : s.job.lastWorkedDay === s.time.day ? 'already_worked' : null)
  },

  shop: {
    location: p => p.place, npc: p => LOCATION_NPC[p.place], kind: 'daily',
    title: p => (p.items?.length
      ? { en: `Shopping: ${itemsText(p.items)}`, pt: `Compras: ${itemsText(p.items)}` }
      : { en: `Visit ${locationById(p.place)?.name}`, pt: `Visitar ${locationById(p.place)?.name}` }),
    goal: p => {
      const loc = locationById(p.place)?.name;
      return p.items?.length
        ? { en: `Buy ${itemsText(p.items)} at ${loc}.`, pt: `Compra ${itemsText(p.items)} em ${loc}.` }
        : { en: `Talk and buy what you need at ${loc}.`, pt: `Conversa e compra o que precisares em ${loc}.` };
    },
    objective: p => `${p.items?.length ? `The customer needs to buy: ${itemsText(p.items)} (but they must ask for it themselves — do not list it for them).` : 'A customer walks in.'} Serve them naturally, ask the usual follow-up questions for this kind of place, tell the total, and take payment. ${catalogText(p.place)}`,
    actions: p => (['barber', 'clinic'].includes(p.place) ? ['service', 'end'] : ['sell', 'end']),
    vocab: p => SHOP_VOCAB[p.place] || [],
    reward: p => ({ xp: p.items?.length ? 50 : 15, social: 4 }),
    isComplete: (p, done) => {
      if (!p.items?.length) return false;
      return p.items.every(req => {
        const got = done.filter(a => (a.type === 'sell' || a.type === 'service') && a.item === req.item).reduce((n, a) => n + (a.qty || 1), 0);
        return got >= req.qty;
      });
    }
  },

  barber_cut: {
    location: 'barber', npc: 'barber', kind: 'daily',
    title: p => ({ en: `Get a haircut: ${p.style}`, pt: `Corta o cabelo: ${p.style}` }),
    goal: p => ({ en: `Explain to the barber exactly what you want: "${p.style}". Pay and tip.`, pt: `Explica ao barbeiro exatamente o que queres: "${p.style}". Paga e deixa gorjeta.` }),
    objective: p => `The customer wants a haircut. They should describe it themselves (their target is "${p.style}", don't reveal it). Ask precise questions (clippers number, how short on the sides, the top, beard, neckline). Describe what you are doing with small talk. At the end emit service. ${catalogText('barber')}`,
    actions: ['service', 'end'],
    vocab: SHOP_VOCAB.barber,
    reward: { xp: 60, social: 15 },
    isComplete: (p, done) => has(done, 'service')
  },

  smalltalk: {
    location: null, npc: null, kind: 'social',
    title: p => ({ en: `Chat with ${p.name}`, pt: `Conversa com ${p.name}` }),
    goal: () => ({ en: 'Have a friendly conversation (at least 4 messages).', pt: 'Tem uma conversa amigável (pelo menos 4 mensagens).' }),
    objective: p => `You are a stranger in the street/park. ${p.persona} The player approaches you. Make friendly small talk: weather, the city, where they are from, recommendations. Ask questions back. Be a real person, with opinions.`,
    actions: ['end'],
    vocab: ['How\'s it going?', 'Nice to meet you', 'Where are you from?', 'What do you do?', 'Have a good one!', 'by the way'],
    reward: { xp: 30, social: 12 },
    isComplete: (p, done, meta) => (meta?.turns || 0) >= 4
  },

  chat_people: {
    location: 'park', npc: null, kind: 'daily',
    title: p => ({ en: `Talk to ${p.count} people in the street`, pt: `Fala com ${p.count} pessoas na rua` }),
    goal: p => ({ en: `Walk up to ${p.count} pedestrians (E) and have a short chat.`, pt: `Aproxima-te de ${p.count} pessoas (tecla E) e conversa um pouco.` }),
    reward: { xp: 40, social: 10 },
    progressKey: 'smalltalk'
  },

  online_chat: {
    location: null, npc: null, kind: 'daily',
    title: () => ({ en: 'Talk to a real player', pt: 'Fala com um jogador real' }),
    goal: () => ({ en: 'Send 3 messages in English to another online player near you (Enter to chat).', pt: 'Envia 3 mensagens em inglês a outro jogador online perto de ti (Enter para conversar).' }),
    reward: { xp: 60, social: 20 },
    progressKey: 'online_chat'
  }
};

function has(done, type) { return done.some(a => a.type === type); }

export function jobRequirements(s) {
  const missing = [];
  if (levelFor(s?.xp || 0).index < 1) missing.push('level_a2');
  if (!s?.home) missing.push('home');
  if (!s?.flags?.phone) missing.push('phone');
  if (!s?.flags?.bank) missing.push('bank');
  if (s?.job) missing.push('already_employed');
  if (s?.flags?.lastInterviewDay === s?.time?.day) missing.push('tomorrow');
  return missing.length ? missing.join(',') : null;
}
function jobReqText(s) { const m = jobRequirements(s); return m ? 'MISSING ' + m : 'all OK'; }

export const STORY = ['arrival_taxi', 'lodging', 'get_phone', 'open_bank', 'job_interview'];

// Resolve fields that may be functions of params
export function resolve(tpl, field, params, state) {
  const v = tpl[field];
  return typeof v === 'function' ? v(params || {}, state) : v;
}

export function missionLocation(m) {
  const tpl = TEMPLATES[m.templateId];
  return resolve(tpl, 'location', m.params);
}

// ── Daily mission generator (deterministic per day) ─────────────
function rng(seed) {
  let t = seed >>> 0;
  return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
function pickItems(r, place, n, filter = () => true) {
  const keys = Object.keys(CATALOG[place]).filter(k => filter(CATALOG[place][k], k));
  const out = [];
  while (out.length < n && keys.length) {
    const k = keys.splice(Math.floor(r() * keys.length), 1)[0];
    out.push({ item: k, qty: place === 'grocery' || place === 'bakery' ? 1 + Math.floor(r() * 2) : 1 });
  }
  return out;
}

export function generateDaily(day, seedBase = 1) {
  const r = rng(day * 7919 + seedBase);
  const pool = [
    () => ({ templateId: 'shop', params: { place: 'bakery', items: pickItems(r, 'bakery', 2) } }),
    () => ({ templateId: 'shop', params: { place: 'grocery', items: pickItems(r, 'grocery', 3, v => v.food) } }),
    () => ({ templateId: 'shop', params: { place: 'cafe', items: pickItems(r, 'cafe', 2) } }),
    () => ({ templateId: 'shop', params: { place: 'diner', items: [...pickItems(r, 'diner', 1, (v, k) => v.food > 30), { item: 'soda', qty: 1 }, { item: 'tip', qty: 1 }] } }),
    () => ({ templateId: 'barber_cut', params: { style: pick(r, ['short fade with a little off the top', 'just a trim, keep the length', 'buzz cut, number 2 clippers', 'haircut and beard trim', 'clean shave']) } }),
    () => ({ templateId: 'chat_people', params: { count: 2 } }),
    () => ({ templateId: 'online_chat', params: {} })
  ];
  const chosen = new Set();
  const out = [];
  while (out.length < 3) {
    const i = Math.floor(r() * pool.length);
    if (chosen.has(i)) continue;
    chosen.add(i);
    out.push({ uid: `d${day}-${i}`, ...pool[i](), day, progress: 0 });
  }
  return out;
}

// ── Action validation ───────────────────────────────────────────
// Returns { ok, action (normalized), cost, reason }
export function validateAction(mission, raw, state) {
  const tpl = TEMPLATES[mission.templateId];
  const allowed = resolve(tpl, 'actions', mission.params) || [];
  const a = { ...raw };
  if (!allowed.includes(a.type)) return { ok: false, reason: `action ${a.type} not allowed here` };
  const loc = resolve(tpl, 'location', mission.params);
  const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  switch (a.type) {
    case 'agree_price': {
      a.amount = clamp(Math.round(num(a.amount, TAXI.start)), TAXI.min, TAXI.max);
      return { ok: true, action: a, cost: a.amount };
    }
    case 'set_destination': {
      if (!['hotel', 'apartment'].includes(a.place)) {
        const p = String(a.place || '').toLowerCase();
        a.place = p.includes('apart') || p.includes('oak') ? 'apartment' : p.includes('hotel') || p.includes('sunrise') ? 'hotel' : null;
      }
      if (!a.place) return { ok: false, reason: 'unknown destination' };
      return { ok: true, action: a, cost: 0 };
    }
    case 'rent': {
      a.place = mission.params?.place || a.place;
      const L = LODGING[a.place];
      if (!L) return { ok: false, reason: 'unknown place' };
      a.price = clamp(num(a.price, L.nightly || L.weekly), L.min, L.max);
      a.nights = a.place === 'hotel' ? clamp(Math.round(num(a.nights, 1)), 1, 14) : 7;
      const cost = a.place === 'hotel' ? a.price * a.nights : a.price;
      return { ok: true, action: a, cost: round2(cost) };
    }
    case 'sell':
    case 'service': {
      const it = findCatalogItem(loc, a.item);
      if (!it) return { ok: false, reason: `item "${a.item}" is not sold here` };
      a.item = it.key;
      a.qty = a.type === 'service' ? 1 : clamp(Math.round(num(a.qty, 1)), 1, 12);
      let unit = num(a.type === 'service' ? a.price : a.unitPrice, it.price);
      if (unit < it.price * 0.7 || unit > it.price * 1.3) unit = it.price;
      if (a.item === 'tip') unit = clamp(num(a.unitPrice, 2), 1, 20);
      a.unitPrice = round2(unit);
      return { ok: true, action: a, cost: round2(unit * a.qty), item: it };
    }
    case 'open_account': {
      if (!state.home) return { ok: false, reason: 'the player has no US address yet' };
      if (!state.flags?.phone) return { ok: false, reason: 'the player has no US phone number yet' };
      if (state.flags?.bank) return { ok: false, reason: 'the player already has an account' };
      return { ok: true, action: a, cost: 0 };
    }
    case 'hire': {
      a.score = clamp(Math.round(num(a.score, 0)), 0, 100);
      const missing = jobRequirements(state);
      if (missing) return { ok: false, reason: `requirements missing: ${missing}` };
      if (a.score < 60) return { ok: true, action: { type: 'reject', score: a.score, reason: 'score below 60' }, cost: 0 };
      return { ok: true, action: a, cost: 0 };
    }
    case 'reject': {
      a.score = clamp(Math.round(num(a.score, 0)), 0, 100);
      return { ok: true, action: a, cost: 0 };
    }
    case 'work_done': {
      if (!state.job) return { ok: false, reason: 'the player has no job' };
      if (state.job.lastWorkedDay === state.time?.day) return { ok: false, reason: 'already worked today' };
      a.performance = clamp(Math.round(num(a.performance, 70)), 0, 100);
      return { ok: true, action: a, cost: 0 };
    }
    case 'end':
      return { ok: true, action: a, cost: 0 };
    default:
      return { ok: false, reason: 'unknown action' };
  }
}

export const round2 = n => Math.round(n * 100) / 100;
