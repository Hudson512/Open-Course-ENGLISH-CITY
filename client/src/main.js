import Phaser from 'phaser';
import './style.css';
import { WorldScene } from './scenes/WorldScene.js';
import * as S from './state.js';
import { setLang, t } from './i18n.js';
import { getSettings } from './api.js';
import { connect } from './net.js';
import { getPack, listPacks, loadPack, loadCourse } from './pack.js';
import { titleScreen, createScreen, departuresScreen, hideScreen, gameOverScreen } from './ui/screens.js';
import { mountGameUI, openPanel } from './ui/ui.js';
import { levelFor } from '../../shared/data.js';

setLang(getSettings().uiLang);

let game = null;

function boot(notice) {
  titleScreen({
    notice,
    canContinue: S.hasSave() && !S.load()?.gameOver,
    onContinue: () => enter(S.load().pack),
    onNew: () => createScreen({
      onBack: () => boot(),
      onDone: async player => {
        let packs = [];
        try { packs = await listPacks(); } catch { /* server offline: the board shows no open flights */ }
        departuresScreen(player, { packs, onBoard: city => enter(city.id, player) });
      }
    }),
    onSettings: () => openPanel('settings')
  });
}

// Fetch the city, then play in it — a new life when `player` is given, the saved one otherwise.
async function enter(packId, player) {
  try { await Promise.all([loadPack(packId), loadCourse()]); } catch (e) { return boot(`${t('cityFailed')} (${e.message})`); }
  if (player) S.newGame(player);
  S.ensureDaily();
  startWorld(!!player);
}

function startWorld(fresh = false) {
  hideScreen();
  const st = S.getState();
  mountGameUI();
  if (!game) {
    game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'game',
      backgroundColor: '#1e272e',
      scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
      physics: { default: 'arcade', arcade: { debug: false } },
      scene: [WorldScene]
    });
    window.__game = game; // handy for debugging in the console
  }
  connect({ id: st.id, name: st.player.name, level: levelFor(st.xp).id, color: st.player.color, x: st.position.x, y: st.position.y, room: st.pack, from: st.player.homeCity });
  if (fresh) setTimeout(() => S.bus.emit('toast', { text: `${t('welcome')} ${getPack().name}! ${t('welcomeHint')}`, kind: 'good' }), 800);
  S.bus.on(type => {
    if (type === 'gameover') gameOverScreen(S.getState(), { onRestart: () => { S.wipe(); location.reload(); } });
  });
  window.addEventListener('beforeunload', () => S.save());
}

boot();
