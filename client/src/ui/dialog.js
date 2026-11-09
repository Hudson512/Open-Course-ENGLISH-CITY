// Real-time conversation with an AI NPC.
import { h, $, clear, esc } from './dom.js';
import * as S from '../state.js';
import { api, getSettings } from '../api.js';
import { speak, stopSpeaking, listen, micSupported } from '../speech.js';
import { t, tr } from '../i18n.js';
import { NPCS } from '../../../shared/npcs.js';
import { TEMPLATES, resolve, missionLocation } from '../../../shared/missions.js';

let current = null;
export const dialogOpen = () => !!current;

export function npcMeta(mission) {
  if (mission.templateId === 'smalltalk') {
    const p = mission.params;
    return { name: p.name, emoji: p.emoji || '🙂', role: p.role || 'Local', voice: { gender: p.gender || 'female', rate: 1 } };
  }
  const id = resolve(TEMPLATES[mission.templateId], 'npc', mission.params);
  const n = NPCS[id] || {};
  return { name: n.name || 'Staff', emoji: n.emoji || '🙂', role: n.role || '', voice: n.voice || {} };
}

export function openDialog(mission, { onClose } = {}) {
  closeDialog(true);
  const state = S.getState();
  const meta = npcMeta(mission);
  const info = S.missionInfo(mission);
  const level = S.levelFor(state.xp).id;
  const settings = getSettings();
  const lowLevel = ['A1', 'A2'].includes(level);

  const log = h('div', { class: 'dlg-log' });
  const input = h('input', { class: 'dlg-input', placeholder: t('typeHere'), maxlength: 400, autocomplete: 'off' });
  const sugg = h('div', { class: 'dlg-sugg hidden' });
  const banner = h('div', { class: 'dlg-banner hidden' });
  const micBtn = h('button', { class: 'mic', title: t('mic'), onclick: () => toggleMic() }, '🎤');
  const sendBtn = h('button', { class: 'primary', onclick: () => send() }, t('send'));
  const hintBtn = h('button', { class: 'ghost small', onclick: () => sugg.classList.toggle('hidden') }, `💡 ${t('hint')}`);
  const vocabRow = h('div', { class: 'dlg-vocab' }, info.vocab.slice(0, 10).map(v => h('span', { class: 'chip', title: 'click', onclick: () => { input.value += (input.value ? ' ' : '') + v.replace('…', ''); input.focus(); } }, v)));

  const panel = h('div', { class: 'dialog panel' },
    h('div', { class: 'dlg-head' },
      h('div', { class: 'dlg-emoji' }, meta.emoji),
      h('div', { class: 'dlg-who' }, h('b', {}, meta.name), h('small', {}, meta.role)),
      h('button', { class: 'ghost close', onclick: () => closeDialog() }, '✕')),
    h('div', { class: 'dlg-goal' }, h('b', {}, info.title), h('div', {}, info.goal)),
    log, banner, sugg,
    h('div', { class: 'dlg-input-row' }, micSupported && settings.mic ? micBtn : null, input, sendBtn),
    h('div', { class: 'dlg-foot' }, hintBtn, vocabRow)
  );
  $('#overlay').append(panel);

  current = { mission, history: [], done: [], playerTurns: 0, busy: false, completed: new Set(), panel, onClose, ended: false, rec: null };
  input.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') send(); if (e.key === 'Escape') closeDialog(); });
  setTimeout(() => input.focus(), 50);
  requestTurn();

  function addMsg(role, text, extra = {}) {
    const el = h('div', { class: `msg ${role}` },
      h('div', { class: 'bubble' }, text,
        role === 'npc' && extra.translation ? h('button', { class: 'tr-btn', title: t('translate'), onclick: e => e.currentTarget.parentElement.querySelector('.tr')?.classList.toggle('hidden') }, '🌐') : null,
        role === 'npc' ? h('button', { class: 'tr-btn', title: 'Play', onclick: () => speak(text, { ...meta.voice, level }) }, '🔊') : null,
        role === 'npc' && extra.translation ? h('div', { class: `tr ${settings.autoTranslate && lowLevel ? '' : 'hidden'}` }, extra.translation) : null));
    log.append(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  function addGame(text, kind = '') { log.append(h('div', { class: `msg game ${kind}` }, text)); log.scrollTop = log.scrollHeight; }

  function feedbackBlock(fb) {
    const cls = fb.score >= 85 ? 'great' : fb.score >= 65 ? 'good' : fb.score >= 40 ? 'ok' : 'bad';
    return h('div', { class: `fb ${cls}` },
      h('span', { class: 'score' }, fb.score),
      fb.corrected ? h('div', { class: 'corr' }, '✏️ ', h('i', {}, fb.corrected)) : h('div', { class: 'corr' }, '✅ Natural!'),
      (fb.tips || []).map(tip => h('div', { class: 'tip' }, '💡 ', tip)),
      fb.newWords?.length ? h('div', { class: 'words' }, fb.newWords.map(w => h('span', { class: 'chip word', title: w.meaning }, `📒 ${w.en}`, h('small', {}, ` — ${w.meaning}`)))) : null);
  }

  async function requestTurn(lastPlayerEl) {
    if (!current) return;
    current.busy = true;
    const typing = h('div', { class: 'msg npc typing' }, h('div', { class: 'bubble' }, `${meta.name} ${t('thinking')}`));
    log.append(typing); log.scrollTop = log.scrollHeight;
    sendBtn.disabled = true;
    try {
      const res = await api.npcTurn(current.mission, S.getState(), current.history);
      if (!current || current.panel !== panel) return;
      typing.remove();
      current.history.push({ role: 'npc', text: res.reply });
      addMsg('npc', res.reply, res);
      if (getSettings().voice) speak(res.reply, { ...meta.voice, level: S.levelFor(S.getState().xp).id });

      if (res.feedback && lastPlayerEl) {
        lastPlayerEl.append(feedbackBlock(res.feedback));
        S.addXP(Math.round(res.feedback.score / 10));
        S.addWords(res.feedback.newWords, meta.name);
      }
      clear(sugg).append((res.suggestions || []).map(s => h('button', { class: 'chip', onclick: () => { input.value = s; input.focus(); } }, s)));
      if (lowLevel && res.suggestions?.length && current.playerTurns === 0) sugg.classList.remove('hidden');

      if (res.actions?.length) handleActions(res.actions);
      checkCompletion();
    } catch (e) {
      typing.remove();
      log.append(h('div', { class: 'msg game error' }, `⚠️ ${e.message}`, ' ', h('button', { class: 'ghost small', onclick: () => S.bus.emit('open-panel', 'settings') }, '⚙️ ' + t('settings'))));
      // let the player retry by sending again
      if (current?.history.at(-1)?.role === 'player') current.retry = true;
    } finally {
      if (current) current.busy = false;
      sendBtn.disabled = false;
      log.scrollTop = log.scrollHeight;
    }
  }

  function handleActions(actions) {
    const results = S.applyActions(current.mission, actions);
    let needsReaction = false;
    for (const r of results) {
      if (r.action.type === 'end') { current.ended = true; addGame('👋'); continue; }
      if (r.ok) {
        current.done.push(r.action);
        const label = r.cost ? `💳 −$${r.cost.toFixed(2)} · ${r.action.item ? `${r.action.qty}× ${r.action.item}` : r.action.type.replace('_', ' ')}` : `✔️ ${r.action.type.replace('_', ' ')}`;
        addGame(label, 'ok');
      } else {
        addGame(r.payFail ? `💳 ${t('payFail')}` : `⛔ ${r.note}`, 'bad');
        needsReaction = true;
      }
      current.history.push({ role: 'game', text: r.note });
    }
    if (needsReaction) setTimeout(() => requestTurn(), 0);
  }

  function checkCompletion() {
    const loc = missionLocation(current.mission);
    const candidates = [current.mission, ...S.activeMissions().filter(m => m.uid !== current.mission.uid && loc && missionLocation(m) === loc)];
    for (const m of candidates) {
      if (current.completed.has(m.uid) || m.kind === 'free') continue;
      if (S.isComplete(m, current.done, { turns: current.playerTurns })) {
        current.completed.add(m.uid);
        const reward = S.completeMission(m);
        if (m.templateId === 'smalltalk') onSmalltalkDone(m);
        banner.classList.remove('hidden');
        clear(banner).append(h('b', {}, `🏆 ${t('missionComplete')}`), ` ${tr(resolve(TEMPLATES[m.templateId], 'title', m.params, S.getState()))} · +${reward.xp} XP`);
      }
    }
  }

  function onSmalltalkDone(m) {
    const st = S.getState();
    if (!st.missions.chattedToday.includes(m.params.name)) {
      st.missions.chattedToday.push(m.params.name);
      S.bumpCounter('smalltalk');
    }
  }

  function send() {
    if (!current || current.busy) return;
    const text = input.value.trim();
    if (!text) {
      if (current.retry) { current.retry = false; requestTurn(current.lastPlayerEl); }
      return;
    }
    input.value = '';
    stopSpeaking();
    current.history.push({ role: 'player', text });
    current.playerTurns++;
    S.getState().stats_total.messages++;
    S.advanceTime(2);
    const used = S.markUsedVocab(text, info.vocab);
    const el = addMsg('player', text);
    current.lastPlayerEl = el;
    if (used.length) { S.addXP(3 * used.length); el.append(h('div', { class: 'used' }, `⭐ ${used.join(', ')} +${3 * used.length} XP`)); }
    sugg.classList.add('hidden');
    requestTurn(el);
  }

  function toggleMic() {
    if (current.rec) { current.rec.stop(); return; }
    stopSpeaking();
    micBtn.classList.add('rec');
    current.rec = listen({
      onPartial: txt => { input.value = txt; },
      onFinal: txt => { input.value = txt; send(); },
      onEnd: () => { micBtn.classList.remove('rec'); if (current) current.rec = null; },
      onError: err => { addGame(`🎤 ${err}`, 'bad'); }
    });
  }
}

export function closeDialog(silent = false) {
  if (!current) return;
  const c = current;
  current = null;
  stopSpeaking();
  c.rec?.stop?.();
  c.panel.remove();
  S.save();
  if (!silent) c.onClose?.({ completed: [...c.completed], done: c.done, mission: c.mission });
}
