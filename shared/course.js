// The English course as the game uses it (client and tests): which lesson comes next, which phrases are
// due for review, and how well a spoken phrase matched. The course itself is data (courses/english).

const words = s => String(s).toLowerCase().replace(/[’‘]/g, "'").replace(/[^\p{L}\p{N}' ]/gu, ' ').split(/\s+/).filter(Boolean);

// The phrase as said in this city's English (a phrase may have an `en-GB` or `en-US` version).
export function phraseFor(p, language = 'en-US') {
  return p[language] || p.en;
}

// How well what was said matches a phrase: the share of its words that were heard (order does not
// matter; "…" marks a place for the player's own words, "/" separates alternatives). 0 … 1.
export function sayScore(said, phrase) {
  const heard = new Set(words(said).map(w => w.replace(/'/g, '')));
  let best = 0;
  for (const option of String(phrase).split('/')) {
    const target = words(option.replace(/…|\.\.\./g, ' ')).map(w => w.replace(/'/g, ''));
    if (target.length) best = Math.max(best, target.filter(w => heard.has(w)).length / target.length);
  }
  return best;
}

// The first lesson the player has not done yet, or null when they have done them all.
export function nextLesson(course, done = {}) {
  return course?.lessons.find(l => !done[l.id]) || null;
}

// The lesson that prepares the mission the player is on now, if they have not done it.
export function lessonForMission(course, pack, templateId, done = {}) {
  const id = pack?.missions[templateId]?.lesson;
  if (!id || done[id]) return null;
  return course?.lessons.find(l => l.id === id) || null;
}

// Spaced repetition (Leitner boxes): a card in box n comes back after INTERVALS[n] days.
export const INTERVALS = [0, 1, 2, 4, 7, 15];

// The notebook entries to review today: they have a meaning and their waiting time is over.
export function dueCards(vocab = {}, day = 1) {
  return Object.entries(vocab)
    .filter(([, v]) => v.meaning && day - (v.reviewed ?? v.day ?? 0) >= INTERVALS[Math.min(v.box || 0, INTERVALS.length - 1)])
    .sort((a, b) => (a[1].box || 0) - (b[1].box || 0));
}

// What the player's phone reminds them of: the next lesson and the review waiting.
// → [{ kind: 'lesson', lesson, forMission }, { kind: 'review', count }]
export function phoneNotes({ course, pack, state }) {
  const notes = [];
  const done = state?.course?.done || {};
  const story = state?.missions?.story?.templateId;
  const urgent = lessonForMission(course, pack, story, done);
  const next = urgent || nextLesson(course, done);
  if (next) notes.push({ kind: 'lesson', lesson: next, forMission: Boolean(urgent) });
  const due = dueCards(state?.vocab, state?.time?.day).length;
  if (due) notes.push({ kind: 'review', count: due });
  return notes;
}
