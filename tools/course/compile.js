// English course: lessons written in YAML (courses/<language>/<level>.yaml), checked and joined into one
// list in teaching order. Like city packs, mistakes are explained in words a teacher can act on.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

export const LEVELS = ['a1', 'a2', 'b1', 'b2', 'c1'];
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'courses');

export class CourseError extends Error {
  constructor(id, errors) {
    super(`Course "${id}" has ${errors.length} problem${errors.length > 1 ? 's' : ''}:\n` + errors.map(e => '  ' + e).join('\n'));
    this.errors = errors;
  }
}

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = v => typeof v === 'string' && v.trim() !== '';
const words = s => String(s).toLowerCase().replace(/[^\p{L}\p{N}' ]/gu, ' ').split(/\s+/).filter(Boolean);

// Check one level's lessons; `E(where, message)` collects problems.
function checkLessons(list, file, seen, E) {
  if (!Array.isArray(list)) return E([file], 'expected a list of lessons (each starting with "- id:")');
  list.forEach((l, i) => {
    const at = [file, l?.id || `#${i + 1}`];
    if (!isObj(l)) return E(at, 'expected a lesson block');
    for (const k of Object.keys(l)) if (!['id', 'title', 'goal', 'phrases', 'tip', 'exercises'].includes(k)) E(at, `unknown field "${k}". Known: id, title, goal, phrases, tip, exercises`);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(l.id || '')) E(at, 'missing or bad "id": lowercase letters, digits and dashes, e.g. a1-taxi');
    else if (seen.has(l.id)) E(at, `the id "${l.id}" is used twice`);
    else seen.add(l.id);
    for (const k of ['title', 'goal']) if (!isObj(l[k]) || !text(l[k].en) || !text(l[k].pt)) E([...at, k], 'needs "en" and "pt" texts');
    if (l.tip !== undefined && (!isObj(l.tip) || !text(l.tip.en) || !text(l.tip.pt))) E([...at, 'tip'], 'needs "en" and "pt" texts');
    if (!Array.isArray(l.phrases) || l.phrases.length < 3) E([...at, 'phrases'], 'needs at least 3 phrases');
    else l.phrases.forEach((p, j) => {
      if (!isObj(p) || !text(p.en) || !text(p.pt)) E([...at, 'phrases', `#${j + 1}`], 'needs "en" (the English) and "pt" (its meaning)');
      else for (const k of Object.keys(p)) if (!['en', 'pt', 'en-GB', 'en-US'].includes(k)) E([...at, 'phrases', `#${j + 1}`], `unknown field "${k}". Known: en, pt, en-GB, en-US`);
    });
    if (!Array.isArray(l.exercises) || !l.exercises.length) return E([...at, 'exercises'], 'needs at least one exercise');
    l.exercises.forEach((x, j) => {
      const w = [...at, 'exercises', `#${j + 1}`];
      if (!isObj(x)) return E(w, 'expected an exercise block');
      if (x.type === 'gap') {
        if (!text(x.text) || !x.text.includes('___')) E(w, '"text" must contain ___ where the missing word goes');
        if (!Array.isArray(x.options) || x.options.length < 2) E(w, 'needs at least 2 "options"');
        else if (!x.options.includes(x.answer)) E(w, `the answer "${x.answer}" is not one of the options`);
      } else if (x.type === 'order') {
        if (!text(x.answer) || words(x.answer).length < 3) E(w, '"answer" must be a sentence of at least 3 words');
      } else if (x.type === 'choose') {
        if (!isObj(x.prompt) || !text(x.prompt.en) || !text(x.prompt.pt)) E([...w, 'prompt'], 'needs "en" and "pt" texts');
        if (!Array.isArray(x.options) || x.options.length < 2) E(w, 'needs at least 2 "options"');
        else if (!x.options.includes(x.answer)) E(w, `the answer "${x.answer}" is not one of the options`);
      } else E(w, `unknown exercise type "${x.type}". Known: gap, order, choose`);
    });
  });
}

// From parsed YAML files ({ 'a1.yaml': [...] }) to the course the game reads.
export function compileCourse(id, files) {
  const errors = [];
  const E = (where, msg) => errors.push(`${where.join(' › ')}: ${msg}`);
  const seen = new Set();
  const lessons = [];
  for (const level of LEVELS) {
    const file = `${level}.yaml`;
    if (!(file in files)) continue;
    checkLessons(files[file], file, seen, E);
    if (Array.isArray(files[file])) for (const l of files[file]) if (isObj(l)) lessons.push({ ...l, level: level.toUpperCase() });
  }
  for (const f of Object.keys(files)) if (!LEVELS.includes(f.replace('.yaml', ''))) E([f], `files are named after a level: ${LEVELS.map(l => l + '.yaml').join(', ')}`);
  if (!lessons.length && !errors.length) E([id], 'has no lessons');
  if (errors.length) throw new CourseError(id, errors);
  return { id, lessons };
}

export function readCourse(dir) {
  const id = path.basename(dir);
  const files = {};
  const errors = [];
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.yaml')).sort()) {
    const doc = YAML.parseDocument(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (doc.errors.length) errors.push(...doc.errors.map(e => `${f}: ${e.message.split('\n')[0]}`));
    else files[f] = doc.toJS();
  }
  if (errors.length) throw new CourseError(id, errors);
  return compileCourse(id, files);
}

// The English course, or null if there is none (the game then simply has no lessons).
export function loadCourse(dir = path.join(ROOT, 'english')) {
  return fs.existsSync(dir) ? readCourse(dir) : null;
}
