// The English school's classroom: a blackboard and the teacher. Each lesson goes through its phrases
// (hear them, say them), a short tip, a few exercises, and ends by saving the phrases to the notebook.
// Opened by walking into the city's school (the place with `school: true`).
import { h, $, clear } from './dom.js';
import { getPack, getCourse } from '../pack.js';
import * as S from '../state.js';
import { t, getLang } from '../i18n.js';
import { getSettings } from '../api.js';
import { speak, stopSpeaking, listen, micSupported, serverListens } from '../speech.js';
import { listenFlux, canCapture } from '../flux.js';
import { phraseFor, sayScore, nextLesson, lessonForMission } from '../../../shared/course.js';

let room = null;
export const classroomOpen = () => !!room;

export function closeClassroom() {
  if (!room) return;
  stopSpeaking();
  room.rec?.cancel?.();
  room.el.remove();
  room = null;
  S.bus.emit('change');
}

const shuffle = list => list.map(v => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(([, v]) => v);
const tr = obj => obj?.[getLang()] || obj?.en || '';              // course texts in the interface language

export function openClassroom({ onReview } = {}) {
  closeClassroom();
  const pack = getPack(), course = getCourse();
  const school = pack.places[pack.school];
  const teacher = school?.character || { name: 'Teacher', emoji: '🧑‍🏫', voice: {} };
  const voice = { ...teacher.voice, name: teacher.name };
  const board = h('div', { class: 'chalkboard' });
  const bubble = h('div', { class: 'teacher-says' });
  const actions = h('div', { class: 'class-actions' });
  const el = h('div', { class: 'classroom' },
    h('div', { class: 'class-head' },
      h('b', {}, `${school?.icon || '🏫'} ${school?.name || t('school')}`),
      h('button', { class: 'ghost close', title: t('leave'), onclick: closeClassroom }, '✕')),
    h('div', { class: 'class-body' },
      h('div', { class: 'board-frame' }, board),
      h('div', { class: 'teacher' }, h('div', { class: 'teacher-face' }, teacher.emoji || '🧑‍🏫'), h('b', {}, teacher.name), bubble)),
    actions);
  $('#overlay').append(el);
  room = { el };

  const say = text => { bubble.textContent = text; };
  const hear = text => { if (getSettings().voice) speak(text, { ...voice, level: S.levelFor(S.getState().xp).id }); };
  const buttons = (...list) => clear(actions).append(...list.filter(Boolean));

  if (!course?.lessons?.length) { say(t('noCourse')); buttons(h('button', { class: 'primary', onclick: closeClassroom }, t('leave'))); return; }

  // ── choose a lesson ──
  function menu() {
    const st = S.getState(), done = st.course.done;
    const urgent = lessonForMission(course, pack, st.missions.story?.templateId, done);
    const next = urgent || nextLesson(course, done);
    say(next ? `${t('teacherHello').replace('{name}', st.player.name)} ${t('teacherSuggest').replace('{lesson}', tr(next.title))}` : t('teacherAllDone'));
    clear(board).append(h('div', { class: 'chalk-title' }, t('lessons')),
      h('div', { class: 'lesson-list' }, course.lessons.map(l => {
        const d = done[l.id];
        return h('button', { class: `lesson-item ${l === next ? 'next' : ''} ${d ? 'done' : ''}`, onclick: () => lesson(l) },
          h('span', { class: 'lesson-level' }, l.level), h('span', {}, tr(l.title)), h('span', { class: 'lesson-mark' }, d ? `✔ ${d.score}/${l.exercises.length}` : l === next ? '⭐' : ''));
      })));
    buttons(onReview ? h('button', { class: 'ghost', onclick: () => { closeClassroom(); onReview(); } }, `🃏 ${t('reviewNotebook')}`) : null,
      next ? h('button', { class: 'primary', onclick: () => lesson(next) }, `▶ ${tr(next.title)}`) : null);
  }

  // ── one lesson ──
  function lesson(l) {
    const language = pack.language;
    const phrases = l.phrases.map(p => ({ en: phraseFor(p, language), pt: p.pt }));
    let i = 0, score = 0;

    const intro = () => {
      clear(board).append(h('div', { class: 'chalk-level' }, `${l.level} · ${t('lesson')}`), h('div', { class: 'chalk-title' }, tr(l.title)), h('div', { class: 'chalk-note' }, tr(l.goal)));
      say(t('teacherIntro').replace('{goal}', tr(l.goal).toLowerCase()));
      buttons(h('button', { class: 'ghost', onclick: menu }, `← ${t('lessons')}`), h('button', { class: 'primary', onclick: () => phrase(0) }, `${t('start')} →`));
    };

    const phrase = n => {
      i = n;
      const p = phrases[i];
      const result = h('div', { class: 'say-result' });
      clear(board).append(h('div', { class: 'chalk-count' }, `${i + 1} / ${phrases.length}`), h('div', { class: 'chalk-phrase' }, p.en), h('div', { class: 'chalk-meaning' }, p.pt), result);
      say(i === 0 ? t('teacherListen') : t('teacherNext'));
      hear(p.en);
      const mic = micButton(p.en, result);
      buttons(h('button', { class: 'ghost', onclick: () => hear(p.en) }, `🔊 ${t('listen')}`), mic,
        h('button', { class: 'primary', onclick: () => (i + 1 < phrases.length ? phrase(i + 1) : tip()) }, `${t('next')} →`));
    };

    // Hold to say the phrase; the teacher tells you how close it was.
    const micButton = (target, result) => {
      if (!micSupported && !canCapture) return null;
      const btn = h('button', { class: 'ghost mic' }, `🎤 ${t('sayIt')}`);
      let useFlux = false;
      serverListens().then(yes => { useFlux = yes && canCapture; });
      const done = text => {
        btn.classList.remove('rec');
        room && (room.rec = null);
        if (!text) { result.textContent = t('heardNothing'); return; }
        const s = sayScore(text, target);
        result.className = `say-result ${s >= 0.75 ? 'good' : s >= 0.4 ? 'close' : 'bad'}`;
        result.textContent = s >= 0.75 ? `✅ ${t('sayGreat')}` : `${s >= 0.4 ? '🟡' : '🔁'} ${t('sayHeard')}: “${text}”`;
        say(s >= 0.75 ? t('teacherGreat') : t('teacherTryAgain'));
      };
      const start = e => {
        e.preventDefault();
        if (!room || room.rec) return;
        stopSpeaking();
        btn.classList.add('rec');
        result.textContent = t('listening');
        const opts = { onPartial: txt => { result.textContent = txt; }, onDone: done, onError: () => done('') };
        room.rec = useFlux ? listenFlux({ ...opts, level: S.levelFor(S.getState().xp).id, keyterms: target.split(/\s+/).slice(0, 8) }) : listen(opts);
      };
      btn.addEventListener('pointerdown', start);
      btn.addEventListener('pointerup', () => room?.rec?.stop());
      btn.addEventListener('pointercancel', () => room?.rec?.cancel());
      btn.addEventListener('contextmenu', e => e.preventDefault());
      return btn;
    };

    const tip = () => {
      if (!l.tip) return exercise(0);
      clear(board).append(h('div', { class: 'chalk-title' }, `💡 ${t('tip')}`), h('div', { class: 'chalk-note' }, tr(l.tip)));
      say(t('teacherTip'));
      buttons(h('button', { class: 'ghost', onclick: () => phrase(phrases.length - 1) }, '←'), h('button', { class: 'primary', onclick: () => exercise(0) }, `${t('practise')} →`));
    };

    const exercise = n => {
      const x = l.exercises[n];
      if (!x) return finish();
      const feedback = h('div', { class: 'say-result' });
      const after = ok => {
        if (ok) score++;
        feedback.className = `say-result ${ok ? 'good' : 'bad'}`;
        feedback.textContent = ok ? `✅ ${t('correct')}` : `✖ ${t('answerWas')}: ${x.type === 'gap' ? x.text.replace('___', x.answer) : x.answer}`;
        say(ok ? t('teacherGreat') : t('teacherNoWorries'));
        if (x.type !== 'choose' || ok) hear(x.type === 'gap' ? x.text.replace('___', x.answer) : x.answer);
        board.querySelectorAll('.opt-btn, .word').forEach(b => { b.disabled = true; });
        buttons(h('button', { class: 'primary', onclick: () => exercise(n + 1) }, `${t('next')} →`));
      };
      const head = h('div', { class: 'chalk-count' }, `${t('exercise')} ${n + 1} / ${l.exercises.length}`);
      buttons();
      if (x.type === 'gap') {
        say(t('teacherGap'));
        clear(board).append(head, h('div', { class: 'chalk-phrase' }, x.text.replace('___', '____')),
          h('div', { class: 'opt-row' }, shuffle(x.options).map(o => h('button', { class: 'opt-btn', onclick: () => after(o === x.answer) }, o))), feedback);
      } else if (x.type === 'choose') {
        say(t('teacherChoose'));
        clear(board).append(head, h('div', { class: 'chalk-note' }, tr(x.prompt)),
          h('div', { class: 'opt-col' }, shuffle(x.options).map(o => h('button', { class: 'opt-btn', onclick: () => after(o === x.answer) }, o))), feedback);
      } else if (x.type === 'order') {
        say(t('teacherOrder'));
        const target = x.answer.replace(/[.?!]$/, '');
        const parts = target.split(/\s+/);
        const built = h('div', { class: 'built' });
        const picked = [];
        const pool = h('div', { class: 'opt-row' }, shuffle(parts.map((w, k) => ({ w, k }))).map(({ w }) => {
          const b = h('button', { class: 'word', onclick: () => { b.disabled = true; picked.push(w); built.textContent = picked.join(' '); if (picked.length === parts.length) after(picked.join(' ').toLowerCase() === target.toLowerCase()); } }, w);
          return b;
        }));
        clear(board).append(head, built, pool, feedback);
        buttons(h('button', { class: 'ghost', onclick: () => exercise(n) }, `↺ ${t('again')}`));
      }
    };

    const finish = () => {
      const xp = S.completeLesson(l, score, phrases.map(p => ({ en: p.en, meaning: p.pt })));
      clear(board).append(h('div', { class: 'chalk-title' }, `🎓 ${tr(l.title)}`),
        h('div', { class: 'chalk-phrase' }, `${score} / ${l.exercises.length}`),
        h('div', { class: 'chalk-note' }, `+${xp} XP · 📒 ${t('phrasesSaved').replace('{n}', phrases.length)}`));
      say(score === l.exercises.length ? t('teacherPerfect') : t('teacherWellDone'));
      buttons(h('button', { class: 'ghost', onclick: menu }, `← ${t('lessons')}`), h('button', { class: 'primary', onclick: closeClassroom }, `🏙️ ${t('backToCity')}`));
    };

    intro();
  }

  menu();
}
