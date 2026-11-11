// The city in 3D with Three.js: the ground (grass, roads, park) is painted from the scene, every
// building is a box as tall as its floors, with windows, a door and its name floating above it.
import * as THREE from 'three';
export { THREE };
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { paintGround } from './ground.js';
import { lampGeometries } from './models.js';

// The map's x/y become Three's x/z; heights go up the y axis.
const at = (x, y, z = 0) => new THREE.Vector3(x, z, y);

function groundTexture(scene) {
  const tex = new THREE.CanvasTexture(paintGround(scene, Math.min(1, 2048 / Math.max(scene.width, scene.height))));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// One cell of wall by one storey, with a framed window. `kind`: 'lit' (warm, people inside), 'glass'
// (offices: blue glass) or 'glow' (the light the window gives off at night: black except the glass).
function windowTexture(kind) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const glow = kind === 'glow';
  g.fillStyle = glow ? '#000' : '#ffffff'; g.fillRect(0, 0, 64, 64);
  if (!glow) {
    g.fillStyle = 'rgba(0,0,0,0.13)'; g.fillRect(0, 0, 64, 3);                    // line between floors
    g.fillStyle = '#f4f1ea'; g.fillRect(15, 15, 34, 37);                          // frame
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(13, 51, 38, 4);                  // sill
  }
  const grad = g.createLinearGradient(0, 18, 0, 49);
  if (kind === 'glass') { grad.addColorStop(0, '#9cc3e6'); grad.addColorStop(1, '#3d5a78'); }
  else { grad.addColorStop(0, '#ffe7a3'); grad.addColorStop(1, '#f5c56a'); }
  g.fillStyle = grad; g.fillRect(18, 18, 28, 31);
  if (!glow) { g.fillStyle = '#e8e4da'; g.fillRect(31, 18, 2, 31); g.fillRect(18, 32, 28, 2); }   // glazing bars
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// The ground floor of a shop: big windows in frames, repeated along the front.
function shopTexture(glow) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = glow ? '#000' : '#ffffff'; g.fillRect(0, 0, 64, 64);
  if (!glow) { g.fillStyle = '#efece4'; g.fillRect(3, 10, 58, 48); }
  const grad = g.createLinearGradient(0, 13, 0, 55);
  grad.addColorStop(0, glow ? '#ffe2a0' : '#bcd8ee'); grad.addColorStop(1, glow ? '#f0b860' : '#6f8fab');
  g.fillStyle = grad; g.fillRect(6, 13, 52, 42);
  if (!glow) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 58, 64, 6); }       // plinth
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function label(text, colour = '#ffd32a') {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const font = 'bold 44px system-ui, "Segoe UI", Helvetica, Arial, sans-serif';
  g.font = font;
  c.width = Math.ceil(g.measureText(text).width) + 40; c.height = 72;
  g.font = font;
  g.fillStyle = 'rgba(30,39,46,0.82)';
  g.beginPath(); g.roundRect(0, 0, c.width, c.height, 18); g.fill();
  g.fillStyle = colour; g.fillRect(0, c.height - 8, c.width, 8);
  g.fillStyle = '#ffffff'; g.textBaseline = 'middle'; g.fillText(text, 20, 38);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sprite.scale.set(c.width / 2.2, c.height / 2.2, 1);
  sprite.renderOrder = 10;
  return sprite;
}

export class ThreeView {
  // `orbit`: turn the camera with the mouse (city viewer); off when the game moves the camera itself.
  // `signs`: 'big' names floating over the city (viewer) or 'small' ones over the doors (game).
  constructor(container, scene, { orbit = true, marker = true, signs = 'big' } = {}) {
    this.container = container;
    this.signs = signs;
    this.glowing = [];                                               // materials that light up at night
    this.scene3 = new THREE.Scene();
    this.scene3.background = new THREE.Color('#bfe3ff');
    this.scene3.fog = new THREE.Fog('#bfe3ff', 2500, 6000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.append(this.renderer.domElement);

    const { width: W, height: H } = scene;
    this.camera = new THREE.PerspectiveCamera(45, 1, 5, 12000);
    this.camera.position.copy(at(W * 0.5, H * 1.35, Math.max(W, H) * 0.75));
    if (orbit) {
      this.controls = new OrbitControls(this.camera, this.renderer.domElement);
      this.controls.target.copy(at(W / 2, H / 2));
      this.controls.maxPolarAngle = Math.PI * 0.47;                  // never under the ground
      this.controls.minDistance = 80; this.controls.maxDistance = Math.max(W, H) * 2.2;
      this.controls.enableDamping = true;
    }

    // light: sky and ground, plus a sun that casts shadows over the whole map
    this.sky = new THREE.HemisphereLight('#ffffff', '#6a8f6b', 1.3);
    this.scene3.add(this.sky);
    const sun = this.sun = new THREE.DirectionalLight('#fff4e0', 2.2);
    sun.position.copy(at(W * 0.2, -H * 0.3, 1400));
    sun.target.position.copy(at(W / 2, H / 2));
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -W * 0.8, right: W * 0.8, top: H * 0.8, bottom: -H * 0.8, near: 100, far: 4000 });
    sun.shadow.bias = -0.0005;
    this.scene3.add(sun, sun.target);

    const groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshLambertMaterial({ map: groundTexture(scene) }));
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.copy(at(W / 2, H / 2));
    groundMesh.receiveShadow = true;
    this.scene3.add(groundMesh);

    this.sceneData = scene;
    this.addBuildings(scene);
    this.addProps(scene.props);
    if (marker) this.addMarker(scene.spawn, '#eb4d4b');

    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    this.resize();
  }

  addBuildings(scene) {
    const tex = { lit: windowTexture('lit'), glass: windowTexture('glass'), glow: windowTexture('glow'), shop: shopTexture(false), shopGlow: shopTexture(true) };
    const { cell } = scene;
    const STOREY = scene.blocks[0] ? scene.blocks[0].top / scene.blocks[0].floors : 15;
    const tiled = (base, across, up) => { const t = base.clone(); t.needsUpdate = true; t.repeat.set(across, up); return t; };
    // a box whose four walls repeat `texture` once per cell across and once per storey up
    const walls = (b, h, texture, glow, colour, roofColour) => {
      const make = (across) => {
        const m = new THREE.MeshLambertMaterial({ color: colour, map: tiled(texture, across / cell, h / STOREY) });
        if (glow) { m.emissive = new THREE.Color('#ffd27a'); m.emissiveMap = tiled(glow, across / cell, h / STOREY); m.emissiveIntensity = 0; this.glowing.push(m); }
        return m;
      };
      const roof = new THREE.MeshLambertMaterial({ color: roofColour });
      const x = make(b.h), z = make(b.w);
      return new THREE.Mesh(new THREE.BoxGeometry(b.w, h, b.h), [x, x, roof, roof, z, z]);
    };
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const b of scene.blocks) {
      const place = b.kind === 'place';
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      // ground floor: a shop front for places; upper floors: windows
      const groundH = place ? STOREY : 0;
      if (place) {
        const shop = walls(b, groundH, tex.shop, tex.shopGlow, b.color, b.roof);
        shop.position.copy(at(cx, cy, groundH / 2)); shop.castShadow = shop.receiveShadow = true;
        this.scene3.add(shop);
      }
      const upper = b.top - groundH;
      if (upper > 0) {
        const body = walls(b, upper, place ? tex.lit : tex.glass, tex.glow, b.color, b.roof);
        body.position.copy(at(cx, cy, groundH + upper / 2)); body.castShadow = body.receiveShadow = true;
        this.scene3.add(body);
      }
      // a parapet around the roof, and for big buildings some machinery on top
      const lip = new THREE.MeshLambertMaterial({ color: b.roof });
      for (const [w, d, x, y] of [[b.w, 1.2, cx, b.y + 0.6], [b.w, 1.2, cx, b.y + b.h - 0.6], [1.2, b.h, b.x + 0.6, cy], [1.2, b.h, b.x + b.w - 0.6, cy]]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, 2.4, d), lip);
        m.position.copy(at(x, y, b.top + 1.2));
        this.scene3.add(m);
      }
      if (!place && b.w > 80 && b.h > 80) {
        const grey = new THREE.MeshLambertMaterial({ color: '#8e979f' });
        for (let i = 0; i < 2 + Math.floor(rnd() * 3); i++) {
          const unit = new THREE.Mesh(new THREE.BoxGeometry(8 + rnd() * 10, 4 + rnd() * 4, 8 + rnd() * 10), grey);
          unit.position.copy(at(b.x + 15 + rnd() * (b.w - 30), b.y + 15 + rnd() * (b.h - 30), b.top + 3));
          unit.castShadow = true;
          this.scene3.add(unit);
        }
        if (rnd() < 0.5) {
          const tank = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 9, 14), new THREE.MeshLambertMaterial({ color: '#7f8c8d' }));
          tank.position.copy(at(b.x + 20 + rnd() * (b.w - 40), b.y + 20 + rnd() * (b.h - 40), b.top + 4.5));
          this.scene3.add(tank);
        }
      }

      if (!place) continue;
      const d = b.door;
      const along = d.side === 'top' || d.side === 'bottom';
      const out = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] }[d.side];
      const face = { top: [d.x, b.y], bottom: [d.x, b.y + b.h], left: [b.x, d.y], right: [b.x + b.w, d.y] }[d.side];
      const turn = { top: Math.PI, bottom: 0, left: -Math.PI / 2, right: Math.PI / 2 }[d.side];
      // the door, in a light frame
      const frame = new THREE.Mesh(new THREE.PlaneGeometry(cell * 1.05, 12.6), new THREE.MeshLambertMaterial({ color: '#efece4' }));
      frame.position.copy(at(face[0] + out[0] * 0.5, face[1] + out[1] * 0.5, 6.3)); frame.rotation.y = turn;
      const door = new THREE.Mesh(new THREE.PlaneGeometry(cell * 0.8, 11.4), new THREE.MeshLambertMaterial({ color: '#4a3022' }));
      door.position.copy(at(face[0] + out[0] * 0.6, face[1] + out[1] * 0.6, 5.7)); door.rotation.y = turn;
      this.scene3.add(frame, door);
      // a striped awning along the shop front
      const len = along ? b.w : b.h;
      const c = document.createElement('canvas'); c.width = 64; c.height = 8;
      const g = c.getContext('2d');
      for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f5f3ee' : b.roof; g.fillRect(i * 8, 0, 8, 8); }
      const stripes = new THREE.CanvasTexture(c); stripes.colorSpace = THREE.SRGBColorSpace;
      stripes.wrapS = THREE.RepeatWrapping; stripes.repeat.set(len / 40, 1);
      const awning = new THREE.Mesh(new THREE.PlaneGeometry(len, 7), new THREE.MeshLambertMaterial({ map: stripes, side: THREE.DoubleSide }));
      const mid = along ? [cx, face[1]] : [face[0], cy];
      awning.position.copy(at(mid[0] + out[0] * 3, mid[1] + out[1] * 3, STOREY - 1.5));
      awning.rotation.order = 'YXZ'; awning.rotation.y = turn; awning.rotation.x = -Math.PI / 2 + 0.55;
      awning.castShadow = true;
      this.scene3.add(awning);

      const sign = label(`${b.icon} ${b.short}`.trim(), b.color);
      if (this.signs === 'small') {
        sign.material.depthTest = true;
        sign.scale.multiplyScalar(0.16);                             // a shop sign above the awning
        sign.position.copy(at(face[0] + out[0] * 1.5, face[1] + out[1] * 1.5, STOREY + 4));
      } else sign.position.copy(at(cx, cy, b.top + 30));
      this.scene3.add(sign);
    }
  }

  // Night: windows and lamps glow (0 = day … 1 = deep night).
  setNight(n) { for (const m of this.glowing) m.emissiveIntensity = n * 0.95; }

  addProps(props) {
    const trees = props.filter(p => p.kind === 'tree'), lamps = props.filter(p => p.kind === 'lamp');
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
    const many = (geometry, material, list, place, shadow = false) => {
      const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, list.length));
      mesh.count = list.length;
      list.forEach((p, i) => mesh.setMatrixAt(i, place(p)));
      mesh.castShadow = shadow;
      this.scene3.add(mesh);
      return mesh;
    };
    const plain = (x, y, z = 0) => m.makeTranslation(x, z, y).clone();
    many(new THREE.CylinderGeometry(1.6, 2.2, 12), new THREE.MeshLambertMaterial({ color: '#6b4a2f' }), trees, p => plain(p.x, p.y, 6));
    many(new THREE.IcosahedronGeometry(12, 1), new THREE.MeshLambertMaterial({ color: '#2f6b45', flatShading: true }), trees, p => plain(p.x, p.y, 24), true);
    many(new THREE.IcosahedronGeometry(8, 1), new THREE.MeshLambertMaterial({ color: '#3f8a58', flatShading: true }), trees, p => plain(p.x + 4, p.y - 3, 31), true);
    // a lamp's arm points over the road: turn each lamp towards the nearest road
    const roads = this.sceneData.roads;
    const facing = p => {
      let best = Infinity, ang = 0;
      for (const r of roads) {
        const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.w)), dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.h));
        const d = Math.hypot(dx, dy);
        if (d < best) { best = d; ang = r.w > r.h ? (p.y < r.y ? Math.PI / 2 : -Math.PI / 2) : (p.x < r.x ? 0 : Math.PI); }
      }
      return m.compose(new THREE.Vector3(p.x, 0, p.y), q.setFromAxisAngle(up, -ang), one).clone();
    };
    const { pole, arm, head } = lampGeometries();
    const metal = new THREE.MeshLambertMaterial({ color: '#2f3640' });
    many(pole, metal, lamps, facing);
    many(arm, metal, lamps, facing);
    const bulb = new THREE.MeshLambertMaterial({ color: '#fff3c4', emissive: '#ffd27a', emissiveIntensity: 0 });
    this.glowing.push(bulb);
    many(head, bulb, lamps, facing);
  }

  addMarker(pt, colour) {
    const pin = new THREE.Mesh(new THREE.ConeGeometry(7, 22, 16), new THREE.MeshLambertMaterial({ color: colour }));
    pin.rotation.x = Math.PI;
    pin.position.copy(at(pt.x, pt.y, 16));
    this.scene3.add(pin);
  }

  resize() {
    const w = this.container.clientWidth || 800, h = this.container.clientHeight || 600;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%'; this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render() {
    this.controls?.update();
    this.renderer.render(this.scene3, this.camera);
  }

  dispose() {
    window.removeEventListener('resize', this.resize);
    this.controls?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
