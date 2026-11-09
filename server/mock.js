// Offline rule-based NPC so the game runs (and can be tested) without any API key.
import { CATALOG, TAXI, findCatalogItem } from '../shared/data.js';
import { resolveNpc } from './prompts.js';
import { resolve, TEMPLATES } from '../shared/missions.js';

const NUM_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

export function mockTurn({ mission, state, history = [] }) {
  const npc = resolveNpc(mission);
  const players = history.filter(h => h.role === 'player');
  const last = players[players.length - 1]?.text || '';
  const all = players.map(p => p.text).join(' ').toLowerCase();
  const lastLower = last.toLowerCase();
  const turns = players.length;
  const done = history.filter(h => h.role === 'game').map(h => h.text).join(' ');
  const actions = [];
  let reply;

  const tpl = TEMPLATES[mission.templateId];
  const place = resolve(tpl, 'location', mission.params);

  if (!turns) {
    reply = greeting(mission.templateId, npc.name);
  } else {
    switch (mission.templateId) {
      case 'arrival_taxi': {
        const dest = /apart|oak/.test(all) ? 'apartment' : /hotel|sunrise/.test(all) ? 'hotel' : null;
        const nums = (lastLower.match(/\d+/g) || []).map(Number);
        const offer = nums.length ? nums[nums.length - 1] : null;
        if (!dest) reply = 'Sure, buddy. But where are you going? Hotel Sunrise or Oak Street Apartments?';
        else if (offer == null) reply = `${dest === 'hotel' ? 'Hotel Sunrise' : 'Oak Street'}, got it. That's $${TAXI.start}. Deal?`;
        else if (offer < TAXI.min) reply = `$${offer}? No way! Tell you what, I can do $${TAXI.min + 10}.`;
        else {
          reply = `OK, $${offer}, deal! Put your luggage in the trunk. Hop in!`;
          actions.push({ type: 'set_destination', place: dest }, { type: 'agree_price', amount: offer });
        }
        if (/^(yes|ok|deal|sure|fine)/.test(lastLower) && dest && !actions.length) {
          reply = 'Great! Hop in!';
          actions.push({ type: 'set_destination', place: dest }, { type: 'agree_price', amount: TAXI.start });
        }
        break;
      }
      case 'lodging': {
        const isHotel = mission.params.place === 'hotel';
        if (turns < 2) reply = isHotel ? 'Welcome! May I have your name, and how many nights will you stay?' : 'Hello. So, why did you come to Maple City? Do you work?';
        else {
          reply = isHotel ? 'Perfect, you are all set. Here is your key card. Check-out is at 11 am.' : 'Alright, you seem like a good tenant. Here are your keys. No loud music after 10 pm!';
          const nights = Number((lastLower.match(/\d+/) || [])[0]) || 2;
          actions.push(isHotel ? { type: 'rent', place: 'hotel', price: 110, nights } : { type: 'rent', place: 'apartment', price: 180 });
        }
        break;
      }
      case 'get_phone':
      case 'shop': {
        const loc = place || 'phone_store';
        const found = parseItems(loc, lastLower);
        if (found.length) {
          for (const f of found) actions.push({ type: loc === 'barber' || loc === 'clinic' ? 'service' : 'sell', item: f.item, qty: f.qty, unitPrice: f.price, price: f.price });
          const total = found.reduce((s, f) => s + f.price * f.qty, 0);
          reply = `Sure! ${found.map(f => `${f.qty} ${f.item}`).join(', ')}. That's $${total.toFixed(2)}. Anything else?`;
        } else if (/(no|that's all|thats all|thank|bye)/.test(lastLower)) {
          reply = 'Thank you! Have a great day!';
          actions.push({ type: 'end' });
        } else {
          const some = Object.keys(CATALOG[loc] || {}).slice(0, 3).join(', ');
          reply = `Sorry, what would you like? We have ${some}...`;
        }
        break;
      }
      case 'barber_cut':
        if (turns < 2) reply = 'Alright, how short on the sides? Clippers or scissors?';
        else { reply = 'All done! Take a look in the mirror. That\'s $25.'; actions.push({ type: 'service', item: 'haircut', price: 25 }); }
        break;
      case 'open_bank':
        if (turns < 2) reply = 'I can help with that. Can I see your passport, and what is your address?';
        else { reply = 'Your checking account is open. Your debit card arrives in 5 days.'; actions.push({ type: 'open_account' }); }
        break;
      case 'job_interview': {
        const qs = ['Tell me about yourself.', 'Why do you want this job?', 'What are your strengths?', 'And your weaknesses?', 'Where do you see yourself in five years?'];
        if (turns < 5) reply = qs[turns - 1] || qs[0];
        else { reply = 'Thank you. I am happy to say: you got the job! You start tomorrow at 9.'; actions.push({ type: 'hire', score: 75, jobTitle: '' }); }
        break;
      }
      case 'work_shift':
        if (turns < 3) reply = ['Good morning! What are you working on today?', 'OK. Any problems I should know about?'][turns - 1];
        else { reply = 'Great work today. See you tomorrow!'; actions.push({ type: 'work_done', performance: 80 }); }
        break;
      default:
        reply = ['Oh really? That\'s interesting!', 'Where are you from, by the way?', 'Nice! Do you like Maple City so far?', 'Cool. Well, it was nice talking to you!'][Math.min(turns - 1, 3)];
    }
  }
  void done;
  return {
    reply,
    emotion: actions.length ? 'happy' : 'neutral',
    actions,
    feedback: turns ? heuristicFeedback(last) : null,
    suggestions: ['Hello! How are you?', 'How much is it?'],
    translation: null
  };
}

function greeting(t, name) {
  const g = {
    arrival_taxi: 'Hey there, welcome to Maple City! Need a ride? Where are you headed?',
    lodging: 'Good afternoon! How can I help you?',
    get_phone: 'Hi! Welcome to PhoneHub. Looking for a phone plan?',
    open_bank: 'Good morning. How may I help you today?',
    job_interview: 'Hello, please have a seat. Shall we start the interview?',
    work_shift: 'Morning! Ready for today?',
    barber_cut: 'What\'s up! Have a seat. What are we doing today?',
    shop: 'Hi there! What can I get for you?'
  };
  return g[t] || `Hi, I'm ${name}. How's it going?`;
}

function parseItems(loc, text) {
  const cat = CATALOG[loc] || {};
  const out = [];
  for (const key of Object.keys(cat).sort((a, b) => b.length - a.length)) {
    const k = key.toLowerCase();
    const singular = k.replace(/s$/, '');
    if (text.includes(k) || text.includes(singular)) {
      if (out.some(o => o.item.includes(k))) continue;
      const re = new RegExp(`(\\d+|a|an|one|two|three|four|five|six)\\s+(?:\\w+\\s+)?${singular.split(' ')[0]}`);
      const m = text.match(re);
      const qty = m ? Number(m[1]) || NUM_WORDS[m[1]] || 1 : 1;
      const it = findCatalogItem(loc, key);
      out.push({ item: key, qty, price: it.price });
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
