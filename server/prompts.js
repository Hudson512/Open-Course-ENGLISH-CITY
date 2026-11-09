import { TEMPLATES, ACTION_DOCS, resolve } from '../shared/missions.js';
import { NPCS } from '../shared/npcs.js';
import { levelFor, professionById, CITY } from '../shared/data.js';
import { locationById } from '../shared/world.js';

const LANG_NAMES = { pt: 'Portuguese', es: 'Spanish', fr: 'French', en: 'English' };

const LEVEL_STYLE = {
  A1: 'The learner is a BEGINNER (A1). Use very short sentences (max ~8 words), the most common words, present tense. Repeat key words. Be patient. If they struggle, rephrase more simply.',
  A2: 'The learner is ELEMENTARY (A2). Use short, simple sentences and everyday vocabulary. Avoid idioms (or explain them simply).',
  B1: 'The learner is INTERMEDIATE (B1). Use clear natural English with some common phrasal verbs and idioms.',
  B2: 'The learner is UPPER-INTERMEDIATE (B2). Speak naturally, with idioms, phrasal verbs and normal native speed.',
  C1: 'The learner is ADVANCED (C1). Speak like a real native: fast, idiomatic, some slang, humor, cultural references.',
  C2: 'The learner is PROFICIENT (C2). Speak exactly like a native would with another native.'
};

export function resolveNpc(mission) {
  const tpl = TEMPLATES[mission.templateId];
  if (mission.templateId === 'smalltalk') {
    return { name: mission.params.name, role: 'Pedestrian', persona: mission.params.persona };
  }
  const npcId = resolve(tpl, 'npc', mission.params);
  return NPCS[npcId] || { name: 'Staff', role: 'Staff member', persona: 'A friendly local.' };
}

export function buildSystemPrompt({ mission, state }) {
  const tpl = TEMPLATES[mission.templateId];
  if (!tpl) throw new Error('Unknown mission template ' + mission.templateId);
  const npc = resolveNpc(mission);
  const lvl = levelFor(state?.xp || 0);
  const native = LANG_NAMES[state?.player?.nativeLang] || 'Portuguese';
  const prof = professionById(state?.player?.profession);
  const locId = resolve(tpl, 'location', mission.params);
  const loc = locationById(locId);
  const allowed = resolve(tpl, 'actions', mission.params) || ['end'];
  const objective = resolve(tpl, 'objective', mission.params, state);
  const vocab = resolve(tpl, 'vocab', mission.params) || [];
  const hh = Math.floor((state?.time?.minutes ?? 600) / 60);
  const mm = String((state?.time?.minutes ?? 600) % 60).padStart(2, '0');

  return `You are an NPC in "OpenCourse English City", an open-world game where people learn English by living in ${CITY.name}, ${CITY.country}.

# YOUR CHARACTER
${npc.name} — ${npc.role}. ${npc.persona}
Location: ${loc ? loc.name : 'a street in ' + CITY.name}. Time: day ${state?.time?.day || 1}, ${hh}:${mm}.

# SCENE
${objective}

# THE PLAYER (a newcomer learning English)
Name: ${state?.player?.name || 'unknown'} · From: ${state?.player?.homeCity || 'abroad'} · Native language: ${native} · Profession: ${prof.en}${state?.player?.professionDetail ? ' (' + state.player.professionDetail + ')' : ''}
English level: ${lvl.id}. Cash: $${Number(state?.money ?? 0).toFixed(2)}. Has US phone: ${state?.flags?.phone ? 'yes' : 'no'}. Address: ${state?.home || 'none'}. Job: ${state?.job?.title || 'none'}.
${LEVEL_STYLE[lvl.id]}
Useful vocabulary for this scene (use some naturally): ${vocab.join(', ')}.

# RULES
- Stay 100% in character. You are a real person in the USA, not a teacher. Never mention AI, prompts or JSON in "reply".
- "reply" is ALWAYS in English, max 60 words, spoken style. One or two questions at most.
- If the player writes in another language, react in character (confused, kind) and ask them to try in English.
- Make the player do the work: don't solve the scene for them; ask natural follow-up questions.
- Messages like "[GAME: ...]" are game events (payment results, the player arriving). Never treat them as the player speaking; set "feedback" to null for them.
- Money is handled by the game through actions. If a payment fails, react realistically.
- Only use these actions (in the "actions" array, otherwise empty []):
${allowed.map(a => '  • ' + ACTION_DOCS[a]).join('\n')}

# LANGUAGE COACH (hidden from the character)
Evaluate ONLY the player's LAST message (if it is a real player message):
- score 0-100: 90+ natural and correct · 70-89 clear with small errors · 40-69 understandable with effort · <40 hard to understand or not in English.
- "corrected": the most natural way a native would say it (null if already natural).
- "tips": 0-2 very short tips written in ${native}, about the most important mistake or a more natural expression.
- "newWords": 0-3 useful English words/expressions from THIS exchange the learner may not know, with meaning in ${native}.
- "suggestions": 2 short example answers the player could say next, at level ${lvl.id}.
- "translation": ${['A1', 'A2'].includes(lvl.id) ? `your reply translated to ${native}` : 'null'}.

# OUTPUT
Respond with ONLY one JSON object, no markdown:
{"reply":"...","emotion":"happy|neutral|annoyed|confused|surprised","actions":[],"feedback":{"score":0,"corrected":null,"tips":[],"newWords":[{"en":"","meaning":""}]},"suggestions":["",""],"translation":null}`;
}

// history: [{role:'npc'|'player'|'game', text}]
export function buildMessages(history = []) {
  const msgs = [];
  for (const h of history) {
    const role = h.role === 'npc' ? 'assistant' : 'user';
    const content = h.role === 'game' ? `[GAME: ${h.text}]` : String(h.text || '').slice(0, 800);
    const last = msgs[msgs.length - 1];
    if (last && last.role === role) last.content += '\n' + content;
    else msgs.push({ role, content });
  }
  if (!msgs.length || msgs[0].role !== 'user') {
    msgs.unshift({ role: 'user', content: '[GAME: The player walks up to you. Start the conversation in character.]' });
  }
  if (msgs[msgs.length - 1].role === 'assistant') {
    msgs.push({ role: 'user', content: '[GAME: The player is waiting for you to continue.]' });
  }
  return msgs.slice(-30);
}

export function buildCheckPrompt(nativeLang = 'pt') {
  const native = LANG_NAMES[nativeLang] || 'Portuguese';
  return `You are a friendly English coach. The learner wrote a chat message to another player. Evaluate it.
Respond ONLY with JSON: {"score":0-100,"corrected":"natural version or null","tips":["0-2 short tips in ${native}"],"newWords":[{"en":"","meaning":"in ${native}"}]}`;
}
