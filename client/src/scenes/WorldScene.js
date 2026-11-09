// Top-down open world of Maple City.
import Phaser from 'phaser';
import { WORLD, ROADS, LOCATIONS, PARK, DECOR, TAXI_STAND } from '../../../shared/world.js';
import { PEDESTRIANS } from '../../../shared/npcs.js';
import * as S from '../state.js';
import { others, sendMove } from '../net.js';
import { ui } from '../ui/ui.js';
import { t } from '../i18n.js';

const WALK = 150, RUN = 250;

export class WorldScene extends Phaser.Scene {
  constructor() { super('world'); }

  create() {
    this.texts = [];
    this.physics.world.setBounds(0, 0, WORLD.width, WORLD.height);
    this.makeTextures();
    this.walls = [];
    this.drawCity();

    const st = S.getState();
    this.player = this.physics.add.image(st.position.x, st.position.y, 'person').setTint(st.player.color).setDepth(10);
    this.player.body.setCircle(11, 3, 3);
    this.player.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, this.walls);
    this.nameTag = this.label(0, 0, st.player.name, 11, '#fff').setDepth(11);

    this.spawnPedestrians();
    this.spawnCars();
    this.setupCameras();
    this.setupGPS();

    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT,E', false);
    this.keys.E.on('down', () => { if (!ui.isTyping() && this.nearest) ui.interact(this.nearest); });

    this.remote = new Map();
    this.bubbles = new Map();
    this.acc = 0;
    this.saveAcc = 0;
    this.hitCooldown = 0;
    ui.setScene(this);
    this.scale.on('resize', () => this.layout());
    this.layout();
  }

  // ── Textures (generated, no external assets) ──────────────────
  makeTextures() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    // person (white, tinted per character). Faces +x.
    g.clear(); g.fillStyle(0x000000, 0.25); g.fillCircle(15, 16, 12);
    g.fillStyle(0xffffff); g.fillCircle(14, 14, 11);
    g.fillStyle(0x222222); g.fillTriangle(20, 9, 20, 19, 27, 14);
    g.lineStyle(2, 0x111111, 0.6); g.strokeCircle(14, 14, 11);
    g.generateTexture('person', 30, 30);
    // car (white, tinted)
    g.clear(); g.fillStyle(0x000000, 0.25); g.fillRoundedRect(3, 4, 46, 24, 6);
    g.fillStyle(0xffffff); g.fillRoundedRect(0, 0, 46, 24, 6);
    g.fillStyle(0x1b2631, 0.9); g.fillRect(28, 3, 9, 18); g.fillRect(8, 4, 6, 16);
    g.fillStyle(0xfff6a0); g.fillRect(43, 3, 3, 5); g.fillRect(43, 16, 3, 5);
    g.generateTexture('car', 50, 30);
    // tree
    g.clear(); g.fillStyle(0x000000, 0.2); g.fillCircle(20, 22, 17);
    g.fillStyle(0x2d6a4f); g.fillCircle(18, 18, 17); g.fillStyle(0x40916c); g.fillCircle(14, 14, 10);
    g.generateTexture('tree', 40, 40);
    // GPS arrow
    g.clear(); g.fillStyle(0xffd32a); g.lineStyle(3, 0x000000, 0.7);
    g.beginPath(); g.moveTo(30, 12); g.lineTo(4, 0); g.lineTo(10, 12); g.lineTo(4, 24); g.closePath(); g.fillPath(); g.strokePath();
    g.generateTexture('arrow', 32, 26);
    g.destroy();
  }

  label(x, y, text, size = 12, color = '#fff', bg = null) {
    const tx = this.add.text(x, y, text, { fontFamily: 'system-ui, sans-serif', fontSize: `${size}px`, color, stroke: '#000', strokeThickness: 3, backgroundColor: bg || undefined, padding: bg ? { x: 4, y: 2 } : undefined }).setOrigin(0.5);
    this.texts.push(tx);
    if (this.mini) this.mini.ignore(tx);
    return tx;
  }

  drawCity() {
    const add = this.add;
    add.rectangle(0, 0, WORLD.width, WORLD.height, 0x7cb342).setOrigin(0);
    // sidewalks then roads
    for (const r of ROADS) add.rectangle(r.x - 14, r.y - 14, r.w + 28, r.h + 28, 0xc8ccd0).setOrigin(0);
    for (const r of ROADS) add.rectangle(r.x, r.y, r.w, r.h, 0x3a3d42).setOrigin(0);
    const g = add.graphics();
    g.lineStyle(3, 0xf5f5f5, 0.8);
    for (const r of ROADS) {
      const horiz = r.w > r.h;
      const len = horiz ? r.w : r.h;
      for (let d = 0; d < len; d += 48) {
        if (horiz) g.lineBetween(r.x + d, r.y + r.h / 2, r.x + d + 24, r.y + r.h / 2);
        else g.lineBetween(r.x + r.w / 2, r.y + d, r.x + r.w / 2, r.y + d + 24);
      }
    }
    // intersections + crosswalks
    const hs = ROADS.filter(r => r.w > r.h), vs = ROADS.filter(r => r.h > r.w);
    for (const hr of hs) for (const vr of vs) {
      add.rectangle(vr.x, hr.y, vr.w, hr.h, 0x3a3d42).setOrigin(0);
      const z = add.graphics(); z.fillStyle(0xffffff, 0.75);
      for (let i = 6; i < 90; i += 14) {
        z.fillRect(vr.x + i, hr.y - 12, 8, 10); z.fillRect(vr.x + i, hr.y + hr.h + 2, 8, 10);
        z.fillRect(vr.x - 12, hr.y + i, 10, 8); z.fillRect(vr.x + vr.w + 2, hr.y + i, 10, 8);
      }
    }
    // park
    add.rectangle(PARK.x, PARK.y, PARK.w, PARK.h, 0x52b788).setOrigin(0);
    add.rectangle(PARK.x + PARK.w / 2 - 12, PARK.y, 24, PARK.h, 0xe9d8a6).setOrigin(0);
    add.rectangle(PARK.x, PARK.y + PARK.h / 2 - 12, PARK.w, 24, 0xe9d8a6).setOrigin(0);
    add.ellipse(PARK.x + 390, PARK.y + 110, 150, 90, 0x4ea8de);
    add.circle(PARK.x + PARK.w / 2, PARK.y + PARK.h / 2, 34, 0xe9d8a6);
    add.circle(PARK.x + PARK.w / 2, PARK.y + PARK.h / 2, 18, 0x90e0ef);
    for (const [tx, ty] of [[40, 40], [120, 70], [60, 160], [180, 330], [80, 360], [400, 330], [470, 260], [330, 60], [200, 150], [470, 380], [40, 260], [320, 360]]) add.image(PARK.x + tx, PARK.y + ty, 'tree');
    this.label(PARK.x + PARK.w / 2, PARK.y + 18, '🌳 Central Park', 14, '#fff');
    // decor buildings
    for (const d of DECOR) this.building(d, 0x95a5a6, 0x7f8c8d);
    // locations
    for (const l of LOCATIONS) {
      this.building(l, l.color, l.roof);
      this.label(l.x + l.w / 2, l.y + l.h / 2 - 6, l.icon, 34);
      this.label(l.x + l.w / 2, l.y + l.h / 2 + 30, l.name, 13, '#fff', '#00000088');
      const door = add.rectangle(l.door.x, l.door.y, 26, 26, 0xffd32a, 0.35).setStrokeStyle(2, 0xffd32a);
      this.tweens.add({ targets: door, alpha: 0.4, yoyo: true, repeat: -1, duration: 900 });
    }
    // airport details: runway + taxi stand
    add.rectangle(30, 340, 240, 40, 0x2f3542).setOrigin(0);
    const rg = add.graphics(); rg.lineStyle(3, 0xffffff, 0.8); for (let x = 40; x < 260; x += 30) rg.lineBetween(x, 360, x + 15, 360);
    this.taxi = this.add.image(TAXI_STAND.x, TAXI_STAND.y, 'car').setTint(0xffd32a).setAngle(90).setDepth(5);
    this.label(TAXI_STAND.x, TAXI_STAND.y - 34, '🚕 TAXI', 12, '#ffd32a');
  }

  building(b, color, roof) {
    this.add.rectangle(b.x + 8, b.y + 8, b.w, b.h, 0x000000, 0.25).setOrigin(0);
    this.add.rectangle(b.x, b.y, b.w, b.h, color).setOrigin(0).setStrokeStyle(3, 0x222222, 0.6);
    this.add.rectangle(b.x + 10, b.y + 10, b.w - 20, b.h - 20, roof, 0.85).setOrigin(0);
    const z = this.add.zone(b.x + b.w / 2, b.y + b.h / 2, b.w, b.h);
    this.physics.add.existing(z, true);
    this.walls.push(z);
  }

  // ── NPC pedestrians ───────────────────────────────────────────
  spawnPedestrians() {
    const pts = [];
    for (let i = 0; i < 30; i++) pts.push({ x: PARK.x + 30 + Math.random() * (PARK.w - 60), y: PARK.y + 30 + Math.random() * (PARK.h - 60) });
    for (const r of ROADS) {
      const horiz = r.w > r.h;
      for (let i = 0; i < 8; i++) {
        const along = 40 + Math.random() * ((horiz ? r.w : r.h) - 80);
        const side = Math.random() < 0.5 ? -7 : (horiz ? r.h : r.w) + 7;
        pts.push(horiz ? { x: r.x + along, y: r.y + side } : { x: r.x + side, y: r.y + along });
      }
    }
    this.wayPoints = pts;
    this.peds = PEDESTRIANS.map((p, i) => {
      const start = i < 4 ? pts[i * 3] : pts[30 + i * 5];
      const s = this.physics.add.image(start.x, start.y, 'person').setTint(p.color).setDepth(9);
      s.body.setCircle(11, 3, 3);
      s.setCollideWorldBounds(true);
      this.physics.add.collider(s, this.walls);
      s.npc = { ...p, target: null, stuck: 0, pause: 0, lastD: 0 };
      s.tag = this.label(start.x, start.y - 22, `${p.emoji} ${p.name}`, 10, '#fffbe6').setDepth(9);
      return s;
    });
  }

  updatePedestrians(dt) {
    for (const s of this.peds) {
      const d = s.npc;
      const near = Phaser.Math.Distance.Between(s.x, s.y, this.player.x, this.player.y) < 60;
      if (near || ui.isBlocking() && this.talkingTo === s) { s.setVelocity(0); }
      else if (d.pause > 0) { d.pause -= dt; s.setVelocity(0); }
      else {
        if (!d.target) {
          // choose a nearby waypoint
          const cands = this.wayPoints.filter(p => Math.hypot(p.x - s.x, p.y - s.y) < 400);
          d.target = Phaser.Utils.Array.GetRandom(cands.length ? cands : this.wayPoints);
          d.lastD = Infinity; d.stuck = 0;
        }
        const dist = Phaser.Math.Distance.Between(s.x, s.y, d.target.x, d.target.y);
        if (dist < 12) { d.target = null; d.pause = 1 + Math.random() * 4; s.setVelocity(0); }
        else {
          const a = Math.atan2(d.target.y - s.y, d.target.x - s.x);
          s.setVelocity(Math.cos(a) * 45, Math.sin(a) * 45);
          s.rotation = a;
          if (dist > d.lastD - 0.2) d.stuck += dt; else d.stuck = 0;
          d.lastD = dist;
          if (d.stuck > 1.5) d.target = null;
        }
      }
      s.tag.setPosition(s.x, s.y - 22);
    }
  }

  // ── Traffic ───────────────────────────────────────────────────
  spawnCars() {
    const colors = [0xe74c3c, 0x3498db, 0xecf0f1, 0x2c3e50, 0x16a085, 0xf39c12, 0x8e44ad, 0xffd32a];
    this.cars = [];
    for (const r of ROADS) {
      const horiz = r.w > r.h;
      for (const dir of [1, -1]) {
        for (let k = 0; k < 2; k++) {
          const lane = dir === 1 ? (horiz ? r.y + 70 : r.x + 26) : (horiz ? r.y + 26 : r.x + 70);
          const along = Math.random() * (horiz ? r.w : r.h);
          const c = this.add.image(horiz ? r.x + along : lane, horiz ? lane : r.y + along, 'car').setTint(Phaser.Utils.Array.GetRandom(colors)).setDepth(8);
          c.angle = horiz ? (dir === 1 ? 0 : 180) : (dir === 1 ? 90 : -90);
          c.car = { horiz, dir, speed: 110 + Math.random() * 90, cur: 0, min: horiz ? r.x : r.y, max: horiz ? r.x + r.w : r.y + r.h };
          this.cars.push(c);
        }
      }
    }
  }

  updateCars(dt) {
    const p = this.player;
    for (const c of this.cars) {
      const k = c.car;
      // brake if the player (or another car) is right ahead in the lane
      const ahead = k.horiz ? (p.x - c.x) * k.dir : (p.y - c.y) * k.dir;
      const lateral = k.horiz ? Math.abs(p.y - c.y) : Math.abs(p.x - c.x);
      let target = k.speed;
      if (ahead > 0 && ahead < 90 && lateral < 22) target = 0;
      for (const o of this.cars) {
        if (o === c || o.car.horiz !== k.horiz || o.car.dir !== k.dir) continue;
        const oa = k.horiz ? (o.x - c.x) * k.dir : (o.y - c.y) * k.dir;
        const ol = k.horiz ? Math.abs(o.y - c.y) : Math.abs(o.x - c.x);
        if (ol < 10 && oa > 0 && oa < 70) target = Math.min(target, o.car.cur * 0.9);
      }
      k.cur += (target - k.cur) * Math.min(1, dt * 3);
      if (k.horiz) c.x += k.cur * k.dir * dt; else c.y += k.cur * k.dir * dt;
      const pos = k.horiz ? c.x : c.y;
      if (pos > k.max + 40) { if (k.horiz) c.x = k.min - 40; else c.y = k.min - 40; }
      if (pos < k.min - 40) { if (k.horiz) c.x = k.max + 40; else c.y = k.max + 40; }
      // collision with player
      if (this.hitCooldown <= 0 && k.cur > 40) {
        const dx = Math.abs(p.x - c.x), dy = Math.abs(p.y - c.y);
        const hw = k.horiz ? 24 : 12, hh = k.horiz ? 12 : 24;
        if (dx < hw + 10 && dy < hh + 10) {
          this.hitCooldown = 1.5;
          const st = S.getState();
          st.stats.health = Math.max(0, st.stats.health - 10);
          if (k.horiz) p.y += (p.y < c.y ? -40 : 40); else p.x += (p.x < c.x ? -40 : 40);
          this.cameras.main.shake(200, 0.01);
          S.bus.emit('toast', { text: `🚗 ${t('carHit')} −10 ❤️`, kind: 'bad' });
          S.bus.emit('change');
        }
      }
    }
  }

  // ── Cameras / minimap / night ─────────────────────────────────
  setupCameras() {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD.width, WORLD.height);
    cam.startFollow(this.player, true, 0.12, 0.12);
    cam.setZoom(window.innerWidth > 1400 ? 1.15 : 1);
    this.night = this.add.rectangle(0, 0, 10, 10, 0x0a1640, 0).setOrigin(0).setScrollFactor(0).setDepth(50);
    this.mini = this.cameras.add(0, 0, 200, 158).setZoom(200 / WORLD.width).setBackgroundColor(0x1e272e).setName('mini');
    this.mini.centerOn(WORLD.width / 2, WORLD.height / 2);
    this.miniDot = this.add.circle(0, 0, 42, 0xff3b3b).setStrokeStyle(10, 0xffffff).setDepth(60);
    this.miniTarget = this.add.circle(0, 0, 50, 0xffd32a).setDepth(60);
    cam.ignore([this.miniDot, this.miniTarget]);
    this.mini.ignore([this.night, ...this.texts]);
  }

  layout() {
    const w = this.scale.width, hgt = this.scale.height;
    this.mini.setPosition(w - 214, hgt - 172);
    this.night.setSize(w / this.cameras.main.zoom + 200, hgt / this.cameras.main.zoom + 200).setPosition(-100, -100);
  }

  setupGPS() {
    this.arrow = this.add.image(0, 0, 'arrow').setDepth(20).setVisible(false);
    this.targetRing = this.add.circle(0, 0, 26).setStrokeStyle(4, 0xffd32a).setDepth(4).setVisible(false);
    this.tweens.add({ targets: this.targetRing, scale: 1.5, alpha: 0.3, yoyo: true, repeat: -1, duration: 700 });
    this.mini.ignore([this.arrow, this.targetRing]);
  }

  teleport(x, y) {
    this.player.setPosition(x, y);
    this.player.body.reset(x, y);
    S.setPosition(x, y);
  }

  // Speech bubble above a player (id 'me' = local player)
  bubble(id, text) {
    const prev = this.bubbles.get(id);
    if (prev) prev.destroy();
    const b = this.add.text(0, 0, text.length > 90 ? text.slice(0, 88) + '…' : text, { fontFamily: 'system-ui', fontSize: '12px', color: '#111', backgroundColor: '#ffffffee', padding: { x: 6, y: 4 }, wordWrap: { width: 180 } }).setOrigin(0.5, 1).setDepth(40);
    this.mini.ignore(b);
    this.bubbles.set(id, b);
    this.time.delayedCall(7000, () => { if (this.bubbles.get(id) === b) { b.destroy(); this.bubbles.delete(id); } });
  }

  syncRemotePlayers() {
    for (const [id, o] of others) {
      let r = this.remote.get(id);
      if (!r) {
        const sp = this.add.image(o.x, o.y, 'person').setTint(o.color || 0xffffff).setDepth(10);
        const tag = this.label(o.x, o.y - 24, `${o.name} · ${o.level}`, 11, '#9ff', '#00336688');
        const dot = this.add.circle(o.x, o.y, 36, 0x22d3ee).setDepth(59);
        this.cameras.main.ignore(dot);
        r = { sp, tag, dot };
        this.remote.set(id, r);
      }
      r.sp.x += (o.x - r.sp.x) * 0.25; r.sp.y += (o.y - r.sp.y) * 0.25;
      r.sp.rotation = o.dir || 0;
      r.tag.setPosition(r.sp.x, r.sp.y - 24).setText(`${o.name} · ${o.level}`);
      r.dot.setPosition(r.sp.x, r.sp.y);
      const b = this.bubbles.get(id);
      if (b) b.setPosition(r.sp.x, r.sp.y - 34);
    }
    for (const [id, r] of this.remote) if (!others.has(id)) { r.sp.destroy(); r.tag.destroy(); r.dot.destroy(); this.remote.delete(id); }
  }

  // ── Main loop ─────────────────────────────────────────────────
  update(time, deltaMs) {
    const st = S.getState();
    if (!st) return;
    const dt = deltaMs / 1000;
    const blocking = ui.isBlocking() || st.gameOver;
    const k = this.keys;
    let vx = 0, vy = 0;
    if (!blocking && !ui.isTyping()) {
      if (k.A.isDown || k.LEFT.isDown) vx -= 1;
      if (k.D.isDown || k.RIGHT.isDown) vx += 1;
      if (k.W.isDown || k.UP.isDown) vy -= 1;
      if (k.S.isDown || k.DOWN.isDown) vy += 1;
    }
    const moving = vx || vy;
    const running = moving && k.SHIFT.isDown && st.stats.energy > 5;
    const speed = running ? RUN : WALK;
    const len = Math.hypot(vx, vy) || 1;
    this.player.setVelocity((vx / len) * speed, (vy / len) * speed);
    if (moving) this.player.rotation = Math.atan2(vy, vx);
    this.nameTag.setPosition(this.player.x, this.player.y - 24);
    const myBubble = this.bubbles.get('me');
    if (myBubble) myBubble.setPosition(this.player.x, this.player.y - 34);

    this.updatePedestrians(dt);
    this.updateCars(dt);
    this.hitCooldown -= dt;
    this.syncRemotePlayers();

    // time passes (1 real second = 1.5 game minutes) unless in a menu/dialog
    if (!blocking) {
      this.acc += deltaMs;
      if (this.acc >= 1000) { S.tick(1.5 * this.acc / 1000, { running }); this.acc = 0; this.updateNight(); }
    }
    this.saveAcc += deltaMs;
    if (this.saveAcc > 5000) { this.saveAcc = 0; S.setPosition(this.player.x, this.player.y); S.save(); }

    sendMove(this.player.x, this.player.y, this.player.rotation, S.levelFor(st.xp).id);
    this.updateInteraction(blocking);
    this.updateGPS();
    this.miniDot.setPosition(this.player.x, this.player.y);
  }

  updateNight() {
    const m = S.getState().time.minutes / 60;
    let a = 0;
    if (m >= 20 || m < 5) a = 0.5; else if (m >= 18) a = ((m - 18) / 2) * 0.5; else if (m < 7) a = (1 - (m - 5) / 2) * 0.5;
    this.night.fillAlpha = a;
  }

  updateInteraction(blocking) {
    if (blocking) { ui.prompt(null); this.nearest = null; return; }
    const p = this.player;
    let best = null, bestD = 56;
    for (const l of LOCATIONS) {
      for (const pt of l.id === 'airport' ? [l.door, TAXI_STAND] : [l.door]) {
        const d = Math.hypot(pt.x - p.x, pt.y - p.y);
        if (d < bestD + (pt === TAXI_STAND ? 20 : 0)) { bestD = d; best = { type: 'location', id: l.id, text: `${t('enter')} ${l.icon} ${l.name}` }; }
      }
    }
    for (const s of this.peds) {
      const d = Math.hypot(s.x - p.x, s.y - p.y);
      if (d < bestD) { bestD = d; best = { type: 'ped', ped: s.npc, text: `${t("talk")} ${s.npc.emoji} ${s.npc.name}` }; this.talkCandidate = s; }
    }
    if (best?.type === 'ped') this.talkingTo = this.talkCandidate;
    this.nearest = best;
    ui.prompt(best ? best.text : null);
  }

  updateGPS() {
    const m = S.trackedMission();
    const target = m && S.missionTarget(m);
    if (!target) { this.arrow.setVisible(false); this.targetRing.setVisible(false); this.miniTarget.setVisible(false); return; }
    this.targetRing.setVisible(true).setPosition(target.x, target.y);
    this.miniTarget.setVisible(true).setPosition(target.x, target.y);
    const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, target.x, target.y);
    const a = Math.atan2(target.y - this.player.y, target.x - this.player.x);
    this.arrow.setVisible(d > 140).setPosition(this.player.x + Math.cos(a) * 46, this.player.y + Math.sin(a) * 46).setRotation(a);
  }
}
