import * as THREE from 'three';
import type { Building, Layout } from './layout';
import { footballStadium, nbaArena } from './venues';
import { cityFeatures, mosqueSmall, oldHouse } from './cityFeatures';
import { mallGeometry } from './layout';
import { airport } from './airport';
import { themePark } from './themepark';

/**
 * Architecture for the special districts of futuristic cities: mansions in five
 * styles on landscaped plots, a souk of arcaded shophouses with wind towers, a
 * mall, a mosque and a temple, and palm-lined boulevards. Everything is built
 * from a handful of instanced shapes so a whole district costs a few draw calls.
 */
export type DShape = 'box' | 'cyl' | 'cone' | 'hemi' | 'sphere' | 'gable' | 'arch' | 'palmTrunk' | 'fronds' | 'oct' | 'hip' | 'ring' | 'dArc' | 'threeArc' | 'beamCone' | 'torus' | 'halfTorus' | 'rod' | 'wingR' | 'wingL' | 'fin';
export type DMat = 'plaster' | 'stone' | 'roof' | 'glass' | 'water' | 'gold' | 'metal' | 'leaf' | 'bark' | 'glow' | 'wood' | 'lawn' | 'cloth' | 'dark' | 'marble' | 'crowd' | 'pitch' | 'court' | 'net' | 'skylight' | 'paint' | 'beam' | 'nightBeam' | 'atrium';

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
  /** Coastal cities: the sea covers everything at z below this, drawn as one large plane. */
  sea?: number;
  /** Pool and fountain surfaces (lit from below at night). */
  lights: [number, number][];
  /** Things that move on fixed routes (trains, boats): pieces round the origin and a pose in time. */
  movers?: import('./movers').Mover[];
  /** Aircraft that fly: their pieces around the origin (nose along +z), and their route. */
  flights?: { pieces: DPiece[]; piecesUp: DPiece[]; mode: 'land' | 'takeoff'; runZ: number; runX0: number; runX1: number }[];
}

/** Grid spacing of futuristic cities (see layout.ts). */
export const FUT_SPACING = 36;

export const VILLA_STYLES = ['modern', 'mediterranean', 'courtyard', 'classical', 'pavilion', 'tropical'] as const;
export type VillaStyle = (typeof VILLA_STYLES)[number];
export function villaStyle(b: Building): VillaStyle {
  return VILLA_STYLES[Math.floor(b.tone * VILLA_STYLES.length) % VILLA_STYLES.length];
}

const q = new THREE.Quaternion();
const e = new THREE.Euler();

/** Deterministic per-building random numbers. */
export function hashRand(seed: number) {
  return (k: number) => {
    const v = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
    return v - Math.floor(v);
  };
}

export function generateDistricts(layout: Layout, y0: number, warm: boolean): DistrictData {
  const out: DistrictData = { pieces: [], lights: [], movers: [] };
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
      case 'church':
        church(out, b, y0, warm);
        break;
      case 'park':
        park(out, b, y0, warm);
        break;
      case 'stadium':
        footballStadium(out, frame(out, b.x, b.z, y0, b.door).add, b, warm);
        break;
      case 'themepark':
        themePark(out, b, y0, warm);
        break;
      case 'arena':
        nbaArena(frame(out, b.x, b.z, y0, b.door).add, b);
        break;
      case 'oldhouse':
        oldHouse(out, b, y0);
        break;
      case 'mosqueSmall':
        mosqueSmall(out, b, y0, warm);
        break;
    }
  }
  if (layout.features) cityFeatures(out, layout, y0, warm);
  if (layout.features?.airport) airport(out, layout.features.airport, y0, warm);
  if (warm) boulevardPalms(out, layout, y0);
  return out;
}

/**
 * A local frame for a building: +lz points from the building towards its street
 * (where the door is), +lx to the right when facing the street.
 */
export function frame(out: DistrictData, ox: number, oz: number, y0: number, toward: [number, number]) {
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

export type Add = ReturnType<typeof frame>['add'];

export function palm(add: Add, lx: number, lz: number, h: number, r: (k: number) => number, k: number, y = 0) {
  add('palmTrunk', 'bark', lx, y, lz, 2.2, h, 2.2, new THREE.Color('#8a7256').offsetHSL(0, 0, (r(k) - 0.5) * 0.1), r(k + 1) * 6);
  // the trunk leans along its local +x by about 0.18 per unit height squared
  const lean = 0.18 * 2.2;
  const rot = r(k + 1) * 6;
  add('fronds', 'leaf', lx + Math.cos(rot) * lean, y + h, lz - Math.sin(rot) * lean, 4.2, 4, 4.2, new THREE.Color('#4f8a3a').offsetHSL((r(k + 2) - 0.5) * 0.04, 0, (r(k + 3) - 0.5) * 0.08), r(k + 4) * 6);
}

/** Arched opening: a dark recess with a semicircular head, flush with a wall facing +lz. */
export function archWindow(add: Add, lx: number, ly: number, lz: number, w: number, h: number, mat: DMat = 'glass', color = '#6f8ea6', rot = 0) {
  add('box', mat, lx, ly, lz, w, h - w / 2, 0.12, color, rot);
  add('arch', mat, lx, ly + h - w / 2, lz, w, w / 2, 0.12, color, rot);
}

// ───────────────────────── Villas ─────────────────────────

/**
 * A framed window on a facade whose outward normal is local +z turned by `rot`:
 * glass, a frame of four members, a projecting sill and, if asked, shutters or a small pediment.
 */
function win(add: Add, x: number, y: number, z: number, w: number, h: number, rot: number, frameCol: string, extra: 'none' | 'shutters' | 'pediment' | 'arch' = 'none', shutterCol = '#2f6f8a') {
  const tx = Math.cos(rot);
  const tz = -Math.sin(rot);
  const nx = Math.sin(rot);
  const nz = Math.cos(rot);
  if (extra === 'arch') {
    archWindow(add, x, y, z, w, h, 'glass', '#6f8ea6', rot);
    add('arch', 'plaster', x + nx * 0.03, y + h - w / 2, z + nz * 0.03, w + 0.3, (w + 0.3) / 2, 0.12, frameCol, rot);
  } else {
    add('box', 'glass', x, y, z, w, h, 0.1, '#6f8ea6', rot);
    add('box', 'plaster', x + nx * 0.04, y + h, z + nz * 0.04, w + 0.28, 0.16, 0.2, frameCol, rot);
    for (const s of [-1, 1]) add('box', 'plaster', x + tx * s * (w / 2 + 0.07) + nx * 0.04, y, z + tz * s * (w / 2 + 0.07) + nz * 0.04, 0.14, h, 0.2, frameCol, rot);
    // a mullion and transom divide the pane
    add('box', 'plaster', x + nx * 0.03, y, z + nz * 0.03, 0.06, h, 0.06, frameCol, rot);
    add('box', 'plaster', x + nx * 0.03, y + h * 0.66, z + nz * 0.03, w, 0.06, 0.06, frameCol, rot);
  }
  add('box', 'stone', x + nx * 0.12, y - 0.16, z + nz * 0.12, w + 0.42, 0.16, 0.34, '#e6e0d2', rot);
  if (extra === 'shutters') for (const s of [-1, 1]) add('box', 'wood', x + tx * s * (w / 2 + 0.45) + nx * 0.08, y, z + tz * s * (w / 2 + 0.45) + nz * 0.08, w * 0.5, h, 0.06, shutterCol, rot);
  if (extra === 'pediment') add('gable', 'plaster', x + nx * 0.1, y + h + 0.16, z + nz * 0.1, w + 0.6, 0.55, 0.22, frameCol, rot);
}

type Face = 'front' | 'back' | 'left' | 'right';
/** Windows evenly along one or more faces of a box W x D centred on (cx, cz), at one floor height. */
function windowsOn(add: Add, faces: Face[], cx: number, cz: number, W: number, D: number, y: number, h: number, every: number, frameCol: string, extra: 'none' | 'shutters' | 'pediment' | 'arch' = 'none', skipCentre = false, shutterCol?: string) {
  for (const f of faces) {
    const along = f === 'front' || f === 'back' ? W : D;
    const rot = f === 'front' ? 0 : f === 'back' ? Math.PI : f === 'right' ? Math.PI / 2 : -Math.PI / 2;
    const ox = f === 'right' ? W / 2 + 0.03 : f === 'left' ? -W / 2 - 0.03 : 0;
    const oz = f === 'front' ? D / 2 + 0.03 : f === 'back' ? -D / 2 - 0.03 : 0;
    const n = Math.max(1, Math.floor(along / every));
    const w = Math.min(1.5, (along / n) * 0.48);
    for (let k = 0; k < n; k++) {
      const t = -along / 2 + (along / n) * (k + 0.5);
      if (skipCentre && f === 'front' && Math.abs(t) < along / n / 2) continue;
      win(add, cx + ox + Math.cos(rot) * t, y, cz + oz - Math.sin(rot) * t, w, h, rot, frameCol, extra, shutterCol);
    }
  }
}

/** Balustrade: a rail on turned posts along local x (rot 0) or z (rot pi/2). */
function balustrade(add: Add, x: number, y: number, z: number, len: number, rot: number, col: string) {
  const tx = Math.cos(rot);
  const tz = -Math.sin(rot);
  add('box', 'stone', x, y + 0.82, z, len, 0.14, 0.24, col, rot);
  add('box', 'stone', x, y, z, len, 0.12, 0.26, col, rot);
  const posts = Math.max(2, Math.round(len / 0.42));
  for (let k = 0; k <= posts; k++) {
    const t = -len / 2 + (k * len) / posts;
    add('cyl', 'stone', x + tx * t, y + 0.12, z + tz * t, 0.15, 0.7, 0.15, col);
  }
}

/** Battlements along a parapet: alternating merlons. */
function merlons(add: Add, x: number, y: number, z: number, len: number, rot: number, col: THREE.Color | string) {
  const tx = Math.cos(rot);
  const tz = -Math.sin(rot);
  const n = Math.max(2, Math.floor(len / 1.2));
  for (let k = 0; k < n; k++) {
    const t = -len / 2 + 0.4 + (k * (len - 0.8)) / (n - 1);
    add('box', 'plaster', x + tx * t, y, z + tz * t, 0.55, 0.65, 0.4, col, rot);
  }
}

export function roundTree(add: Add, x: number, z: number, h: number, col: string, r: (k: number) => number, k: number) {
  add('cyl', 'bark', x, 0, z, 0.35, h * 0.5, 0.35, '#6a5240');
  const s = h * (0.55 + r(k) * 0.2);
  add('sphere', 'leaf', x, h * 0.55 + s * 0.35, z, s, s * 0.85, s, new THREE.Color(col).offsetHSL((r(k + 1) - 0.5) * 0.03, 0, (r(k + 2) - 0.5) * 0.08));
}

function flowerBed(add: Add, x: number, z: number, len: number, rot: number, r: (k: number) => number, k: number) {
  const tx = Math.cos(rot);
  const tz = -Math.sin(rot);
  add('box', 'stone', x, 0, z, len, 0.35, 1.1, '#cfc6b4', rot);
  add('box', 'dark', x, 0.3, z, len - 0.2, 0.12, 0.9, '#4a3626', rot);
  const blooms = ['#e8404a', '#f2a81e', '#f4f0e8', '#c84aa0', '#8a5ad8', '#ff7a4a'];
  const n = Math.max(3, Math.round(len / 0.7));
  for (let i = 0; i < n; i++) {
    const t = -len / 2 + 0.35 + (i * (len - 0.7)) / (n - 1);
    add('sphere', 'leaf', x + tx * t, 0.55, z + tz * t, 0.6, 0.45, 0.6, i % 3 === 0 ? '#3f6e30' : blooms[Math.floor(r(k + i) * blooms.length)]);
  }
}

export function lounger(add: Add, x: number, z: number, rot: number) {
  add('box', 'wood', x, 0.25, z, 0.75, 0.12, 1.9, '#b08a62', rot);
  add('box', 'cloth', x, 0.37, z, 0.7, 0.08, 1.8, '#f4f2ee', rot);
}

/** Stone quoins: alternating long and short blocks up the four corners of a box. */
function quoins(add: Add, cx: number, cz: number, W: number, D: number, y: number, H: number, col: string) {
  const n = Math.floor(H / 0.62);
  for (const s of [-1, 1]) for (const t of [-1, 1]) for (let k = 0; k < n; k++) {
    const long = k % 2 === 0;
    add('box', 'stone', cx + s * (W / 2 - (long ? 0.35 : 0.22) + 0.04), y + k * 0.62, cz + t * (D / 2 - (long ? 0.22 : 0.35) + 0.04), long ? 0.78 : 0.52, 0.56, long ? 0.52 : 0.78, col);
  }
}

/** A dormer window on a roof slope facing +z (local), at height y. */
function dormer(add: Add, x: number, y: number, z: number, col: string, roof: string) {
  add('box', 'plaster', x, y, z, 1.5, 1.5, 1.4, col);
  add('box', 'glass', x, y + 0.25, z + 0.71, 0.9, 1, 0.06, '#6f8ea6');
  add('gable', 'roof', x, y + 1.5, z, 1.9, 0.8, 1.6, roof);
}

/** A chimney stack with a stone cap and two pots. */
function chimney(add: Add, x: number, y: number, z: number, h: number, col: string | THREE.Color) {
  add('box', 'plaster', x, y, z, 1.2, h, 0.8, col);
  add('box', 'stone', x, y + h, z, 1.4, 0.2, 1, '#cfc6b4');
  for (const s of [-0.3, 0.3]) add('cyl', 'roof', x + s, y + h + 0.2, z, 0.3, 0.5, 0.3, '#a8583a');
}

function villa(out: DistrictData, b: Building, y0: number, warm: boolean) {
  const r = hashRand(b.tone * 1000 + b.x * 0.37 + b.z * 0.11);
  const style = villaStyle(b);
  const plotRect = b.plot ?? { x: Math.floor(b.x / FUT_SPACING) * FUT_SPACING + FUT_SPACING / 2, z: Math.floor(b.z / FUT_SPACING) * FUT_SPACING + FUT_SPACING / 2, w: 24, d: 24 };
  const plot = frame(out, plotRect.x, plotRect.z, y0, b.door);
  const pa = plot.add;
  // the plot frame faces the street, so local x runs along the frontage
  const cos = Math.cos(plot.ry);
  const sin = Math.sin(plot.ry);
  // a plot laid out along a curving estate road carries its own rotation and is sized in its frame
  const local = b.plot?.rot !== undefined;
  const along = local ? plotRect.w : Math.abs(sin) > 0.5 ? plotRect.d : plotRect.w;
  const deep = local ? plotRect.d : Math.abs(sin) > 0.5 ? plotRect.w : plotRect.d;
  const PW = along / 2;
  const PD = deep / 2;
  const hx = (b.x - plotRect.x) * cos - (b.z - plotRect.z) * sin;
  const hz = (b.x - plotRect.x) * sin + (b.z - plotRect.z) * cos;
  const hwx = plot.wx(hx, hz);
  const hwz = plot.wz(hx, hz);
  const house = frame(out, hwx, hwz, y0, [hwx + sin * 10, hwz + cos * 10]);
  const add = house.add;
  const W = b.w;
  const D = b.d;
  const H = b.h;
  const estate = PW > 20;
  const gardenSide = hx > 0 ? -1 : 1;
  const floors = H > 10.5 ? 3 : 2;
  const fh = (H - 0.45) / floors;
  const front = (lz: number) => lz;

  // ── grounds: striped lawn, boundary with coping and lamp piers, gate, drive
  const wallCol = style === 'modern' || style === 'pavilion' ? '#ecebe6' : style === 'courtyard' ? '#d9bf94' : style === 'mediterranean' ? '#e6d2b0' : style === 'tropical' ? '#8a7a66' : '#efe9dc';
  const lawnC = new THREE.Color('#5f8f3c').offsetHSL((r(1) - 0.5) * 0.03, 0, (r(2) - 0.5) * 0.05);
  pa('box', 'lawn', 0, 0, 0, PW * 2, 0.14, PD * 2, lawnC);
  const stripes = Math.floor((PW * 2) / 2.4);
  for (let k = 0; k < stripes; k += 2) pa('box', 'lawn', -PW + 1.2 + k * 2.4, 0.02, 0, 2.4, 0.14, PD * 2 - 0.6, lawnC.clone().offsetHSL(0, 0, 0.05));
  const hedge = style === 'classical' || style === 'mediterranean' || style === 'tropical';
  const wallH = hedge ? 1.6 : 1.9;
  const wall = (lx: number, lz: number, sx: number, sz: number) => {
    if (hedge) {
      pa('box', 'leaf', lx, 0, lz, sx, wallH, sz, '#3a6a2e');
    } else {
      pa('box', 'plaster', lx, 0, lz, sx, wallH, sz, wallCol);
      pa('box', 'stone', lx, wallH, lz, sx + 0.12, 0.14, sz + 0.12, '#d8d0c0');
    }
  };
  wall(0, -PD, PW * 2, 0.5);
  wall(-PW, 0, 0.5, PD * 2);
  wall(PW, 0, 0.5, PD * 2);
  // the gate sits in front of the house; the drive runs straight to the door
  const gx = estate ? hx : -gardenSide * 4.5;
  const gw = estate ? 5.2 : 4.2;
  const leftLen = gx - gw / 2 + PW;
  const rightLen = PW - (gx + gw / 2);
  wall(-PW + leftLen / 2, PD, leftLen, 0.5);
  wall(PW - rightLen / 2, PD, rightLen, 0.5);
  // piers with lamps along the frontage
  for (let x = -PW; x <= PW + 0.01; x += estate ? 8 : 6) {
    if (Math.abs(x - gx) < gw / 2 + 0.8) continue;
    pa('box', 'stone', x, 0, PD, 0.7, wallH + 0.4, 0.7, '#d8d0c0');
    pa('sphere', 'glow', x, wallH + 0.6, PD, 0.28, 0.28, 0.28, '#ffe2b0');
  }
  for (const s of [-1, 1]) {
    pa('box', 'stone', gx + s * (gw / 2 + 0.4), 0, PD, 0.9, 2.8, 0.9, '#d8d0c0');
    pa('box', 'stone', gx + s * (gw / 2 + 0.4), 2.8, PD, 1.1, 0.2, 1.1, '#cfc6b4');
    pa('sphere', style === 'classical' ? 'stone' : 'glow', gx + s * (gw / 2 + 0.4), 3.1, PD, 0.5, 0.6, 0.5, style === 'classical' ? '#ddd6c6' : '#ffe2b0');
  }
  for (const s of [-1, 1]) pa('box', 'metal', gx + s * gw * 0.25, 0.1, PD, gw * 0.48, 2, 0.08, '#24242a');
  const fz = hz + D / 2 + (style === 'classical' ? 3.6 : 0);
  const driveLen = Math.max(1, PD - fz);
  if (estate) {
    // motor court: a gravel forecourt across the whole front, kerbed, with a fountain or a clipped
    // topiary island in the middle and the cars drawn up at the sides
    const cw = Math.min(W + 6, 2 * (PW - Math.abs(gx)) - 2.4);
    pa('box', 'stone', gx, 0.03, (PD + fz) / 2, cw, 0.16, driveLen, '#ddd2b8');
    for (const s of [-1, 1]) pa('box', 'stone', gx + s * (cw / 2), 0.03, (PD + fz) / 2, 0.3, 0.24, driveLen, '#b8b0a0');
    const iz = fz + driveLen * 0.55;
    if (style !== 'classical' && driveLen > 7) {
      if (r(21) < 0.6) {
        fountain(pa, gx, iz, 3.6, true);
        out.lights.push([plot.wx(gx, iz), plot.wz(gx, iz)]);
      } else {
        pa('cyl', 'stone', gx, 0, iz, 4.4, 0.4, 4.4, '#cfc6b4');
        pa('cyl', 'lawn', gx, 0.3, iz, 4, 0.14, 4, '#5f8f3c');
        pa('sphere', 'leaf', gx, 0.4, iz, 2, 2, 2, '#3a6a2e');
        for (let k = 0; k < 6; k++) pa('cone', 'leaf', gx + Math.cos(k) * 1.6, 0.4, iz + Math.sin(k) * 1.6, 0.5, 1.1, 0.5, '#335e2a');
      }
    }
    for (const s of [-1, 1]) {
      if (driveLen > 5) carProp(pa, gx + s * (cw / 2 - 1.8), fz + driveLen * 0.5, (k) => r(k + (s > 0 ? 7 : 0)));
      for (let z = fz + 1; z < PD - 0.5; z += 3) pa('cyl', 'glow', gx + s * (cw / 2 - 0.5), 0, z, 0.16, 0.6, 0.16, '#ffe0a8');
    }
  } else {
    pa('box', 'stone', gx, 0.03, (PD + fz) / 2, 3.6, 0.16, driveLen, '#d6cfc0');
    for (const s of [-1, 1]) pa('box', 'stone', gx + s * 1.9, 0.03, (PD + fz) / 2, 0.25, 0.22, driveLen, '#b8b0a0');
    for (let z = fz + 1.5; z < PD - 1; z += 3.5) for (const s of [-1, 1]) pa('cyl', 'glow', gx + s * 2.2, 0, z, 0.16, 0.6, 0.16, '#ffe0a8');
    if (driveLen > 5) carProp(pa, gx, fz + Math.min(driveLen - 2.6, 3.2), r);
  }

  // ── garden: pool (and on estates a pool house, a tennis court or a formal garden, a gazebo)
  const gx0 = hx + gardenSide * (W / 2 + 2);
  const gx1 = gardenSide * (PW - 1.6);
  const gcx = (gx0 + gx1) / 2;
  const gW = Math.abs(gx1 - gx0);
  let tennis = false;
  if (gW >= 16) {
    const poolL = Math.min(gW - 5, 15);
    const pz = PD - 6.5;
    pa('box', 'marble', gcx, 0.02, pz, poolL + 3, 0.2, 7.4, '#ecebe6');
    pa('box', 'water', gcx, 0.08, pz, poolL, 0.18, 4.6, '#3fb6d8');
    out.lights.push([plot.wx(gcx, pz), plot.wz(gcx, pz)]);
    for (let k = 0; k < 4; k++) lounger(pa, gcx - poolL / 2 + 1 + k * 1.3, pz - 3.1, 0);
    pa('cyl', 'metal', gcx + poolL / 2 - 1, 0.2, pz - 3.2, 0.08, 2.4, 0.08, '#8a8a8a');
    pa('cone', 'cloth', gcx + poolL / 2 - 1, 2.1, pz - 3.2, 3, 0.7, 3, r(9) < 0.5 ? '#f2efe6' : '#2f6f8a');
    // pool house at the far end
    const phx = gcx + gardenSide * (poolL / 2 + 0.2);
    pa('box', 'plaster', phx, 0, pz - 0.2, 3.2, 3, 4.6, wallCol);
    pa('box', 'glass', phx - gardenSide * 1.62, 0.2, pz - 0.2, 0.1, 2.4, 3.8, '#6f8ea6', Math.PI / 2);
    pa('box', 'dark', phx, 3, pz - 0.2, 4, 0.25, 5.4, '#5a5e64');
    const feature = r(18);
    tennis = feature < 0.45 && gW >= 24;
    if (tennis) {
      // tennis court with lines and a net
      const cz = -PD + 6.8;
      pa('box', 'cloth', gcx, 0.03, cz, 24, 0.14, 11.6, '#3a7a5a');
      pa('box', 'cloth', gcx, 0.04, cz, 22, 0.14, 9.6, '#4a6a9a');
      for (const lz of [-4.8, 4.8, -3.6, 3.6]) pa('box', 'plaster', gcx, 0.06, cz + lz, 22, 0.13, 0.08, '#f4f4f0');
      for (const lx of [-11, 11, -6.4, 6.4]) pa('box', 'plaster', gcx + lx, 0.06, cz, 0.08, 0.13, lx === -11 || lx === 11 ? 9.6 : 7.2, '#f4f4f0');
      pa('box', 'plaster', gcx, 0.06, cz, 12.8, 0.13, 0.08, '#f4f4f0', Math.PI / 2);
      pa('box', 'metal', gcx, 0.1, cz, 0.06, 1, 10.4, '#e8e8e8');
      for (const s of [-1, 1]) pa('box', 'metal', gcx + s * 12.2, 0, cz, 0.06, 3, 11.8, '#3a3e44');
    } else if (feature < 0.8) {
      // formal garden: hedge parterre round a fountain, topiary cones
      const cz = -PD + 6.5;
      fountain(pa, gcx, cz, 3.4, true);
      out.lights.push([plot.wx(gcx, cz), plot.wz(gcx, cz)]);
      for (const s of [-1, 1]) for (const t of [-1, 1]) {
        pa('box', 'leaf', gcx + s * 4.5, 0, cz + t * 2.6, 5, 0.7, 0.5, '#3a6a2e');
        pa('box', 'leaf', gcx + s * 6.8, 0, cz + t * 1.5, 0.5, 0.7, 2.6, '#3a6a2e');
        pa('cone', 'leaf', gcx + s * 7.6, 0, cz + t * 3.4, 1, 2.6, 1, '#335e2a');
      }
      flowerBed(pa, gcx, cz - 4.2, Math.min(gW - 4, 12), 0, r, 60);
    } else {
      // a gazebo on the lawn with a table
      const cz = -PD + 6;
      pa('oct', 'marble', gcx, 0, cz, 6, 0.4, 6, '#ece6da');
      for (let k = 0; k < 8; k++) pa('cyl', 'marble', gcx + Math.cos((k * Math.PI) / 4) * 2.7, 0.4, cz + Math.sin((k * Math.PI) / 4) * 2.7, 0.3, 2.8, 0.3, '#f6f2ea');
      pa('oct', 'marble', gcx, 3.2, cz, 6.6, 0.4, 6.6, '#ece6da');
      pa('cone', 'roof', gcx, 3.6, cz, 7, 2, 7, style === 'mediterranean' ? '#b4553a' : '#5a6068');
      pa('cyl', 'wood', gcx, 0.4, cz, 1.8, 0.8, 1.8, '#8a6a4a');
    }
  } else {
    // a narrow side garden: a long pool with a deck, loungers and an umbrella
    const poolX = gardenSide * (PW - 4.2);
    const poolL = Math.min(9, PD * 2 - 6);
    pa('box', 'marble', poolX, 0.02, -0.5, 6.4, 0.2, poolL + 2.4, '#ecebe6');
    pa('box', 'water', poolX, 0.08, -0.5, 4.4, 0.18, poolL, '#3fb6d8');
    out.lights.push([plot.wx(poolX, -0.5), plot.wz(poolX, -0.5)]);
    for (const k of [0, 1]) lounger(pa, poolX - gardenSide * 2.6, -2.5 + k * 1.6, 0);
    pa('cyl', 'metal', poolX - gardenSide * 2.6, 0.2, 2.2, 0.08, 2.4, 0.08, '#8a8a8a');
    pa('cone', 'cloth', poolX - gardenSide * 2.6, 2.1, 2.2, 2.8, 0.7, 2.8, r(9) < 0.5 ? '#f2efe6' : '#2f6f8a');
  }
  // trees along the boundary and flower beds before the house
  const trees = estate ? 8 : 4;
  for (let k = 0; k < trees; k++) {
    const t = (k + 0.5) / trees;
    const lx = -PW + 1.6 + t * (PW * 2 - 3.2);
    const lz = -PD + 1.5;
    // no trees on the tennis court or behind a house that stands at the back of its plot
    if (tennis && (lx - gx0) * (lx - gx1) < 0) continue;
    if (Math.abs(lx - hx) < W / 2 + 2 && hz - D / 2 < -PD + 4) continue;
    if (warm && k % 2 === 0) palm(pa, lx, lz, 6 + r(30 + k) * 3.5, r, 40 + k * 5);
    else if (style === 'mediterranean' || style === 'classical') pa('cone', 'leaf', lx, 0, lz, 1.2, 5.5 + r(30 + k) * 2, 1.2, '#2f5a2c');
    else roundTree(pa, lx, lz, 4.5 + r(30 + k) * 2, warm ? '#6a8a4a' : '#3f6a34', r, 70 + k * 3);
  }
  for (const s of [-1, 1]) if (warm) palm(pa, s * (PW - 1.6), PD - 1.8, 6 + r(80 + s) * 3, r, 90 + s * 5);
  flowerBed(add, -W * 0.3, D / 2 + 1, W * 0.3, 0, r, 100);
  flowerBed(add, W * 0.3, D / 2 + 1, W * 0.3, 0, r, 110);
  // facade uplights
  for (const s of [-1, 0, 1]) add('box', 'glow', s * W * 0.4, 0.05, D / 2 + 0.5, 0.3, 0.12, 0.3, '#ffe6b8');

  // ── the house itself, by style
  switch (style) {
    case 'modern': {
      add('box', 'stone', 0, 0, 0, W + 0.6, 0.45, D + 0.6, '#d8d4cc');
      add('box', 'plaster', 0, 0.45, 0, W, fh, D, '#f3f2ee');
      // floor-to-ceiling glazing with slim mullions
      add('box', 'glass', -W * 0.08, 0.6, D / 2 + 0.03, W * 0.72, fh - 0.4, 0.1, '#6f8ea6');
      for (let k = 0; k <= 6; k++) add('box', 'metal', -W * 0.08 - W * 0.36 + (k * W * 0.72) / 6, 0.6, D / 2 + 0.06, 0.08, fh - 0.4, 0.08, '#2a2a2e');
      const ux = W * 0.14 * (r(4) < 0.5 ? 1 : -1);
      const uw = W * 0.74;
      const ud = D * 0.9;
      const uy = 0.45 + fh;
      add('box', 'plaster', ux, uy, 1.4, uw, fh, ud, '#f7f7f4');
      add('box', 'glass', ux + uw * 0.12, uy + fh * 0.32, 1.4 + ud / 2 + 0.03, uw * 0.62, fh * 0.42, 0.1, '#6f8ea6');
      // timber or stone fins over part of the upper floor
      const finM: DMat = r(14) < 0.5 ? 'wood' : 'stone';
      for (let k = 0; k < 9; k++) add('box', finM, ux - uw * 0.46 + k * 0.42, uy + 0.2, 1.4 + ud / 2 + 0.2, 0.12, fh - 0.4, 0.4, finM === 'wood' ? '#9a6a42' : '#bcb2a0');
      // thin roof planes with a lit soffit
      for (const [x, y, z, w, d] of [[0, uy, 0, W + 0.6, D + 0.6], [ux, uy + fh, 1.4, uw + 1.4, ud + 1.4]] as const) {
        add('box', 'dark', x, y - 0.05, z, w, 0.3, d, '#4a4e54');
        add('box', 'plaster', x, y + 0.25, z, w - 0.1, 0.06, d - 0.1, '#e2e2de');
        add('box', 'glow', x, y - 0.08, z + d / 2 - 0.15, w - 0.4, 0.05, 0.08, '#ffe6c0');
      }
      if (floors === 3) {
        // a glass penthouse with a roof terrace
        add('box', 'glass', ux - uw * 0.15, uy + fh + 0.3, 0.6, uw * 0.45, fh * 0.9, ud * 0.55, '#6f8ea6');
        add('box', 'plaster', ux - uw * 0.15, uy + fh * 1.9 + 0.3, 0.6, uw * 0.55, 0.25, ud * 0.65, '#efefec');
        add('box', 'glass', ux + uw * 0.2, uy + fh + 0.3, 1.4 + ud / 2 + 0.1, uw * 0.5, 1, 0.06, '#9ec4d8');
      }
      // a planted roof on the lower volume and a bronze band along the upper floor
      add('box', 'lawn', -ux * 1.6, uy + 0.32, 0, W - uw - 0.2, 0.12, D - 0.6, '#6a9a44');
      for (let k = 0; k < 5; k++) add('sphere', 'leaf', -ux * 1.6 + (r(30 + k) - 0.5) * (W - uw - 1), uy + 0.45, (r(40 + k) - 0.5) * (D - 2), 0.9, 0.6, 0.9, '#4f7a34');
      add('box', 'metal', ux, uy + fh - 0.5, 1.4 + ud / 2 + 0.05, uw + 0.2, 0.35, 0.1, '#8a6a3a');
      // terrace rail on the exposed ground roof, a stone feature wall, an entrance canopy
      add('box', 'glass', -ux * 1.6, uy + 0.25, D / 2 - 0.1, W - uw + 0.6, 1, 0.06, '#9ec4d8');
      add('box', 'stone', -W / 2 - 0.5, 0, 1, 1, H * 0.82, D + 3, ['#5a5650', '#b8a890', '#3a3e44'][Math.floor(r(15) * 3)]);
      add('box', 'plaster', W * 0.36, 2.9, D / 2 + 1.3, 3.4, 0.2, 2.6, '#f3f2ee');
      add('box', 'wood', W * 0.36, 0.45, D / 2 + 0.04, 1.5, 2.4, 0.1, '#7a5232');
      windowsOn(add, ['back', 'left', 'right'], 0, 0, W, D, 0.45 + 0.6, fh - 1.2, 3, '#3a3e44');
      windowsOn(add, ['back', 'right'], ux, 1.4, uw, ud, uy + 0.6, fh - 1.2, 3, '#3a3e44');
      break;
    }
    case 'mediterranean': {
      const wallC = new THREE.Color(['#ead8b4', '#f0e2c8', '#e8cfa6', '#f2e6d4'][Math.floor(r(5) * 4)]);
      const roofC = ['#b4553a', '#9a4a32', '#c06a3e', '#a85a3a'][Math.floor(r(11) * 4)];
      const shutter = ['#2f6f8a', '#4f7a3a', '#6a4a8a', '#8a5a2a'][Math.floor(r(8) * 4)];
      add('box', 'stone', 0, 0, 0, W + 0.6, 0.45, D + 0.6, '#cfc0a0');
      add('box', 'plaster', 0, 0.45, 0, W, H - 0.45, D, wallC);
      add('box', 'plaster', 0, H - 0.35, 0, W + 0.6, 0.35, D + 0.6, wallC.clone().offsetHSL(0, 0, 0.04));
      add('hip', 'roof', 0, H, 0, W * 1.12, H * 0.3, D * 1.16, roofC);
      chimney(add, W * 0.3, H, -D * 0.2, H * 0.34 + 0.6, wallC);
      chimney(add, -W * 0.32, H, D * 0.1, H * 0.3 + 0.6, wallC);
      quoins(add, 0, 0, W, D, 0.45, H - 0.8, '#efe4cc');
      // a belvedere tower at a back corner: an open loggia under its own hipped roof
      {
        const tx = (W / 2 - 1.8) * (r(22) < 0.5 ? 1 : -1);
        const tz = -D / 2 + 1.8;
        add('box', 'plaster', tx, 0.45, tz, 3.6, H + 2.2, 3.6, wallC);
        quoins(add, tx, tz, 3.6, 3.6, 0.45, H + 2.2, '#efe4cc');
        for (let f = 0; f < 4; f++) {
          const a = (f * Math.PI) / 2;
          archWindow(add, tx + Math.sin(a) * 1.82, H + 0.2, tz + Math.cos(a) * 1.82, 1.1, 1.9, 'dark', '#2a2420', a);
        }
        add('box', 'plaster', tx, H + 2.65, tz, 4.2, 0.3, 4.2, wallC.clone().offsetHSL(0, 0, 0.04));
        add('hip', 'roof', tx, H + 2.95, tz, 4.6, 1.8, 4.6, roofC);
      }
      if (!estate || r(23) < 0.6) for (const k of [-1, 1]) dormer(add, k * W * 0.22, H + 0.4, D * 0.18, wallC.getStyle(), roofC);
      // arcaded loggia across the front with a balcony above
      const bays = W > 15 ? 5 : 3;
      const lw = W * 0.7;
      const lz = D / 2 + 1.7;
      for (let k = 0; k <= bays; k++) add('cyl', 'stone', -lw / 2 + (k * lw) / bays, 0.45, lz, 0.5, fh - 0.9, 0.5, '#efe6d4');
      for (let k = 0; k < bays; k++) add('arch', 'plaster', -lw / 2 + (lw / bays) * (k + 0.5), 0.45 + fh - 0.9 - (lw / bays) / 2 + 0.2, lz, lw / bays - 0.5, (lw / bays - 0.5) / 2, 0.45, wallC);
      add('box', 'plaster', 0, 0.45 + fh - 0.5, lz - 0.85, lw + 0.6, 0.55, 2.3, wallC);
      balustrade(add, 0, 0.45 + fh + 0.05, lz + 0.2, lw + 0.4, 0, '#f0e8d6');
      add('box', 'stone', 0, 0, lz - 0.85, lw + 1, 0.5, 2.6, '#d8ccb4');
      // windows with shutters all round, arched French doors above the loggia
      windowsOn(add, ['back', 'left', 'right'], 0, 0, W, D, 1.2, fh - 1.7, 2.8, '#f6efe0', 'shutters', false, shutter);
      windowsOn(add, ['back', 'left', 'right'], 0, 0, W, D, 0.45 + fh + 0.7, fh - 1.6, 2.8, '#f6efe0', 'shutters', false, shutter);
      for (let k = 0; k < bays; k++) win(add, -lw / 2 + (lw / bays) * (k + 0.5), 0.45 + fh + 0.6, D / 2 + 0.03, 1.2, fh - 1.2, 0, '#f6efe0', 'arch');
      if (floors === 3) windowsOn(add, ['front'], 0, 0, W, D, 0.45 + fh * 2 + 0.6, fh - 1.4, 2.8, '#f6efe0', 'shutters', false, shutter);
      // a wing with its own hipped roof, bougainvillea on the walls, pots and a vine pergola
      const wx = (W / 2 + 3) * (r(7) < 0.5 ? 1 : -1);
      if (Math.abs(hx + wx) < PW - 3.5) {
        add('box', 'plaster', wx, 0.45, -1.2, 6, fh, D * 0.66, wallC);
        add('hip', 'roof', wx, 0.45 + fh, -1.2, 6.8, 2, D * 0.74, roofC);
        windowsOn(add, ['front'], wx, -1.2, 6, D * 0.66, 1.2, fh - 1.6, 3, '#f6efe0', 'shutters', false, shutter);
      }
      // bougainvillea climbing the front corners, flat against the wall
      for (const x of [-W / 2 + 0.6, W / 2 - 0.6]) {
        for (let k = 0; k < 4; k++) add('sphere', 'leaf', x + (r(120 + k) - 0.5) * 0.9, 0.6 + k * 1.15, D / 2 + 0.25, 1.1 - k * 0.12, 1, 0.45, k % 2 ? '#c8348a' : '#d84a9a');
        add('box', 'leaf', x, 0.4, D / 2 + 0.2, 0.9, fh * 1.4, 0.25, '#3f6e30');
      }
      for (let k = 0; k < 4; k++) add('cyl', 'roof', -W / 2 + 0.8 + k * 1.2, 0, D / 2 + 3.4, 0.8, 0.9, 0.8, '#b8603e');
      break;
    }
    case 'courtyard': {
      // a U-shaped house round a courtyard: crenellated sand walls, domes, wind towers, an arcade
      const wallC = new THREE.Color(['#dcc298', '#e4cfa6', '#d2b484'][Math.floor(r(5) * 3)]);
      const bz = -D * 0.3;
      const bd = D * 0.4;
      const sw = W * 0.24;
      add('box', 'stone', 0, 0, 0, W + 0.6, 0.45, D + 0.6, '#cfb48a');
      add('box', 'plaster', 0, 0.45, bz, W, H * 0.78, bd, wallC);
      for (const s of [-1, 1]) add('box', 'plaster', s * (W / 2 - sw / 2), 0.45, 0, sw, H * 0.64, D, wallC);
      merlons(add, 0, 0.45 + H * 0.78, bz - bd / 2 + 0.2, W, 0, wallC);
      merlons(add, 0, 0.45 + H * 0.78, bz + bd / 2 - 0.2, W * 0.5, 0, wallC);
      for (const s of [-1, 1]) {
        merlons(add, s * (W / 2 - 0.2), 0.45 + H * 0.64, 0, D, Math.PI / 2, wallC);
        merlons(add, s * (W / 2 - sw + 0.2), 0.45 + H * 0.64, D * 0.1, D * 0.75, Math.PI / 2, wallC);
      }
      // courtyard: marble floor, arcades along the wings, a fountain and palms
      add('box', 'marble', 0, 0.45, D * 0.2, W - sw * 2, 0.06, D * 0.6, '#ece4d4');
      fountain(add, 0, D * 0.2, 2.8, true);
      out.lights.push([house.wx(0, D * 0.2), house.wz(0, D * 0.2)]);
      for (const s of [-1, 1]) {
        const ax = s * (W / 2 - sw - 1.2);
        for (let k = 0; k <= 4; k++) add('cyl', 'plaster', ax, 0.45, -bd * 0.2 + (k * (D / 2 + bd * 0.2)) / 4.2, 0.45, 3, 0.45, wallC.clone().offsetHSL(0, 0, 0.04));
        add('box', 'plaster', ax, 3.45, D * 0.18, 0.6, 0.6, D * 0.72, wallC);
        add('box', 'plaster', s * (W / 2 - sw - 0.6), 3.45, D * 0.18, 1.2, 0.3, D * 0.72, wallC.clone().offsetHSL(0, 0, -0.04));
        if (warm) palm(add, s * (W / 2 - sw - 3), D * 0.32, 5 + r(150 + s) * 2, r, 160 + s * 5, 0.45);
      }
      // domes: a great one on the hall, small ones on the wings
      const domeKind = Math.floor(r(6) * 3);
      const domeM: DMat = domeKind === 0 ? 'gold' : 'plaster';
      const domeC = ['#d8b25a', '#f2ebdd', '#3f9a9a'][domeKind];
      add('cyl', 'plaster', 0, 0.45 + H * 0.78, bz, 5.4, 1.6, 5.4, wallC);
      for (let k = 0; k < 8; k++) archWindow(add, Math.sin((k * Math.PI) / 4) * 2.72, 0.45 + H * 0.78 + 0.2, bz + Math.cos((k * Math.PI) / 4) * 2.72, 0.6, 1.2, 'glass', '#6f8ea6', (k * Math.PI) / 4);
      add('hemi', domeM, 0, 0.45 + H * 0.78 + 1.6, bz, 5.8, 5, 5.8, domeC);
      add('sphere', 'gold', 0, 0.45 + H * 0.78 + 4.3, bz, 0.4, 0.9, 0.4, '#e2c070');
      for (const s of [-1, 1]) {
        add('cyl', 'plaster', s * (W / 2 - sw / 2), 0.45 + H * 0.64, D / 2 - 2, 2.4, 0.8, 2.4, wallC);
        add('hemi', domeM, s * (W / 2 - sw / 2), 0.45 + H * 0.64 + 0.8, D / 2 - 2, 2.6, 2.4, 2.6, domeC);
      }
      // wind towers with slatted vents
      for (const s of [-1, 1]) {
        const tx = s * W * 0.34;
        add('box', 'plaster', tx, 0.45 + H * 0.78, bz, 2.4, 4.6, 2.4, wallC.clone().offsetHSL(0, 0, 0.03));
        for (let f = 0; f < 4; f++) {
          const a = (f * Math.PI) / 2;
          for (const o of [-0.55, 0, 0.55]) add('box', 'dark', tx + Math.sin(a) * 1.22 + Math.cos(a) * o, 0.45 + H * 0.78 + 2, bz + Math.cos(a) * 1.22 - Math.sin(a) * o, 0.22, 2.2, 0.08, '#3a2a1e', a);
        }
        add('box', 'plaster', tx, 0.45 + H * 0.78 + 4.6, bz, 2.8, 0.35, 2.8, wallC);
      }
      // arched windows behind carved screens on the outer walls, mashrabiya oriels upstairs
      for (const s of [-1, 1]) {
        windowsOn(add, [s > 0 ? 'right' : 'left'], s * (W / 2 - sw / 2), 0, sw, D, 1.2, 2.4, 3, wallC.getStyle(), 'arch');
        add('box', 'wood', s * (W / 2 + 0.5), 0.45 + H * 0.36, D * 0.1, 1, 2.4, 2.8, '#8a5e36');
        add('box', 'wood', s * (W / 2 + 0.5), 0.45 + H * 0.36 + 2.4, D * 0.1, 1.3, 0.25, 3.1, '#6a4428');
      }
      windowsOn(add, ['front'], 0, bz, W * 0.5, bd, 1.4, 2.6, 2.6, wallC.getStyle(), 'arch');
      windowsOn(add, ['back'], 0, bz, W, bd, 1.4, 2.6, 3, wallC.getStyle(), 'arch');
      // a grand arched gateway joining the wings at the front
      add('box', 'plaster', 0, 0.45, D / 2 - 0.4, 5.4, H * 0.74, 1.2, wallC.clone().offsetHSL(0, 0, -0.03));
      archWindow(add, 0, 0.5, D / 2 + 0.22, 3, H * 0.56, 'dark', '#2a1c12');
      add('box', 'wood', 0, 0.5, D / 2 + 0.24, 2.6, 3.2, 0.06, '#7a4e2a');
      merlons(add, 0, 0.45 + H * 0.74, D / 2 - 0.4, 5.4, 0, wallC);
      for (const s of [-1, 1]) {
        add('box', 'plaster', s * (sw / 2 + W * 0.14), 0.45, D / 2 - 0.4, W * 0.28 - 2.4, 2.6, 0.6, wallC);
        add('sphere', 'glow', s * 2.2, 2.8, D / 2 + 0.4, 0.35, 0.5, 0.35, '#ffc070');
      }
      break;
    }
    case 'classical': {
      // neo-Palladian: rusticated base, string course, cornice and balustrade, cupola, portico, wings
      const ivory = new THREE.Color(['#f2ece0', '#efe3c4', '#e4e8ec', '#f3e6dc'][Math.floor(r(12) * 4)]);
      const stoneC = '#ddd6c6';
      const cw = W * 0.56;
      add('box', 'stone', 0, 0, 0, W + 0.8, 0.6, D + 0.8, '#d4ccbc');
      add('box', 'plaster', 0, 0.6, 0, cw, H - 0.6, D, ivory);
      for (let k = 1; k <= 3; k++) add('box', 'stone', 0, 0.6 + (k * (fh - 0.4)) / 4, D / 2 + 0.02, cw + 0.04, 0.06, 0.06, '#cfc6b4');
      add('box', 'stone', 0, 0.6 + fh - 0.2, 0, cw + 0.3, 0.25, D + 0.3, stoneC);
      add('box', 'stone', 0, H - 0.1, 0, cw + 0.8, 0.5, D + 0.8, stoneC);
      balustrade(add, 0, H + 0.4, D / 2 + 0.2, cw + 0.6, 0, '#e8e2d6');
      balustrade(add, 0, H + 0.4, -D / 2 - 0.2, cw + 0.6, 0, '#e8e2d6');
      for (const s of [-1, 1]) for (const t of [-1, 1]) {
        add('box', 'stone', s * (cw / 2 + 0.2), H + 0.4, t * (D / 2 + 0.2), 0.6, 1.1, 0.6, stoneC);
        add('sphere', 'stone', s * (cw / 2 + 0.2), H + 1.75, t * (D / 2 + 0.2), 0.6, 0.8, 0.6, '#e2dccd');
      }
      add('hip', 'roof', 0, H + 0.4, 0, cw * 0.9, 1.6, D * 0.85, '#5a6068');
      quoins(add, 0, 0, cw, D, 0.6, H - 0.8, '#e2dccd');
      for (const s of [-1, 1]) chimney(add, s * cw * 0.32, H + 0.4, -D * 0.15, 2.4, ivory);
      // cupola on the roof
      add('cyl', 'plaster', 0, H + 1.6, 0, 3.2, 1.8, 3.2, ivory);
      for (let k = 0; k < 8; k++) add('cyl', 'stone', Math.cos((k * Math.PI) / 4) * 1.65, H + 1.6, Math.sin((k * Math.PI) / 4) * 1.65, 0.2, 1.8, 0.2, stoneC);
      add('hemi', 'roof', 0, H + 3.4, 0, 3.6, 3, 3.6, '#4a7a7a');
      add('sphere', 'gold', 0, H + 4.9, 0, 0.35, 0.6, 0.35, '#e2c070');
      // wings with their own cornice and balustrade
      for (const s of [-1, 1]) {
        const wx = s * (cw / 2 + W * 0.11);
        add('box', 'plaster', wx, 0.6, -0.8, W * 0.22, fh * 1.4, D * 0.82, ivory);
        add('box', 'stone', wx, 0.6 + fh * 1.4, -0.8, W * 0.22 + 0.5, 0.35, D * 0.82 + 0.5, stoneC);
        balustrade(add, wx, 0.6 + fh * 1.4 + 0.35, -0.8 + D * 0.41 + 0.15, W * 0.22, 0, '#e8e2d6');
        windowsOn(add, ['front'], wx, -0.8, W * 0.22, D * 0.82, 1.3, fh * 1.4 - 1.6, 2.6, '#f8f4ec', 'pediment');
        windowsOn(add, [s > 0 ? 'right' : 'left'], wx, -0.8, W * 0.22, D * 0.82, 1.3, fh * 1.4 - 1.6, 3, '#f8f4ec');
      }
      // windows: tall below, pedimented above, all round
      windowsOn(add, ['front'], 0, 0, cw, D, 1.3, fh - 1.8, 2.4, '#f8f4ec', 'none', true);
      windowsOn(add, ['front', 'back'], 0, 0, cw, D, 0.6 + fh + 0.4, fh - 1.6, 2.4, '#f8f4ec', 'pediment');
      windowsOn(add, ['back'], 0, 0, cw, D, 1.3, fh - 1.8, 2.4, '#f8f4ec');
      if (floors === 3) windowsOn(add, ['front', 'back'], 0, 0, cw, D, 0.6 + fh * 2 + 0.3, fh - 1.8, 2.4, '#f8f4ec');
      // portico: steps, columns with bases and capitals, entablature, pediment
      const pw = cw * 0.8;
      for (let k = 0; k < 3; k++) add('box', 'marble', 0, 0, D / 2 + 3.4 - k * 0.5, pw + 2 - k * 0.4, 0.2 + k * 0.2, 1.2 + k * 0.6, '#ebe6dc');
      const cols = r(13) < 0.5 ? 4 : 6;
      for (let k = 0; k < cols; k++) {
        const lx = -pw / 2 + (k * pw) / (cols - 1);
        add('box', 'marble', lx, 0.6, D / 2 + 2.6, 1, 0.35, 1, '#e6e0d4');
        add('cyl', 'marble', lx, 0.95, D / 2 + 2.6, 0.75, H - 1.9, 0.75, '#f6f2ea');
        add('box', 'marble', lx, H - 0.95, D / 2 + 2.6, 1.05, 0.35, 1.05, '#e6e0d4');
      }
      add('box', 'marble', 0, H - 0.6, D / 2 + 1.5, pw + 1.2, 0.9, 3, '#ebe6dc');
      add('gable', 'marble', 0, H + 0.3, D / 2 + 2.3, pw + 1.4, 2.4, 1.6, '#efe9de');
      add('box', 'wood', 0, 0.6, D / 2 + 0.04, 1.9, 3.2, 0.08, '#4a2e1c');
      add('arch', 'glass', 0, 3.8, D / 2 + 0.04, 1.9, 0.95, 0.08, '#6f8ea6');
      break;
    }
    case 'pavilion': {
      // two glass volumes crossing at right angles, white roof plates, a stone wall, a deck
      const g1 = fh + 0.2;
      add('box', 'wood', 0, 0, 1.2, W + 3, 0.4, D + 4, '#a07a52');
      add('box', 'stone', -W * 0.32, 0.4, -D * 0.1, W * 0.2, H * 0.9, D * 0.8, ['#8a8278', '#c8b8a0', '#4a4844'][Math.floor(r(16) * 3)]);
      add('box', 'glass', W * 0.05, 0.4, 0, W * 0.86, g1, D * 0.72, '#6f8ea6');
      for (let k = 0; k <= 8; k++) add('box', 'metal', W * 0.05 - W * 0.43 + (k * W * 0.86) / 8, 0.4, D * 0.36 + 0.03, 0.06, g1, 0.06, '#d8d8d8');
      add('box', 'plaster', 0, 0.4 + g1, 0, W + 2.4, 0.35, D + 1.6, '#f4f4f0');
      add('box', 'glow', 0, 0.4 + g1 - 0.06, D / 2 + 0.6, W + 2, 0.05, 0.1, '#ffe6c0');
      const g2y = 0.75 + g1;
      add('box', 'glass', W * 0.22, g2y, 0.6, W * 0.42, fh, D * 1.3, '#6f8ea6');
      add('box', 'plaster', W * 0.22, g2y + fh, 0.6, W * 0.46 + 0.6, 0.3, D * 1.3 + 0.8, '#f4f4f0');
      for (let k = 0; k <= 6; k++) add('box', 'metal', W * 0.22 - W * 0.21 + (k * W * 0.42) / 6, g2y, 0.6 + D * 0.65 + 0.03, 0.06, fh, 0.06, '#d8d8d8');
      for (const s of [-1, 1]) for (const t of [-1, 1]) add('cyl', 'metal', s * (W / 2 + 0.8), 0.4, t * (D / 2 + 0.4), 0.2, g1, 0.2, '#e0e0e0');
      // fire pit and lounge on the deck
      add('cyl', 'stone', -W * 0.1, 0.4, D / 2 + 2.2, 1.6, 0.45, 1.6, '#6a6560');
      add('cyl', 'glow', -W * 0.1, 0.85, D / 2 + 2.2, 1, 0.08, 1, '#ff9a40');
      for (const s of [-1, 1]) add('box', 'cloth', -W * 0.1 + s * 2, 0.4, D / 2 + 2.2, 0.9, 0.45, 2.2, '#e8e2d8');
      windowsOn(add, ['back'], W * 0.05, 0, W * 0.86, D * 0.72, 0.8, g1 - 0.8, 2.2, '#d8d8d8');
      break;
    }
    case 'tropical': {
      // timber pavilions under deep, steep roofs round a water garden
      const timber = '#7a5236';
      const roofC = ['#6a5440', '#7a5e44', '#58624e'][Math.floor(r(19) * 3)];
      add('box', 'stone', 0, 0, 0, W + 1, 0.7, D + 1, '#8a8070');
      add('box', 'glass', 0, 0.7, 0, W * 0.82, fh + 0.6, D * 0.78, '#6f8ea6');
      for (let k = 0; k <= 6; k++) for (const t of [-1, 1]) add('box', 'wood', -W * 0.41 + (k * W * 0.82) / 6, 0.7, t * D * 0.39, 0.25, fh + 0.6, 0.25, timber);
      add('box', 'wood', 0, 0.7 + fh + 0.6, 0, W * 0.9, 0.4, D * 0.86, timber);
      // a teak deck all round and sliding timber screens over part of the glass
      add('box', 'wood', 0, 0.62, 0, W + 2.6, 0.12, D + 2.6, '#a07a52');
      for (let k = 0; k < 10; k++) add('box', 'wood', -W * 0.38 + k * 0.32, 0.75, D * 0.39 + 0.15, 0.14, fh + 0.4, 0.08, '#8a6440');
      for (let k = 0; k < 4; k++) add('cyl', 'roof', W / 2 + 0.8, 0.7, -D / 2 + 1 + k * 2.2, 0.8, 0.9, 0.8, '#7a5a3a');
      add('hip', 'roof', 0, 1.7 + fh, 0, W * 1.3, H * 0.55, D * 1.35, roofC);
      // a second pavilion joined by a covered walk
      const sx = (W / 2 + 4) * (r(20) < 0.5 ? 1 : -1);
      if (Math.abs(hx + sx) < PW - 4) {
        add('box', 'stone', sx, 0, -1, 6.4, 0.7, 6.4, '#8a8070');
        add('box', 'glass', sx, 0.7, -1, 5, fh, 5, '#6f8ea6');
        add('hip', 'roof', sx, 0.7 + fh, -1, 7.6, H * 0.4, 7.6, roofC);
        add('box', 'wood', sx / 2, 2.8, -1, Math.abs(sx) - 4, 0.25, 2.2, timber);
      }
      // a pond with stepping stones, lilies and stone lanterns before the house
      add('box', 'water', 0, 0.05, D / 2 + 2.6, W * 0.6, 0.12, 3, '#2f7a88');
      out.lights.push([house.wx(0, D / 2 + 2.6), house.wz(0, D / 2 + 2.6)]);
      for (let k = 0; k < 4; k++) add('cyl', 'stone', -W * 0.2 + k * W * 0.13, 0.05, D / 2 + 2.6 + (k % 2 ? 0.5 : -0.5), 1, 0.2, 1, '#9a948a');
      for (let k = 0; k < 6; k++) add('cyl', 'leaf', -W * 0.27 + r(170 + k) * W * 0.54, 0.16, D / 2 + 1.6 + r(180 + k) * 2, 0.6, 0.04, 0.6, '#4f8a3a');
      for (const s of [-1, 1]) {
        add('box', 'stone', s * W * 0.38, 0, D / 2 + 2.6, 0.6, 1, 0.6, '#9a948a');
        add('box', 'glow', s * W * 0.38, 1, D / 2 + 2.6, 0.5, 0.5, 0.5, '#ffd090');
        add('cone', 'stone', s * W * 0.38, 1.5, D / 2 + 2.6, 1, 0.5, 1, '#8a847a');
      }
      for (let k = 0; k < 5; k++) add('sphere', 'leaf', -W / 2 + k * (W / 4), 0, -D / 2 - 1.2, 2.2, 2.4, 1.6, k % 2 ? '#3a7a3a' : '#4f8a3a');
      break;
    }
  }
  void front;
}

/** Round fountain: basin, water, a central column, and on grand ones an upper bowl. */
export function fountain(add: Add, lx: number, lz: number, d: number, tiered = false) {
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
  add('box', 'glass', lx, 1.05, lz - 0.2, 1.65, 0.55, 2.4, '#6f8ea6');
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

/** A cold-climate evergreen: three stacked tiers on a short trunk. */
function conifer(add: Add, x: number, z: number, h: number, y = 0) {
  add('cyl', 'bark', x, y, z, 0.35, h * 0.2, 0.35, '#5a4232');
  for (const [f, w] of [[0.15, 0.62], [0.42, 0.48], [0.66, 0.32]] as const) add('cone', 'leaf', x, y + h * f, z, h * w, h * 0.42, h * w, '#2f5e3a');
}

function mall(out: DistrictData, b: Building, y0: number, warm: boolean) {
  const r = hashRand(b.tone * 1000 + 7);
  const { add } = frame(out, b.x, b.z, y0, b.door);
  // local +z faces the entrance; W runs across the front, D front to back
  // the footprint is given in world axes; turn it into the entrance's frame
  const alongX = Math.abs(b.door[0] - b.x) > Math.abs(b.door[1] - b.z);
  const W = alongX ? b.d : b.w;
  const D = alongX ? b.w : b.d;
  const H = b.h;
  const big = W >= 60;
  const cream = '#ece4d2';
  const stoneDark = '#b9ae98';
  const glassC = '#5f8fae';
  const brand = r(1) < 0.5 ? '#ffd27a' : '#7ae0ff';
  const shopCols = ['#ff5a5a', '#ffd23a', '#5ad1ff', '#ff8ad8', '#8aff9a', '#ffffff', '#ff9a3a', '#b48aff'];
  // the entrance rotunda, the concourse and the passage between them; all hollow and walkable
  const g = mallGeometry(b);
  const { anchorW, coreW, vd, pass } = g;
  const rd = g.rd;
  const rz = g.rz;
  const rh = H + (big ? 8 : 4);
  const rBack = rz - rd / 2;
  const sideW = (coreW - rd) / 2;

  // ── podium and plinth
  add('box', 'marble', 0, 0, 0, W + 6, 0.35, D + 6, '#e6e1d6');

  // ── the main body: two shopping levels clad in cream stone with vertical fins
  // the body is notched where the rotunda stands: a block behind it and a wing either side
  // the shell: a block behind the concourse, wings either side of the rotunda, and short walls
  // either side of the passage from the rotunda into the concourse
  add('box', 'stone', 0, 0.35, (-D / 2 - vd / 2) / 2, coreW, H - 0.35, D / 2 - vd / 2, cream);
  for (const sd of [-1, 1]) add('box', 'stone', sd * (rd / 2 + sideW / 2), 0.35, (vd / 2 + D / 2) / 2, sideW, H - 0.35, D / 2 - vd / 2, cream);
  if (rBack > vd / 2 + 0.2) for (const sd of [-1, 1]) add('box', 'stone', sd * (pass + (rd / 2 - pass) / 2), 0.35, (vd / 2 + rBack) / 2, rd / 2 - pass, H - 0.35, rBack - vd / 2, cream);
  // glazed shopfronts at ground level, a dark band of glass above, on the front wings and the back
  const faces: [number, number, number, number][] = [[0, -D / 2, coreW, Math.PI]];
  for (const sd of [-1, 1]) faces.push([sd * (rd / 2 + sideW / 2), D / 2, sideW, 0]);
  for (const [cx, lz, len, rot] of faces) {
    const o = lz > 0 ? 1 : -1;
    add('box', 'glass', cx, 0.35, lz + o * 0.05, len - 1, 4.4, 0.12, glassC, rot);
    add('box', 'dark', cx, 4.75, lz + o * 0.08, len - 1, 0.5, 0.14, '#4a4640', rot);
    add('box', 'glass', cx, 7.2, lz + o * 0.05, len - 1, 4.2, 0.1, '#46708c', rot);
    // vertical stone fins every 3 m across the facade
    for (let x = -len / 2 + 1.5; x <= len / 2 - 1.4; x += 3) add('box', 'stone', cx + x, 0.35, lz + o * 0.35, 0.45, H - 1, 0.7, stoneDark, rot);
  }
  // shop signs above the ground-floor windows (front face), lit at night
  for (let x = -coreW / 2 + 4; x < coreW / 2 - 4; x += 7) {
    if (Math.abs(x) < rd / 2 + 3) continue;
    add('box', 'glow', x, 3.7, D / 2 + 0.75, 3.8, 0.55, 0.08, shopCols[Math.floor(r(40 + x) * shopCols.length)]);
  }
  // cornice and a lit parapet strip, notched like the body
  add('box', 'stone', 0, H, (-D / 2 - 0.6 - vd / 2) / 2, coreW + 1.2, 0.8, D / 2 + 0.6 - vd / 2, '#d8cfbc');
  for (const sd of [-1, 1]) {
    add('box', 'stone', sd * (rd / 2 + sideW / 2 + 0.3), H, (vd / 2 + D / 2 + 0.6) / 2, sideW + 0.6, 0.8, D / 2 + 0.6 - vd / 2, '#d8cfbc');
    add('box', 'glow', sd * (rd / 2 + sideW / 2 + 0.3), H + 0.82, D / 2 + 0.6, sideW + 0.4, 0.12, 0.1, brand);
  }
  // a restrained bronze-framed name panel, softly backlit, on each wing
  if (sideW > 8)
    for (const sd of [-1, 1]) {
      const px = sd * (rd / 2 + sideW / 2);
      add('box', 'metal', px, 9.6, D / 2 + 1.1, Math.min(7, sideW * 0.4), 1.5, 0.18, '#6a5032');
      add('box', 'glow', px, 9.75, D / 2 + 1.2, Math.min(6.4, sideW * 0.4 - 0.6), 1.2, 0.04, '#e8cfa0');
      add('rod', 'gold', px, 9.6, D / 2 + 1.22, 0.08, Math.min(7, sideW * 0.4), 0.08, '#c8a050', 0, 0, Math.PI / 2);
    }

  // ── the glazed barrel-vault atrium running the length of the mall, ribbed in white steel
  const vaultD = vd;
  const vaultL = coreW;
  // the vault springs from two stone beams over the concourse walls
  for (const sd of [-1, 1]) add('box', 'stone', 0, H, sd * (vd / 2 + 0.35), vaultL, 2, 0.7, '#d8cfbc');
  add('cyl', 'atrium', vaultL / 2, H + 2, 0, vaultD, vaultL, vaultD, '#bfe2f0', 0, 0, Math.PI / 2);
  for (let x = -vaultL / 2; x <= vaultL / 2 + 0.01; x += 3) add('ring', 'metal', x, H + 2, 0, vaultD + 0.25, 1, vaultD + 0.25, '#e8ecf0', Math.PI / 2, Math.PI / 2);
  add('box', 'metal', 0, H + 2 + vaultD / 2 - 0.1, 0, vaultL, 0.25, 0.3, '#e8ecf0');
  // rooftop skylights, plant and cooling towers on the side wings
  for (const s of [-1, 1]) {
    const lz = s * (vaultD / 2 + (D / 2 - vaultD / 2) / 2);
    for (let x = -coreW / 2 + 6; x < coreW / 2 - 6; x += 9) {
      if (r(60 + x + s) < 0.55) add('box', 'skylight', x, H + 0.8, lz, 5, 0.6, 3, '#bfe4f4');
      else add('box', 'metal', x, H + 0.8, lz, 3.2, 1.6, 2.4, '#9aa0a8');
    }
  }

  // ── the concourse: a two-level shopping street under the glass vault
  {
    const cw = coreW;
    const half = vd / 2;
    const gw = big ? 2.6 : 2;
    // marble floor with inlaid bands and a lit strip down each side
    add('box', 'marble', 0, 0.35, 0, cw, 0.06, vd, '#f2eee6');
    for (let x = -cw / 2 + 4; x < cw / 2 - 2; x += 8) add('box', 'stone', x, 0.42, 0, 0.35, 0.01, vd - 1, '#c9bfa8');
    for (const sd of [-1, 1]) add('box', 'gold', 0, 0.42, sd * (half - gw - 0.4), cw - 2, 0.01, 0.12, '#c8a050');
    // shopfronts on both levels along both sides, with lit fascia signs and stone pilasters
    const unit = big ? 7 : 6;
    for (const sd of [-1, 1]) {
      const wz = sd * half;
      const rot = sd > 0 ? Math.PI : 0;
      for (let x = -cw / 2 + unit / 2; x < cw / 2 - unit / 2 + 0.01; x += unit) {
        // the opening into the rotunda passage on the entrance side
        if (sd > 0 && Math.abs(x) < pass + unit / 2) continue;
        const col = shopCols[Math.floor(r(700 + x * 3 + sd) * shopCols.length)];
        for (const [y0s, hgt] of [[0.41, 3.9], [5.6, 3.4]] as const) {
          add('box', 'glass', x, y0s, wz - sd * 0.06, unit - 0.9, hgt, 0.08, '#b8d8e8', rot);
          // goods glowing behind the glass
          add('box', 'glow', x, y0s + 0.3, wz + sd * 0.25, unit - 1.6, hgt * 0.5, 0.05, r(800 + x + y0s) < 0.5 ? '#fff0d8' : '#e8f4ff', rot);
          add('box', 'dark', x, y0s + hgt, wz - sd * 0.12, unit - 0.6, 0.75, 0.14, '#24262a', rot);
          add('box', 'glow', x, y0s + hgt + 0.18, wz - sd * 0.2, unit * 0.55, 0.38, 0.04, col, rot);
        }
        add('box', 'stone', x - unit / 2, 0.41, wz - sd * 0.18, 0.5, H - 0.6, 0.36, '#e2dac8', rot);
      }
      // the upper gallery: a walkway with a glass balustrade, a lit underside and a handrail
      add('box', 'marble', 0, 5.2, wz - sd * (gw / 2), cw, 0.4, gw, '#efeae0');
      add('box', 'glow', 0, 5.15, wz - sd * (gw - 0.2), cw, 0.06, 0.3, '#fff2d6');
      add('box', 'glass', 0, 5.6, wz - sd * gw, cw, 1.05, 0.06, '#cfe6f0');
      add('box', 'metal', 0, 6.65, wz - sd * gw, cw, 0.08, 0.12, '#d8dce0');
    }
    // footbridges across the void between the galleries
    for (let x = -cw / 2 + 10; x < cw / 2 - 6; x += big ? 18 : 15) {
      if (Math.abs(x) < pass + 3) continue;
      add('box', 'marble', x, 5.2, 0, 3, 0.4, vd - gw * 2 + 0.2, '#efeae0');
      for (const sd of [-1, 1]) add('box', 'glass', x + sd * 1.5, 5.6, 0, 0.06, 1.05, vd - gw * 2, '#cfe6f0');
    }
    // escalators: a pair crossing in the middle of each half of the concourse, each a flight of
    // steps between glass balustrades with lit handrails, landing on the gallery
    const flight = (ex: number, ez: number, dir: number) => {
      const steps = 18;
      const run = 8.4;
      const rise = 4.8;
      for (let k = 0; k < steps; k++) {
        const f = (k + 0.5) / steps;
        const sx = ex + dir * (f - 0.5) * run;
        const top = 0.41 + f * rise;
        const sw = run / steps + 0.02;
        // the tread, the truss below it, and on each side a glass panel and a lit handrail
        add('box', 'metal', sx, top - 0.18, ez, sw, 0.18, 1.0, '#8a9098');
        add('box', 'metal', sx, Math.max(0.41, top - 0.9), ez, sw, Math.min(0.72, top - 0.41), 1.2, '#c0c6cc');
        for (const ss of [-1, 1]) {
          add('box', 'glass', sx, top, ez + ss * 0.58, sw, 0.9, 0.04, '#cfe6f0');
          add('box', 'glow', sx, top + 0.9, ez + ss * 0.58, sw, 0.06, 0.09, '#fff2d6');
        }
      }
    };
    for (const sd of [-1, 1]) {
      const ex = sd * cw * 0.27;
      if (vd >= 9) {
        flight(ex, -1.1, 1);
        flight(ex, 1.1, -1);
      }
    }
    // kiosks, planters with trees and benches down the middle; banners and pendant lamps above
    for (let x = -cw / 2 + 6; x < cw / 2 - 4; x += big ? 12 : 10) {
      if (Math.abs(Math.abs(x) - cw * 0.27) < 6 || Math.abs(x) < pass + 2) continue;
      const k = Math.floor(r(900 + x) * 3);
      if (k === 0) {
        add('box', 'wood', x, 0.41, 0, 2.6, 1.1, 1.6, '#7a5a3e');
        add('box', 'metal', x, 2.6, 0, 3, 0.15, 2, '#e8e8e8');
        add('box', 'glow', x, 1.6, 0, 2.4, 0.5, 1.62, shopCols[(x * 7) & 7] ?? '#ffffff');
      } else {
        add('cyl', 'stone', x, 0.41, 0, 1.8, 0.8, 1.8, '#d8cfbc');
        add('cyl', 'bark', x, 1.2, 0, 0.25, 1.6, 0.25, '#6a5240');
        add('sphere', 'leaf', x, 3.1, 0, 2.4, 2, 2.4, '#4f8a3a');
        for (const sd of [-1, 1]) add('box', 'wood', x + sd * 2.2, 0.41, 0, 1.8, 0.45, 0.55, '#8a6a4a');
      }
    }
    for (let x = -cw / 2 + 5; x < cw / 2 - 3; x += 6) {
      add('cyl', 'metal', x, H - 1.5, 0, 0.03, 3.5 + vd * 0.3, 0.03, '#c8ccd0');
      add('sphere', 'glow', x, H - 1.6, 0, 0.7, 0.45, 0.7, '#fff2d6');
      if (Math.floor(x / 6) % 2 === 0) add('box', 'cloth', x + 3, H - 3.5, 0, 0.05, 2.6, 1.2, shopCols[Math.floor(r(950 + x) * shopCols.length)]);
    }
    // the ends of a small mall: glass walls with doors out to the side streets
    if (!big)
      for (const sd of [-1, 1]) {
        add('box', 'glass', sd * (cw / 2 + 0.2), 0.35, 0, 0.12, H - 0.35, vd, '#bfe2f0');
        add('box', 'glow', sd * (cw / 2 + 0.1), 3.6, 0, 0.05, 0.5, 4, brand);
      }
  }

  // ── anchor stores at both ends: taller, dark glass, each with a big lit logo
  if (big)
    for (const s of [-1, 1]) {
      const ax = s * (W / 2 - anchorW / 2);
      add('box', 'glass', ax, 0.35, 0, anchorW, H + 4, D - 4, '#2e4658');
      add('box', 'stone', ax, H + 4.35, 0, anchorW + 0.8, 0.9, D - 3.2, '#d8cfbc');
      for (let lz = -D / 2 + 4; lz < D / 2 - 3; lz += 3.2) {
        add('box', 'metal', ax + s * (anchorW / 2 + 0.05), 0.35, lz, 0.12, H + 4, 0.25, '#cfd4da');
        add('box', 'glow', ax + s * (anchorW / 2 + 0.13), 1, lz, 0.04, H + 2.6, 0.06, brand);
      }
      // the anchor's front: vertical fins in pale stone with fritted glass bands between
      for (let x = -anchorW / 2 + 1; x < anchorW / 2 - 0.5; x += 1.6) add('box', 'stone', ax + x, 0.35, D / 2 - 1.85, 0.35, H + 4, 0.7, '#e2dac8');
      for (const y of [6.8, 12.2]) add('box', 'stone', ax, y, D / 2 - 1.7, anchorW, 0.45, 0.6, '#d8cfbc');
      add('box', 'dark', ax, H - 3, D / 2 - 1.8, anchorW * 0.6, 4.6, 0.3, '#1a1c20');
      add('box', 'glow', ax, H - 2.7, D / 2 - 1.6, anchorW * 0.42, 2.6, 0.06, s < 0 ? '#e8e0d0' : '#e8c88a');
      add('box', 'glass', ax, 0.35, D / 2 - 1.9, anchorW - 4, 6, 0.15, '#6f9cbc');
      // the anchor's shopfront at the end of the concourse
      add('box', 'glass', ax - s * (anchorW / 2 + 0.06), 0.41, 0, 0.08, 4.4, vd - 1, '#b8d8e8');
      add('box', 'glow', ax - s * (anchorW / 2 + 0.1), 5.6, 0, 0.05, 1.6, vd * 0.6, s < 0 ? '#ffffff' : '#ffcf5a');
    }

  // ── the entrance rotunda: a glass drum taller than the mall, a ring canopy, a lantern dome
  add('cyl', 'stone', 0, 0.35, rz, rd + 1, 0.6, rd + 1, '#d8cfbc');
  // the drum, glazed in panels, with an open doorway at the front and the passage at the back
  {
    const segs = big ? 40 : 26;
    for (let k = 0; k < segs; k++) {
      const t = (k / segs) * Math.PI * 2;
      const lx = (Math.sin(t) * rd) / 2;
      const lz = rz + (Math.cos(t) * rd) / 2;
      const low = Math.abs(lx) < pass + 0.4 ? 4.2 : 0.35;
      add('box', 'atrium', lx, low, lz, (Math.PI * rd) / segs + 0.05, rh - low, 0.12, '#bfe2f0', t);
    }
  }
  const fins = big ? 28 : 16;
  for (let k = 0; k < fins; k++) {
    const t = (k / fins) * Math.PI * 2;
    if (Math.abs(Math.sin(t) * rd) / 2 < pass + 0.3) continue;
    add('box', 'metal', Math.sin(t) * (rd / 2 + 0.12), 0.35, rz + Math.cos(t) * (rd / 2 + 0.12), 0.3, rh - 0.35, 0.5, '#eef0f2', t);
  }
  // floor bands outside the glass, and inside two gallery levels round an open well
  for (const y of [5.2, 10.4]) {
    add('ring', 'stone', 0, y, rz, rd + 0.7, 1, rd + 0.7, '#e2dac8');
    const segs = big ? 24 : 14;
    const gw = big ? 3.2 : 2.2;
    for (let k = 0; k < segs; k++) {
      const t = (k / segs) * Math.PI * 2;
      const rr = rd / 2 - gw / 2 - 0.2;
      // leave the front open above the doors
      if (Math.abs(Math.cos(t)) > 0.92) continue;
      add('box', 'marble', Math.sin(t) * rr, y, rz + Math.cos(t) * rr, (Math.PI * rd) / segs + 0.3, 0.4, gw, '#efeae0', t);
      add('box', 'glass', Math.sin(t) * (rr - gw / 2), y + 0.4, rz + Math.cos(t) * (rr - gw / 2), (Math.PI * (rd - gw * 2)) / segs + 0.2, 1, 0.08, '#cfe6f0', t);
      add('box', 'glow', Math.sin(t) * (rr - gw / 2), y - 0.05, rz + Math.cos(t) * (rr - gw / 2), (Math.PI * (rd - gw * 2)) / segs + 0.2, 0.08, 0.2, '#fff2d6', t);
    }
  }
  // the canopy: a ring of panels outside the glass only, so the rotunda stays open inside
  {
    const segs = big ? 40 : 24;
    for (let k = 0; k < segs; k++) {
      const t = (k / segs) * Math.PI * 2;
      if (Math.cos(t) < -0.2) continue;
      const rr = rd / 2 + 2.25;
      add('box', 'plaster', Math.sin(t) * rr, 5.6, rz + Math.cos(t) * rr, (Math.PI * (rd + 9)) / segs + 0.25, 0.5, 4.5, '#f4f2ee', t);
    }
  }
  add('ring', 'glow', 0, 5.58, rz, rd + 9, 1, rd + 9, brand);
  for (let k = 0; k < 10; k++) {
    const t = -Math.PI / 2 + (k / 9) * Math.PI;
    add('cyl', 'metal', Math.sin(t) * (rd / 2 + 4), 0.35, rz + Math.cos(t) * (rd / 2 + 4), 0.35, 5.25, 0.35, '#d8dce0');
  }
  add('cyl', 'stone', 0, rh, rz, rd + 1.2, 0.9, rd + 1.2, '#d8cfbc');
  add('hemi', 'atrium', 0, rh + 0.9, rz, rd * 0.8, rd * 0.42, rd * 0.8, '#cfeaf4');
  // lattice rings on the dome
  for (const f of [0.35, 0.65, 0.88]) add('ring', 'metal', 0, rh + 0.9 + rd * 0.42 * f, rz, rd * 0.8 * Math.sqrt(1 - f * f) + 0.2, 1, rd * 0.8 * Math.sqrt(1 - f * f) + 0.2, '#eef0f2');
  add('cyl', 'metal', 0, rh + 0.9 + rd * 0.42, rz, 1.2, 2.5, 1.2, '#eef0f2');
  add('cone', 'metal', 0, rh + 3.4 + rd * 0.42, rz, 0.5, 5, 0.5, '#eef0f2');
  // the mall's name in lit letters on the drum, and sliding doors at its foot
  add('box', 'glow', 0, rh - 3.2, rz + rd / 2 + 0.4, Math.min(16, rd * 0.75), 1.8, 0.1, brand);
  add('box', 'dark', 0, rh - 3.5, rz + rd / 2 + 0.3, Math.min(17, rd * 0.8), 2.4, 0.15, '#1e2024');
  // the entrance: an open doorway in the drum framed in steel (the doors stand open)
  for (const sd of [-1, 1]) add('box', 'metal', sd * 2.6, 0.35, rz + rd / 2 + 0.2, 0.3, 3.4, 0.4, '#d8dce0');
  add('box', 'metal', 0, 3.75, rz + rd / 2 + 0.2, 5.6, 0.35, 0.4, '#d8dce0');
  for (const sd of [-1, 1]) add('box', 'glass', sd * 3.6, 0.35, rz + rd / 2 + 0.55, 1.8, 3.3, 0.06, '#cfe6f0');
  // inside the drum: a marble floor with an inlaid star, shopfronts round the back wall, escalators
  // up to the galleries, a fountain under a chandelier, benches and planters
  add('cyl', 'marble', 0, 0.35, rz, rd - 0.3, 0.06, rd - 0.3, '#f2eee6');
  add('ring', 'gold', 0, 0.42, rz, rd * 0.55, 1, rd * 0.55, '#c8a050');
  add('ring', 'gold', 0, 0.42, rz, rd * 0.35, 1, rd * 0.35, '#c8a050');
  const shops = big ? 14 : 8;
  for (let k = 0; k < shops; k++) {
    const t = Math.PI * 0.62 + (k / (shops - 1)) * Math.PI * 0.76;
    const rr = rd / 2 - 0.35;
    const sx = Math.sin(t) * rr;
    const sz = rz + Math.cos(t) * rr;
    const sw = (Math.PI * rd * 0.76) / 2 / shops;
    if (Math.abs(sx) < pass + sw / 2 + 0.3) continue;
    add('box', 'glass', sx, 0.41, sz, sw - 0.4, 3.6, 0.1, '#a8cce0', t + Math.PI);
    add('box', 'glow', sx * 0.995, 4.1, rz + (sz - rz) * 0.995, sw - 0.6, 0.6, 0.06, shopCols[k % shopCols.length], t + Math.PI);
    add('box', 'stone', sx, 0.41, sz, 0.35, 4.8, 0.35, '#d8cfbc', t);
  }
  fountain(add, 0, rz + rd * 0.06, big ? 6 : 3.6, true);
  // the chandelier: a gilt crown with three rings of crystal drops on fine cables
  const cy = rh - (big ? 5 : 3.5);
  add('cyl', 'metal', 0, cy, rz, 0.05, rh - cy, 0.05, '#c8ccd0');
  add('ring', 'gold', 0, cy, rz, big ? 6 : 3.6, 1, big ? 6 : 3.6, '#d8b25a');
  add('cyl', 'gold', 0, cy - 0.3, rz, big ? 1.4 : 0.9, 0.6, big ? 1.4 : 0.9, '#d8b25a');
  for (const [rr2, n2, drop] of [[big ? 3 : 1.8, big ? 18 : 12, 1.6], [big ? 2 : 1.2, big ? 12 : 8, 2.6], [big ? 1 : 0.6, 6, 3.6]] as const)
    for (let k = 0; k < n2; k++) {
      const t = (k / n2) * Math.PI * 2 + rr2;
      const px = Math.sin(t) * rr2;
      const pz = rz + Math.cos(t) * rr2;
      add('cyl', 'metal', px, cy - drop, pz, 0.03, drop, 0.03, '#d8dce0');
      add('sphere', 'glow', px, cy - drop, pz, 0.32, 0.5, 0.32, '#fff4dc');
    }
  for (const t of [0.8, 2.3, 3.9, 5.4]) {
    const bx = Math.sin(t) * rd * 0.3;
    const bz = rz + Math.cos(t) * rd * 0.3;
    add('box', 'wood', bx, 0.41, bz, 2, 0.45, 0.6, '#8a6a4a', t);
    add('cyl', 'stone', bx + Math.cos(t) * 1.8, 0.41, bz - Math.sin(t) * 1.8, 1.1, 0.7, 1.1, '#cfc6b4');
    add('sphere', 'leaf', bx + Math.cos(t) * 1.8, 1.4, bz - Math.sin(t) * 1.8, 1.3, 1.1, 1.3, '#4f8a3a');
  }

  // ── exterior detail
  const gold = '#d8b25a';
  // a shaded arcade along the front of each wing: paired columns with gilt capitals, a lit soffit,
  // a crenellated parapet and uplights at the column feet
  const az = D / 2 + 3.2;
  for (const sd of [-1, 1]) {
    const x0 = rd / 2 + 2.5;
    const x1 = coreW / 2 - 0.5;
    if (x1 - x0 < 6) continue;
    const mid = sd * (x0 + x1) / 2;
    const len = x1 - x0;
    add('box', 'stone', mid, 5.4, az - 1.5, len, 0.9, 3.6, '#e8e0cc');
    add('box', 'glow', mid, 5.38, az - 1.5, len - 0.6, 0.04, 3, '#fff0d4');
    // coffered soffit: a grid of recessed lit panels between stone ribs
    for (let x = x0 + 1; x < x1; x += 2.1) add('box', 'stone', sd * x, 5.2, az - 1.5, 0.25, 0.2, 3.4, '#d8cfbc');
    add('box', 'stone', mid, 6.3, az + 0.2, len, 0.35, 0.4, '#d8cfbc');
    for (let x = x0; x <= x1 + 0.01; x += 1.1) add('box', 'stone', sd * x, 6.65, az + 0.2, 0.55, 0.45, 0.4, '#d8cfbc');
    for (let x = x0; x <= x1 + 0.01; x += 4.2) {
      for (const dx of [-0.35, 0.35]) {
        add('cyl', 'marble', sd * (x + dx), 0.35, az, 0.42, 5.05, 0.42, '#f2eee6');
        // fluting, an astragal ring and a torus at the base
        for (let k = 0; k < 8; k++) add('box', 'marble', sd * (x + dx) + Math.sin(k * 0.785) * 0.21, 0.75, az + Math.cos(k * 0.785) * 0.21, 0.05, 4.1, 0.05, '#ded8cc', k * 0.785);
        add('torus', 'gold', sd * (x + dx), 4.8, az, 0.5, 0.5, 0.5, '#c8a050');
        add('torus', 'marble', sd * (x + dx), 0.8, az, 0.6, 0.7, 0.6, '#ece6da');
        add('torus', 'marble', sd * (x + dx), 0.6, az, 0.66, 0.8, 0.66, '#e6e0d4');
        add('cyl', 'gold', sd * (x + dx), 5.0, az, 0.62, 0.4, 0.62, gold);
        add('box', 'marble', sd * (x + dx), 0.35, az, 0.7, 0.4, 0.7, '#e6e0d4');
      }
      add('cone', 'glow', sd * x, 0.35, az + 0.6, 0.5, 0.12, 0.5, '#ffe6b8');
      // after dark each column pair washes the facade above it with light
      add('beamCone', 'nightBeam', sd * x, H - 0.5, az - 2.4, 3.2, H - 1, 1.6, '#ffe2b0', 0, Math.PI);
      // a pierced brass lantern hanging in each bay
      if (x + 4.2 <= x1 + 0.01) {
        add('cyl', 'metal', sd * (x + 2.1), 4.2, az - 1.4, 0.03, 1.0, 0.03, '#a08040');
        add('oct', 'gold', sd * (x + 2.1), 3.4, az - 1.4, 0.55, 0.8, 0.55, '#c8a050');
        add('sphere', 'glow', sd * (x + 2.1), 3.8, az - 1.4, 0.42, 0.62, 0.42, '#ffd890');
        add('cone', 'gold', sd * (x + 2.1), 4.2, az - 1.4, 0.6, 0.3, 0.6, '#c8a050');
      }
      // a pointed arch between each pair of column bays, in carved stone
      if (x + 4.2 <= x1 + 0.01) {
        add('arch', 'stone', sd * (x + 2.1), 4.1, az + 0.05, 3.4, 1.3, 0.25, '#e8e0cc');
        // a rounded moulding following the arch, with a keystone
        add('halfTorus', 'stone', sd * (x + 2.1), 4.1, az + 0.22, 3.6, 2.8, 0.5, '#efe8d8');
        add('box', 'stone', sd * (x + 2.1), 5.25, az + 0.25, 0.4, 0.5, 0.3, '#e2dac8');
      }
    }
  }
  // mashrabiya screens of gilt diamond lattice over the upper glazing of each wing
  for (const sd of [-1, 1]) {
    const x0 = rd / 2 + 1.2;
    const x1 = coreW / 2 - 1;
    const bw = sideW > 8 ? Math.min(7, sideW * 0.4) + 0.6 : 0;
    const bx0 = rd / 2 + sideW / 2 - bw / 2;
    for (let x = x0 + 0.25; x < x1; x += 0.5)
      for (let y = 7.6; y < H - 0.7; y += 0.5) {
        if (bw && x > bx0 - 0.2 && x < bx0 + bw + 0.2 && y > 9.3 && y < 11.4) continue;
        add('box', 'gold', sd * x, y, D / 2 + 0.95, 0.26, 0.26, 0.04, '#c8a050', 0, 0, Math.PI / 4);
        // eight-pointed stars at every other node
        if ((Math.round(x * 2) + Math.round(y * 2)) % 4 === 0) add('box', 'gold', sd * x, y, D / 2 + 0.98, 0.26, 0.26, 0.04, '#e0c070');
      }
    // lit from behind after dark: a warm panel behind each screen
    add('box', 'glow', sd * (x0 + x1) / 2, 7.6, D / 2 + 0.88, x1 - x0 - 0.4, 0.06, 0.04, '#ffd890');
    // a frieze between arcade and screens: a band of interlaced stars over a lit groove, then a
    // carved cornice on modillions at the top of the wall
    for (let x = x0 + 0.6; x < x1; x += 1.2) {
      add('box', 'stone', sd * x, 7.15, D / 2 + 1.05, 0.5, 0.5, 0.1, '#cfc4ae', 0, 0, Math.PI / 4);
      add('box', 'stone', sd * x, 7.15, D / 2 + 1.08, 0.5, 0.5, 0.1, '#d8cdb8');
    }
    for (let x = x0 + 0.5; x < x1; x += 1.0) add('box', 'stone', sd * x, H - 0.55, D / 2 + 1.0, 0.25, 0.45, 0.6, '#d8cfbc');
    add('box', 'stone', sd * (x0 + x1) / 2, H - 0.1, D / 2 + 1.05, x1 - x0, 0.3, 0.8, '#e2dac8');
    add('rod', 'stone', sd * (x0 + x1) / 2, H - 0.15, D / 2 + 1.42, 0.36, x1 - x0, 0.36, '#ece4d2', 0, 0, Math.PI / 2);
    add('rod', 'stone', sd * (x0 + x1) / 2, 7.45, D / 2 + 1.12, 0.22, x1 - x0, 0.22, '#ece4d2', 0, 0, Math.PI / 2);
    add('box', 'stone', sd * (x0 + x1) / 2, 7.05, D / 2 + 1, x1 - x0, 0.25, 0.3, '#d8cfbc');
  }
  // the rotunda: a gilt crown at the top of the drum, light strips on every fin
  add('cyl', 'gold', 0, rh - 0.6, rz, rd + 1.6, 0.5, rd + 1.6, gold);
  for (let k = 0; k < (big ? 36 : 22); k++) {
    const t = (k / (big ? 36 : 22)) * Math.PI * 2;
    add('cone', 'gold', Math.sin(t) * (rd / 2 + 0.8), rh - 0.1, rz + Math.cos(t) * (rd / 2 + 0.8), 0.5, 1.2, 0.5, gold);
  }
  {
    const fins2 = big ? 28 : 16;
    for (let k = 0; k < fins2; k++) {
      const t = (k / fins2) * Math.PI * 2;
      if ((Math.abs(Math.sin(t)) * rd) / 2 < pass + 0.3) continue;
      add('box', 'glow', Math.sin(t) * (rd / 2 + 0.4), 1.2, rz + Math.cos(t) * (rd / 2 + 0.4), 0.08, rh - 2.4, 0.06, brand, t);
    }
  }
  // two digital totems flanking the entrance, with a lit logo and a screen
  for (const sd of [-1, 1]) {
    const tx = sd * (rd / 2 + 3.2);
    const tz = rz + rd / 2 + 6;
    add('box', 'dark', tx, 0.35, tz, 1.4, 7.5, 0.8, '#1c1e22');
    add('box', 'glow', tx, 1.2, tz + 0.41, 1.1, 4.6, 0.04, sd < 0 ? '#7ac8ff' : '#ff8ad8');
    add('box', 'gold', tx, 6.2, tz + 0.41, 1.2, 1.2, 0.05, gold);
    add('box', 'stone', tx, 7.85, tz, 1.7, 0.25, 1.1, '#d8cfbc');
  }
  // gilt sculptures: stacked spheres on marble plinths at the corners of the forecourt
  for (const sd of [-1, 1]) {
    const sx = sd * (W / 2 - 2);
    const sz = D / 2 + 5;
    add('box', 'marble', sx, 0.35, sz, 2, 1.1, 2, '#ece6da');
    add('sphere', 'gold', sx, 2.2, sz, 1.6, 1.6, 1.6, gold);
    add('sphere', 'gold', sx + 0.3, 3.5, sz, 1.1, 1.1, 1.1, gold);
    add('sphere', 'gold', sx - 0.1, 4.4, sz + 0.2, 0.7, 0.7, 0.7, gold);
    add('cone', 'glow', sx, 1.45, sz + 1.1, 0.5, 0.1, 0.5, '#ffe6b8');
  }
  // flower beds and lit bollards along the arcade
  for (const sd of [-1, 1])
    for (let x = rd / 2 + 4.5; x < coreW / 2 - 1; x += 4.2) {
      add('box', 'stone', sd * x, 0.35, az + 1.6, 2.6, 0.45, 1, '#cfc6b4');
      add('box', 'leaf', sd * x, 0.8, az + 1.6, 2.4, 0.35, 0.8, ['#c84a7a', '#e8c040', '#7a4ac8', '#e86a3a'][Math.floor(r(1200 + x) * 4)]);
      add('cyl', 'metal', sd * (x + 2.1), 0.35, az + 1.6, 0.22, 0.9, 0.22, '#3a3e44');
      add('cyl', 'glow', sd * (x + 2.1), 1.1, az + 1.6, 0.24, 0.12, 0.24, '#fff2d6');
    }
  // a rooftop garden on the wings: planted edges along the front parapet and a terrace café with
  // a pergola at one end
  for (const sd of [-1, 1]) {
    const x0 = rd / 2 + 1.5;
    const x1 = coreW / 2 - 1.5;
    if (x1 - x0 < 6) continue;
    add('box', 'stone', sd * (x0 + x1) / 2, H + 0.8, D / 2 - 1.2, x1 - x0, 0.6, 1.4, '#cfc6b4');
    add('box', 'leaf', sd * (x0 + x1) / 2, H + 1.4, D / 2 - 1.2, x1 - x0 - 0.2, 0.5, 1.2, '#4f8a3a');
    for (let x = x0 + 1.5; x < x1; x += 3.5) add('sphere', 'leaf', sd * x, H + 1.9, D / 2 - 1.2, 1.4, 1.2, 1.4, '#3f7a34');
  }
  {
    const px = (coreW / 2 - 6) * (r(1300) < 0.5 ? -1 : 1);
    const pz = D / 2 - 6;
    for (const dx of [-3, 3]) for (const dz of [-2.5, 2.5]) add('box', 'wood', px + dx, H + 0.8, pz + dz, 0.3, 3, 0.3, '#8a6a4a');
    for (let k = -3; k <= 3; k++) add('box', 'wood', px + k, H + 3.8, pz, 0.2, 0.25, 5.6, '#8a6a4a');
    for (const dx of [-1.6, 1.6]) {
      add('cyl', 'metal', px + dx, H + 0.8, pz, 0.8, 0.75, 0.8, '#f0f0f0');
      add('cyl', 'glow', px + dx, H + 3.4, pz, 0.3, 0.2, 0.3, '#fff2d6');
    }
  }

  // ── the observation tower (big malls): a slender shaft with a glazed pod and a spire
  if (big) {
    const tx = -W / 2 + anchorW + 8;
    const tz = -D / 2 + 8;
    const th = 48 + r(3) * 14;
    add('cyl', 'stone', tx, 0, tz, 4.4, th, 4.4, '#e8e2d4');
    for (let y = 6; y < th - 4; y += 6) add('cyl', 'glow', tx, y, tz, 4.5, 0.15, 4.5, brand);
    add('cyl', 'stone', tx, th, tz, 11, 1, 11, '#d8cfbc');
    add('cyl', 'atrium', tx, th + 1, tz, 10.4, 4.2, 10.4, '#bfe2f0');
    add('cyl', 'stone', tx, th + 5.2, tz, 11.4, 0.8, 11.4, '#d8cfbc');
    add('cone', 'metal', tx, th + 6, tz, 2.2, 12, 2.2, '#eef0f2');
    add('sphere', 'glow', tx, th + 18.2, tz, 0.6, 0.6, 0.6, '#ff3a3a');
  }

  // ── multi-storey car park behind the mall, with ramps and parked cars
  if (big && D > 50) {
    const pz = -D / 2 - 0.5;
    const pw = coreW * 0.7;
    const carCols = ['#e8e8e8', '#202226', '#9a1e1e', '#3a5a8a', '#c0c4c8', '#1e3a2a'];
    for (let lv = 0; lv < 3; lv++) {
      add('box', 'stone', 0, lv * 3.2, pz - 8, pw, 0.4, 15, '#a8a49c');
      add('box', 'stone', 0, lv * 3.2 + 0.4, pz - 15.3, pw, 1, 0.3, '#c8c2b4');
      for (let x = -pw / 2 + 2; x < pw / 2 - 2; x += 2.8) if (r(100 + x + lv * 7) < 0.7) add('box', 'metal', x, lv * 3.2 + 0.4, pz - 11, 1.8, 1.3, 4.2, carCols[Math.floor(r(200 + x + lv) * carCols.length)]);
      for (let x = -pw / 2; x <= pw / 2; x += 8) add('box', 'stone', x, lv * 3.2, pz - 15, 0.6, 3.2, 0.6, '#b8b2a4');
    }
    add('box', 'stone', 0, 9.6, pz - 8, pw, 0.3, 15, '#a8a49c');
    add('box', 'glow', pw / 2 - 3, 9.9, pz - 15.4, 4, 1.2, 0.1, '#3a8aff');
  }

  // ── the forecourt: a drop-off loop with taxis, flagpoles, a show fountain, palms, planters
  const fz = D / 2 + 3;
  const front = rz + rd / 2;
  if (big) {
    // the drop-off lane: an asphalt arc around the rotunda, with a covered walkway
    add('box', 'dark', 0, 0.35, front + 4, rd + 14, 0.06, 6, '#3c4048');
    for (let x = -rd / 2 - 6; x <= rd / 2 + 6; x += 3) add('box', 'paint', x, 0.42, front + 4, 1.4, 0.01, 0.15, '#f0f0f0');
    const taxis = ['#f2c21a', '#f2c21a', '#e8e8e8', '#202226'];
    for (let k = 0; k < 5; k++) {
      const x = -rd / 2 - 6 + k * 7 + r(300 + k) * 2;
      const c = taxis[k % taxis.length];
      add('box', 'metal', x, 0.42, front + 5.2, 4.4, 0.8, 1.9, c);
      add('box', 'glass', x - 0.2, 1.22, front + 5.2, 2.4, 0.6, 1.7, '#2a3440');
    }
    // flagpoles in a row along the street edge
    for (let k = 0; k < 9; k++) {
      const x = -W * 0.3 + (k * W * 0.6) / 8;
      add('cyl', 'metal', x, 0.35, front + 9, 0.18, 12, 0.18, '#e0e4e8');
      add('box', 'cloth', x + 1.1, 9.8, front + 9, 2.2, 1.4, 0.05, shopCols[k % shopCols.length]);
    }
    // the show fountain: a long basin with a row of jets in front of each wing
    for (const s of [-1, 1]) {
      const cx = s * (rd / 2 + 19.8);
      add('box', 'marble', cx, 0.35, fz + 5.5, 18, 0.7, 6, '#ece6da');
      add('box', 'water', cx, 0.9, fz + 5.5, 17, 0.12, 5, '#4ab8d8');
      for (let k = 0; k < 6; k++) {
        const jh = 1.4 + r(400 + k + s) * 1.8;
        add('cone', 'water', cx - 7.5 + k * 3, 1, fz + 5.5, 0.08, jh, 0.08, '#e8f8ff');
        for (let q = 0; q < 5; q++) add('sphere', 'water', cx - 7.5 + k * 3 + Math.cos(q * 1.26) * 0.35, 1 + jh * (0.75 + 0.05 * q), fz + 5.5 + Math.sin(q * 1.26) * 0.35, 0.12, 0.16, 0.12, '#e8f8ff');
      }
      add('box', 'glow', cx, 0.9, fz + 8.55, 17, 0.12, 0.05, '#7ae0ff');
    }
  } else {
    // a plaza out to the waterfront: paving bands, café terraces either side of the rotunda,
    // kiosks, lamp posts and a fountain
    const pz0 = D / 2 + 1;
    const depth = 16;
    add('box', 'marble', 0, 0.36, pz0 + depth / 2, W + 6, 0.04, depth, '#e2dccf');
    for (let k = 0; k < 5; k++) add('box', 'stone', 0, 0.41, pz0 + 2 + k * 3.2, W + 5, 0.02, 0.5, '#bfb4a0');
    for (const sd of [-1, 1]) {
      const cx = sd * (rd / 2 + 6);
      for (let k = 0; k < 4; k++) {
        const tx = cx + ((k % 2) - 0.5) * 4.2;
        const tz = pz0 + 4 + Math.floor(k / 2) * 4.4;
        add('cyl', 'metal', tx, 0.4, tz, 0.9, 0.75, 0.9, '#e8e8e8');
        add('cyl', 'metal', tx, 0.4, tz, 0.08, 2.6, 0.08, '#b8bcc0');
        add('cone', 'cloth', tx, 2.6, tz, 3, 0.7, 3, shopCols[(k + (sd > 0 ? 2 : 0)) % shopCols.length]);
        for (const c of [-1, 1]) add('box', 'wood', tx + c * 0.9, 0.4, tz, 0.45, 0.45, 0.45, '#6a4a32');
      }
      // a kiosk with a striped awning
      add('box', 'plaster', sd * (W / 2 - 3), 0.4, pz0 + 9, 3, 2.6, 2.4, '#f2efe8');
      add('box', 'cloth', sd * (W / 2 - 3), 2.7, pz0 + 10.4, 3.4, 0.25, 1.2, brand, 0, -0.3);
      add('box', 'glow', sd * (W / 2 - 3), 2.2, pz0 + 10.21, 2.6, 0.3, 0.04, '#ffffff');
    }
    fountain(add, 0, pz0 + 11, 6, true);
    for (let k = 0; k < 6; k++) {
      const lx = -W / 2 - 1 + (k * (W + 2)) / 5;
      add('cyl', 'metal', lx, 0.4, pz0 + depth - 1, 0.16, 4.5, 0.16, '#3a3e44');
      add('sphere', 'glow', lx, 4.9, pz0 + depth - 1, 0.5, 0.5, 0.5, '#fff2d6');
    }
  }
  // palms in planters and benches lining the forecourt and the side walks
  const step = big ? 9 : 7;
  for (let x = -W / 2 + 3; big && x <= W / 2 - 3; x += step) {
    if (Math.abs(x) < rd / 2 + 6) continue;
    const lz = big ? front + 9 : fz + 2;
    add('cyl', 'stone', x, 0.35, lz, 2.2, 0.8, 2.2, '#cfc6b4');
    if (warm) palm(add, x, lz, 7 + r(20 + x) * 3, r, 30 + x, 1.15);
    else conifer(add, x, lz, 6, 1.15);
    add('box', 'wood', x + step / 2, 0.35, lz, 2.2, 0.5, 0.6, '#8a6a4a');
  }
  for (const s of [-1, 1])
    for (let lz = -D / 2 + 4; lz < D / 2; lz += 8) {
      add('cyl', 'stone', s * (W / 2 + 2), 0.35, lz, 1.6, 0.6, 1.6, '#cfc6b4');
      if (warm) palm(add, s * (W / 2 + 2), lz, 6 + r(500 + lz + s) * 2, r, 60 + lz + s, 0.95);
      else conifer(add, s * (W / 2 + 2), lz, 5, 0.95);
    }
}

// ───────────────────────── Places of worship ─────────────────────────

export function minaret(add: Add, lx: number, lz: number, h: number, col: THREE.Color) {
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
  for (let k = 0; k < 5; k++) archWindow(add, -hw / 2 + (hw / 5) * (k + 0.5), 1.2, hz + hd / 2 + 0.03, 1.5, 4.2, 'glass', '#6f8ea6');
  add('box', 'stone', 0, 8, hz, hw + 0.4, 0.5, hd + 0.4, '#e2dccd');
  // a great dome on a drum, four smaller domes at the corners
  add('cyl', 'plaster', 0, 8.5, hz, 9, 2.6, 9, white);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    archWindow(add, Math.sin(a) * 4.52, 8.9, hz + Math.cos(a) * 4.52, 0.8, 1.7, 'glass', '#6f8ea6', a);
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

function church(out: DistrictData, b: Building, y0: number, warm: boolean) {
  const r = hashRand(b.tone * 1000 + 11);
  const { add } = frame(out, b.x, b.z, y0, b.door);
  const S = b.w / 2;
  const stone = new THREE.Color(r(1) < 0.5 ? '#d8cdb8' : '#c8bca4');
  const slate = '#4a5058';
  // churchyard: lawn, a path to the door, a low wall, yews
  add('box', 'lawn', 0, 0, 0, S * 2, 0.14, S * 2, '#5a8a3c');
  add('box', 'stone', 0, 0.02, S * 0.6, 2.6, 0.16, S * 0.8, '#cfc6b4');
  for (const [lx, lz, sx, sz] of [[0, -S, S * 2, 0.5], [-S, 0, 0.5, S * 2], [S, 0, 0.5, S * 2]] as const) add('box', 'stone', lx, 0, lz, sx, 1.1, sz, stone);
  for (const s of [-1, 1]) add('box', 'stone', s * (S / 2 + 1.5), 0, S, S - 3, 1.1, 0.5, stone);
  // nave with buttresses and tall pointed windows, a steep slate roof
  const nw = 8.5;
  const nl = S * 1.35;
  const nz = -S * 0.15;
  add('box', 'stone', 0, 0, nz, nw, 9, nl, stone);
  add('gable', 'roof', 0, 9, nz, nw * 1.02, 5.5, nl * 0.98, slate);
  for (let k = 0; k < 5; k++) {
    const z = nz - nl / 2 + (nl / 5) * (k + 0.5);
    for (const s of [-1, 1]) {
      add('box', 'stone', s * (nw / 2 + 0.5), 0, z - nl / 10, 1, 7, 1.1, stone.clone().offsetHSL(0, 0, -0.04));
      archWindow(add, s * (nw / 2 + 0.03), 2.2, z, 1.3, 5, 'glass', ['#3a4a8a', '#8a2a3a', '#2a6a4a', '#8a6a2a'][Math.floor(r(10 + k) * 4)], (s * Math.PI) / 2);
    }
  }
  // apse at the east end
  add('cyl', 'stone', 0, 0, nz - nl / 2, nw * 0.9, 8, nw * 0.9, stone);
  add('cone', 'roof', 0, 8, nz - nl / 2, nw * 0.95, 3.5, nw * 0.95, slate);
  // west front: a tower with a belfry and a tall spire, a rose window, a pointed portal
  const tz = nz + nl / 2 + 2;
  add('box', 'stone', 0, 0, tz, 5.2, 20, 5.2, stone);
  for (let f = 0; f < 4; f++) {
    const a = (f * Math.PI) / 2;
    archWindow(add, Math.sin(a) * 2.62, 14.5, tz + Math.cos(a) * 2.62, 1.4, 3.6, 'dark', '#1e1e22', a);
    add('cone', 'roof', Math.sin(a) * 2.2 + Math.cos(a) * 2.2, 20, tz + Math.cos(a) * 2.2 - Math.sin(a) * 2.2, 0.9, 2.4, 0.9, slate);
  }
  add('box', 'stone', 0, 20, tz, 5.8, 0.6, 5.8, stone.clone().offsetHSL(0, 0, -0.05));
  add('cone', 'roof', 0, 20.6, tz, 5, 16, 5, slate);
  add('box', 'gold', 0, 36.4, tz, 0.18, 2.2, 0.18, '#d8b25a');
  add('box', 'gold', 0, 37.6, tz, 1.1, 0.18, 0.18, '#d8b25a');
  archWindow(add, 0, 0.2, tz + 2.62, 2.4, 5.2, 'dark', '#3a2416');
  add('cyl', 'glass', 0, 7.6, tz + 2.62, 2.6, 0.12, 2.6, '#6a4a9a', 0, Math.PI / 2);
  add('sphere', 'glow', 0, 5.8, tz + 3.2, 0.3, 0.3, 0.3, '#ffd090');
  for (let k = 0; k < 4; k++) add('cone', 'leaf', (k < 2 ? -1 : 1) * (S - 2.2), 0, S * 0.5 - (k % 2) * 5, 1.4, 5, 1.4, '#2f4e2a');
  if (warm) palm(add, S - 2.4, -S + 2.4, 6, r, 40);
}

// ───────────────────────── Parks ─────────────────────────

const PLAY_COLS = ['#e8402e', '#f2b81e', '#2e8ae8', '#3ab85a', '#e86ab8'];

/** Fenced playground: safety surface, swings, a slide tower, a seesaw, a climbing frame, a roundabout, a sandpit. */
function playground(add: Add, x: number, z: number, rot: number, r: (k: number) => number, k: number, large: boolean) {
  const c = Math.cos(rot);
  const sn = Math.sin(rot);
  // local offsets inside the playground, turned by rot
  const P = (lx: number, lz: number): [number, number] => [x + lx * c + lz * sn, z - lx * sn + lz * c];
  const col = (i: number) => PLAY_COLS[Math.floor(r(k + i) * PLAY_COLS.length)];
  const PW = large ? 7 : 5;
  const PD = large ? 5.5 : 4.2;
  add('box', 'cloth', x, 0.03, z, PW * 2, 0.14, PD * 2, r(k) < 0.5 ? '#b8563e' : '#3a6aa8', rot);
  // low timber fence with a gap for the gate
  for (const [lx, lz, sx, sz] of [[0, -PD, PW * 2, 0.08], [-PW, 0, 0.08, PD * 2], [PW, 0, 0.08, PD * 2], [-PW / 2 - 1, PD, PW - 2, 0.08], [PW / 2 + 1, PD, PW - 2, 0.08]] as const) {
    const [fx, fz] = P(lx, lz);
    add('box', 'wood', fx, 0.7, fz, sx, 0.1, sz, '#8a6440', rot);
    add('box', 'wood', fx, 0.35, fz, sx, 0.08, sz, '#8a6440', rot);
  }
  // swings: an A-frame at each end, a top bar, two seats on chains
  {
    const [sx, sz] = P(-PW * 0.5, -PD * 0.45);
    for (const e of [-1.8, 1.8]) for (const t of [-0.55, 0.55]) {
      const [ax, az] = P(-PW * 0.5 + e, -PD * 0.45 + t);
      add('cyl', 'metal', ax, 0, az, 0.12, 2.6, 0.12, col(1), rot, t > 0 ? -0.22 : 0.22);
    }
    add('box', 'metal', sx, 2.45, sz, 3.8, 0.14, 0.14, col(1), rot);
    for (const o of [-0.8, 0.8]) {
      const [cx, cz] = P(-PW * 0.5 + o, -PD * 0.45);
      for (const t of [-0.22, 0.22]) {
        const [hx, hz] = P(-PW * 0.5 + o + t, -PD * 0.45);
        add('cyl', 'metal', hx, 0.55, hz, 0.03, 1.9, 0.03, '#9a9a9a', rot);
      }
      add('box', 'cloth', cx, 0.5, cz, 0.6, 0.06, 0.3, '#2a2a2a', rot);
    }
  }
  // slide: a platform on posts with a roof, a ladder and a chute
  {
    const [tx, tz] = P(PW * 0.45, -PD * 0.35);
    for (const a of [-0.6, 0.6]) for (const b2 of [-0.6, 0.6]) {
      const [px, pz] = P(PW * 0.45 + a, -PD * 0.35 + b2);
      add('cyl', 'metal', px, 0, pz, 0.12, 2.9, 0.12, col(2), rot);
    }
    add('box', 'wood', tx, 1.6, tz, 1.4, 0.12, 1.4, '#a07a52', rot);
    add('cone', 'cloth', tx, 2.9, tz, 2, 1, 2, col(3), rot + Math.PI / 4);
    const [lx2, lz2] = P(PW * 0.45, -PD * 0.35 - 0.95);
    for (const s of [-0.3, 0.3]) {
      const [rx, rz] = P(PW * 0.45 + s, -PD * 0.35 - 0.95);
      add('box', 'metal', rx, 0, rz, 0.06, 1.7, 0.06, '#9a9a9a', rot, -0.25);
    }
    for (let h = 0.35; h < 1.6; h += 0.4) add('box', 'metal', lx2, h, lz2 + 0.06 * h, 0.6, 0.05, 0.05, '#9a9a9a', rot);
    const [cx, cz] = P(PW * 0.45, -PD * 0.35 + 1.9);
    add('box', 'plaster', cx, 0.15, cz, 0.7, 0.08, 3.1, col(4), rot, 0.5);
  }
  // seesaw and a roundabout
  {
    const [sx, sz] = P(-PW * 0.45, PD * 0.4);
    add('box', 'metal', sx, 0, sz, 0.3, 0.45, 0.3, '#5a5a5a', rot);
    add('box', 'wood', sx, 0.45, sz, 3, 0.1, 0.3, col(5), rot, 0, 0.18);
    const [rx, rz] = P(PW * 0.1, PD * 0.45);
    add('cyl', 'metal', rx, 0.1, rz, 2.2, 0.12, 2.2, col(6), rot);
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      add('cyl', 'metal', rx + Math.cos(a) * 0.8, 0.22, rz + Math.sin(a) * 0.8, 0.06, 0.6, 0.06, '#d8d8d8');
    }
  }
  // climbing frame and a sandpit on the larger playgrounds
  if (large) {
    const [gx, gz] = P(PW * 0.62, PD * 0.35);
    for (let a = -1; a <= 1; a++) for (let b2 = -1; b2 <= 1; b2++) {
      const [bx, bz] = P(PW * 0.62 + a * 0.7, PD * 0.35 + b2 * 0.7);
      add('cyl', 'metal', bx, 0, bz, 0.07, 1.8, 0.07, col(7), rot);
    }
    for (const h of [0.9, 1.8]) for (const a of [-0.7, 0, 0.7]) {
      const [bx, bz] = P(PW * 0.62 + a, PD * 0.35);
      add('box', 'metal', bx, h, bz, 0.06, 0.06, 1.4, col(7), rot);
      const [cx, cz] = P(PW * 0.62, PD * 0.35 + a);
      add('box', 'metal', cx, h, cz, 1.4, 0.06, 0.06, col(7), rot);
    }
    void gx;
    void gz;
    const [px, pz] = P(-PW * 0.05, -PD * 0.1);
    add('box', 'wood', px, 0, pz, 3.4, 0.35, 2.6, '#8a6440', rot);
    add('box', 'cloth', px, 0.1, pz, 3, 0.28, 2.2, '#e8d4a0', rot);
    add('cone', 'cloth', px + 0.6, 0.38, pz - 0.3, 0.6, 0.4, 0.6, '#d8c090');
    add('box', 'plaster', px - 0.7, 0.38, pz + 0.4, 0.3, 0.25, 0.3, col(8), rot);
  }
  // spring riders
  for (const o of [-1.2, 1.2]) {
    const [qx, qz] = P(o, -PD * 0.1 + (large ? 2.4 : 0));
    add('cyl', 'metal', qx, 0, qz, 0.16, 0.4, 0.16, '#5a5a5a');
    add('sphere', 'plaster', qx, 0.7, qz, 0.5, 0.45, 0.8, col(9 + o), rot);
  }
}

/** Picnic tables, blankets with baskets, a barbecue. */
function picnic(add: Add, x: number, z: number, r: (k: number) => number, k: number, tables: number) {
  for (let i = 0; i < tables; i++) {
    const a = r(k + i) * Math.PI * 2;
    const d = 2 + r(k + i + 10) * 3.5;
    const tx = x + Math.cos(a) * d;
    const tz = z + Math.sin(a) * d;
    const rot = r(k + i + 20) * Math.PI;
    add('box', 'wood', tx, 0.72, tz, 1.9, 0.08, 0.8, '#9a7450', rot);
    for (const s of [-0.62, 0.62]) add('box', 'wood', tx + Math.sin(rot) * s, 0.42, tz + Math.cos(rot) * s, 1.9, 0.06, 0.3, '#8a6440', rot);
    for (const s of [-0.75, 0.75]) add('box', 'wood', tx + Math.cos(rot) * s, 0, tz - Math.sin(rot) * s, 0.08, 0.72, 1.3, '#7a5636', rot);
  }
  const blankets = ['#d83a3a', '#3a7ad8', '#f2c81e', '#3ab86a', '#e8e0d0', '#c84aa0'];
  for (let i = 0; i < tables + 2; i++) {
    const a = r(k + i + 40) * Math.PI * 2;
    const d = 4 + r(k + i + 50) * 4;
    const bx = x + Math.cos(a) * d;
    const bz = z + Math.sin(a) * d;
    const rot = r(k + i + 60) * Math.PI;
    add('box', 'cloth', bx, 0.15, bz, 2, 0.03, 1.6, blankets[Math.floor(r(k + i + 70) * blankets.length)], rot);
    add('box', 'cloth', bx, 0.16, bz, 2, 0.03, 0.25, '#f4f2ee', rot);
    add('box', 'wood', bx + 0.5, 0.18, bz + 0.3, 0.5, 0.35, 0.35, '#a0784a', rot);
    if (r(k + i + 80) < 0.5) add('sphere', 'plaster', bx - 0.5, 0.3, bz - 0.2, 0.3, 0.3, 0.3, '#e83a3a');
  }
  add('cyl', 'dark', x + 5, 0, z - 4, 0.6, 0.9, 0.6, '#2a2a2a');
  add('cyl', 'metal', x + 5, 0.9, z - 4, 0.9, 0.08, 0.9, '#5a5a5a');
}

/** An irregular pond: overlapping discs of water, reeds, lily pads, ducks and a footbridge. */
function pond(out: DistrictData, add: Add, wx: (x: number, z: number) => number, wz: (x: number, z: number) => number, x: number, z: number, size: number, r: (k: number) => number, k: number) {
  const discs: [number, number, number][] = [[x, z, size]];
  for (let i = 0; i < 4; i++) {
    const a = r(k + i) * Math.PI * 2;
    discs.push([x + Math.cos(a) * size * 0.45, z + Math.sin(a) * size * 0.35, size * (0.55 + r(k + i + 5) * 0.3)]);
  }
  for (const [dx, dz, ds] of discs) {
    add('cyl', 'stone', dx, 0, dz, ds + 0.8, 0.12, ds * 0.8 + 0.8, '#b8b0a0');
    add('cyl', 'water', dx, 0.06, dz, ds, 0.1, ds * 0.8, '#3f8aa0');
  }
  out.lights.push([wx(x, z), wz(x, z)]);
  for (let i = 0; i < 14; i++) {
    const [dx, dz, ds] = discs[i % discs.length];
    const a = r(k + 20 + i) * Math.PI * 2;
    add('cone', 'leaf', dx + Math.cos(a) * ds * 0.5, 0, dz + Math.sin(a) * ds * 0.4, 0.5, 1.4 + r(k + 30 + i), 0.5, '#5a7a3a');
  }
  for (let i = 0; i < 8; i++) add('cyl', 'leaf', x + (r(k + 40 + i) - 0.5) * size, 0.13, z + (r(k + 50 + i) - 0.5) * size * 0.6, 0.7, 0.03, 0.7, '#4f8a3a');
  for (let i = 0; i < 3; i++) add('sphere', 'plaster', x + (r(k + 60 + i) - 0.5) * size * 0.6, 0.22, z + (r(k + 70 + i) - 0.5) * size * 0.4, 0.3, 0.25, 0.42, '#f4f2ee');
  // a timber footbridge across the middle
  add('box', 'wood', x, 0.35, z, 1.8, 0.15, size * 1.2, '#8a6440');
  for (const s of [-0.85, 0.85]) add('box', 'wood', x + s, 0.5, z, 0.08, 0.8, size * 1.2, '#7a5636');
}

function park(out: DistrictData, b: Building, y0: number, warm: boolean) {
  const r = hashRand(b.tone * 1000 + 13);
  const { add, wx, wz } = frame(out, b.x, b.z, y0, b.door);
  const W = b.w / 2;
  const D = b.d / 2;
  const area = b.w * b.d;
  const size: 'pocket' | 'long' | 'central' = area > 2500 ? 'central' : area > 1000 ? 'long' : 'pocket';
  const taken: [number, number, number][] = [];
  const isFree = (x: number, z: number, rad: number) => taken.every(([tx, tz, tr]) => Math.hypot(tx - x, tz - z) > tr + rad);
  // lawn with soft meadow patches and grassy mounds
  add('box', 'lawn', 0, 0, 0, W * 2, 0.14, D * 2, '#5f9a40');
  for (let i = 0; i < Math.round(area / 180); i++) {
    const x = (r(i) - 0.5) * W * 1.7;
    const z = (r(i + 100) - 0.5) * D * 1.7;
    add('cyl', 'lawn', x, 0.02, z, 4 + r(i + 200) * 6, 0.14, 3 + r(i + 300) * 5, r(i + 400) < 0.5 ? '#6aa848' : '#55893a');
  }
  if (size !== 'pocket') for (let i = 0; i < (size === 'central' ? 3 : 1); i++) {
    const x = (r(i + 500) - 0.5) * W * 1.2;
    const z = (r(i + 510) - 0.5) * D * 1.2;
    add('hemi', 'lawn', x, -0.2, z, 9 + r(i + 520) * 6, 2 + r(i + 530) * 1.4, 7 + r(i + 540) * 5, '#64a044');
    taken.push([x, z, 5]);
  }
  // a winding path loop with entrances from the street sides
  const a = W - 3.6;
  const c = D - 3.6;
  const n = Math.max(16, Math.round((a + c) * 1.2));
  const ph = r(600) * 6;
  const pts: [number, number][] = [];
  for (let k = 0; k < n; k++) {
    const t = (k / n) * Math.PI * 2;
    const f = 1 + 0.1 * Math.sin(3 * t + ph) + 0.05 * Math.sin(5 * t + ph * 2);
    pts.push([Math.cos(t) * a * f * 0.92, Math.sin(t) * c * f * 0.92]);
  }
  for (let k = 0; k < n; k++) {
    const [x0, z0] = pts[k];
    const [x1, z1] = pts[(k + 1) % n];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const ang = Math.atan2(x1 - x0, z1 - z0);
    add('box', 'stone', (x0 + x1) / 2, 0.04, (z0 + z1) / 2, 2, 0.14, len + 0.3, '#d8cdb4', ang);
    add('cyl', 'stone', x0, 0.04, z0, 2, 0.14, 2, '#d8cdb4');
    // benches and lamps along the loop
    if (k % 4 === 0) {
      const nx = Math.cos(ang);
      const nz = -Math.sin(ang);
      add('box', 'wood', x0 + nx * 1.7, 0.45, z0 + nz * 1.7, 1.7, 0.1, 0.5, '#8a6440', ang + Math.PI / 2);
      add('box', 'wood', x0 + nx * 1.95, 0.55, z0 + nz * 1.95, 1.7, 0.45, 0.08, '#8a6440', ang + Math.PI / 2);
    }
    if (k % 4 === 2) {
      add('cyl', 'metal', x0 - Math.cos(ang) * 1.5, 0, z0 + Math.sin(ang) * 1.5, 0.12, 3.6, 0.12, '#2a2e34');
      add('sphere', 'glow', x0 - Math.cos(ang) * 1.5, 3.7, z0 + Math.sin(ang) * 1.5, 0.38, 0.38, 0.38, '#ffe2b0');
    }
  }
  for (const [ex, ez] of [[0, D], [0, -D], [W, 0], [-W, 0]] as const) {
    const [px, pz] = pts.reduce((best, p) => (Math.hypot(p[0] - ex, p[1] - ez) < Math.hypot(best[0] - ex, best[1] - ez) ? p : best));
    const len = Math.hypot(ex - px, ez - pz);
    add('box', 'stone', (ex + px) / 2, 0.04, (ez + pz) / 2, 2.2, 0.14, len, '#d8cdb4', Math.atan2(ex - px, ez - pz));
  }
  // what the park holds depends on its size
  if (size === 'pocket') {
    if (r(700) < 0.6) {
      playground(add, 0, 0, r(701) * 0.6 - 0.3, r, 710, false);
      taken.push([0, 0, 7]);
    } else {
      picnic(add, 0, 0, r, 720, 3);
      taken.push([0, 0, 6]);
    }
  } else if (size === 'long') {
    const along = W > D;
    const p1: [number, number] = along ? [-W * 0.5, 0] : [0, -D * 0.5];
    const p2: [number, number] = along ? [W * 0.5, 0] : [0, D * 0.5];
    playground(add, p1[0], p1[1], along ? 0 : Math.PI / 2, r, 730, true);
    taken.push([p1[0], p1[1], 9]);
    picnic(add, p2[0], p2[1], r, 740, 4);
    taken.push([p2[0], p2[1], 7]);
    cafe(add, 0, 0, r, 750);
    taken.push([0, 0, 5]);
  } else {
    pond(out, add, wx, wz, -W * 0.28, D * 0.22, 7, r, 760);
    taken.push([-W * 0.28, D * 0.22, 12]);
    playground(add, W * 0.36, -D * 0.36, 0.2, r, 770, true);
    taken.push([W * 0.36, -D * 0.36, 9]);
    picnic(add, -W * 0.36, -D * 0.38, r, 780, 5);
    taken.push([-W * 0.36, -D * 0.38, 8]);
    if (r(790) < 0.5) {
      // basketball court
      const cx = W * 0.34;
      const cz = D * 0.36;
      add('box', 'cloth', cx, 0.03, cz, 13, 0.14, 21, '#c0663e');
      for (const lz of [-10, 10, 0]) add('box', 'plaster', cx, 0.05, cz + lz, 12.4, 0.13, 0.1, '#f4f4f0');
      for (const lx of [-6.2, 6.2]) add('box', 'plaster', cx + lx, 0.05, cz, 0.1, 0.13, 20.4, '#f4f4f0');
      add('cyl', 'plaster', cx, 0.05, cz, 3.6, 0.13, 3.6, '#f4f4f0');
      add('cyl', 'cloth', cx, 0.06, cz, 3.4, 0.13, 3.4, '#c0663e');
      for (const s of [-1, 1]) {
        add('cyl', 'metal', cx, 0, cz + s * 10.6, 0.16, 3.2, 0.16, '#3a3e44');
        add('box', 'plaster', cx, 2.8, cz + s * 10.3, 1.8, 1.1, 0.06, '#f4f4f0');
        add('cyl', 'metal', cx, 3, cz + s * 9.95, 0.46, 0.04, 0.46, '#e8642a');
      }
    } else {
      // a small football pitch with goals
      const cx = W * 0.34;
      const cz = D * 0.36;
      add('box', 'lawn', cx, 0.03, cz, 14, 0.14, 22, '#4f9a3a');
      for (const lz of [-11, 11, 0]) add('box', 'plaster', cx, 0.05, cz + lz, 14, 0.13, 0.12, '#f4f4f0');
      for (const lx of [-7, 7]) add('box', 'plaster', cx + lx, 0.05, cz, 0.12, 0.13, 22, '#f4f4f0');
      for (const s of [-1, 1]) {
        for (const lx of [-2.4, 2.4]) add('box', 'plaster', cx + lx, 0, cz + s * 11, 0.12, 2, 0.12, '#f4f4f0');
        add('box', 'plaster', cx, 2, cz + s * 11, 4.9, 0.12, 0.12, '#f4f4f0');
      }
    }
    taken.push([W * 0.34, D * 0.36, 12]);
    // bandstand and café
    bandstand(add, W * 0.02, -D * 0.02, r);
    taken.push([0, 0, 6]);
    cafe(add, -W * 0.05, D * 0.62, r, 800);
    taken.push([-W * 0.05, D * 0.62, 5]);
  }
  // trees in irregular clusters, shrubs and flower beds, kept off the features
  const clusters = size === 'central' ? 16 : size === 'long' ? 9 : 4;
  let k = 900;
  for (let cl = 0; cl < clusters; cl++) {
    const cx = (r(k++) - 0.5) * W * 1.8;
    const cz = (r(k++) - 0.5) * D * 1.8;
    const count = 3 + Math.floor(r(k++) * 5);
    for (let i = 0; i < count; i++) {
      const x = cx + (r(k++) - 0.5) * 7;
      const z = cz + (r(k++) - 0.5) * 7;
      if (Math.abs(x) > W - 1.5 || Math.abs(z) > D - 1.5 || !isFree(x, z, 2)) continue;
      const roll = r(k++);
      if (warm && roll < 0.3) palm(add, x, z, 6 + r(k++) * 3, r, k++);
      else if (roll < 0.5) add('cone', 'leaf', x, 0, z, 1.6, 5 + r(k++) * 3, 1.6, '#2f5a2c');
      else roundTree(add, x, z, 5 + r(k++) * 3, r(k++) < 0.15 ? '#c8862a' : r(k) < 0.5 ? '#4f7a34' : '#3f6a2c', r, k++);
      taken.push([x, z, 1.5]);
    }
  }
  for (let i = 0; i < (size === 'pocket' ? 2 : 5); i++) {
    const x = (r(k++) - 0.5) * W * 1.6;
    const z = (r(k++) - 0.5) * D * 1.6;
    if (!isFree(x, z, 2)) continue;
    flowerBed(add, x, z, 3 + r(k++) * 3, r(k++) * Math.PI, r, k++);
  }
  // edge planting: a low hedge with gaps at the entrances
  for (const [lx, lz, sx, sz] of [[-W / 2 - 1.4, D, W - 2.8, 0.6], [W / 2 + 1.4, D, W - 2.8, 0.6], [-W / 2 - 1.4, -D, W - 2.8, 0.6], [W / 2 + 1.4, -D, W - 2.8, 0.6], [W, -D / 2 - 1.4, 0.6, D - 2.8], [W, D / 2 + 1.4, 0.6, D - 2.8], [-W, -D / 2 - 1.4, 0.6, D - 2.8], [-W, D / 2 + 1.4, 0.6, D - 2.8]] as const) add('box', 'leaf', lx, 0, lz, sx, 0.9, sz, '#3a6a2e');
}

function cafe(add: Add, x: number, z: number, r: (k: number) => number, k: number) {
  add('box', 'wood', x, 0, z, 4, 2.8, 3, '#e8e0d0');
  add('box', 'glass', x, 1, z + 1.52, 3, 1.2, 0.08, '#2a3640');
  add('box', 'cloth', x, 2.5, z + 2, 4.4, 0.08, 1.4, AWNINGS[Math.floor(r(k) * AWNINGS.length)], 0, -0.3);
  add('box', 'wood', x, 2.8, z, 4.4, 0.2, 3.4, '#7a5636');
  for (let i = 0; i < 4; i++) {
    const tx = x - 4.5 + (i % 2) * 9;
    const tz = z + 1 + Math.floor(i / 2) * 3.5;
    add('cyl', 'metal', tx, 0, tz, 0.8, 0.75, 0.8, '#f2f2ee');
    add('cyl', 'metal', tx, 0, tz, 0.06, 2.3, 0.06, '#8a8a8a');
    add('cone', 'cloth', tx, 2.1, tz, 2.6, 0.6, 2.6, AWNINGS[Math.floor(r(k + i + 1) * AWNINGS.length)]);
    for (const s of [-0.7, 0.7]) add('box', 'metal', tx + s, 0.45, tz, 0.4, 0.06, 0.4, '#3a3e44');
  }
}

function bandstand(add: Add, x: number, z: number, r: (k: number) => number) {
  add('oct', 'stone', x, 0, z, 7, 0.8, 7, '#e2dccd');
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    add('cyl', 'metal', x + Math.cos(a) * 3.2, 0.8, z + Math.sin(a) * 3.2, 0.18, 3, 0.18, '#f4f4f0');
  }
  add('oct', 'plaster', x, 3.8, z, 7.6, 0.3, 7.6, '#f4f4f0');
  add('cone', 'roof', x, 4.1, z, 8, 2.2, 8, r(810) < 0.5 ? '#3a6a5a' : '#a8442e');
  add('sphere', 'gold', x, 6.4, z, 0.4, 0.6, 0.4, '#d8b25a');
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
