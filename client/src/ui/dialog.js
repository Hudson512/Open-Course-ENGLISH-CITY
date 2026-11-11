// Real-time conversation with an AI NPC.
import { h, $, clear, esc } from './dom.js';
import * as S from '../state.js';
import { api, getSettings } from '../api.js';
import { speak, stopSpeaking, listen, micSupported, serverListens } from '../speech.js';
import { listenFlux, keytermsFor, canCapture } from '../flux.js';
import { t } from '../i18n.js';
import { getPack, fmtMoney } from '../pack.js';

let current = null;
export const dialogOpen = () => !!current;

// Who the player is talking to: the place's character, or the pedestrian they stopped.
export function npcMeta(mission) {
  const c = S.missionInfo(mission).character || {};
  return { name: c.name || 'Staff', emoji: c.emoji || '🙂', role: c.role || 'Local', voice: { ...c.voice, name: c.name || '' } };
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
  const micBtn = h('button', { class: 'mic', title: t('holdToTalk') }, '🎤');
  holdToTalk(micBtn);
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
    h('div', { class: 'dlg-input-row' }, settings.mic && (micSupported || canCapture) ? micBtn : null, input, sendBtn),
    h('div', { class: 'dlg-foot' }, hintBtn, vocabRow)
  );
  $('#overlay').append(panel);

  current = { mission, history: [], done: [], playerTurns: 0, busy: false, completed: new Set(), panel, onClose, ended: false, rec: null, live: null };
  // With Deepgram on the server the microphone goes through Flux (any browser, better with accents);
  // otherwise through the browser's own recogniser.
  let useFlux = false, speaking = false, muted = false;
  const keyterms = keytermsFor(info);
  const mineNow = current;
  serverListens().then(yes => { if (current !== mineNow) return; useFlux = yes && canCapture; if (useFlux && settings.mic && settings.handsFree) startHandsFree(); });
  input.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') send(); if (e.key === 'Escape') closeDialog(); });
  setTimeout(() => input.focus(), 50);
  requestTurn();

  function addMsg(role, text, extra = {}) {
    const el = h('div', { class: `msg ${role}` },
      h('div', { class: 'bubble' }, text,
        role === 'npc' ? h('button', { class: 'tr-btn', title: 'Play', onclick: () => speak(text, { ...meta.voice, level }) }, '🔊') : null));
    if (role === 'npc') addTranslation(el, extra.translation);
    log.append(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  // The translation can arrive after the line itself is already on screen.
  function addTranslation(el, translation) {
    if (!translation) return;
    const bubble = el.querySelector('.bubble');
    const tr = h('div', { class: `tr ${settings.autoTranslate && lowLevel ? '' : 'hidden'}` }, translation);
    bubble.querySelector('.tr-btn').before(h('button', { class: 'tr-btn', title: t('translate'), onclick: () => tr.classList.toggle('hidden') }, '🌐'));
    bubble.append(tr);
    log.scrollTop = log.scrollHeight;
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
    syncLive();
    const typing = h('div', { class: 'msg npc typing' }, h('div', { class: 'bubble' }, `${meta.name} ${t('thinking')}`));
    log.append(typing); log.scrollTop = log.scrollHeight;
    sendBtn.disabled = true;
    try {
      // The character's line is shown and spoken as soon as it is known; the corrections,
      // suggestions and actions follow when the whole answer has arrived.
      const mine = current;
      let bubble = null;
      const showReply = reply => {
        if (bubble || current !== mine || mine.panel !== panel) return;
        typing.remove();
        mine.history.push({ role: 'npc', text: reply });
        bubble = addMsg('npc', reply);
        if (getSettings().voice) {
          speaking = true;                     // hands-free waits until the character has finished
          speak(reply, { ...meta.voice, level: S.levelFor(S.getState().xp).id }).finally(() => { if (current === mine) { speaking = false; syncLive(); } });
        }
      };
      const res = await api.npcTurn(current.mission, S.getState(), current.history, showReply);
      if (!current || current.panel !== panel) return;
      showReply(res.reply);
      addTranslation(bubble, res.translation);

      if (res.feedback && lastPlayerEl) {
        lastPlayerEl.append(feedbackBlock(res.feedback));
        S.addXP(Math.round(res.feedback.score / 10));
        S.addWords(res.feedback.newWords, meta.name);
      }
      clear(sugg).append(...(res.suggestions || []).map(s => h('button', { class: 'chip', onclick: () => { input.value = s; input.focus(); } }, s)));
      if (lowLevel && res.suggestions?.length && current.playerTurns === 0) sugg.classList.remove('hidden');

      if (res.actions?.length) handleActions(res.actions);
      checkCompletion();
    } catch (e) {
      typing.remove();
      log.append(h('div', { class: 'msg game error' }, `⚠️ ${e.message}`, ' ', h('button', { class: 'ghost small', onclick: () => S.bus.emit('open-panel', 'settings') }, '⚙️ ' + t('settings'))));
      // let the player retry by sending again
      if (current?.history.at(-1)?.role === 'player') current.retry = true;
    } finally {
      if (current) { current.busy = false; syncLive(); }
      sendBtn.disabled = false;
      log.scrollTop = log.scrollHeight;
    }
  }

  // A fare, a choice, a rent, an account or a job is settled once per conversation: if the
  // character repeats the action after a "thank you", the player must not pay twice.
  const ONCE = ['price', 'choose', 'rent', 'grant', 'hire'];

  function handleActions(actions) {
    const kinds = getPack().actions;
    actions = actions.filter(a => !(ONCE.includes(kinds[a.type]?.kind) && current.done.some(d => d.type === a.type)));
    const results = S.applyActions(current.mission, actions);
    let needsReaction = false;
    for (const r of results) {
      if (r.kind === 'end') { current.ended = true; addGame('👋'); continue; }
      if (r.ok) {
        current.done.push({ ...r.action, kind: r.kind });
        const label = r.cost ? `💳 −${fmtMoney(r.cost)} · ${r.action.item ? `${r.action.qty}× ${r.action.item}` : r.action.type.replace('_', ' ')}` : `✔️ ${r.action.type.replace('_', ' ')}`;
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
    const loc = S.missionPlace(current.mission);
    const candidates = [current.mission, ...S.activeMissions().filter(m => m.uid !== current.mission.uid && loc && S.missionPlace(m) === loc)];
    for (const m of candidates) {
      if (current.completed.has(m.uid) || m.kind === 'free') continue;
      if (S.isComplete(m, current.done, { turns: current.playerTurns })) {
        current.completed.add(m.uid);
        const title = S.missionInfo(m).title;
        const reward = S.completeMission(m);
        if (getPack().missions[m.templateId].with_person) onSmalltalkDone(m);
        banner.classList.remove('hidden');
        clear(banner).append(h('b', {}, `🏆 ${t('missionComplete')}`), ` ${title} · +${reward.xp} XP`);
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

  const micError = err => (String(err).startsWith('flux') ? t('micLost') : err);

  // Hands-free (Settings): the microphone stays open and Deepgram decides when the player has
  // finished a turn, waiting longer for beginners. While the character is thinking or speaking the
  // microphone is paused, so the character never answers its own voice. Click 🎤 to pause/resume.
  function startHandsFree() {
    const mine = current;
    mine.live = listenFlux({
      handsFree: true, level, keyterms,
      onPartial: txt => { if (current === mine) input.value = txt; },
      onTurn: txt => { if (current !== mine || mine.busy) return; input.value = txt; send(); },
      onError: err => {
        mine.live = null;
        micBtn.classList.remove('live', 'rec');
        micBtn.title = t('holdToTalk');
        if (current === mine) addGame(`🎤 ${['not-allowed', 'no-microphone'].includes(err) ? t('micBlocked') : micError(err)}`, 'bad');
      }
    });
    micBtn.title = t('micToggle');
    addGame(`🎤 ${t('handsFreeOn')}`);
    syncLive();
  }
  // Listen only when it is the player's turn to speak.
  function syncLive() {
    if (!current?.live) return;
    const listening = !(muted || current.busy || speaking);
    current.live.pause(!listening);
    micBtn.classList.toggle('live', listening);
    input.placeholder = listening ? t('listening').split('…')[0] + '…' : t('typeHere');
  }

  // The microphone works like a voice message: hold the button (or Space/Enter on it) to record,
  // release to send. Pauses do not send anything, so the player can take the time they need.
  function holdToTalk(btn) {
    let startedAt = 0;
    const begin = () => {
      if (!current || current.rec || current.busy || current.live) return;
      if (!useFlux && !micSupported) return addGame(`🎤 ${t('micBlocked')}`, 'bad');
      stopSpeaking();
      startedAt = Date.now();
      input.value = '';
      input.placeholder = t('listening');
      btn.classList.add('rec');
      const mine = current;
      const done = () => { btn.classList.remove('rec'); input.placeholder = t('typeHere'); mine.rec = null; };
      const start = useFlux ? opts => listenFlux({ ...opts, level, keyterms }) : listen;
      mine.rec = start({
        onPartial: txt => { if (current === mine) input.value = txt; },
        onDone: txt => {
          const quick = Date.now() - startedAt < 400;
          done();
          if (current !== mine) return;
          input.value = txt;
          if (txt) send();
          else addGame(`🎤 ${t(quick ? 'holdToTalk' : 'heardNothing')}`);
        },
        onError: err => { done(); if (current === mine) addGame(`🎤 ${['not-allowed', 'service-not-allowed'].includes(err) ? t('micBlocked') : micError(err)}`, 'bad'); }
      });
      if (!mine.rec) done();
    };
    const end = () => current?.rec?.stop();
    const cancel = () => { if (!current?.rec) return; current.rec.cancel(); current.rec = null; btn.classList.remove('rec'); input.value = ''; input.placeholder = t('typeHere'); };

    btn.addEventListener('pointerdown', e => { if (e.button) return; e.preventDefault(); btn.setPointerCapture?.(e.pointerId); begin(); });
    btn.addEventListener('pointerup', end);
    btn.addEventListener('click', () => { if (current?.live) { muted = !muted; syncLive(); addGame(`🎤 ${t(muted ? 'handsFreePaused' : 'handsFreeOn')}`); } });
    btn.addEventListener('pointercancel', cancel);
    btn.addEventListener('contextmenu', e => e.preventDefault());     // a long press on a phone
    btn.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); begin(); } if (e.key === 'Escape') cancel(); });
    btn.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); end(); } });
    btn.addEventListener('blur', end);
  }
}

export function closeDialog(silent = false) {
  current?.live?.cancel();
  if (!current) return;
  const c = current;
  current = null;
  stopSpeaking();
  c.rec?.cancel?.();
  c.panel.remove();
  S.save();
  if (!silent) c.onClose?.({ completed: [...c.completed], done: c.done, mission: c.mission });
}
