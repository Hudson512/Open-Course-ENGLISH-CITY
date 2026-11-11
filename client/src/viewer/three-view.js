// The city in 3D with Three.js: the ground (grass, roads, park) is painted from the scene, every
// building is a box as tall as its floors, with windows, a door and its name floating above it.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { paintGround } from './ground.js';

// The map's x/y become Three's x/z; heights go up the y axis.
const at = (x, y, z = 0) => new THREE.Vector3(x, z, y);

function groundTexture(scene) {
  const tex = new THREE.CanvasTexture(paintGround(scene, Math.min(1, 2048 / Math.max(scene.width, scene.height))));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// One storey of wall with a window, repeated across the building.
function windowTexture(lit) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = lit ? '#ffe9a8' : '#3d4f63'; g.fillRect(18, 20, 28, 28);
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(18, 46, 28, 4);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function label(text, colour) {
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
  constructor(container, scene) {
    this.container = container;
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
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(at(W / 2, H / 2));
    this.controls.maxPolarAngle = Math.PI * 0.47;                    // never under the ground
    this.controls.minDistance = 80; this.controls.maxDistance = Math.max(W, H) * 2.2;
    this.controls.enableDamping = true;

    // light: sky and ground, plus a sun that casts shadows over the whole map
    this.scene3.add(new THREE.HemisphereLight('#ffffff', '#6a8f6b', 1.3));
    const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
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

    this.addBuildings(scene);
    this.addProps(scene.props);
    this.addMarker(scene.spawn, '#eb4d4b');

    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    this.resize();
  }

  addBuildings(scene) {
    const lit = windowTexture(true), dark = windowTexture(false);
    const { cell } = scene;
    for (const b of scene.blocks) {
      const tex = (b.kind === 'place' ? lit : dark).clone();
      tex.needsUpdate = true;
      const side = new THREE.MeshLambertMaterial({ color: b.color, map: tex });
      const roof = new THREE.MeshLambertMaterial({ color: b.roof });
      // box faces: +x, -x, +y (roof), -y, +z, -z
      const box = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.top, b.h), [side, side, roof, roof, side, side]);
      box.position.copy(at(b.x + b.w / 2, b.y + b.h / 2, b.top / 2));
      box.castShadow = box.receiveShadow = true;
      // one window per cell across, one per storey up
      box.geometry.attributes.uv.array.forEach((_, i, uv) => {
        if (i % 2) return;
        const face = Math.floor(i / 8);
        if (face === 2 || face === 3) return;
        const across = face < 2 ? b.h : b.w;
        uv[i] *= across / cell; uv[i + 1] *= b.floors;
      });
      box.geometry.attributes.uv.needsUpdate = true;
      this.scene3.add(box);

      if (b.kind !== 'place') continue;
      const d = b.door;
      const doorMesh = new THREE.Mesh(new THREE.PlaneGeometry(cell * 0.9, 12), new THREE.MeshLambertMaterial({ color: '#3a261c' }));
      const off = 0.6;
      const edge = { top: [d.x, b.y - off], bottom: [d.x, b.y + b.h + off], left: [b.x - off, d.y], right: [b.x + b.w + off, d.y] }[d.side];
      doorMesh.position.copy(at(edge[0], edge[1], 6));
      doorMesh.rotation.y = { top: Math.PI, bottom: 0, left: -Math.PI / 2, right: Math.PI / 2 }[d.side];
      this.scene3.add(doorMesh);

      const sign = label(`${b.icon} ${b.short}`.trim(), b.color);
      sign.position.copy(at(b.x + b.w / 2, b.y + b.h / 2, b.top + 30));
      this.scene3.add(sign);
    }
  }

  addProps(props) {
    const trees = props.filter(p => p.kind === 'tree'), lamps = props.filter(p => p.kind === 'lamp');
    const m = new THREE.Matrix4();
    const many = (geometry, colour, list, y, shadow) => {
      const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial({ color: colour }), Math.max(1, list.length));
      mesh.count = list.length;
      list.forEach((p, i) => mesh.setMatrixAt(i, m.makeTranslation(p.x, y, p.y)));
      mesh.castShadow = shadow;
      this.scene3.add(mesh);
    };
    many(new THREE.CylinderGeometry(2, 2.5, 12), '#6b4a2f', trees, 6, false);
    many(new THREE.SphereGeometry(13, 10, 8), '#2f6b45', trees, 26, true);
    many(new THREE.CylinderGeometry(0.8, 0.8, 26), '#2f3640', lamps, 13, false);
    many(new THREE.BoxGeometry(5, 2, 5), '#ffe8a3', lamps, 26, false);
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
    this.controls.update();
    this.renderer.render(this.scene3, this.camera);
  }

  dispose() {
    window.removeEventListener('resize', this.resize);
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
