// The English course: its lessons, the checker that keeps them sound, the school every city must
// have, and how the game decides what to teach and what to review.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCourse, compileCourse, CourseError } from '../tools/course/compile.js';
import { readPack, compileSources, compilePack, PackError } from '../tools/pack/compile.js';
import { sayScore, phraseFor, nextLesson, lessonForMission, dueCards, phoneNotes } from '../shared/course.js';

const packsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'packs');
const course = loadCourse();
const london = compilePack(path.join(packsDir, 'london'));
const maple = compilePack(path.join(packsDir, 'maple-city'));

test('course: the A1 lessons are there, in teaching order, each with phrases and exercises', () => {
  assert.deepEqual(course.lessons.map(l => l.id), ['a1-first-words', 'a1-taxi', 'a1-lodging', 'a1-phone']);
  for (const l of course.lessons) {
    assert.equal(l.level, 'A1');
    assert.ok(l.phrases.length >= 3 && l.exercises.length >= 1, l.id);
    assert.ok(l.title.pt && l.title.en && l.goal.pt, l.id);
  }
});

test('course: mistakes in a lesson are explained', () => {
  const bad = [{
    id: 'A1 Taxi', title: { en: 'Taxi' }, goal: { en: 'x', pt: 'y' },
    phrases: [{ en: 'Hi', pt: 'Olá' }, { en: 'Bye' }],
    exercises: [
      { type: 'gap', text: 'How much?', options: ['a', 'b'], answer: 'c' },
      { type: 'order', answer: 'Hi there' },
      { type: 'dance' }
    ]
  }];
  assert.throws(() => compileCourse('english', { 'a1.yaml': bad, 'extra.yaml': [] }), e => {
    assert.ok(e instanceof CourseError);
    for (const re of [/bad "id"/, /title: needs "en" and "pt"/, /phrases: needs at least 3 phrases/, /must contain ___/, /the answer "c" is not one of the options/,
      /"answer" must be a sentence of at least 3 words/, /unknown exercise type "dance"/, /extra\.yaml: files are named after a level/]) assert.match(e.message, re);
    return true;
  });
  const twice = [course.lessons[0], course.lessons[0]];
  assert.throws(() => compileCourse('english', { 'a1.yaml': twice }), /the id "a1-first-words" is used twice/);
});

test('course: every city has one school, and missions point at real lessons', () => {
  for (const pack of [london, maple]) {
    assert.ok(pack.school && pack.places[pack.school].school, pack.id);
    assert.equal(pack.missions.smalltalk.lesson, 'a1-first-words');
  }
  assert.equal(london.missions.arrival_cab.lesson, 'a1-taxi');
  assert.equal(maple.missions.arrival_taxi.lesson, 'a1-taxi');

  const { sources } = readPack(path.join(packsDir, 'london'));
  const noSchool = structuredClone(sources);
  delete noSchool.places.school.school;
  assert.throws(() => compileSources(noSchool), e => e instanceof PackError && /every city needs a school/.test(e.message));
  const twoSchools = structuredClone(sources);
  twoSchools.places.pub.school = true;
  assert.throws(() => compileSources(twoSchools), /only one place can be the school; found pub, school/);
  const wrongLesson = structuredClone(sources);
  wrongLesson.missions.get_sim.lesson = 'a1-telephone';
  assert.throws(() => compileSources(wrongLesson, 'london', { lessons: course.lessons.map(l => l.id) }), /missions\.yaml › get_sim › lesson: unknown lesson "a1-telephone"/);
});

test('course: a phrase in British or American English, as the city speaks', () => {
  const p = course.lessons[1].phrases.find(x => x['en-GB']);
  assert.equal(phraseFor(p, 'en-GB'), "That's a bit steep.");
  assert.equal(phraseFor(p, 'en-US'), "That's too expensive.");
});

test('course: saying a phrase is judged on its words, not on perfect spelling', () => {
  assert.equal(sayScore('can you take me to the station', 'Can you take me to …?'), 1);
  assert.equal(sayScore("thats too expensive", "That's too expensive."), 1);
  assert.equal(sayScore('hi', 'Hello! / Hi!'), 1);                       // either of the alternatives
  assert.ok(sayScore('take me station', 'Can you take me to …?') < 0.75);
  assert.equal(sayScore('', 'Thank you'), 0);
});

test('course: the next lesson, the one the current mission needs, and the phone notes', () => {
  assert.equal(nextLesson(course, {}).id, 'a1-first-words');
  assert.equal(nextLesson(course, { 'a1-first-words': {} }).id, 'a1-taxi');
  assert.equal(nextLesson(course, Object.fromEntries(course.lessons.map(l => [l.id, {}]))), null);
  assert.equal(lessonForMission(course, london, 'get_sim', {}).id, 'a1-phone');
  assert.equal(lessonForMission(course, london, 'get_sim', { 'a1-phone': {} }), null);
  assert.equal(lessonForMission(course, london, 'bank_account', {}), null);   // no lesson for it yet

  const state = { course: { done: {} }, missions: { story: { templateId: 'arrival_cab' } }, time: { day: 1 }, vocab: {} };
  assert.deepEqual(phoneNotes({ course, pack: london, state }).map(n => [n.kind, n.lesson?.id, n.forMission]), [['lesson', 'a1-taxi', true]]);
  state.course.done['a1-taxi'] = { day: 1 };
  state.vocab = { 'Thank you': { meaning: 'Obrigado', box: 0, day: 1 } };
  assert.deepEqual(phoneNotes({ course, pack: london, state }).map(n => [n.kind, n.lesson?.id ?? n.count]), [['lesson', 'a1-first-words'], ['review', 1]]);
});

test('course: cards come back after longer and longer waits', () => {
  const vocab = {
    new: { meaning: 'a', box: 0, day: 5 },
    known: { meaning: 'b', box: 2, day: 1, reviewed: 4 },                 // box 2 waits 2 days
    solid: { meaning: 'c', box: 5, day: 1, reviewed: 3 },                 // box 5 waits 15 days
    nomeaning: { meaning: '', box: 0, day: 1 }
  };
  assert.deepEqual(dueCards(vocab, 5).map(([w]) => w), ['new']);
  assert.deepEqual(dueCards(vocab, 6).map(([w]) => w), ['new', 'known']);
  assert.deepEqual(dueCards(vocab, 18).map(([w]) => w), ['new', 'known', 'solid']);
});

test('course: the server hands out the course', async () => {
  const { createApp } = await import('../server/index.js');
  const app = createApp({ packs: { london }, voices: null, course }).listen(0);
  const none = createApp({ packs: { london }, voices: null, course: null }).listen(0);
  try {
    const got = await (await fetch(`http://127.0.0.1:${app.address().port}/api/course`)).json();
    assert.deepEqual(got.lessons.map(l => l.id), course.lessons.map(l => l.id));
    assert.equal((await fetch(`http://127.0.0.1:${none.address().port}/api/course`)).status, 404);
  } finally { app.close(); none.close(); }
});
