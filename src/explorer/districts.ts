import * as THREE from 'three';
import type { Building, Layout } from './layout';

/**
 * Architecture for the special districts of futuristic cities: mansions in five
 * styles on landscaped plots, a souk of arcaded shophouses with wind towers, a
 * mall, a mosque and a temple, and palm-lined boulevards. Everything is built
 * from a handful of instanced shapes so a whole district costs a few draw calls.
 */
export type DShape = 'box' | 'cyl' | 'cone' | 'hemi' | 'sphere' | 'gable' | 'arch' | 'palmTrunk' | 'fronds' | 'oct';
export type DMat = 'plaster' | 'stone' | 'roof' | 'glass' | 'water' | 'gold' | 'metal' | 'leaf' | 'bark' | 'glow' | 'wood' | 'lawn' | 'cloth' | 'dark' | 'marble';

export interface DPiece {
  shape: DShape;
  mat: DMat;
  m: THREE.Matrix4;
  c: THREE.Color;
  x: number;
  z: number;
  /** Small props are culled sooner than walls, domes and minarets. */
  small: boolean;
}

export interface DistrictData {
  pieces: DPiece[];
  /** Pool and fountain surfaces (lit from below at night). */
  lights: [number, number][];
}

/** Grid spacing of futuristic cities (see layout.ts). */
export const FUT_SPACING = 36;

export const VILLA_STYLES = ['modern', 'mediterranean', 'courtyard', 'classical', 'pavilion'] as const;
export type VillaStyle = (typeof VILLA_STYLES)[number];
export function villaStyle(b: Building): VillaStyle {
  return VILLA_STYLES[Math.floor(b.tone * VILLA_STYLES.length) % VILLA_STYLES.length];
}

const q = new THREE.Quaternion();
const e = new THREE.Euler();

/** Deterministic per-building random numbers. */
function hashRand(seed: number) {
  return (k: number) => {
    const v = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
    return v - Math.floor(v);
  };
}

export function generateDistricts(layout: Layout, y0: number, warm: boolean): DistrictData {
  const out: DistrictData = { pieces: [], lights: [] };
  if (layout.style !== 'futuristic') return out;

  for (const b of layout.buildings) {
    switch (b.kind) {
      case 'villa':
        villa(out, b, y0, warm);
        break;
      case 'shop':
        shop(out, b, y0);
        break;
      case 'mall':
        mall(out, b, y0, warm);
        break;
      case 'mosque':
        mosque(out, b, y0, warm);
        break;
      case 'temple':
        temple(out, b, y0);
        break;
    }
  }
  if (warm) boulevardPalms(out, layout, y0);
  return out;
}

/**
 * A local frame for a building: +lz points from the building towards its street
 * (where the door is), +lx to the right when facing the street.
 */
function frame(out: DistrictData, ox: number, oz: number, y0: number, toward: [number, number]) {
  const ry = Math.atan2(toward[0] - ox, toward[1] - oz);
  const cos = Math.cos(ry);
  const sin = Math.sin(ry);
  const wx = (lx: number, lz: number) => ox + lx * cos + lz * sin;
  const wz = (lx: number, lz: number) => oz - lx * sin + lz * cos;
  const add = (shape: DShape, mat: DMat, lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, color: string | THREE.Color, rot = 0, rx = 0, rz = 0) => {
    e.set(rx, ry + rot, rz, 'YXZ');
    q.setFromEuler(e);
    const x = wx(lx, lz);
    const z = wz(lx, lz);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y0 + ly, z), q, new THREE.Vector3(sx, sy, sz));
    out.pieces.push({ shape, mat, m, c: typeof color === 'string' ? new THREE.Color(color) : color, x, z, small: Math.max(sx, sy, sz) < 1.6 });
  };
  return { add, wx, wz, ry };
}

type Add = ReturnType<typeof frame>['add'];

function palm(add: Add, lx: number, lz: number, h: number, r: (k: number) => number, k: number, y = 0) {
  add('palmTrunk', 'bark', lx, y, lz, 2.2, h, 2.2, new THREE.Color('#8a7256').offsetHSL(0, 0, (r(k) - 0.5) * 0.1), r(k + 1) * 6);
  // the trunk leans along its local +x by about 0.18 per unit height squared
  const lean = 0.18 * 2.2;
  const rot = r(k + 1) * 6;
  add('fronds', 'leaf', lx + Math.cos(rot) * lean, y + h, lz - Math.sin(rot) * lean, 4.2, 4, 4.2, new THREE.Color('#4f8a3a').offsetHSL((r(k + 2) - 0.5) * 0.04, 0, (r(k + 3) - 0.5) * 0.08), r(k + 4) * 6);
}

/** Arched opening: a dark recess with a semicircular head, flush with a wall facing +lz. */
function archWindow(add: Add, lx: number, ly: number, lz: number, w: number, h: number, mat: DMat = 'glass', color = '#2a3644', rot = 0) {
  add('box', mat, lx, ly, lz, w, h - w / 2, 0.12, color, rot);
  add('arch', mat, lx, ly + h - w / 2, lz, w, w / 2, 0.12, color, rot);
}

// ───────────────────────── Villas ─────────────────────────

function villa(out: DistrictData, b: Building, y0: number, warm: boolean) {
  const r = hashRand(b.tone * 1000 + b.x * 0.37 + b.z * 0.11);
  const style = villaStyle(b);
  // the plot fills the street block the house stands in
  const px = Math.floor(b.x / FUT_SPACING) * FUT_SPACING + FUT_SPACING / 2;
  const pz = Math.floor(b.z / FUT_SPACING) * FUT_SPACING + FUT_SPACING / 2;
  const P = 11.6;
  const plot = frame(out, px, pz, y0, b.door);
  const pa = plot.add;
  // house position in the plot frame
  const hx = (b.x - px) * Math.cos(plot.ry) - (b.z - pz) * Math.sin(plot.ry);
  const hz = (b.x - px) * Math.sin(plot.ry) + (b.z - pz) * Math.cos(plot.ry);
  // the house shares the plot's orientation so it sits square to the garden walls
  const hwx = plot.wx(hx, hz);
  const hwz = plot.wz(hx, hz);
  const house = frame(out, hwx, hwz, y0, [hwx + Math.sin(plot.ry) * 10, hwz + Math.cos(plot.ry) * 10]);
  const add = house.add;
  const W = b.w;
  const D = b.d;
  const H = b.h;
  const poolSide = hx > 0 ? -1 : 1;

  // ── plot: lawn, boundary, gate, drive, pool, palms, lamps
  const wallCol = style === 'modern' || style === 'pavilion' ? '#e8e6e0' : style === 'courtyard' ? '#d9bf94' : style === 'mediterranean' ? '#e6d2b0' : '#efe9dc';
  pa('box', 'lawn', 0, 0, 0, P * 2, 0.14, P * 2, new THREE.Color('#5f8a3c').offsetHSL((r(1) - 0.5) * 0.03, 0, (r(2) - 0.5) * 0.06));
  const hedge = style === 'classical' || style === 'mediterranean';
  const wallH = hedge ? 1.5 : 1.8;
  const wall = (lx: number, lz: number, sx: number, sz: number) =>
    hedge ? pa('box', 'leaf', lx, 0, lz, sx, wallH, sz, '#3f6e30') : pa('box', 'plaster', lx, 0, lz, sx, wallH, sz, wallCol);
  wall(0, -P, P * 2, 0.5);
  wall(-P, 0, 0.5, P * 2);
  wall(P, 0, 0.5, P * 2);
  // front wall with a gate opening at the drive
  const gx = -poolSide * 4.5;
  const gw = 4.2;
  const leftLen = gx - gw / 2 + P;
  const rightLen = P - (gx + gw / 2);
  wall(-P + leftLen / 2, P, leftLen, 0.5);
  wall(P - rightLen / 2, P, rightLen, 0.5);
  for (const s of [-1, 1]) {
    pa('box', style === 'courtyard' ? 'plaster' : 'stone', gx + s * (gw / 2 + 0.35), 0, P, 0.7, 2.4, 0.7, style === 'courtyard' ? '#cfae7c' : '#d8d2c4');
    pa('sphere', 'glow', gx + s * (gw / 2 + 0.35), 2.6, P, 0.32, 0.32, 0.32, '#ffe2b0');
  }
  pa('box', 'metal', gx, 0.1, P, gw, 1.7, 0.08, '#2a2a2e');
  // driveway from the gate to the front door, with a parked car
  const fz = hz + D / 2;
  const driveLen = P - fz;
  pa('box', 'stone', gx, 0.02, (P + fz) / 2, 3.6, 0.16, driveLen, '#cfc8ba');
  carProp(pa, gx, fz + driveLen * 0.45, r);
  // pool and deck beside the house, loungers, an umbrella
  const poolX = poolSide * (P - 4.2);
  const poolL = Math.min(9, P * 2 - 6);
  pa('box', 'marble', poolX, 0.02, -0.5, 6.4, 0.2, poolL + 2.4, '#ecebe6');
  pa('box', 'water', poolX, 0.08, -0.5, 4.4, 0.18, poolL, '#3fb6d8');
  out.lights.push([plot.wx(poolX, -0.5), plot.wz(poolX, -0.5)]);
  for (const k of [0, 1]) pa('box', 'cloth', poolX - poolSide * 2.6, 0.2, -2.5 + k * 1.6, 0.8, 0.3, 1.9, '#f4f2ee');
  pa('cyl', 'metal', poolX - poolSide * 2.6, 0.2, 2.2, 0.08, 2.4, 0.08, '#8a8a8a');
  pa('cone', 'cloth', poolX - poolSide * 2.6, 2.1, 2.2, 2.8, 0.7, 2.8, r(9) < 0.5 ? '#f2efe6' : '#2f6f8a');
  // palms (or clipped conifers on cold worlds) along the boundary
  const trees = 3 + Math.floor(r(3) * 3);
  for (let k = 0; k < trees; k++) {
    const side = k % 2 === 0 ? -1 : 1;
    const lx = k < 2 ? side * (P - 1.6) : (r(10 + k) - 0.5) * P * 1.4;
    const lz = k < 2 ? P - 1.8 - r(20 + k) * 2 : -P + 1.6;
    if (warm) palm(pa, lx, lz, 5.5 + r(30 + k) * 3.5, r, 40 + k * 5);
    else pa('cone', 'leaf', lx, 0, lz, 1.6, 4.5 + r(30 + k) * 2, 1.6, '#2f5a34');
  }
  for (const s of [-1, 1]) pa('cyl', 'glow', gx + s * 2.2, 0, (P + fz) / 2, 0.16, 0.7, 0.16, '#ffe0a8');

  // ── the house itself, by style
  const glass = (lx: number, ly: number, lz: number, w: number, h: number, rot = 0) => add('box', 'glass', lx, ly, lz, w, h, 0.14, '#24303c', rot);
  switch (style) {
    case 'modern': {
      // two offset white volumes, the upper one cantilevered over the terrace
      const h1 = H * 0.48;
      add('box', 'plaster', 0, 0, 0, W, h1, D, '#f1f0ec');
      const uw = W * 0.72;
      const ud = D * 0.85;
      const ux = W * 0.2 * (r(4) < 0.5 ? 1 : -1);
      add('box', 'plaster', ux, h1, 0.8, uw, H * 0.44, ud, '#f6f6f2');
      // thin roof planes with a dark fascia edge, pale on top
      add('box', 'dark', 0, h1 - 0.05, 0, W + 0.4, 0.25, D + 0.4, '#5a5e64');
      add('box', 'plaster', 0, h1 + 0.2, 0, W + 0.3, 0.06, D + 0.3, '#d6d6d2');
      add('box', 'dark', ux, h1 + H * 0.44, 0.8, uw + 1.2, 0.3, ud + 1.2, '#4a4e54');
      add('box', 'plaster', ux, h1 + H * 0.44 + 0.3, 0.8, uw + 1.1, 0.06, ud + 1.1, '#e2e2de');
      // timber screen, floor-to-ceiling glazing, a ribbon window upstairs
      const accentM: DMat = r(14) < 0.5 ? 'wood' : 'stone';
      add('box', accentM, ux - uw * 0.32, h1 + 0.2, 0.8 + ud / 2 + 0.02, uw * 0.3, H * 0.4, 0.1, accentM === 'wood' ? '#9a6a42' : ['#5a5650', '#b8a890', '#3a3e44'][Math.floor(r(15) * 3)]);
      glass(-W * 0.12, 0.25, D / 2 + 0.02, W * 0.66, h1 - 0.6);
      glass(ux + uw * 0.12, h1 + 0.9, 0.8 + ud / 2 + 0.02, uw * 0.6, H * 0.22);
      glass(0, 0.25, -D / 2 - 0.02, W * 0.5, h1 - 0.6, Math.PI);
      // roof terrace rail and a glass balustrade on the cantilever
      add('box', 'glass', ux, h1 + H * 0.44 + 0.3, 0.8 + ud / 2 + 0.5, uw + 1, 0.9, 0.06, '#9ec4d8');
      break;
    }
    case 'mediterranean': {
      const wallC = new THREE.Color(r(5) < 0.5 ? '#ead8b4' : '#f0e2c8').offsetHSL(0, 0, (r(6) - 0.5) * 0.04);
      add('box', 'plaster', 0, 0, 0, W, H * 0.62, D, wallC);
      // gable cross-sections span local x before rotation, so a ridge along x swaps the scales
      const roofC = ['#b4553a', '#9a4a32', '#6a6e74', '#c47a3a'][Math.floor(r(11) * 4)];
      add('gable', 'roof', 0, H * 0.62, 0, D * 1.04, H * 0.38, W * 1.06, roofC, Math.PI / 2);
      // a lower wing with its own roof
      const wx = (W / 2 + 2.6) * (r(7) < 0.5 ? 1 : -1);
      add('box', 'plaster', wx, 0, -1, 5.2, H * 0.4, D * 0.7, wallC);
      add('gable', 'roof', wx, H * 0.4, -1, 5.6, 1.8, D * 0.74, roofC);
      // arched windows and doors, painted shutters, a balcony
      const shutter = r(8) < 0.5 ? '#2f6f8a' : '#4f7a3a';
      for (const k of [-1, 0, 1]) {
        const lx = k * W * 0.3;
        archWindow(add, lx, 0.3, D / 2 + 0.03, k === 0 ? 1.6 : 1.3, k === 0 ? 2.8 : 2.2);
        archWindow(add, lx, H * 0.34, D / 2 + 0.03, 1.1, 1.8);
        if (k) for (const s of [-1, 1]) add('box', 'wood', lx + s * 0.95, H * 0.34, D / 2 + 0.05, 0.5, 1.4, 0.06, shutter);
      }
      add('box', 'stone', 0, H * 0.3, D / 2 + 0.6, W * 0.4, 0.18, 1.2, '#e8e0cc');
      // stone balustrade: a top rail on short posts
      add('box', 'stone', 0, H * 0.3 + 0.9, D / 2 + 1.15, W * 0.4, 0.14, 0.2, '#ece4d0');
      for (let k = 0; k < 7; k++) add('cyl', 'stone', -W * 0.2 + (k * W * 0.4) / 6, H * 0.3 + 0.18, D / 2 + 1.15, 0.16, 0.72, 0.16, '#ece4d0');
      // terracotta pots and a pergola with climbing plants
      for (const k of [0, 1, 2]) add('cyl', 'roof', -W / 2 + 1 + k * 1.2, 0, D / 2 + 1.4, 0.7, 0.8, 0.7, '#b8603e');
      add('box', 'wood', wx, 2.6, D * 0.35 + 1.6, 5, 0.18, 3, '#7a5236');
      add('box', 'leaf', wx, 2.75, D * 0.35 + 1.6, 4.6, 0.3, 2.6, '#4f7a34');
      break;
    }
    case 'courtyard': {
      // Gulf-style courtyard house: thick sand walls with crenellations, a dome, a wind tower
      const wallC = new THREE.Color('#dcc298').offsetHSL(0, 0, (r(5) - 0.5) * 0.05);
      add('box', 'plaster', 0, 0, 0, W, H * 0.7, D, wallC);
      const merlons = Math.floor(W / 1.4);
      for (let k = 0; k < merlons; k++) {
        const lx = -W / 2 + 0.7 + k * (W - 1.4) / Math.max(1, merlons - 1);
        add('box', 'plaster', lx, H * 0.7, D / 2 - 0.2, 0.6, 0.7, 0.4, wallC);
        add('box', 'plaster', lx, H * 0.7, -D / 2 + 0.2, 0.6, 0.7, 0.4, wallC);
      }
      add('cyl', 'plaster', -W * 0.15, H * 0.7, -0.5, 5, 1.2, 5, wallC);
      const domeKind = Math.floor(r(6) * 3);
      add('hemi', domeKind === 0 ? 'gold' : 'plaster', -W * 0.15, H * 0.7 + 1.2, -0.5, 5.2, 4.4, 5.2, ['#d8b25a', '#f2ebdd', '#3f9a9a'][domeKind]);
      add('sphere', 'gold', -W * 0.15, H * 0.7 + 3.6, -0.5, 0.4, 0.8, 0.4, '#e2c070');
      // wind tower (barjeel) with slatted vents
      const tx = W * 0.32;
      add('box', 'plaster', tx, H * 0.7, -D * 0.2, 2.6, 5, 2.6, wallC.clone().offsetHSL(0, 0, 0.03));
      for (let s = 0; s < 4; s++) {
        const a = (s * Math.PI) / 2;
        for (const o of [-0.6, 0, 0.6]) add('box', 'dark', tx + Math.sin(a) * 1.32 + Math.cos(a) * o, H * 0.7 + 2.2, -D * 0.2 + Math.cos(a) * 1.32 - Math.sin(a) * o, 0.25, 2.4, 0.08, '#3a2a1e', a);
      }
      add('box', 'plaster', tx, H * 0.7 + 5, -D * 0.2, 3, 0.4, 3, wallC);
      // tall arched portal (iwan) with carved wooden doors, mashrabiya screens
      add('box', 'plaster', 0, 0, D / 2 + 0.4, 4.6, H * 0.85, 0.8, wallC.clone().offsetHSL(0, 0, -0.03));
      archWindow(add, 0, 0.1, D / 2 + 0.82, 2.6, H * 0.62, 'dark', '#2a1c12');
      add('box', 'wood', 0, 0.1, D / 2 + 0.84, 2.2, 2.9, 0.06, '#7a4e2a');
      for (const s of [-1, 1]) {
        add('box', 'wood', s * W * 0.32, H * 0.3, D / 2 + 0.04, 1.8, 2, 0.1, '#8a5e36');
        archWindow(add, s * W * 0.32, 0.4, D / 2 + 0.03, 1.2, 2.2);
      }
      fountain(pa, poolSide * 7.2, 8.6, 3.2);
      out.lights.push([plot.wx(poolSide * 7.2, 8.6), plot.wz(poolSide * 7.2, 8.6)]);
      break;
    }
    case 'classical': {
      // symmetrical mansion: two storeys, lower wings, a columned portico under a pediment
      const ivory = new THREE.Color(['#f2ece0', '#efe3c4', '#e4e8ec', '#f3e6dc'][Math.floor(r(12) * 4)]);
      add('box', 'plaster', 0, 0, 0, W * 0.62, H, D, ivory);
      for (const s of [-1, 1]) {
        add('box', 'plaster', s * W * 0.4, 0, -0.6, W * 0.2, H * 0.62, D * 0.85, ivory);
        add('box', 'stone', s * W * 0.4, H * 0.62, -0.6, W * 0.22, 0.35, D * 0.88, '#ddd6c6');
        for (const k of [0, 1]) archWindow(add, s * W * 0.4, 0.4, D * 0.425 - 0.6 + 0.03, 1.1, 2.4 + k * 0);
      }
      add('box', 'stone', 0, H, 0, W * 0.64, 0.45, D + 0.2, '#ddd6c6');
      add('gable', 'roof', 0, H + 0.45, 0, D * 0.9, 1.8, W * 0.62, '#5a6068', Math.PI / 2);
      // portico: steps, six columns, entablature, pediment facing the street
      const pw = W * 0.5;
      add('box', 'marble', 0, 0, D / 2 + 1.8, pw + 1.2, 0.5, 3.6, '#ebe6dc');
      const cols = r(13) < 0.5 ? 4 : 6;
      for (let k = 0; k < cols; k++) {
        const lx = -pw / 2 + (k * pw) / (cols - 1);
        add('cyl', 'marble', lx, 0.5, D / 2 + 3, 0.7, H - 0.5, 0.7, '#f6f2ea');
        add('box', 'marble', lx, 0.5, D / 2 + 3, 0.95, 0.3, 0.95, '#e6e0d4');
      }
      add('box', 'marble', 0, H, D / 2 + 1.8, pw + 1, 0.7, 3.4, '#ebe6dc');
      add('gable', 'marble', 0, H + 0.7, D / 2 + 2.6, pw + 1.2, 2.2, 1.8, '#efe9de');
      for (const lx of [-pw * 0.3, pw * 0.3]) for (const ly of [0.6, H * 0.55]) glass(lx, ly, D / 2 + 0.03, 1.2, 2.2);
      add('box', 'wood', 0, 0.5, D / 2 + 0.04, 1.8, 3, 0.08, '#5a3a22');
      fountain(pa, poolSide * 7.2, 8.6, 3.8, true);
      out.lights.push([plot.wx(poolSide * 7.2, 8.6), plot.wz(poolSide * 7.2, 8.6)]);
      break;
    }
    case 'pavilion': {
      // single-storey glass pavilion under a floating roof plane, a stone core, a reflecting pool
      const h1 = H * 0.5;
      add('box', 'stone', -W * 0.3, 0, -D * 0.1, W * 0.25, h1 + 0.6, D * 0.7, ['#8a8278', '#c8b8a0', '#4a4844'][Math.floor(r(16) * 3)]);
      add('box', 'glass', 0, 0.15, 0, W * 0.94, h1 - 0.2, D * 0.9, '#2c3a46');
      add('box', 'plaster', 0, h1, 0, W + 3.2, 0.35, D + 2.6, '#f4f4f0');
      add('box', 'dark', 0, h1 - 0.08, 0, W + 3, 0.1, D + 2.4, '#3a3e44');
      for (const s of [-1, 1]) for (const t of [-1, 1]) add('cyl', 'metal', s * (W / 2 + 1.1), 0, t * (D / 2 + 0.9), 0.18, h1, 0.18, '#d8d8d8');
      // a small rooftop studio
      add('box', 'glass', W * 0.2, h1 + 0.35, -D * 0.2, W * 0.35, H * 0.4, D * 0.4, '#2c3a46');
      add('box', 'plaster', W * 0.2, h1 + 0.35 + H * 0.4, -D * 0.2, W * 0.4, 0.25, D * 0.45, '#f4f4f0');
      // a stone terrace in front of the glass, under the roof overhang
      add('box', 'marble', 0, 0, D / 2 + 0.9, W + 2.8, 0.12, 1.8, '#e6e4de');
      break;
    }
  }
}

/** Round fountain: basin, water, a central column, and on grand ones an upper bowl. */
function fountain(add: Add, lx: number, lz: number, d: number, tiered = false) {
  add('cyl', 'marble', lx, 0, lz, d, 0.6, d, '#ece6da');
  add('cyl', 'water', lx, 0.5, lz, d - 0.5, 0.12, d - 0.5, '#4ab8d8');
  add('cyl', 'marble', lx, 0.5, lz, 0.5, tiered ? 1.6 : 1.2, 0.5, '#ece6da');
  if (tiered) {
    add('cyl', 'marble', lx, 2.1, lz, 1.6, 0.2, 1.6, '#ece6da');
    add('cyl', 'water', lx, 2.25, lz, 1.3, 0.08, 1.3, '#4ab8d8');
  }
}

function carProp(add: Add, lx: number, lz: number, r: (k: number) => number) {
  const col = ['#f2f2f0', '#1a1c20', '#8a8f96', '#7a1a1a', '#1e3a5a', '#c8b07a'][Math.floor(r(50) * 6)];
  add('box', 'metal', lx, 0.35, lz, 1.9, 0.75, 4.5, col);
  add('box', 'glass', lx, 1.05, lz - 0.2, 1.65, 0.55, 2.4, '#1c2630');
  for (const s of [-1, 1]) for (const t of [-1, 1]) add('cyl', 'dark', lx + s * 0.82, 0.33, lz + t * 1.45, 0.66, 0.26, 0.66, '#151515', 0, 0, (s * Math.PI) / 2);
}

// ───────────────────────── Souk ─────────────────────────

const AWNINGS = ['#b8442e', '#2e6a8a', '#d8a030', '#6a8a3a', '#e8e0d0', '#8a3a5a'];

function shop(out: DistrictData, b: Building, y0: number) {
  const r = hashRand(b.tone * 1000 + b.x * 0.71);
  const { add } = frame(out, b.x, b.z, y0, b.door);
  const W = b.w;
  const D = b.d;
  const H = b.h;
  const wallC = new THREE.Color(['#dcc298', '#e4cfa8', '#d4b488', '#e8d8b8', '#cfae84'][Math.floor(r(1) * 5)]);
  add('box', 'plaster', 0, 0, 0, W, H, D, wallC);
  // parapet with crenellations
  const merlons = Math.max(2, Math.floor(W / 1.3));
  for (let k = 0; k < merlons; k++) add('box', 'plaster', -W / 2 + 0.5 + (k * (W - 1)) / (merlons - 1), H, D / 2 - 0.2, 0.5, 0.6, 0.35, wallC);
  // arcade along the street: columns and arches in front of glowing shopfronts
  const bays = Math.max(2, Math.round(W / 2.8));
  const bw = W / bays;
  const az = D / 2 + 1.6;
  add('box', 'plaster', 0, 3.4, az - 0.8, W, 0.9, 1.9, wallC.clone().offsetHSL(0, 0, -0.04));
  for (let k = 0; k <= bays; k++) add('box', 'plaster', -W / 2 + k * bw, 0, az, 0.5, 3.4, 0.5, wallC.clone().offsetHSL(0, 0, -0.06));
  for (let k = 0; k < bays; k++) {
    const lx = -W / 2 + bw * (k + 0.5);
    add('arch', 'plaster', lx, 2.6, az, bw - 0.5, 0.8, 0.5, wallC.clone().offsetHSL(0, 0, -0.06));
    add('box', 'glass', lx, 0.2, D / 2 + 0.03, bw - 0.9, 2.6, 0.1, '#3a3020');
    add('box', 'glow', lx, 2.85, D / 2 + 0.05, bw - 1, 0.35, 0.05, AWNINGS[Math.floor(r(10 + k) * AWNINGS.length)]);
    // goods spilling out: crates, carpets and sacks of spice
    if (r(20 + k) < 0.6) add('box', 'cloth', lx, 0, D / 2 + 0.8, bw * 0.6, 0.6, 0.7, AWNINGS[Math.floor(r(30 + k) * AWNINGS.length)]);
  }
  // upper floor: small arched windows behind wooden screens
  const wins = Math.max(1, Math.floor(W / 2.6));
  for (let k = 0; k < wins; k++) {
    const lx = -W / 2 + (W / wins) * (k + 0.5);
    if (H > 7.5) {
      archWindow(add, lx, 4.6, D / 2 + 0.03, 1, 1.8);
      if (r(40 + k) < 0.5) add('box', 'wood', lx, 4.4, D / 2 + 0.12, 1.4, 2.2, 0.12, '#7a5232');
    }
  }
  // a wind tower on half of the roofs, a striped awning on some
  if (r(2) < 0.55) {
    const tx = (r(3) - 0.5) * W * 0.5;
    add('box', 'plaster', tx, H, -D * 0.2, 2.2, 4.2, 2.2, wallC.clone().offsetHSL(0, 0, 0.03));
    for (let s = 0; s < 4; s++) {
      const a = (s * Math.PI) / 2;
      for (const o of [-0.5, 0.5]) add('box', 'dark', tx + Math.sin(a) * 1.12 + Math.cos(a) * o, H + 1.8, -D * 0.2 + Math.cos(a) * 1.12 - Math.sin(a) * o, 0.24, 2.1, 0.08, '#3a2a1e', a);
    }
    add('box', 'plaster', tx, H + 4.2, -D * 0.2, 2.6, 0.35, 2.6, wallC);
  }
  if (r(4) < 0.5) add('box', 'cloth', 0, 3.1, az + 1.4, W * 0.9, 0.08, 1.8, AWNINGS[Math.floor(r(5) * AWNINGS.length)], 0, -0.3);
  // lanterns under the arcade
  for (let k = 0; k < bays; k += 2) add('sphere', 'glow', -W / 2 + bw * (k + 0.5), 2.4, az - 0.6, 0.35, 0.45, 0.35, '#ffc070');
}

function mall(out: DistrictData, b: Building, y0: number, warm: boolean) {
  const r = hashRand(b.tone * 1000 + 7);
  const { add } = frame(out, b.x, b.z, y0, b.door);
  const S = b.w;
  const H = b.h;
  // stone-clad box with bands, a glass atrium dome, a glazed portal and signage
  add('box', 'stone', 0, 0, 0, S, H, S, '#e4dccb');
  for (const y of [4.6, 9.8]) add('box', 'dark', 0, y, 0, S + 0.2, 0.5, S + 0.2, '#6a6458');
  add('box', 'stone', 0, H, 0, S + 0.6, 0.6, S + 0.6, '#d8cfbd');
  add('cyl', 'stone', 0, H, 0, 13, 1.4, 13, '#d8cfbd');
  add('hemi', 'glass', 0, H + 1.4, 0, 12, 7, 12, '#7ab0c8');
  for (let k = 0; k < 8; k++) add('box', 'metal', 0, H + 1.4, 0, 0.18, 7.2, 12.2, '#c8ccd0', (k * Math.PI) / 8);
  add('box', 'glass', 0, 0.2, S / 2 + 0.05, 10, H * 0.8, 0.2, '#2e4250');
  add('box', 'plaster', 0, H * 0.82, S / 2 + 2.5, 13, 0.4, 5, '#f2f0ea');
  for (const s of [-1, 1]) add('cyl', 'metal', s * 6, 0, S / 2 + 4.6, 0.3, H * 0.82, 0.3, '#c8ccd0');
  add('box', 'glow', 0, H * 0.82 + 0.5, S / 2 + 0.2, 9, 1.2, 0.12, r(1) < 0.5 ? '#ffd27a' : '#7ae0ff');
  for (const s of [-1, 1]) for (const k of [0, 1, 2]) add('box', 'glow', s * (S / 2 - 3 - k * 3.5), 5.6, S / 2 + 0.06, 2.6, 3.2, 0.06, AWNINGS[Math.floor(r(10 + k + s) * AWNINGS.length)]);
  // a plaza of palms and planters at the entrance
  for (let k = 0; k < 6; k++) {
    const lx = -11 + (k % 3) * 11;
    const lz = S / 2 + 6 + Math.floor(k / 3) * 4;
    add('cyl', 'stone', lx, 0, lz, 2.2, 0.7, 2.2, '#cfc6b4');
    if (warm) palm(add, lx, lz, 6 + r(20 + k) * 2, r, 30 + k * 5, 0.7);
    else add('cone', 'leaf', lx, 0.7, lz, 1.6, 4, 1.6, '#2f5a34');
  }
}

// ───────────────────────── Places of worship ─────────────────────────

function minaret(add: Add, lx: number, lz: number, h: number, col: THREE.Color) {
  add('box', 'plaster', lx, 0, lz, 2.6, h * 0.22, 2.6, col);
  add('oct', 'plaster', lx, h * 0.22, lz, 2, h * 0.45, 2, col);
  add('cyl', 'plaster', lx, h * 0.67, lz, 2.9, 0.4, 2.9, col.clone().offsetHSL(0, 0, -0.04));
  add('cyl', 'glow', lx, h * 0.67 + 0.4, lz, 2.7, 0.18, 2.7, '#bff0c8');
  add('cyl', 'plaster', lx, h * 0.67 + 0.4, lz, 1.5, h * 0.2, 1.5, col);
  add('cyl', 'plaster', lx, h * 0.87 + 0.4, lz, 2.2, 0.3, 2.2, col.clone().offsetHSL(0, 0, -0.04));
  add('cone', 'gold', lx, h * 0.87 + 0.7, lz, 1.7, h * 0.12, 1.7, '#d8b25a');
  add('sphere', 'gold', lx, h + 0.9, lz, 0.4, 0.4, 0.4, '#e8c878');
}

function mosque(out: DistrictData, b: Building, y0: number, warm: boolean) {
  const r = hashRand(b.tone * 1000 + 3);
  const { add } = frame(out, b.x, b.z, y0, b.door);
  const S = b.w / 2;
  const white = new THREE.Color(r(1) < 0.6 ? '#f6f4ee' : '#efe4cc');
  const domeC = r(2) < 0.4 ? '#f6f4ee' : r(2) < 0.75 ? '#d8b25a' : '#3f9a9a';
  const domeM: DMat = domeC === '#d8b25a' ? 'gold' : 'plaster';
  // courtyard walls with an arched gateway on the street side
  add('box', 'marble', 0, 0, 0, S * 2, 0.3, S * 2, '#ebe7de');
  for (const [lx, lz, sx, sz] of [[0, -S, S * 2, 0.6], [-S, 0, 0.6, S * 2], [S, 0, 0.6, S * 2]] as const) add('box', 'plaster', lx, 0, lz, sx, 2.8, sz, white);
  for (const s of [-1, 1]) add('box', 'plaster', s * (S / 2 + 1.5), 0, S, S - 3, 2.8, 0.6, white);
  add('box', 'plaster', 0, 0, S, 6, 5, 1, white);
  archWindow(add, 0, 0.3, S + 0.52, 3, 4.2, 'dark', '#2a2a2a');
  // prayer hall
  const hw = S * 1.3;
  const hd = S * 1.0;
  const hz = -S * 0.3;
  add('box', 'plaster', 0, 0, hz, hw, 8, hd, white);
  for (let k = 0; k < 5; k++) archWindow(add, -hw / 2 + (hw / 5) * (k + 0.5), 1.2, hz + hd / 2 + 0.03, 1.5, 4.2, 'glass', '#2a3a44');
  add('box', 'stone', 0, 8, hz, hw + 0.4, 0.5, hd + 0.4, '#e2dccd');
  // a great dome on a drum, four smaller domes at the corners
  add('cyl', 'plaster', 0, 8.5, hz, 9, 2.6, 9, white);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    archWindow(add, Math.sin(a) * 4.52, 8.9, hz + Math.cos(a) * 4.52, 0.8, 1.7, 'glass', '#2a3a44', a);
  }
  add('hemi', domeM, 0, 11.1, hz, 9.4, 8.6, 9.4, domeC);
  add('cone', 'gold', 0, 15.2, hz, 0.7, 2.4, 0.7, '#d8b25a');
  add('sphere', 'gold', 0, 17.3, hz, 0.6, 0.6, 0.6, '#e8c878');
  add('cyl', 'glow', 0, 11.05, hz, 9.6, 0.15, 9.6, '#bff0c8');
  for (const s of [-1, 1]) for (const t of [-1, 1]) {
    add('cyl', 'plaster', s * hw * 0.36, 8.5, hz + t * hd * 0.3, 2.6, 1, 2.6, white);
    add('hemi', domeM, s * hw * 0.36, 9.5, hz + t * hd * 0.3, 2.8, 2.6, 2.8, domeC);
  }
  // the entrance iwan
  add('box', 'plaster', 0, 0, hz + hd / 2 + 0.6, 6.5, 10.5, 1.2, white);
  archWindow(add, 0, 0.3, hz + hd / 2 + 1.22, 4, 8, 'dark', '#1e2a30');
  add('box', 'gold', 0, 9.6, hz + hd / 2 + 1.23, 5, 0.25, 0.05, '#d8b25a');
  // minarets at the front corners (four on larger mosques)
  const mh = 30 + r(3) * 8;
  const four = r(4) < 0.5;
  for (const s of [-1, 1]) {
    minaret(add, s * (S - 1.6), S - 1.6, mh, white);
    if (four) minaret(add, s * (S - 1.6), -S + 1.6, mh * 0.9, white);
  }
  // ablution fountain in the courtyard and a row of palms
  add('oct', 'marble', 0, 0.3, S * 0.62, 3.6, 0.7, 3.6, '#ebe7de');
  add('oct', 'water', 0, 0.9, S * 0.62, 3, 0.1, 3, '#4ab8d8');
  out.lights.push([b.x, b.z]);
  for (const s of [-1, 1]) for (let k = 0; k < 2; k++) {
    if (warm) palm(add, s * (S - 3.2), S * 0.5 - k * 4, 6 + r(10 + k) * 2, r, 20 + k * 5 + (s > 0 ? 50 : 0), 0.3);
    else add('cone', 'leaf', s * (S - 3.2), 0.3, S * 0.5 - k * 4, 1.6, 4.5, 1.6, '#2f5a34');
  }
}

function temple(out: DistrictData, b: Building, y0: number) {
  const r = hashRand(b.tone * 1000 + 5);
  const { add } = frame(out, b.x, b.z, y0, b.door);
  const S = b.w / 2;
  const stone = new THREE.Color(r(1) < 0.5 ? '#e8d2b0' : '#f2eee6');
  const accent = new THREE.Color(r(1) < 0.5 ? '#d9b48a' : '#e6dccb');
  // raised plinth with steps up from the street
  add('box', 'stone', 0, 0, -1, S * 1.7, 1.4, S * 1.6, accent);
  for (let k = 0; k < 4; k++) add('box', 'stone', 0, 0, S * 0.8 - 1 + 0.6 + k * 0.5, 6, 1.4 - k * 0.35, 0.6, accent);
  // pillared hall (mandapa) with a stepped pyramidal roof
  const mz = S * 0.35;
  add('box', 'stone', 0, 1.4, mz, 9, 0.4, 8, stone);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
    if (i > 0 && i < 3 && j === 1) continue;
    add('box', 'stone', -3.9 + i * 2.6, 1.8, mz - 3.2 + j * 3.2, 0.7, 4, 0.7, stone);
  }
  add('box', 'stone', 0, 5.8, mz, 9.4, 0.6, 8.4, accent);
  for (let k = 0; k < 4; k++) add('box', 'stone', 0, 6.4 + k * 0.9, mz, 8 - k * 1.8, 0.9, 7 - k * 1.6, k % 2 ? accent : stone);
  add('cyl', 'stone', 0, 10, mz, 1.6, 0.5, 1.6, stone);
  add('cone', 'gold', 0, 10.5, mz, 0.6, 1.2, 0.6, '#d8a840');
  // sanctum and its tall curved tower (shikhara): many narrowing courses, a ribbed cap, a gold finial
  const sz = -S * 0.45;
  add('box', 'stone', 0, 1.4, sz, 8, 6, 8, stone);
  add('box', 'dark', 0, 1.8, sz + 4.02, 2, 3.4, 0.1, '#2a1c12');
  const courses = 9;
  for (let k = 0; k < courses; k++) {
    const t = k / courses;
    const w = 8.2 * (1 - t * 0.72) * (1 - t * t * 0.15);
    add('box', 'stone', 0, 7.4 + k * 1.55, sz, w, 1.55, w, k % 2 ? accent : stone);
    // projecting buttresses on each face give the tower its ribbed silhouette
    for (let s = 0; s < 4; s++) {
      const a = (s * Math.PI) / 2;
      add('box', 'stone', Math.sin(a) * w * 0.5, 7.4 + k * 1.55, sz + Math.cos(a) * w * 0.5, w * 0.36, 1.45, 0.6, accent, a);
    }
  }
  const top = 7.4 + courses * 1.55;
  add('cyl', 'stone', 0, top, sz, 3.2, 0.9, 3.2, accent);
  add('cyl', 'stone', 0, top + 0.9, sz, 1.6, 0.4, 1.6, stone);
  add('cone', 'gold', 0, top + 1.3, sz, 1, 2.2, 1, '#d8a840');
  add('cyl', 'metal', 0.9, top + 1.3, sz, 0.06, 4, 0.06, '#8a6a3a');
  add('box', 'cloth', 1.5, top + 4.4, sz, 1.2, 0.8, 0.03, '#f08a20', 0, 0, -0.1);
  // corner shrines with small towers, garlands of lamps
  for (const s of [-1, 1]) for (const t of [-1, 1]) {
    const lx = s * S * 0.62;
    const lz = -1 + t * S * 0.55;
    add('box', 'stone', lx, 1.4, lz, 2.6, 2.6, 2.6, stone);
    for (let k = 0; k < 4; k++) add('box', 'stone', lx, 4 + k * 0.7, lz, 2.4 - k * 0.5, 0.7, 2.4 - k * 0.5, k % 2 ? accent : stone);
    add('cone', 'gold', lx, 6.8, lz, 0.4, 0.8, 0.4, '#d8a840');
  }
  for (let k = 0; k < 10; k++) add('sphere', 'glow', -4.5 + k, 5.6, mz + 4.3, 0.18, 0.18, 0.18, '#ffb050');
  out.lights.push([b.x, b.z]);
}

// ───────────────────────── Boulevards ─────────────────────────

function boulevardPalms(out: DistrictData, layout: Layout, y0: number) {
  const { add } = frame(out, 0, 0, y0, [0, 1]);
  const r = hashRand(layout.radius * 3.1);
  let k = 0;
  for (const s of layout.streets) {
    if (s.w < 12) continue;
    const dx = s.b[0] - s.a[0];
    const dz = s.b[1] - s.a[1];
    const len = Math.hypot(dx, dz);
    const nx = -dz / len;
    const nz = dx / len;
    for (let d = 7; d < len - 5; d += 12) {
      for (const side of [-1, 1]) {
        const x = s.a[0] + (dx * d) / len + nx * side * (s.w / 2 + 1.6);
        const z = s.a[1] + (dz * d) / len + nz * side * (s.w / 2 + 1.6);
        if (Math.hypot(x, z) < 34) continue;
        if (layout.landmarks.some((l) => Math.hypot(l.x - x, l.z - z) < l.radius + 3)) continue;
        if (layout.buildings.some((bb) => Math.abs(bb.x - x) < bb.w / 2 + 1 && Math.abs(bb.z - z) < bb.d / 2 + 1)) continue;
        add('cyl', 'stone', x, 0, z, 1.6, 0.5, 1.6, '#cfc6b4');
        palm(add, x, z, 7 + r(k) * 3, r, k * 7, 0.5);
        k++;
      }
    }
  }
}
