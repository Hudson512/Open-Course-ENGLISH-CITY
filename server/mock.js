// Offline rule-based NPC so the game runs (and can be tested) without any API key.
// It knows nothing about a particular city: it plays whatever the mission's actions allow.
import { viewMission, catalogOf } from '../shared/engine.js';
import { money } from '../shared/pack.js';
import { missionNpc } from './prompts.js';

const NUM_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

export function mockTurn({ pack, mission, state, history = [] }) {
  const view = viewMission(pack, mission, state);
  const npc = missionNpc(view);
  const players = history.filter(h => h.role === 'player');
  const last = players[players.length - 1]?.text || '';
  const all = players.map(p => p.text).join(' ').toLowerCase();
  const lastLower = last.toLowerCase();
  const turns = players.length;
  const actions = [];
  // the action of each kind this mission allows, e.g. by.price = 'agree_price'
  const by = Object.fromEntries(view.allow.map(id => [pack.actions[id].kind, id]));
  const def = kind => pack.actions[by[kind]];
  const $ = n => money(pack, n);
  let reply;

  if (!turns) {
    reply = greeting(by, npc.name, pack);
  } else if (by.price || by.choose) {
    // a ride: where to, and how much
    const opts = by.choose ? def('choose').options : {};
    const dest = Object.keys(opts).reverse().find(o => opts[o].some(w => all.includes(w))) || null;
    const names = Object.keys(opts).map(o => pack.places[o]?.name || o);
    const P = by.price ? def('price') : null;
    const nums = (lastLower.match(/\d+/g) || []).map(Number);
    const offer = nums.length ? nums[nums.length - 1] : null;
    const go = amount => {
      if (by.choose) actions.push({ type: by.choose, value: dest });
      if (P) actions.push({ type: by.price, amount });
    };
    if (by.choose && !dest) reply = `Sure, buddy. But where are you going? ${names.join(' or ')}?`;
    else if (!P) { reply = 'Got it. Hop in!'; go(); }
    else if (offer == null) reply = `${pack.places[dest]?.name || 'Sure'}, got it. That's ${$(P.start)}. Deal?`;
    else if (offer < P.min) reply = `${$(offer)}? No way! Tell you what, I can do ${$(P.min + 10)}.`;
    else { reply = `OK, ${$(offer)}, deal! Put your luggage in the trunk. Hop in!`; go(offer); }
    if (P && /^(yes|ok|deal|sure|fine)/.test(lastLower) && !actions.length && (dest || !by.choose)) {
      reply = 'Great! Hop in!';
      go(P.start);
    }
  } else if (by.rent) {
    const L = view.place?.lodging || {};
    const nightly = L.per === 'night';
    if (turns < 2) reply = nightly ? 'Welcome! May I have your name, and how many nights will you stay?' : `Hello. So, why did you come to ${pack.name}? Do you work?`;
    else {
      reply = nightly ? 'Perfect, you are all set. Here is your key card. Check-out is at 11 am.' : 'Alright, you seem like a good tenant. Here are your keys. No loud music after 10 pm!';
      const nights = Number((lastLower.match(/\d+/) || [])[0]) || 2;
      actions.push(nightly ? { type: by.rent, price: L.price, nights } : { type: by.rent, price: L.price });
    }
  } else if (by.sell || by.service) {
    const found = [...parseItems(view.place, 'sell', by.sell, lastLower), ...parseItems(view.place, 'service', by.service, lastLower)];
    const goal = pack.missions[mission.templateId].complete;
    const cat = catalogOf(view.place);
    if (found.length) {
      for (const f of found) actions.push({ type: f.type, item: f.item, qty: f.qty, unitPrice: f.price, price: f.price });
      const total = found.reduce((s, f) => s + f.price * f.qty, 0);
      reply = `Sure! ${found.map(f => `${f.qty} ${f.item}`).join(', ')}. That's ${pack.currency.symbol}${total.toFixed(2)}. Anything else?`;
    } else if (by.service && goal?.did === by.service && turns >= 2) {
      // a mission that is simply "get the service done": do the first one on the list
      const [item, it] = Object.entries(view.place.services)[0];
      reply = `All done! Take a look in the mirror. That's ${$(it.price)}.`;
      actions.push({ type: by.service, item, price: it.price });
    } else if (by.service && goal?.did === by.service) {
      reply = 'Alright, how short on the sides? Clippers or scissors?';
    } else if (/(no|that's all|thats all|thank|bye)/.test(lastLower)) {
      reply = 'Thank you! Have a great day!';
      if (by.end) actions.push({ type: by.end });
    } else {
      reply = `Sorry, what would you like? We have ${Object.keys(cat).slice(0, 3).join(', ')}...`;
    }
  } else if (by.grant) {
    if (turns < 2) reply = 'I can help with that. Can I see your passport, and what is your address?';
    else { reply = 'Everything is in order. You are all set!'; actions.push({ type: by.grant }); }
  } else if (by.hire) {
    const qs = ['Tell me about yourself.', 'Why do you want this job?', 'What are your strengths?', 'And your weaknesses?', 'Where do you see yourself in five years?'];
    if (turns < 5) reply = qs[turns - 1] || qs[0];
    else { reply = 'Thank you. I am happy to say: you got the job! You start tomorrow at 9.'; actions.push({ type: by.hire, score: 75, jobTitle: '' }); }
  } else if (by.work_done) {
    if (turns < 3) reply = ['Good morning! What are you working on today?', 'OK. Any problems I should know about?'][turns - 1];
    else { reply = 'Great work today. See you tomorrow!'; actions.push({ type: by.work_done, performance: 80 }); }
  } else {
    reply = ['Oh really? That\'s interesting!', 'Where are you from, by the way?', `Nice! Do you like ${pack.name} so far?`, 'Cool. Well, it was nice talking to you!'][Math.min(turns - 1, 3)];
  }

  return {
    reply,
    emotion: actions.length ? 'happy' : 'neutral',
    actions,
    feedback: turns ? heuristicFeedback(last) : null,
    suggestions: ['Hello! How are you?', 'How much is it?'],
    translation: null
  };
}

function greeting(by, name, pack) {
  if (by.price || by.choose) return `Hey there, welcome to ${pack.name}! Need a ride? Where are you headed?`;
  if (by.rent) return 'Good afternoon! How can I help you?';
  if (by.sell) return 'Hi there! What can I get for you?';
  if (by.service) return 'What\'s up! Have a seat. What are we doing today?';
  if (by.grant) return 'Good morning. How may I help you today?';
  if (by.hire) return 'Hello, please have a seat. Shall we start the interview?';
  if (by.work_done) return 'Morning! Ready for today?';
  return `Hi, I'm ${name}. How's it going?`;
}

// Items of the place named in what the player said, with quantities ("two bagels").
function parseItems(place, kind, type, text) {
  if (!type) return [];
  const cat = catalogOf(place, kind);
  const out = [];
  for (const key of Object.keys(cat).sort((a, b) => b.length - a.length)) {
    const k = key.toLowerCase();
    const singular = k.replace(/s$/, '');
    if (text.includes(k) || text.includes(singular)) {
      if (out.some(o => o.item.toLowerCase().includes(k))) continue;
      const re = new RegExp(`(\\d+|a|an|one|two|three|four|five|six)\\s+(?:\\w+\\s+)?${singular.split(' ')[0].replace(/[^\w]/g, '.')}`);
      const m = text.match(re);
      const qty = m ? Number(m[1]) || NUM_WORDS[m[1]] || 1 : 1;
      out.push({ type, item: key, qty, price: cat[key].price });
    }
  }
  return out;
}

function heuristicFeedback(text) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  let score = Math.min(90, 40 + words.length * 6);
  const nonEnglish = /\b(eu|quero|obrigad|por favor|você|não|sim|quanto|custa)\b/i.test(text);
  if (nonEnglish) score = 15;
  let corrected = text.trim();
  if (corrected) corrected = corrected[0].toUpperCase() + corrected.slice(1);
  if (corrected && !/[.!?]$/.test(corrected)) corrected += '.';
  corrected = corrected.replace(/\bi\b/g, 'I');
  return {
    score,
    corrected: corrected !== text.trim() ? corrected : null,
    tips: nonEnglish ? ['Tenta escrever em inglês 🙂'] : ['(Modo offline) Configura uma API key em ⚙️ para teres correções reais.'],
    newWords: []
  };
}
