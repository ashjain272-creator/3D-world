import * as THREE from 'three';
import type { PalmPlan } from './layout';
import { type Add, type DistrictData, archWindow, fountain, frame, minaret, palm } from './districts';

const IVORY = '#f4ecdc';
const SAND = '#e8dcc4';
const STONE = '#d8ccb4';
const GOLD = '#d8b25a';
const MARBLE = '#f2eee6';
const GLASS = '#3f5a70';

/**
 * The royal palace in the middle of the palm: a raised marble terrace with a grand staircase; four
 * wings of three storeys round a courtyard of pools, fountains and gardens; a towering entrance
 * portal flanked by two minarets; octagonal corner towers under golden domes; a domed great hall
 * rising from the back of the courtyard; roofs of small domes and crenellated parapets; gilded
 * string courses, arcades and balconies; and lights that wash the facades after dark.
 * Local frame: +z faces the land (the entrance), x runs across the trunk.
 */
export function royalPalace(out: DistrictData, p: PalmPlan, y0: number, warm: boolean, r: (k: number) => number) {
  const { x: px, z: pz, w: W, d: D } = p.palace;
  const { add } = frame(out, px, pz, y0, [px, pz + 1]);
  const T = 3;
  const H = 22;
  const wing = 18;
  const tree = (x: number, z: number, k: number, h = 8, y = T) => {
    if (warm) palm(add, x, z, h + r(k) * 3, r, k, y);
    else {
      add('cyl', 'bark', x, y, z, 0.4, 1.6, 0.4, '#5a4232');
      add('cone', 'leaf', x, y + 1.2, z, 2.4, h, 2.4, '#2f5e3a');
    }
  };
  terrace(add, W, D, T);
  // ── the four wings, each with its outer facade, courtyard facade, roof and parapet
  const faces: { cx: number; cz: number; len: number; rot: number; inner: boolean }[] = [];
  // wing blocks
  add('box', 'lit', 0, T, -D / 2 + wing / 2, W, H, wing, IVORY);
  for (const s of [-1, 1]) add('box', 'lit', s * (W / 2 - wing / 2), T, 0, wing, H, D - 2 * wing, IVORY);
  for (const s of [-1, 1]) add('box', 'lit', s * (W / 4 + 4), T, D / 2 - wing / 2, W / 2 - 8, H, wing, IVORY);
  // outer faces: front (two halves either side of the portal), back, sides
  faces.push({ cx: 0, cz: -D / 2, len: W, rot: Math.PI, inner: false });
  for (const s of [-1, 1]) faces.push({ cx: s * (W / 4 + 4), cz: D / 2, len: W / 2 - 8, rot: 0, inner: false });
  for (const s of [-1, 1]) faces.push({ cx: s * (W / 2), cz: 0, len: D, rot: (s * Math.PI) / 2, inner: false });
  // courtyard faces
  faces.push({ cx: 0, cz: -D / 2 + wing, len: W - 2 * wing, rot: 0, inner: true });
  for (const s of [-1, 1]) faces.push({ cx: s * (W / 4 + 4), cz: D / 2 - wing, len: W / 2 - 8 - (s > 0 ? 0 : 0), rot: Math.PI, inner: true });
  for (const s of [-1, 1]) faces.push({ cx: s * (W / 2 - wing), cz: 0, len: D - 2 * wing, rot: (-s * Math.PI) / 2, inner: true });
  for (const f of faces) facade(add, f.cx, f.cz, f.len, f.rot, f.inner, T, H);
  // roofs: a flat roof with skylights, crenellated parapets, small domes along the side wings
  for (const s of [-1, 1])
    for (let k = 0; k < 4; k++) {
      const dz = -D / 2 + wing + 14 + k * ((D - 2 * wing - 28) / 3);
      add('cyl', 'plaster', s * (W / 2 - wing / 2), T + H, dz, 7.5, 2.2, 7.5, IVORY);
      add('hemi', 'gold', s * (W / 2 - wing / 2), T + H + 2.2, dz, 7, 4.5, 7, GOLD);
      add('cone', 'gold', s * (W / 2 - wing / 2), T + H + 6.6, dz, 0.5, 2, 0.5, GOLD);
    }
  for (let k = 0; k < 5; k++) {
    const dx = -W / 2 + wing + 6 + k * ((W - 2 * wing - 12) / 4);
    add('cyl', 'plaster', dx, T + H, -D / 2 + wing / 2, 6, 1.8, 6, IVORY);
    add('hemi', 'plaster', dx, T + H + 1.8, -D / 2 + wing / 2, 5.6, 3.6, 5.6, '#f8f4ea');
    add('cone', 'gold', dx, T + H + 5.3, -D / 2 + wing / 2, 0.4, 1.6, 0.4, GOLD);
  }
  // ── corner towers: octagonal, with balconies, arched windows and golden domes
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const tx = sx * (W / 2 + 2);
      const tz = sz * (D / 2 + 2);
      const th = 44;
      add('oct', 'lit', tx, T, tz, 13, th, 13, SAND);
      for (const y of [T + 7.3, T + 14.6, T + 22]) add('oct', 'gold', tx, y, tz, 13.3, 0.35, 13.3, GOLD);
      for (const y of [T + 26, T + 36]) {
        add('oct', 'stone', tx, y, tz, 15.5, 0.6, 15.5, STONE);
        for (let q = 0; q < 16; q++) add('box', 'stone', tx + Math.cos(q * 0.39) * 7.4, y + 0.6, tz + Math.sin(q * 0.39) * 7.4, 0.25, 1.1, 0.25, STONE);
      }
      for (let q = 0; q < 8; q++) {
        const a = (q / 8) * Math.PI * 2 + Math.PI / 8;
        for (const y of [T + 2, T + 9.5, T + 16.8, T + 28, T + 38])
          archWindow(add, tx + Math.sin(a) * 6.35, y, tz + Math.cos(a) * 6.35, 1.8, 3.2, 'glass', GLASS, a);
      }
      add('oct', 'stone', tx, T + th, tz, 14.5, 1, 14.5, STONE);
      add('cyl', 'plaster', tx, T + th + 1, tz, 10, 3, 10, IVORY);
      add('hemi', 'gold', tx, T + th + 4, tz, 10, 9, 10, GOLD);
      add('cyl', 'gold', tx, T + th + 12.6, tz, 1.2, 1.4, 1.2, GOLD);
      add('cone', 'gold', tx, T + th + 14, tz, 0.6, 4.5, 0.6, GOLD);
      add('beamCone', 'nightBeam', tx, T + th - 2, tz + sz * 9, 10, th - 2, 6, '#ffe2b0', 0, Math.PI);
    }
  portal(add, D, T, H);
  greatHall(add, D, T, H, wing);
  courtyard(add, W, D, T, wing, tree);
  forecourt(add, W, D, T, tree);
  // the gardens beside and behind the terrace, as far as the plateau runs
  for (const s of [-1, 1])
    for (let z = -D / 2; z <= D / 2; z += 12) {
      tree(s * (W / 2 + 26), z, 3100 + z + s, 8, 0);
      add('box', 'leaf', s * (W / 2 + 31), 0, z, 1.2, 1, 11, '#3a6a2e');
    }
  add('box', 'marble', 0, 0, -D / 2 - 40, 40, 0.5, 22, MARBLE);
  add('box', 'water', 0, 0.45, -D / 2 - 40, 36, 0.12, 18, '#2ab8e8');
  add('box', 'glow', 0, 0.4, -D / 2 - 50.95, 36, 0.12, 0.05, '#7ae0ff');
  void THREE;
}

/** The marble terrace: a cornice, balustrades with lamp urns, and the grand staircase at the front. */
function terrace(add: Add, W: number, D: number, T: number) {
  const tw = W + 40;
  const td = D + 50;
  add('box', 'marble', 0, 0, 0, tw, T, td, MARBLE);
  add('box', 'stone', 0, T - 0.4, 0, tw + 1, 0.4, td + 1, STONE);
  add('box', 'gold', 0, T - 0.9, 0, tw + 0.2, 0.15, td + 0.2, GOLD);
  const rail = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const t = Math.atan2(x1 - x0, z1 - z0);
    for (let d = 0; d <= len; d += 1.2) add('cyl', 'marble', x0 + ((x1 - x0) * d) / len, T, z0 + ((z1 - z0) * d) / len, 0.3, 0.9, 0.3, MARBLE);
    add('box', 'marble', (x0 + x1) / 2, T + 0.9, (z0 + z1) / 2, 0.45, 0.18, len, MARBLE, t);
  };
  rail(-tw / 2, -td / 2, tw / 2, -td / 2);
  rail(-tw / 2, -td / 2, -tw / 2, td / 2);
  rail(tw / 2, -td / 2, tw / 2, td / 2);
  rail(-tw / 2, td / 2, -18, td / 2);
  rail(18, td / 2, tw / 2, td / 2);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      add('box', 'marble', (sx * tw) / 2, T, (sz * td) / 2, 2, 1.6, 2, MARBLE);
      add('sphere', 'gold', (sx * tw) / 2, T + 2.2, (sz * td) / 2, 1.4, 1.2, 1.4, GOLD);
      add('sphere', 'glow', (sx * tw) / 2, T + 3, (sz * td) / 2, 0.6, 0.6, 0.6, '#ffe2b0');
    }
  // the grand staircase, flanked by gilded urns with fountains
  for (let k = 0; k < 10; k++) add('box', 'marble', 0, k * 0.3, td / 2 + 6 - k * 0.6, 34, 0.3, 0.62, k % 2 ? MARBLE : '#ebe5d8');
  for (const s of [-1, 1]) {
    add('box', 'marble', s * 18.5, 0, td / 2 + 3, 3, T + 0.9, 6.5, MARBLE);
    add('cyl', 'marble', s * 18.5, T + 0.9, td / 2 + 5, 2.2, 0.6, 2.2, MARBLE);
    add('sphere', 'gold', s * 18.5, T + 2, td / 2 + 5, 2.2, 1.8, 2.2, GOLD);
    add('cone', 'water', s * 18.5, T + 2.6, td / 2 + 5, 0.15, 2.4, 0.15, '#e8f8ff');
  }
}

/**
 * One facade of a wing, outward along local +z turned by `rot`: bays of arches between pilasters,
 * arched windows with balconies above, gilded string courses, a cornice and stepped merlons.
 * Courtyard facades get an open arcade on slim marble columns instead of ground-floor arches.
 */
function facade(add: Add, cx: number, cz: number, len: number, rot: number, inner: boolean, T: number, H: number) {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  // world-local helpers: a point `a` along the facade and `o` out from it
  const at = (a: number, o: number): [number, number] => [cx + a * c + o * s, cz - a * s + o * c];
  const bay = 6;
  const n = Math.floor(len / bay);
  const a0 = -((n - 1) * bay) / 2;
  for (let k = 0; k < n; k++) {
    const a = a0 + k * bay;
    if (inner) {
      // the arcade: a column, a pointed arch, a lantern hanging in each bay
      const [qx, qz] = at(a - bay / 2, 2.4);
      add('cyl', 'marble', qx, T, qz, 0.7, 5, 0.7, MARBLE);
      add('cyl', 'gold', qx, T + 4.8, qz, 0.95, 0.35, 0.95, GOLD);
      const [ax, az] = at(a, 2.4);
      // an open pointed arch between the columns, with solid spandrels and a beam above
      add('halfTorus', 'plaster', ax, T + 3.4, az, (bay - 0.6) / 0.9, 1.9 / 0.45, 1.2, IVORY, rot);
      for (const sd of [-1, 1]) {
        const [sx2, sz2] = at(a + sd * (bay / 2 - 0.6), 2.4);
        add('box', 'plaster', sx2, T + 4.4, sz2, 1.2, 1.2, 0.5, IVORY, rot);
      }
      add('box', 'plaster', ax, T + 5.3, az, bay, 0.8, 0.5, IVORY, rot);
      add('sphere', 'glow', ax, T + 3.6, az - c * 0, 0.45, 0.6, 0.45, '#ffd890');
      const [gx, gz] = at(a, 0.05);
      archWindow(add, gx, T + 0.3, gz, 3.2, 4.6, 'glass', GLASS, rot);
      const [rx, rz] = at(a, 1.2);
      add('box', 'marble', rx, T + 6.1, rz, bay, 0.3, 2.4, MARBLE, rot);
    } else {
      const [gx, gz] = at(a, 0.05);
      archWindow(add, gx, T + 0.6, gz, 3.4, 5.6, 'glass', GLASS, rot);
      const [fx, fz] = at(a, 0.3);
      add('halfTorus', 'stone', fx, T + 0.6 + 5.6 - 1.7, fz, 3.9 / 0.9, 1.9 / 0.45, 0.4, STONE, rot);
    }
    // upper floors: arched windows; balconies with balustrades on the first floor
    for (const [fl, y] of [
      [1, T + 7.6],
      [2, T + 14.9],
    ] as const) {
      const [wx, wz] = at(a, 0.05);
      archWindow(add, wx, y, wz, 2.4, 4, 'glass', GLASS, rot);
      const [mx, mz] = at(a, 0.15);
      add('box', 'stone', mx, y - 0.2, mz, 3, 0.3, 0.3, STONE, rot);
      if (fl === 1 && k % 2 === 0) {
        const [bx, bz] = at(a, 0.9);
        add('box', 'stone', bx, y - 0.3, bz, 3.6, 0.3, 1.8, STONE, rot);
        for (let q = -1.6; q <= 1.6; q += 0.4) {
          const [px, pz] = at(a + q, 1.7);
          add('cyl', 'marble', px, y, pz, 0.14, 0.9, 0.14, MARBLE);
        }
        const [hx, hz] = at(a, 1.7);
        add('box', 'marble', hx, y + 0.9, hz, 3.6, 0.12, 0.2, MARBLE, rot);
      }
    }
    // pilasters between bays, with gilded capitals
    if (k > 0 || !inner) {
      const [px, pz] = at(a - bay / 2, 0.35);
      add('box', 'plaster', px, T, pz, 0.9, H - 1.2, 0.7, SAND, rot);
      add('box', 'gold', px, T + H - 1.6, pz, 1.1, 0.4, 0.8, GOLD, rot);
    }
    // night uplight washing the wall
    if (!inner && k % 2 === 0) {
      const [ux, uz] = at(a, 3);
      add('beamCone', 'nightBeam', ux, T + H - 1, uz, 6, H - 1.4, 2.2, '#ffe2b0', rot, Math.PI);
    }
  }
  // gilded string courses at each floor, the cornice on brackets and the crenellated parapet
  for (const y of [T + 7, T + 14.3]) {
    const [sx, sz] = at(0, 0.2);
    add('box', 'gold', sx, y, sz, len, 0.28, 0.4, GOLD, rot);
  }
  const [kx, kz] = at(0, 0.6);
  add('box', 'stone', kx, T + H - 0.6, kz, len + 1, 0.9, 1.5, STONE, rot);
  add('box', 'glow', kx, T + H - 0.75, kz, len, 0.08, 1.2, '#fff0d4', rot);
  for (let a = -len / 2 + 0.75; a < len / 2; a += 1.5) {
    const [bx, bz] = at(a, 1.1);
    add('box', 'stone', bx, T + H - 1.2, bz, 0.35, 0.6, 0.8, STONE, rot);
    const [mx, mz] = at(a, 0.3);
    add('box', 'plaster', mx, T + H + 0.3, mz, 0.9, 1.3, 0.6, IVORY, rot);
    add('box', 'plaster', mx, T + H + 1.6, mz, 0.5, 0.5, 0.6, IVORY, rot);
  }
}

/**
 * The entrance portal: a tall block standing proud of the front, a great pointed iwan arch framed
 * in gold with stepped muqarnas in its head, carved doors, an inscription band, and two minarets.
 */
function portal(add: Add, D: number, T: number, H: number) {
  const z = D / 2 + 2;
  const PH = 38;
  // two pylons and the mass above the arch: the iwan between them is open, a way into the courtyard
  for (const s of [-1, 1]) add('box', 'lit', s * 12, T, z - 4, 6, PH, 10, IVORY);
  add('box', 'lit', 0, T + 31, z - 4, 30, PH - 31, 10, IVORY);
  add('box', 'stone', 0, T + PH, z - 4, 32, 1.2, 12, STONE);
  for (let a = -15; a <= 15; a += 1.5) {
    add('box', 'plaster', a, T + PH + 1.2, z + 1.2, 0.9, 1.5, 0.6, IVORY);
    add('box', 'plaster', a, T + PH + 2.7, z + 1.2, 0.5, 0.5, 0.6, IVORY);
  }
  // the iwan: a deep pointed arch with a dark, glazed back and gilded frame
  add('arch', 'dark', 0, T + 22, z - 8.8, 18, 9, 0.3, '#2a2420');
  add('box', 'marble', 0, T, z - 4, 18, 0.1, 10, '#ebe5d8');
  add('box', 'glow', 0, T + 21.6, z - 4, 16, 0.1, 9, '#fff0d4');
  add('halfTorus', 'gold', 0, T + 22, z + 1.1, 19.4 / 0.9, 9.6 / 0.45, 1.6, GOLD);
  for (const s of [-1, 1]) add('box', 'gold', s * 9.7, T, z + 1.1, 0.7, 22, 0.7, GOLD);
  // the alfiz: a rectangular gilt frame round the arch, with a lit inscription band above
  add('box', 'gold', 0, T + 33.4, z + 1.05, 24, 0.6, 0.5, GOLD);
  for (const s of [-1, 1]) add('box', 'gold', s * 12, T, z + 1.05, 0.6, 34, 0.5, GOLD);
  add('box', 'dark', 0, T + 34.5, z + 1.05, 24, 2.4, 0.3, '#1a2a3a');
  add('box', 'glow', 0, T + 34.8, z + 1.25, 22, 1.8, 0.05, '#ffd27a');
  // muqarnas: tiers of small gilded niches stepping into the arch head
  for (let tier = 0; tier < 6; tier++) {
    const y = T + 22 + tier * 1.3;
    const span = 16 - tier * 2.6;
    for (let a = -span / 2; a <= span / 2 + 0.01; a += 1.3) add('box', 'gold', a, y, z + 0.4 - tier * 0.5, 1.1, 1.1, 0.7, tier % 2 ? GOLD : '#e8c878');
  }
  // carved double doors and a fanlight, in the back of the iwan
  // the carved doors stand open against the sides of the iwan
  for (const s of [-1, 1]) {
    add('box', 'wood', s * 8.6, T, z - 2.5, 0.3, 9, 5, '#6a3a1a');
    for (let k = 0; k < 4; k++) add('box', 'gold', s * 8.4, T + 1.5 + k * 2, z - 2.5, 0.1, 0.2, 3.8, GOLD);
  }
  add('arch', 'glass', 0, T + 9, z - 8.6, 10.4, 4, 0.2, '#ffcf8a');
  add('box', 'glow', 0, T + 0.2, z + 3, 10, 0.06, 4, '#fff0d4');
  // two minarets flanking the portal
  for (const s of [-1, 1]) {
    minaret(add, s * 16, z - 1, 76, new THREE.Color(IVORY));
    add('beamCone', 'nightBeam', s * 16, T + 60, z + 4, 6, 60, 4, '#ffe2b0', 0, Math.PI);
  }
  // the lit portal and the steps of the terrace below it
  add('beamCone', 'nightBeam', 0, T + PH - 1, z + 8, 22, PH - 1.2, 8, '#ffe8c0', 0, Math.PI);
  void H;
}

/**
 * The great hall at the back of the courtyard: a square base with arched windows, an octagonal
 * drum with a ring of windows, a golden ribbed dome with a lantern and finial, and four satellite
 * domes on its corners.
 */
function greatHall(add: Add, D: number, T: number, H: number, wing: number) {
  const z = -D / 2 + wing + 16;
  const B = 34;
  const BH = H + 8;
  add('box', 'lit', 0, T, z, B, BH, B, IVORY);
  for (const [rot, ox, oz] of [
    [0, 0, B / 2],
    [Math.PI / 2, B / 2, 0],
    [-Math.PI / 2, -B / 2, 0],
  ] as const) {
    for (let k = -2; k <= 2; k++) {
      const a = k * 6;
      const wx = ox + Math.cos(rot) * a;
      const wz = z + oz - Math.sin(rot) * a;
      archWindow(add, wx + Math.sin(rot) * 0.05, T + 2, wz + Math.cos(rot) * 0.05, 3.6, 9, 'glass', GLASS, rot);
      archWindow(add, wx + Math.sin(rot) * 0.05, T + 14, wz + Math.cos(rot) * 0.05, 3, 7, 'glass', GLASS, rot);
    }
    add('box', 'gold', ox, T + 12.4, z + oz, rot === 0 ? B : 0.4, 0.4, rot === 0 ? 0.4 : B, GOLD);
  }
  add('box', 'stone', 0, T + BH, z, B + 1.5, 1.2, B + 1.5, STONE);
  for (let a = -B / 2; a <= B / 2; a += 1.5)
    for (const [mx, mz] of [
      [a, z + B / 2 + 0.4],
      [a, z - B / 2 - 0.4],
      [B / 2 + 0.4, z + a],
      [-B / 2 - 0.4, z + a],
    ])
      add('box', 'plaster', mx, T + BH + 1.2, mz, 0.8, 1.4, 0.8, IVORY);
  // the drum and its ring of windows
  const dy = T + BH + 1.2;
  add('oct', 'lit', 0, dy, z, 30, 9, 30, IVORY);
  for (let q = 0; q < 16; q++) {
    const a = (q / 16) * Math.PI * 2;
    archWindow(add, Math.sin(a) * 14.2, dy + 1.5, z + Math.cos(a) * 14.2, 2, 5.5, 'glass', '#ffcf8a', a);
  }
  add('cyl', 'gold', 0, dy + 9, z, 30.6, 0.6, 30.6, GOLD);
  add('cyl', 'glow', 0, dy + 9.6, z, 29.6, 0.15, 29.6, '#ffd27a');
  // the dome: gold, ribbed, with a lantern and a finial of stacked spheres and a crescent ring
  // (the half-sphere's height is half its y scale: 44 makes a dome 22 m tall)
  add('hemi', 'gold', 0, dy + 9.6, z, 29, 44, 29, GOLD);
  for (let q = 0; q < 16; q++) {
    const a = (q / 16) * Math.PI * 2;
    for (let k = 0; k < 8; k++) {
      const t0 = (k / 8) * (Math.PI / 2);
      const t1 = ((k + 1) / 8) * (Math.PI / 2);
      const r0 = 14.6 * Math.cos(t0);
      const r1 = 14.6 * Math.cos(t1);
      const y0 = 22 * Math.sin(t0);
      const y1 = 22 * Math.sin(t1);
      const mx = Math.sin(a) * (r0 + r1) / 2;
      const mz = Math.cos(a) * (r0 + r1) / 2;
      const len = Math.hypot(r1 - r0, y1 - y0);
      // each rib segment follows the dome's curve: tilted in towards the axis as it climbs
      add('rod', 'gold', mx, dy + 9.6 + (y0 + y1) / 2, z + mz, 0.35, len, 0.35, '#c89a40', a + Math.PI, Math.atan2(r0 - r1, y1 - y0));
    }
  }
  const ly = dy + 9.6 + 22;
  add('cyl', 'plaster', 0, ly - 1, z, 5, 4, 5, IVORY);
  for (let q = 0; q < 8; q++) archWindow(add, Math.sin(q * 0.785) * 2.45, ly - 0.5, z + Math.cos(q * 0.785) * 2.45, 0.8, 2.2, 'glass', '#ffcf8a', q * 0.785);
  add('hemi', 'gold', 0, ly + 3, z, 5, 4, 5, GOLD);
  for (const [k, sz] of [
    [0, 1.4],
    [1, 1.0],
    [2, 0.7],
  ] as const)
    add('sphere', 'gold', 0, ly + 7.4 + k * 1.3, z, sz, sz, sz, GOLD);
  add('torus', 'gold', 0, ly + 11.2, z, 2.4, 2.4, 2.4, GOLD, 0, Math.PI / 2);
  add('beamCone', 'nightBeam', 0, ly, z + 24, 30, ly - T, 14, '#ffe8c0', 0, Math.PI);
  // satellite domes on the corners of the base
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const cx = sx * (B / 2 - 4);
      const cz = z + sz * (B / 2 - 4);
      add('oct', 'plaster', cx, T + BH + 1.2, cz, 7, 3, 7, IVORY);
      add('hemi', 'gold', cx, T + BH + 4.2, cz, 6.8, 5, 6.8, GOLD);
      add('cone', 'gold', cx, T + BH + 9, cz, 0.5, 2.5, 0.5, GOLD);
    }
}

/** The courtyard: a long reflecting pool of jets, parterres of hedge and flowers, a tiered fountain. */
function courtyard(add: Add, W: number, D: number, T: number, wing: number, tree: (x: number, z: number, k: number, h?: number, y?: number) => void) {
  const z0 = -D / 2 + wing + 34;
  const z1 = D / 2 - wing - 3;
  const cz = (z0 + z1) / 2;
  const iw = W - 2 * wing - 6;
  add('box', 'marble', 0, T, cz, iw, 0.08, z1 - z0, '#efe9dc');
  add('box', 'marble', 0, T, cz, 10, 0.6, z1 - z0 - 6, MARBLE);
  add('box', 'water', 0, T + 0.5, cz, 9, 0.12, z1 - z0 - 7, '#2ab8e8');
  for (let z = z0 + 6; z < z1 - 4; z += 5) {
    for (const s of [-1, 1]) add('cone', 'water', s * 3.6, T + 0.6, z, 0.1, 2.2, 0.1, '#e8f8ff');
    add('box', 'glow', 0, T + 0.45, z, 8.6, 0.05, 0.3, '#7ae0ff');
  }
  fountain(add, 0, cz, 7, true);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const bx = sx * (iw / 4 + 3);
      const bz = cz + sz * ((z1 - z0) / 4);
      add('box', 'lawn', bx, T + 0.08, bz, iw / 2 - 12, 0.12, (z1 - z0) / 2 - 8, '#5e9a48');
      // a hedge border and a star of flower beds in each parterre
      for (const [w, d] of [
        [iw / 2 - 12, 0.8],
        [0.8, (z1 - z0) / 2 - 8],
      ] as const)
        for (const o of [-1, 1]) add('box', 'leaf', bx + (d === 0.8 ? 0 : (o * (iw / 2 - 12)) / 2), T + 0.2, bz + (d === 0.8 ? (o * ((z1 - z0) / 2 - 8)) / 2 : 0), w, 0.9, d, '#2f5a2a');
      for (let q = 0; q < 8; q++) add('box', 'leaf', bx + Math.cos(q * 0.785) * 3, T + 0.2, bz + Math.sin(q * 0.785) * 3, 0.8, 0.5, 3, ['#c84a7a', '#e8c040', '#e86a3a', '#7a4ac8'][q % 4], q * 0.785);
      tree(bx + ((sx * (iw / 2 - 12)) / 2 - sx * 2), bz, 3300 + sx * 7 + sz, 8, T);
    }
}

/** The forecourt below the stairs: a great fountain, flags, guard pavilions, lamps and palms. */
function forecourt(add: Add, W: number, D: number, T: number, tree: (x: number, z: number, k: number, h?: number, y?: number) => void) {
  const fz = D / 2 + 25 + 26;
  add('cyl', 'marble', 0, 0, fz, 34, 0.4, 34, '#ece6da');
  add('cyl', 'marble', 0, 0, fz, 24, 0.9, 24, MARBLE);
  add('cyl', 'water', 0, 0.8, fz, 23, 0.12, 23, '#2ab8e8');
  add('cyl', 'marble', 0, 0.8, fz, 4, 4, 4, MARBLE);
  add('cyl', 'marble', 0, 4.8, fz, 10, 0.5, 10, MARBLE);
  add('cyl', 'water', 0, 5.2, fz, 9, 0.1, 9, '#2ab8e8');
  add('cyl', 'gold', 0, 5.3, fz, 1.6, 3, 1.6, GOLD);
  add('sphere', 'gold', 0, 9, fz, 2.4, 2.4, 2.4, GOLD);
  for (let q = 0; q < 16; q++) add('cone', 'water', Math.cos(q * 0.39) * 9, 0.9, fz + Math.sin(q * 0.39) * 9, 0.14, 3 + (q % 2) * 2, 0.14, '#e8f8ff');
  add('ring', 'glow', 0, 0.95, fz, 22.6, 1, 22.6, '#7ae0ff');
  for (let k = 0; k < 14; k++) {
    const a = Math.PI + 0.25 + (k / 13) * (Math.PI - 0.5);
    const fx = Math.cos(a) * 22;
    const fzz = fz + Math.sin(a) * 22;
    add('cyl', 'metal', fx, 0, fzz, 0.2, 14, 0.2, '#e8e8e8');
    add('box', 'cloth', fx + 1.3, 11, fzz, 2.6, 1.7, 0.05, ['#0e6a3a', '#f4f4f2', '#c8102e', '#1a1a1a'][k % 4]);
  }
  for (const s of [-1, 1]) {
    add('box', 'plaster', s * 30, 0, fz + 8, 6, 4.5, 6, IVORY);
    add('hemi', 'gold', s * 30, 4.5, fz + 8, 5, 3.5, 5, GOLD);
    archWindow(add, s * 30, 0.4, fz + 11.05, 2, 3.2, 'glass', GLASS);
    for (let z = fz - 30; z < fz + 14; z += 10) {
      tree(s * 40, z, 3500 + z + s, 9, 0);
      add('cyl', 'metal', s * 34, 0, z + 5, 0.2, 5, 0.2, '#2a2420');
      add('sphere', 'glow', s * 34, 5.2, z + 5, 0.7, 0.9, 0.7, '#ffd890');
    }
  }
  void W;
  void T;
}
