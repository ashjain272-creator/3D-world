import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { HorizontalTiltShiftShader } from 'three/examples/jsm/shaders/HorizontalTiltShiftShader.js';
import { VerticalTiltShiftShader } from 'three/examples/jsm/shaders/VerticalTiltShiftShader.js';
import { Kit, type Mat, rng } from './kit';
import { buildPlinth, buildSite } from './site';
import { tower } from './buildings';
import { buildDowntown } from './downtown';

/**
 * Scale-model style demo: a standalone page (not part of the game) showing apartment towers and
 * mid-rise blocks built the way a developer's sales model looks: matte white board, crisp slab
 * edges, every window lit on its own, foam-ball trees, a glowing pool, and a tilt-shift camera
 * that makes the whole thing read as a miniature. Toggle the model table, the light and the
 * miniature blur to compare.
 */

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 1, 8000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.75;

// ── materials: matte board, painted accents, lit windows, glass rails, foam trees
/** Instance colour drives only the glow, so unlit windows read as dark glass. */
function windowMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: '#2b3540', roughness: 0.18, metalness: 0.35, emissive: '#ffffff', emissiveIntensity: 2 });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <color_fragment>', '')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_COLOR\n  totalEmissiveRadiance *= vColor.rgb;\n#endif');
  };
  m.customProgramCacheKey = () => 'model-window';
  return m;
}
const mats: Record<Mat, THREE.MeshStandardMaterial | THREE.MeshBasicMaterial> = {
  white: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.62 }),
  wall: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7 }),
  charcoal: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.55 }),
  window: windowMaterial(),
  railing: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.32, depthWrite: false }),
  glow: new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }),
  leaf: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true }),
  trunk: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }),
  lawn: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95 }),
  paving: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 }),
  asphalt: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85 }),
  paint: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
  water: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.05, metalness: 0.1, emissive: '#2bb8e0', emissiveIntensity: 0.4 }),
  car: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.25, metalness: 0.5 }),
  carGlass: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.1, metalness: 0.6 }),
  metal: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35, metalness: 0.7 }),
  plinth: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.18, metalness: 0.2 }),
  figure: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7 }),
  court: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 }),
  // curtain-wall glass: tinted and reflective
  glass: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.08, metalness: 0.7 }),
  sand: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85 }),
  gold: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3, metalness: 0.8, emissive: '#6a4a10', emissiveIntensity: 0.4 }),
  stone: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.75 }),
};
const shadows = (m: Mat) => ({ cast: !['glow', 'railing', 'paint', 'water', 'lawn', 'paving', 'asphalt'].includes(m), receive: !['glow', 'paint'].includes(m) });

// ── the scenes: built when first shown. Each has its block, the city round it, a model table.
interface Scene {
  site: THREE.Group;
  city: THREE.Group | null;
  plinth: THREE.Group;
  count: number;
  shadow: number;
}
const scenes: Record<string, Scene> = {};
function residences(): Scene {
  const siteKit = new Kit();
  const cityKit = new Kit();
  buildSite(siteKit, cityKit);
  // a few more towers across the boulevards, so the block sits in a city
  for (const [i, t] of [
    { x: -250, z: -60, floors: 26 },
    { x: -250, z: 50, floors: 32 },
    { x: -60, z: 230, floors: 22 },
    { x: 70, z: 240, floors: 28 },
    { x: 230, z: -60, floors: 36 },
    { x: 250, z: 40, floors: 24 },
    { x: -10, z: -230, floors: 40 },
  ].entries())
    tower(cityKit, { ...t, w: 26, d: 22, w0: 14, d0: 12, seed: rng(100 + i), crown: (['frame', 'pergola', 'stepped'] as const)[i % 3] });
  const plinthKit = new Kit();
  buildPlinth(plinthKit);
  return { site: siteKit.build(mats, shadows), city: cityKit.build(mats, shadows), plinth: plinthKit.build(mats, shadows), count: siteKit.count + cityKit.count, shadow: 260 };
}
function downtown(): Scene {
  const kit = new Kit();
  buildDowntown(kit);
  const plinthKit = new Kit();
  buildPlinth(plinthKit, -690, 690, -570, 570);
  return { site: kit.build(mats, shadows), city: null, plinth: plinthKit.build(mats, shadows), count: kit.count, shadow: 760 };
}
const BUILDERS: Record<string, () => Scene> = { residences, downtown };
const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ color: '#b7b2a6', roughness: 0.95 }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.02;
ground.receiveShadow = true;
const showroom = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ color: '#2a2622', roughness: 0.25, metalness: 0.1 }));
showroom.rotation.x = -Math.PI / 2;
showroom.position.y = -30;
scene.add(ground, showroom);

// ── light
const hemi = new THREE.HemisphereLight('#dfe9ff', '#8a8070', 1);
const sun = new THREE.DirectionalLight('#ffffff', 2);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
const sc = sun.shadow.camera;
sc.near = 10;
sc.far = 4000;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.6;
scene.add(hemi, sun, sun.target);

function gradient(top: string, mid: string, bottom: string) {
  const c = document.createElement('canvas');
  c.width = 2;
  c.height = 256;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, top);
  gr.addColorStop(0.55, mid);
  gr.addColorStop(1, bottom);
  g.fillStyle = gr;
  g.fillRect(0, 0, 2, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const skies = {
  dusk: gradient('#16213d', '#3d4f78', '#e3a676'),
  day: gradient('#5e95d6', '#9cc3ea', '#e8eef2'),
  model: gradient('#0d0c0b', '#1d1a17', '#2c2824'),
};

// ── post: ambient occlusion, bloom on the lights, tilt-shift for the miniature look
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const gtao = new GTAOPass(scene, camera, window.innerWidth, window.innerHeight);
gtao.updateGtaoMaterial({ radius: 3, distanceExponent: 1.3, thickness: 3, scale: 1.6 });
composer.addPass(gtao);
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.32, 0.35, 0.92);
composer.addPass(bloom);
const tiltH = new ShaderPass(HorizontalTiltShiftShader);
const tiltV = new ShaderPass(VerticalTiltShiftShader);
composer.addPass(tiltH);
composer.addPass(tiltV);
composer.addPass(new OutputPass());

// ── state and controls
const state = { time: 'dusk' as 'dusk' | 'day', plinth: true, tilt: true, view: 'model', scene: 'residences' };
function current() {
  return scenes[state.scene];
}
function setTilt(on: boolean) {
  state.tilt = on;
  tiltH.enabled = tiltV.enabled = on;
  const amount = 3.2;
  tiltH.uniforms.h.value = amount / window.innerWidth;
  tiltV.uniforms.v.value = amount / window.innerHeight;
  tiltH.uniforms.r.value = tiltV.uniforms.r.value = 0.45;
}
function setTime(t: 'dusk' | 'day') {
  state.time = t;
  const dusk = t === 'dusk';
  (mats.window as THREE.MeshStandardMaterial).emissiveIntensity = dusk ? 1.7 : 0.12;
  (mats.water as THREE.MeshStandardMaterial).emissiveIntensity = dusk ? 0.9 : 0.15;
  (mats.glow as THREE.MeshBasicMaterial).color.setScalar(dusk ? 1.6 : 0.9);
  hemi.color.set(dusk ? '#9fb0d8' : '#e4eeff');
  hemi.groundColor.set(dusk ? '#4a4038' : '#9a9080');
  hemi.intensity = dusk ? 0.5 : 1.0;
  sun.color.set(dusk ? '#ffc48a' : '#fff6ea');
  sun.intensity = dusk ? 1.9 : 3.0;
  const sk = current()?.shadow ?? 260;
  const f = sk / 260;
  sun.position.set((dusk ? -320 : -180) * f, (dusk ? 140 : 380) * f, (dusk ? 160 : 260) * f);
  sc.left = sc.bottom = -sk;
  sc.right = sc.top = sk;
  sc.updateProjectionMatrix();
  scene.environmentIntensity = dusk ? 0.3 : 0.6;
  bloom.strength = dusk ? 0.32 : 0.12;
  renderer.toneMappingExposure = dusk ? 1.05 : 1.0;
  applyBackground();
}
function applyBackground() {
  scene.background = state.plinth ? skies.model : skies[state.time];
  const f = (current()?.shadow ?? 260) / 260;
  scene.fog = state.plinth ? null : state.time === 'dusk' ? new THREE.Fog('#3d4f78', 350 * f, 1500 * f) : new THREE.Fog('#d6e3ee', 900 * f, 2600 * f);
}
function setPlinth(on: boolean) {
  state.plinth = on;
  const c = current();
  c.plinth.visible = showroom.visible = on;
  if (c.city) c.city.visible = !on;
  ground.visible = !on;
  applyBackground();
}
function setScene(name: string) {
  if (!scenes[name]) {
    const sc2 = BUILDERS[name]();
    scenes[name] = sc2;
    scene.add(sc2.site, sc2.plinth);
    if (sc2.city) scene.add(sc2.city);
  }
  for (const v of Object.values(scenes)) {
    v.site.visible = false;
    v.plinth.visible = false;
    if (v.city) v.city.visible = false;
  }
  state.scene = name;
  current().site.visible = true;
  info.textContent = `${current().count.toLocaleString()} pieces`;
  setPlinth(state.plinth);
  setTime(state.time);
  setView('model');
}
type View = { pos: [number, number, number]; target: [number, number, number]; fov: number };
const SCENE_VIEWS: Record<string, Record<string, View>> = {
  residences: {
    model: { pos: [-260, 175, 300], target: [0, 28, -20], fov: 30 },
    front: { pos: [40, 60, 300], target: [0, 40, -30], fov: 32 },
    aerial: { pos: [60, 420, 260], target: [0, 0, -10], fov: 34 },
    street: { pos: [-140, 1.8, 112], target: [-20, 45, -40], fov: 62 },
    close: { pos: [-40, 22, 40], target: [10, 10, -30], fov: 55 },
  },
  downtown: {
    model: { pos: [560, 560, 1050], target: [20, 170, -40], fov: 36 },
    front: { pos: [80, 140, 760], target: [0, 200, -60], fov: 40 },
    aerial: { pos: [0, 1700, 900], target: [0, 0, -20], fov: 38 },
    street: { pos: [-140, 2.5, 200], target: [0, 160, -60], fov: 64 },
    close: { pos: [260, 90, 330], target: [40, 60, 60], fov: 50 },
  },
};
const VIEWS = SCENE_VIEWS.residences;
function setView(v: string) {
  const p = SCENE_VIEWS[state.scene][v];
  state.view = v;
  camera.position.set(...p.pos);
  controls.target.set(...p.target);
  camera.fov = p.fov;
  camera.updateProjectionMatrix();
  controls.update();
}

// a small panel of toggles
const ui = document.getElementById('ui')!;
const info = document.getElementById('info')!;
function button(label: string, onClick: () => void, group: string, key: string) {
  const b = document.createElement('button');
  b.textContent = label;
  b.dataset.group = group;
  b.dataset.key = key;
  b.onclick = () => {
    onClick();
    refresh();
  };
  return b;
}
function row(title: string, items: HTMLButtonElement[]) {
  const r = document.createElement('div');
  r.className = 'row';
  const t = document.createElement('span');
  t.textContent = title;
  r.append(t, ...items);
  ui.append(r);
}
row('Scene', [button('Residences', () => setScene('residences'), 'scene', 'residences'), button('Downtown', () => setScene('downtown'), 'scene', 'downtown')]);
row('View', Object.keys(VIEWS).map((v) => button(v[0].toUpperCase() + v.slice(1), () => setView(v), 'view', v)));
row('Light', [button('Dusk', () => setTime('dusk'), 'time', 'dusk'), button('Day', () => setTime('day'), 'time', 'day')]);
row('Setting', [button('Model table', () => setPlinth(true), 'plinth', 'on'), button('In the city', () => setPlinth(false), 'plinth', 'off')]);
row('Miniature blur', [button('On', () => setTilt(true), 'tilt', 'on'), button('Off', () => setTilt(false), 'tilt', 'off')]);
function refresh() {
  for (const b of ui.querySelectorAll('button')) {
    const g = b.dataset.group!;
    const k = b.dataset.key!;
    const on = g === 'scene' ? state.scene === k : g === 'view' ? state.view === k : g === 'time' ? state.time === k : g === 'plinth' ? (state.plinth ? 'on' : 'off') === k : (state.tilt ? 'on' : 'off') === k;
    b.classList.toggle('on', on);
  }
}
setTilt(true);
setScene('residences');
refresh();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  setTilt(state.tilt);
});

let frames = 0;
renderer.setAnimationLoop(() => {
  controls.update();
  composer.render();
  frames++;
});

// hooks for scripted screenshots
(window as unknown as { __demo: unknown }).__demo = {
  setView,
  setTime,
  setPlinth,
  setTilt,
  setScene,
  frames: () => frames,
  hideUi: (h: boolean) => {
    ui.style.display = info.style.display = h ? 'none' : '';
  },
};
