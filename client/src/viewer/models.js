// Little 3D models built in code (no files to download): people with arms and legs that swing when
// they walk, cars with a proper shape, a taxi with its roof sign, and street lamps that light up at night.
// Sizes follow the map: 5 px = 1 metre. Everything faces +x (the map's "angle 0").
import * as THREE from 'three';

const mat = new Map();                                   // one material per colour, shared by every model
const lambert = (color, extra = {}) => {
  const key = color + JSON.stringify(extra);
  if (!mat.has(key)) mat.set(key, new THREE.MeshLambertMaterial({ color, ...extra }));
  return mat.get(key);
};
const box = (w, h, d, material) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);

const SKIN = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#a1665e'];
const HAIR = ['#2b1b10', '#4a2c17', '#151515', '#a0522d', '#d8b26e', '#6b4423'];
const LEGS = ['#2d3436', '#1e3a5f', '#4b4b4b', '#3d2b1f', '#2c3e50'];
const pick = (list, seed) => list[Math.abs(seed) % list.length];
const hash = s => [...String(s)].reduce((n, c) => (n * 31 + c.charCodeAt(0)) | 0, 7);

// A person about 1.9 m tall. Call `walk(person, speed, dt)` every frame to swing arms and legs.
export function person(colour, seed = colour) {
  const h = hash(seed);
  const skin = lambert(pick(SKIN, h)), cloth = lambert(colour), legs = lambert(pick(LEGS, h >> 3)), hair = lambert(pick(HAIR, h >> 5));
  const g = new THREE.Group();
  const limb = (w, len, d, material, x, y, z) => {        // hangs from a joint so it can swing
    const joint = new THREE.Group();
    joint.position.set(x, y, z);
    const m = box(w, len, d, material);
    m.position.y = -len / 2;
    m.castShadow = true;
    joint.add(m);
    g.add(joint);
    return joint;
  };
  const legL = limb(1.1, 4.3, 1.2, legs, 0, 4.4, 0.7), legR = limb(1.1, 4.3, 1.2, legs, 0, 4.4, -0.7);
  for (const leg of [legL, legR]) { const shoe = box(1.7, 0.6, 1.25, lambert('#1b1b1b')); shoe.position.set(0.3, -4.1, 0); leg.add(shoe); }
  const torso = box(1.4, 3.7, 2.7, cloth); torso.position.y = 6.2; torso.castShadow = true;
  const neck = box(0.6, 0.5, 0.6, skin); neck.position.y = 8.25;
  const head = new THREE.Mesh(new THREE.SphereGeometry(1.15, 14, 12), skin); head.position.y = 9.2; head.castShadow = true;
  const top = new THREE.Mesh(new THREE.SphereGeometry(1.22, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
  top.position.set(-0.12, 9.3, 0); top.rotation.z = 0.35;
  const eyes = box(0.15, 0.25, 0.9, lambert('#1b1b1b')); eyes.position.set(1.08, 9.35, 0);
  const armL = limb(0.85, 3.5, 0.85, cloth, 0, 7.8, 1.8), armR = limb(0.85, 3.5, 0.85, cloth, 0, 7.8, -1.8);
  for (const arm of [armL, armR]) { const hand = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), skin); hand.position.y = -3.7; arm.add(hand); }
  g.add(torso, neck, head, top, eyes);
  g.userData = { legL, legR, armL, armR, phase: 0, swing: 0 };
  return g;
}

export function walk(p, speed, dt) {
  const u = p.userData;
  const target = Math.min(1, speed / 60);                  // 0 standing … 1 walking briskly
  u.swing += (target - u.swing) * Math.min(1, dt * 8);
  u.phase += dt * (4 + speed / 18);
  const a = Math.sin(u.phase) * 0.7 * u.swing;
  // limbs swing forward/back around the sideways (z) axis
  u.legL.rotation.z = a; u.legR.rotation.z = -a;
  u.armL.rotation.z = -a * 0.8; u.armR.rotation.z = a * 0.8;
}

// The side of a car, drawn as a shape and pushed out to its width.
function carShape() {
  const s = new THREE.Shape();
  s.moveTo(-11, 1.4); s.lineTo(11, 1.4); s.lineTo(11.2, 3.9); s.lineTo(9.5, 4.7); s.lineTo(4.2, 5.1);
  s.lineTo(1.6, 7.7); s.lineTo(-5.2, 7.7); s.lineTo(-7.6, 5.1); s.lineTo(-11, 4.7); s.closePath();
  return s;
}
function glassShape() {
  const s = new THREE.Shape();
  s.moveTo(4.5, 5.0); s.lineTo(1.75, 7.45); s.lineTo(-5.05, 7.45); s.lineTo(-7.45, 5.0); s.closePath();
  return s;
}
let carGeo = null;
function carGeometry() {
  if (carGeo) return carGeo;
  const body = new THREE.ExtrudeGeometry(carShape(), { depth: 9.4, bevelEnabled: true, bevelSize: 0.35, bevelThickness: 0.35, bevelSegments: 2 });
  body.translate(0, 0, -4.7);
  const glass = new THREE.ExtrudeGeometry(glassShape(), { depth: 10.1, bevelEnabled: false });
  glass.translate(0, 0, -5.05);
  const wheel = new THREE.CylinderGeometry(1.95, 1.95, 1.3, 16);
  wheel.rotateX(Math.PI / 2);
  const hub = new THREE.CylinderGeometry(0.9, 0.9, 1.4, 10);
  hub.rotateX(Math.PI / 2);
  carGeo = { body, glass, wheel, hub, light: new THREE.BoxGeometry(0.4, 0.8, 1.6) };
  return carGeo;
}

export function car(colour, { taxi = false } = {}) {
  const geo = carGeometry();
  const g = new THREE.Group();
  const body = new THREE.Mesh(geo.body, lambert(colour)); body.castShadow = true;
  const glass = new THREE.Mesh(geo.glass, lambert('#22313f'));
  g.add(body, glass);
  for (const [x, z] of [[-7, 4.8], [7, 4.8], [-7, -4.8], [7, -4.8]]) {
    const w = new THREE.Mesh(geo.wheel, lambert('#151515')); w.position.set(x, 1.95, z);
    const hb = new THREE.Mesh(geo.hub, lambert('#b2bec3')); hb.position.set(x, 1.95, z);
    g.add(w, hb);
  }
  const lights = [];
  for (const z of [3.2, -3.2]) {
    const head = new THREE.Mesh(geo.light, lambert('#fffbe0', { emissive: '#fff3b0', emissiveIntensity: 0.2 })); head.position.set(11.25, 3.4, z);
    const tail = new THREE.Mesh(geo.light, lambert('#c0392b', { emissive: '#ff2020', emissiveIntensity: 0.2 })); tail.position.set(-11.25, 3.6, z);
    g.add(head, tail); lights.push(head, tail);
  }
  if (taxi) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 40;
    const x = c.getContext('2d');
    x.fillStyle = '#ffd32a'; x.fillRect(0, 0, 128, 40);
    x.fillStyle = '#111'; x.font = 'bold 30px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('TAXI', 64, 22);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.3, 4.6), [lambert('#ffd32a'), lambert('#ffd32a'), lambert('#ffd32a'), lambert('#ffd32a'),
      new THREE.MeshLambertMaterial({ map: tex, emissive: '#ffd32a', emissiveMap: tex, emissiveIntensity: 0.25 }), new THREE.MeshLambertMaterial({ map: tex, emissive: '#ffd32a', emissiveMap: tex, emissiveIntensity: 0.25 })]);
    sign.position.set(-1.6, 8.4, 0); sign.rotation.y = Math.PI / 2;
    g.add(sign);
    const stripe = box(22.2, 0.6, 9.9, lambert('#111')); stripe.position.y = 3.6;
    g.add(stripe);
  }
  g.userData.lights = lights;
  return g;
}

// A street lamp: pole, arm and a head that glows at night (see setNight).
export function lampGeometries() {
  const pole = new THREE.CylinderGeometry(0.35, 0.5, 26, 8); pole.translate(0, 13, 0);
  const arm = new THREE.BoxGeometry(5, 0.5, 0.5); arm.translate(2.2, 25.5, 0);
  const head = new THREE.BoxGeometry(2.6, 0.9, 1.6); head.translate(4.6, 25, 0);
  return { pole, arm, head };
}
