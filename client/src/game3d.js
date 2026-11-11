// The game in 3D (third view of V): the Three.js city of the viewer with a camera that follows the
// player from behind, and the player, people, cars and other players as small 3D figures. Like first
// person, it only draws: the top-down game keeps running underneath and decides everything.
// Loaded only when first used, so Three.js does not slow down the start of the game.
import { ThreeView, THREE, label } from './viewer/three-view.js';
import { buildScene, cameraBehind, kerbside } from '../../shared/scene.js';
import { person, car, walk } from './viewer/models.js';
import { ViewLayer } from './firstperson.js';

const at = (x, y, z = 0) => new THREE.Vector3(x, z, y);
const SIZE = 1.25;                 // people a little bigger than life, so arms and legs read from the camera
const figure = (colour, seed) => { const p = person(colour, seed); p.scale.setScalar(SIZE); return p; };

export class Game3D {
  constructor(pack) {
    this.scene = buildScene(pack);
    this.layer = new ViewLayer(this.scene, { crosshair: false });
    this.view = new ThreeView(this.layer.stage, this.scene, { orbit: false, marker: false, signs: 'small' });
    this.canvas = this.view.renderer.domElement;
    this.canvas.classList.add('fp-view');
    this.view.camera.fov = 60; this.view.camera.near = 2;
    this.view.camera.updateProjectionMatrix();
    this.view.scene3.fog = new THREE.Fog('#bfe3ff', 600, 1700);
    this.things = new Map();                                       // id → { group, kind, label?, say? }
    this.me = figure('#ffffff', 'me');
    this.view.scene3.add(this.me);
    this.camPos = null;
    this.day = { sky: this.view.sky.intensity, sun: this.view.sun.intensity, bg: new THREE.Color('#bfe3ff'), night: new THREE.Color('#0d1a3a') };
  }

  show(on) { this.layer.show(on); if (on) this.view.resize(); }

  // Make, move or remove the figure of everything that moves.
  sync(moving) {
    const seen = new Set();
    for (const m of moving) {
      seen.add(m.id);
      let t = this.things.get(m.id);
      if (!t) {
        const group = m.kind === 'car' ? car(m.color, { taxi: m.id === 'taxi' }) : figure(m.color, m.id);
        t = { group, kind: m.kind, x: m.x, y: m.y };
        this.view.scene3.add(group);
        this.things.set(m.id, t);
      }
      if (t.text !== m.label) {                                    // name tags change rarely
        if (t.label) { t.group.remove(t.label); t.label.material.map.dispose(); }
        t.label = m.label ? label(m.label, m.kind === 'car' ? '#ffd32a' : m.color) : null;
        if (t.label) { t.label.material.depthTest = true; t.label.scale.multiplyScalar(0.2); t.label.position.y = m.kind === 'car' ? 14 : 13.5; t.group.add(t.label); }
        t.text = m.label;
      }
      if (t.sayText !== m.say) {                                   // what another player just said
        if (t.say) { t.group.remove(t.say); t.say.material.map.dispose(); }
        t.say = m.say ? label(`💬 ${m.say.length > 60 ? m.say.slice(0, 58) + '…' : m.say}`, '#ffffff') : null;
        if (t.say) { t.say.scale.multiplyScalar(0.22); t.say.position.y = 19; t.group.add(t.say); }
        t.sayText = m.say;
      }
      let { x, y, angle = 0 } = m;
      if (m.id === 'taxi') ({ x, y, angle } = this.taxiSpot ||= kerbside(this.scene, m.x, m.y));   // parked at the kerb
      if (t.kind === 'person') {
        const speed = Math.hypot(x - t.x, y - t.y) / Math.max(this.dt, 1e-3);
        walk(t.group, speed, this.dt);
        if (speed > 3) t.group.rotation.y = -Math.atan2(y - t.y, x - t.x);   // face where they walk
      } else t.group.rotation.y = -angle;
      t.x = x; t.y = y;
      t.group.position.copy(at(x, y));
    }
    for (const [id, t] of this.things) {
      if (seen.has(id)) continue;
      this.view.scene3.remove(t.group);
      this.things.delete(id);
    }
  }

  // One frame: same inputs as FirstPerson.frame, plus each moving thing has an `id` (and cars an `angle`).
  frame({ me, moving, night = 0, target = null, others = [], dt = 1 / 60, colour }) {
    this.dt = dt;
    this.sync(moving);
    if (colour && this.meColour !== colour) {                      // my clothes in my colour
      this.view.scene3.remove(this.me);
      this.me = figure(colour, 'me');
      this.view.scene3.add(this.me);
      this.meColour = colour;
    }
    const mySpeed = this.mePrev ? Math.hypot(me.x - this.mePrev.x, me.y - this.mePrev.y) / Math.max(dt, 1e-3) : 0;
    walk(this.me, mySpeed, dt);
    this.mePrev = { x: me.x, y: me.y };
    this.me.position.copy(at(me.x, me.y));
    this.me.rotation.y = -me.a;

    // the camera eases into place behind the player, never inside a building
    const goal = cameraBehind(this.scene, me.x, me.y, me.a, 50, 25);
    const k = this.camPos ? 1 - Math.exp(-dt * 6) : 1;
    this.camPos = this.camPos ? { x: this.camPos.x + (goal.x - this.camPos.x) * k, y: this.camPos.y + (goal.y - this.camPos.y) * k, z: this.camPos.z + (goal.z - this.camPos.z) * k } : goal;
    const cam = this.view.camera;
    cam.position.copy(at(this.camPos.x, this.camPos.y, this.camPos.z));
    cam.lookAt(at(me.x + Math.cos(me.a) * 30, me.y + Math.sin(me.a) * 30, 10));

    // night: dimmer light and a dark sky (night is 0…0.5, as in the view from above)
    const n = Math.min(1, night * 2);
    this.view.sky.intensity = this.day.sky * (1 - 0.65 * n);
    this.view.sun.intensity = this.day.sun * (1 - 0.85 * n);
    this.view.scene3.background = this.day.bg.clone().lerp(this.day.night, n);
    this.view.scene3.fog.color.copy(this.view.scene3.background);
    this.view.setNight(n);
    for (const t of this.things.values()) for (const l of t.group.userData.lights || []) l.material.emissiveIntensity = 0.2 + n;

    this.view.render();
    this.layer.update({ me, target, others });
  }

  destroy() { this.view.dispose(); this.layer.destroy(); }
}
