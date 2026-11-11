// UI controller: routes interactions, keyboard shortcuts, multiplayer chat.
import { h, $, clear } from './dom.js';
import * as S from '../state.js';
import { t } from '../i18n.js';
import { openDialog, dialogOpen, closeDialog } from './dialog.js';
import { modalOpen, closeModal, missionsPanel, inventoryPanel, notebookPanel, phonePanel, settingsPanel, locationMenu } from './panels.js';
import { mountHUD, scheduleRender, showPrompt, toast } from './hud.js';
import { sendChat, myId } from '../net.js';
import { api, getSettings } from '../api.js';
import { getPack, getCourse, socialMission } from '../pack.js';
import { openClassroom, classroomOpen, closeClassroom } from './classroom.js';
import { phoneNotes } from '../../../shared/course.js';

let scene = null;
let chatInput, chatLog;
let busyCutscene = false;

export const ui = {
  isBlocking: () => dialogOpen() || modalOpen() || classroomOpen() || busyCutscene,
  isTyping: () => { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT'); },
  prompt: showPrompt,
  setScene(s) { scene = s; },
  interact(target) {
    if (ui.isBlocking()) return;
    if (target.type === 'location' && getPack().places[target.id]?.school) return openClassroom({ onReview: () => notebookPanel('review') });
    if (target.type === 'location') return locationMenu(target.id, { onStart: startMission, onSleep: doSleep });
    if (target.type === 'ped') {
      const p = target.ped;
      const st = S.getState();
      if (st.missions.chattedToday.includes(p.name)) toast(t('alreadyChatted'));
      startMission({ uid: `ped-${p.name}`, templateId: socialMission(), params: { name: p.name, persona: p.persona, emoji: p.emoji, voice: p.voice }, kind: 'social' });
    }
  }
};

function startMission(m) {
  openDialog(m, { onClose: ({ completed, done }) => afterDialog(m, completed, done) });
}

function afterDialog(m, completed, done) {
  scheduleRender();
  if (!completed.includes(m.uid)) return;
  // The player agreed where to go (e.g. with the taxi driver on arrival): ride there.
  const pick = done.find(a => a.kind === 'choose');
  const dest = pick && getPack().places[pick.value];
  if (dest) taxiRide(dest, () => toast(`${t('arrivedAt')} ${dest.name}. ${t('enterToCheckin')}`, 'good'));
}

function taxiRide(loc, after) {
  if (!scene) return;
  busyCutscene = true;
  const cam = scene.cameras.main;
  cam.fadeOut(600, 0, 0, 0);
  cam.once('camerafadeoutcomplete', () => {
    scene.teleport(loc.door.x, loc.door.y + (loc.door.y < loc.y ? -20 : 20));
    S.advanceTime(25);
    cam.fadeIn(700, 0, 0, 0);
    busyCutscene = false;
    after?.();
    scheduleRender();
  });
}

function doSleep() {
  if (!scene) return S.sleep();
  busyCutscene = true;
  const cam = scene.cameras.main;
  cam.fadeOut(700, 0, 0, 0);
  cam.once('camerafadeoutcomplete', () => {
    S.sleep();
    toast(`🌅 ${t('newDay')} — ${t('day')} ${S.getState().time.day}`, 'good');
    cam.fadeIn(900, 0, 0, 0);
    busyCutscene = false;
  });
}

// What the phone reminds the player of (next lesson, phrases to review).
export const notes = () => phoneNotes({ course: getCourse(), pack: getPack(), state: S.getState() });

export function mountGameUI() {
  mountHUD();
  // a newcomer who has not been to class yet hears about the school once
  const st = S.getState();
  if (getCourse() && st && !Object.keys(st.course.done).length && !st.flags.schoolHint) {
    st.flags.schoolHint = true;
    setTimeout(() => toast(t('schoolHint')), 6000);
  }
  // Multiplayer chat box
  chatLog = h('div', { class: 'chat-log' });
  chatInput = h('input', { class: 'chat-input hidden', placeholder: `💬 ${t('chatHint')}`, maxlength: 300 });
  $('#hud').append(h('div', { class: 'chat' }, chatLog, chatInput));
  chatInput.addEventListener('keydown', async e => {
    e.stopPropagation();
    if (e.key === 'Escape') { chatInput.value = ''; chatInput.blur(); chatInput.classList.add('hidden'); }
    if (e.key === 'Enter') {
      const text = chatInput.value.trim();
      chatInput.value = '';
      chatInput.blur(); chatInput.classList.add('hidden');
      if (!text) return;
      if (!sendChat(text)) addChat({ name: '⚪', text: t('offline'), system: true });
      scene?.bubble?.('me', text);
      if (getSettings().checkChat) {
        try {
          const fb = await api.checkChat(text, S.getState().player.nativeLang);
          if (fb.corrected) addChat({ name: '✏️', text: `${fb.corrected}${fb.tips?.[0] ? ' — ' + fb.tips[0] : ''}`, system: true });
          S.addXP(Math.round((fb.score || 0) / 20));
          S.addWords(fb.newWords || [], 'chat');
        } catch { /* ignore */ }
      }
    }
  });

  S.bus.on((type, data) => {
    if (type === 'change') scheduleRender();
    else if (type === 'toast') toast(data.text, data.kind);
    else if (type === 'teleport') scene?.teleport(data.x, data.y);
    else if (type === 'open-panel') openPanel(data);
    else if (type === 'players' || type === 'net') scheduleRender();
    else if (type === 'chat') {
      addChat(data);
      if (data.from && data.from !== myId()) scene?.bubble?.(data.from, data.text);
    } else if (type === 'chat_ack' && data.heard > 0) S.bumpCounter('online_messages');
    else if (type === 'newday') { toast(`📅 ${t('newDay')} — ${t('day')} ${data}`); if (notes().length) setTimeout(() => toast(t('notesNew')), 2500); }
    else if (type === 'mission') scheduleRender();
  });

  window.addEventListener('keydown', e => {
    if (ui.isTyping()) return;
    if (e.key === 'Escape') { if (classroomOpen()) closeClassroom(); else if (dialogOpen()) closeDialog(); else closeModal(); return; }
    if (dialogOpen() || classroomOpen() || busyCutscene) return;
    const k = e.key.toLowerCase();
    if (e.key === 'Enter' && !modalOpen()) { e.preventDefault(); chatInput.classList.remove('hidden'); chatInput.focus(); }
    else if (k === 'm') toggle('missions');
    else if (k === 'i') toggle('inventory');
    else if (k === 'n') toggle('notebook');
    else if (k === 'p') toggle('phone');
  });
}

let lastPanel = null;
function toggle(name) {
  if (modalOpen() && lastPanel === name) { closeModal(); lastPanel = null; return; }
  openPanel(name);
}
export function openPanel(name) {
  lastPanel = name;
  if (name === 'missions') missionsPanel();
  else if (name === 'inventory') inventoryPanel();
  else if (name === 'notebook') notebookPanel();
  else if (name === 'phone') phonePanel({ onTaxi: loc => taxiRide(loc, () => toast(`${t('arrivedAt')} ${loc.name}`)), notes: notes() });
  else if (name === 'settings') settingsPanel();
}

function addChat(m) {
  if (!chatLog) return;
  const el = h('div', { class: `chat-line ${m.system ? 'sys' : ''}` }, h('b', {}, m.from === myId() ? t('you') : m.name), ' ', m.text);
  chatLog.append(el);
  while (chatLog.children.length > 8) chatLog.firstChild.remove();
  setTimeout(() => el.classList.add('old'), 20000);
}
