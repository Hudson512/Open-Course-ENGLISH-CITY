import Phaser from 'phaser';
import './style.css';
import { WorldScene } from './scenes/WorldScene.js';
import * as S from './state.js';
import { setLang, t } from './i18n.js';
import { getSettings } from './api.js';
import { connect } from './net.js';
import { titleScreen, createScreen, departuresScreen, hideScreen, gameOverScreen } from './ui/screens.js';
import { mountGameUI, openPanel } from './ui/ui.js';
import { levelFor } from '../../shared/data.js';

setLang(getSettings().uiLang);

let game = null;

function boot() {
  titleScreen({
    canContinue: S.hasSave() && !S.load()?.gameOver,
    onContinue: () => { S.load(); startWorld(); },
    onNew: () => createScreen({
      onBack: boot,
      onDone: player => departuresScreen(player, { onBoard: () => { S.newGame(player); startWorld(true); } })
    }),
    onSettings: () => openPanel('settings')
  });
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
  connect({ id: st.id, name: st.player.name, level: levelFor(st.xp).id, color: st.player.color, x: st.position.x, y: st.position.y, room: st.destination, from: st.player.homeCity });
  if (fresh) setTimeout(() => S.bus.emit('toast', { text: t('welcome'), kind: 'good' }), 800);
  S.bus.on(type => {
    if (type === 'gameover') gameOverScreen(S.getState(), { onRestart: () => { S.wipe(); location.reload(); } });
  });
  window.addEventListener('beforeunload', () => S.save());
}

boot();
