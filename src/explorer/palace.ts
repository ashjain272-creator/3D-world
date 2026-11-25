import * as THREE from 'three';
import { type PalmPlan, PALACE, palaceGalleryDoors, palaceHallZ } from './layout';
import { type Add, type DistrictData, archWindow, fountain, frame, minaret, palm } from './districts';

const IVORY = '#f4ecdc';
const SAND = '#e8dcc4';
const STONE = '#d8ccb4';
const GOLD = '#d8b25a';
const MARBLE = '#f2eee6';
const GLASS = '#3f5a70';
const TILE = '#1f7f86';
const LAPIS = '#26406e';
const CRIMSON = '#7a1420';

/**
 * The royal palace in the middle of the palm: a raised marble terrace with a grand staircase; four
 * wings of three storeys round a courtyard of pools, fountains and gardens; a towering entrance
 * portal flanked by two minarets; octagonal corner towers under golden domes; a domed great hall
 * rising from the back of the courtyard; roofs of small domes and crenellated parapets; gilded
 * string courses, arcades and balconies; and lights that wash the facades after dark.
 * You can walk in: through the portal into the courtyard, through a tall door into the throne room
 * under the great dome, and through the arcade into the long reception galleries of the side wings.
 * Local frame: +z faces the land (the entrance), x runs across the trunk.
 */
export function royalPalace(out: DistrictData, p: PalmPlan, y0: number, warm: boolean, r: (k: number) => number) {
  const { x: px, z: pz, w: W, d: D } = p.palace;
  const { add } = frame(out, px, pz, y0, [px, pz + 1]);
  const { T, H, wing } = PALACE;
  const tree = (x: number, z: number, k: number, h = 8, y = T) => {
    if (warm) palm(add, x, z, h + r(k) * 3, r, k, y);
    else {
      add('cyl', 'bark', x, y, z, 0.4, 1.6, 0.4, '#5a4232');
      add('cone', 'leaf', x, y + 1.2, z, 2.4, h, 2.4, '#2f5e3a');
    }
  };
  terrace(add, W, D, T);
  // ── the four wings, each with its outer facade, courtyard facade, roof and parapet
  const faces: { cx: number; cz: number; len: number; rot: number; inner: boolean; doors?: number[] }[] = [];
  // wing blocks
  add('box', 'lit', 0, T, -D / 2 + wing / 2, W, H, wing, IVORY);
  galleries(add, W, D, T, H, wing);
  for (const s of [-1, 1]) add('box', 'lit', s * (W / 4 + 4), T, D / 2 - wing / 2, W / 2 - 8, H, wing, IVORY);
  // outer faces: front (two halves either side of the portal), back, sides
  faces.push({ cx: 0, cz: -D / 2, len: W, rot: Math.PI, inner: false });
  for (const s of [-1, 1]) faces.push({ cx: s * (W / 4 + 4), cz: D / 2, len: W / 2 - 8, rot: 0, inner: false });
  for (const s of [-1, 1]) faces.push({ cx: s * (W / 2), cz: 0, len: D, rot: (s * Math.PI) / 2, inner: false });
  // courtyard faces
  // the back wing's courtyard face either side of the great hall, which stands against it
  const hb = PALACE.hallB / 2;
  for (const s of [-1, 1]) faces.push({ cx: s * (hb + (W / 2 - wing - hb) / 2), cz: -D / 2 + wing, len: W / 2 - wing - hb, rot: 0, inner: true });
  for (const s of [-1, 1]) faces.push({ cx: s * (W / 4 + 4), cz: D / 2 - wing, len: W / 2 - 8 - (s > 0 ? 0 : 0), rot: Math.PI, inner: true });
  // the side wings' courtyard faces open into their galleries (the facade's own axis runs along +z
  // on the +x side and along -z on the -x side)
  for (const s of [-1, 1]) faces.push({ cx: s * (W / 2 - wing), cz: 0, len: D - 2 * wing, rot: (-s * Math.PI) / 2, inner: true, doors: palaceGalleryDoors(D, s).map((z) => s * z) });
  for (const f of faces) facade(add, f.cx, f.cz, f.len, f.rot, f.inner, T, H, f.doors);
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
      domeRibs(add, tx, T + th + 4, tz, 5.05, 4.5, 8, 5, 0.2);
      // a band of turquoise tiles set with gilt lozenges below the first balcony
      add('oct', 'marble', tx, T + 23.2, tz, 13.3, 1.8, 13.3, TILE);
      add('oct', 'gold', tx, T + 25, tz, 13.5, 0.25, 13.5, GOLD);
      for (let q = 0; q < 8; q++) {
        const a = (q / 8) * Math.PI * 2 + Math.PI / 8;
        add('box', 'gold', tx + Math.sin(a) * 6.3, T + 23.7, tz + Math.cos(a) * 6.3, 0.7, 0.7, 0.1, GOLD, a, 0, Math.PI / 4);
      }
      // a rusticated base
      add('oct', 'stone', tx, T, tz, 13.6, 1.4, 13.6, STONE);
      add('cyl', 'gold', tx, T + th + 12.6, tz, 1.2, 1.4, 1.2, GOLD);
      add('cone', 'gold', tx, T + th + 14, tz, 0.6, 4.5, 0.6, GOLD);
      add('beamCone', 'nightBeam', tx, T + th - 2, tz + sz * 9, 10, th - 2, 6, '#ffe2b0', 0, Math.PI);
    }
  portal(add, D, T, H);
  greatHall(add, D, T, H);
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
  // urns of flowers along the balustrade, lamps between them
  const urn = (x: number, z: number, k: number) => {
    add('cyl', 'marble', x, T, z, 1, 0.5, 1, MARBLE);
    add('sphere', 'marble', x, T + 1.05, z, 1.2, 1.1, 1.2, '#efe8da');
    add('cyl', 'gold', x, T + 1.5, z, 0.9, 0.18, 0.9, GOLD);
    add('sphere', 'leaf', x, T + 1.85, z, 1.1, 0.7, 1.1, ['#c83a4a', '#e8a030', '#d84a8a'][k % 3]);
  };
  let k = 0;
  for (let z = -td / 2 + 10; z < td / 2 - 6; z += 14)
    for (const s of [-1, 1]) {
      urn((s * tw) / 2 - s * 1.6, z, k++);
      add('cyl', 'metal', (s * tw) / 2 - s * 1.6, T, z + 7, 0.14, 3.6, 0.14, '#2a2420');
      add('sphere', 'glow', (s * tw) / 2 - s * 1.6, T + 3.8, z + 7, 0.5, 0.65, 0.5, '#ffd890');
    }
  for (let x = -tw / 2 + 12; x < tw / 2 - 8; x += 14) urn(x, -td / 2 + 1.6, k++);
  for (const s of [-1, 1]) for (let x = 24; x < tw / 2 - 6; x += 14) urn(s * x, td / 2 - 1.6, k++);
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
function facade(add: Add, cx: number, cz: number, len: number, rot: number, inner: boolean, T: number, H: number, doors?: number[]) {
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
      if (doors?.some((d) => Math.abs(d - a) < 0.1)) {
        // an open doorway into the gallery: gilded arch, marble jambs, a threshold, a tiled panel
        const { galleryDoor: gd } = PALACE;
        const [dx, dz] = at(a, 0.08);
        add('halfTorus', 'gold', dx, T + 3, dz, (2 * gd + 0.3) / 0.9, gd / 0.45, 1.6, GOLD, rot);
        for (const e of [-1, 1]) {
          const [jx, jz] = at(a + e * (gd + 0.15), 0.15);
          add('box', 'marble', jx, T, jz, 0.35, 3, 0.3, MARBLE, rot);
        }
        const [tx, tz] = at(a, 0.6);
        add('box', 'marble', tx, T, tz, 2 * gd + 0.6, 0.05, 1.6, '#e2d6c0', rot);
        const [px, pz] = at(a, 0.1);
        add('box', 'marble', px, T + 4.75, pz, 2 * gd + 0.4, 0.75, 0.12, TILE, rot);
        add('box', 'gold', px, T + 5.05, pz, 0.35, 0.35, 0.16, GOLD, rot, 0, Math.PI / 4);
      } else {
        const [gx, gz] = at(a, 0.05);
        archWindow(add, gx, T + 0.3, gz, 3.2, 4.6, 'glass', GLASS, rot);
      }
      const [rx, rz] = at(a, 1.2);
      add('box', 'marble', rx, T + 6.1, rz, bay, 0.3, 2.4, MARBLE, rot);
    } else {
      const [gx, gz] = at(a, 0.05);
      archWindow(add, gx, T + 0.6, gz, 3.4, 5.6, 'glass', GLASS, rot);
      const [fx, fz] = at(a, 0.3);
      add('halfTorus', 'stone', fx, T + 0.6 + 5.6 - 1.7, fz, 3.9 / 0.9, 1.9 / 0.45, 0.4, STONE, rot);
      // a gilt keystone, carved jambs and a sill on corbels
      const [kx, kz] = at(a, 0.4);
      add('box', 'gold', kx, T + 6.05, kz, 0.5, 0.75, 0.3, GOLD, rot);
      for (const e of [-1, 1]) {
        const [jx, jz] = at(a + e * 1.95, 0.2);
        add('box', 'stone', jx, T + 0.6, jz, 0.35, 3.9, 0.3, STONE, rot);
      }
      const [sx0, sz0] = at(a, 0.35);
      add('box', 'stone', sx0, T + 0.35, sz0, 4.2, 0.25, 0.6, STONE, rot);
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
      // a carved surround: jambs, a moulded hood following the arch, and a gilt keystone
      for (const e of [-1, 1]) {
        const [jx, jz] = at(a + e * 1.38, 0.12);
        add('box', 'stone', jx, y, jz, 0.32, 2.8, 0.24, STONE, rot);
      }
      const [hx0, hz0] = at(a, 0.15);
      add('halfTorus', 'stone', hx0, y + 2.8, hz0, 3 / 0.9, 1.5 / 0.45, 0.6, STONE, rot);
      add('box', 'gold', hx0, y + 4.05, hz0, 0.36, 0.55, 0.26, GOLD, rot);
      if (fl === 1 && k % 2 === 0) {
        const [bx, bz] = at(a, 0.9);
        add('box', 'stone', bx, y - 0.3, bz, 3.6, 0.3, 1.8, STONE, rot);
        // stepped corbels carrying the balcony
        for (const e of [-1.3, 0, 1.3]) {
          const [cx1, cz1] = at(a + e, 0.75);
          add('box', 'stone', cx1, y - 0.85, cz1, 0.32, 0.55, 1.5, STONE, rot);
          const [cx2, cz2] = at(a + e, 0.45);
          add('box', 'stone', cx2, y - 1.3, cz2, 0.28, 0.45, 0.9, STONE, rot);
        }
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
  // a frieze of turquoise tiles set with gilt lozenges and white stars below the cornice
  const [fx0, fz0] = at(0, 0.12);
  add('box', 'marble', fx0, T + H - 2.7, fz0, len, 1, 0.24, TILE, rot);
  add('box', 'gold', fx0, T + H - 2.8, fz0, len, 0.12, 0.3, GOLD, rot);
  add('box', 'gold', fx0, T + H - 1.72, fz0, len, 0.12, 0.3, GOLD, rot);
  for (let a = -len / 2 + 0.75; a < len / 2 - 0.5; a += 1.5) {
    const [dx, dz] = at(a, 0.26);
    add('box', 'gold', dx, T + H - 2.5, dz, 0.42, 0.42, 0.06, GOLD, rot, 0, Math.PI / 4);
    const [wx, wz] = at(a + 0.75, 0.26);
    add('box', 'marble', wx, T + H - 2.35, wz, 0.22, 0.22, 0.05, '#f8f4ec', rot);
  }
  // outside, a rusticated plinth along the foot of the wall
  if (!inner) {
    const [px, pz] = at(0, 0.25);
    add('box', 'stone', px, T, pz, len, 0.55, 0.5, '#cbbd9f', rot);
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
  // tiled spandrels between the arch and the alfiz: turquoise set with gilt lozenges
  for (const sd of [-1, 1])
    for (let y = 0.6; y < 11.2; y += 1.2) {
      const h = Math.min(y, 9.6);
      const xa = 9.9 * Math.sqrt(Math.max(0, 1 - (h / 9.8) ** 2));
      const x0 = y >= 9.6 ? 0.3 : xa + 0.5;
      const wdt = 11.6 - x0;
      if (wdt < 0.4) continue;
      add('box', 'marble', sd * (x0 + wdt / 2), T + 22 + y - 0.6, z + 0.98, wdt, 1.2, 0.3, TILE);
      for (let a = x0 + 0.6; a < 11.4; a += 1.2) add('box', 'gold', sd * a, T + 22 + y - 0.3, z + 1.16, 0.4, 0.4, 0.05, GOLD, 0, 0, Math.PI / 4);
    }
  // a tiled dado and gilt niches lining the passage through the iwan
  for (const sd of [-1, 1]) {
    add('box', 'marble', sd * 8.95, T, z - 4, 0.1, 1.6, 9.6, TILE);
    for (let q = -3; q <= 3; q += 2) archWindow(add, sd * 8.93, T + 2.4, z - 4 + q, 1.3, 3.2, 'gold', '#c89a40', (-sd * Math.PI) / 2);
  }
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
 * domes on its corners. It is hollow: a tall gilded door from the courtyard opens into the throne
 * room, a marble floor inlaid with a star under a ring of columns and arches, the throne on a
 * stepped dais beneath a canopy, a great chandelier, and the inside of the dome painted lapis blue
 * with gold ribs and stars.
 */
function greatHall(add: Add, D: number, T: number, H: number) {
  const z = palaceHallZ(D);
  const { hallB: B, wall: wt, hallDoor: hd, hallDoorH: dh } = PALACE;
  const BH = H + 8;
  const fz = z + B / 2 - wt / 2;
  // the walls: back, sides, and the courtyard wall either side of and above the door
  add('box', 'lit', 0, T, z - B / 2 + wt / 2, B, BH, wt, IVORY);
  for (const s of [-1, 1]) {
    add('box', 'lit', s * (B / 2 - wt / 2), T, z, wt, BH, B - 2 * wt, IVORY);
    add('box', 'lit', s * (hd + (B / 2 - hd) / 2), T, fz, B / 2 - hd, BH, wt, IVORY);
    // the door's arched head: solid corners above the springing
    add('box', 'lit', s * (hd - 0.5), T + dh - 1.5, fz, 1, 1.5, wt, IVORY);
    add('box', 'lit', s * (hd - 1.35), T + dh - 0.55, fz, 0.8, 0.55, wt, IVORY);
  }
  add('box', 'lit', 0, T + dh, fz, 2 * hd, BH - dh, wt, IVORY);
  // the door outside: a gilded arch and jambs inside a gilt alfiz, tiled corners, a lit band
  add('halfTorus', 'gold', 0, T + dh - hd, z + B / 2 + 0.1, (2 * hd + 0.4) / 0.9, hd / 0.45, 2.4, GOLD);
  for (const s of [-1, 1]) {
    add('box', 'gold', s * (hd + 0.2), T, z + B / 2 + 0.1, 0.4, dh - hd, 0.35, GOLD);
    add('box', 'gold', s * (hd + 1.3), T, z + B / 2 + 0.12, 0.45, dh + 1.2, 0.3, GOLD);
    add('box', 'marble', s * (hd + 0.8), T + dh - hd, z + B / 2 + 0.06, 1, hd + 1.2, 0.12, TILE);
    // the carved doors stand open against the inside of the wall
    add('box', 'wood', s * (hd - 0.15), T, z + B / 2 - wt - 1.4, 0.2, dh - 1, 2.6, '#6a3a1a');
    for (let k = 0; k < 4; k++) add('box', 'gold', s * (hd - 0.28), T + 1.2 + k * 1.9, z + B / 2 - wt - 1.4, 0.06, 0.18, 2.2, GOLD);
  }
  add('box', 'gold', 0, T + dh + 1.2, z + B / 2 + 0.12, 2 * hd + 3.1, 0.45, 0.3, GOLD);
  add('box', 'dark', 0, T + dh + 1.8, z + B / 2 + 0.06, 2 * hd + 2.6, 1.4, 0.12, '#1a2a3a');
  add('box', 'glow', 0, T + dh + 2, z + B / 2 + 0.14, 2 * hd + 2, 1, 0.04, '#ffd27a');
  add('box', 'marble', 0, T, z + B / 2 + 1.2, 2 * hd + 1, 0.06, 2.4, '#e2d6c0');
  // windows: outside on the courtyard and side faces, and their inner faces seen from the hall
  for (const [rot, ox, oz] of [
    [0, 0, B / 2],
    [Math.PI / 2, B / 2, 0],
    [-Math.PI / 2, -B / 2, 0],
  ] as const) {
    const nx = Math.sin(rot);
    const nz = Math.cos(rot);
    for (let k = -2; k <= 2; k++) {
      const a = k * 6;
      const wx = ox + Math.cos(rot) * a;
      const wz = z + oz - Math.sin(rot) * a;
      for (const [y, ww, wh] of [
        [T + 2, 3.6, 9],
        [T + 14, 3, 7],
      ] as const) {
        if (rot === 0 && k === 0 && y < T + 10) continue; // the door
        archWindow(add, wx + nx * 0.05, y, wz + nz * 0.05, ww, wh, 'glass', GLASS, rot);
        archWindow(add, wx - nx * (wt + 0.05), y, wz - nz * (wt + 0.05), ww, wh, 'glass', '#ffcf8a', rot + Math.PI);
        add('halfTorus', 'stone', wx + nx * 0.2, y + wh - ww / 2, wz + nz * 0.2, (ww + 0.7) / 0.9, (ww / 2 + 0.35) / 0.45, 0.5, STONE, rot);
        add('box', 'gold', wx + nx * 0.3, y + wh + 0.15, wz + nz * 0.3, 0.45, 0.65, 0.26, GOLD, rot);
      }
    }
    add('box', 'gold', ox, T + 12.4, z + oz, rot === 0 ? B : 0.4, 0.4, rot === 0 ? 0.4 : B, GOLD);
    // the tile frieze below the parapet
    add('box', 'marble', ox + nx * 0.06, T + BH - 2.6, z + oz + nz * 0.06, rot === 0 ? B : 0.24, 1, rot === 0 ? 0.24 : B, TILE);
    for (let a = -B / 2 + 0.85; a < B / 2; a += 1.7) add('box', 'gold', ox + Math.cos(rot) * a + nx * 0.2, T + BH - 2.4, z + oz - Math.sin(rot) * a + nz * 0.2, 0.45, 0.45, 0.06, GOLD, rot, 0, Math.PI / 4);
  }
  // the roof: a ring round an octagonal opening under the drum (open so the dome shows inside)
  const ho = 13.4;
  const so = (B + 1.5) / 2;
  for (const s of [-1, 1]) {
    add('box', 'stone', 0, T + BH, z + s * (ho + (so - ho) / 2), 2 * so, 1.2, so - ho, STONE);
    add('box', 'stone', s * (ho + (so - ho) / 2), T + BH, z, so - ho, 1.2, 2 * ho, STONE);
  }
  for (let q = 0; q < 4; q++) {
    const a = Math.PI / 4 + (q * Math.PI) / 2;
    add('box', 'stone', Math.sin(a) * (ho + 3), T + BH, z + Math.cos(a) * (ho + 3), 11.2, 1.2, 6, STONE, a);
  }
  for (let a = -B / 2; a <= B / 2; a += 1.5)
    for (const [mx, mz] of [
      [a, z + B / 2 + 0.4],
      [a, z - B / 2 - 0.4],
      [B / 2 + 0.4, z + a],
      [-B / 2 - 0.4, z + a],
    ])
      add('box', 'plaster', mx, T + BH + 1.2, mz, 0.8, 1.4, 0.8, IVORY);
  // the drum (faces on the axes) and its ring of windows, lit from inside
  const dy = T + BH + 1.2;
  const oct = Math.PI / 8;
  add('octTube', 'lit', 0, dy, z, 30, 9, 30, IVORY, oct);
  for (let q = 0; q < 8; q++) {
    const a = (q / 8) * Math.PI * 2;
    archWindow(add, Math.sin(a) * 13.92, dy + 1.3, z + Math.cos(a) * 13.92, 3, 6, 'glass', '#ffcf8a', a);
    add('halfTorus', 'gold', Math.sin(a) * 14, dy + 1.3 + 4.5, z + Math.cos(a) * 14, 3.6 / 0.9, 1.7 / 0.45, 0.6, GOLD, a);
    const v = a + Math.PI / 8;
    add('box', 'stone', Math.sin(v) * 14.6, dy, z + Math.cos(v) * 14.6, 0.9, 9, 0.9, STONE, v);
  }
  // (open shells, not solids: the dome must show through them from the hall below)
  add('octTube', 'gold', 0, dy + 9, z, 31, 0.6, 31, GOLD, oct);
  add('ring', 'glow', 0, dy + 9.62, z, 30, 1, 30, '#ffd27a');
  // the dome: gold, ribbed, with a lantern and a finial of stacked spheres and a crescent ring
  // (the half-sphere's height is half its y scale: 44 makes a dome 22 m tall)
  add('hemi', 'gold', 0, dy + 9.6, z, 29, 44, 29, GOLD);
  domeRibs(add, 0, dy + 9.6, z, 14.6, 22, 16, 8, 0.35);
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
      const cx = sx * (B / 2 - 3.6);
      const cz = z + sz * (B / 2 - 3.6);
      add('oct', 'plaster', cx, T + BH + 1.2, cz, 6, 3, 6, IVORY);
      add('hemi', 'gold', cx, T + BH + 4.2, cz, 5.8, 5, 5.8, GOLD);
      domeRibs(add, cx, T + BH + 4.2, cz, 2.95, 2.5, 8, 3, 0.12);
      add('cone', 'gold', cx, T + BH + 6.6, cz, 0.5, 2.5, 0.5, GOLD);
    }
  throneRoom(add, z, T, BH, dy);
}

/** Inside the great hall. */
function throneRoom(add: Add, z: number, T: number, BH: number, dy: number) {
  const { hallB: B, wall: wt, hallDoor: hd, daisW, daisD, daisStep } = PALACE;
  const iw = B - 2 * wt;
  const back = z - B / 2 + wt;
  const front = z + B / 2 - wt;
  // the floor: pale marble, a lapis ring, an eight-pointed gilt star and a medallion
  add('box', 'hallMarble', 0, T, z, iw, 0.04, iw, '#f4efe6');
  add('cyl', 'hallMarble', 0, T, z, 25, 0.06, 25, LAPIS);
  add('cyl', 'hallMarble', 0, T, z, 23.4, 0.07, 23.4, '#f2ede2');
  for (const r of [0, Math.PI / 4]) add('box', 'gold', 0, T, z, 12, 0.08, 12, '#d8b25a', r);
  add('box', 'hallMarble', 0, T, z, 10.4, 0.09, 10.4, '#efe6d4');
  add('box', 'hallMarble', 0, T, z, 10.4, 0.09, 10.4, '#efe6d4', Math.PI / 4);
  add('cyl', 'hallMarble', 0, T, z, 6, 0.1, 6, LAPIS);
  add('cyl', 'gold', 0, T, z, 3.2, 0.11, 3.2, GOLD);
  // the crimson runner from the door to the dais, edged in gold
  const r0 = back + daisD;
  add('box', 'rug', 0, T, (front + r0) / 2, 3.4, 0.13, front - r0, CRIMSON);
  for (const s of [-1, 1]) add('box', 'gold', s * 1.75, T, (front + r0) / 2, 0.18, 0.14, front - r0, GOLD);
  // a tiled dado and gold rail round the walls; a gilt string course; a gilt cornice at the ceiling
  for (const [x, zz, w, d] of [
    [0, back + 0.05, iw, 0.1],
    [-iw / 2 + 0.05, z, 0.1, iw],
    [iw / 2 - 0.05, z, 0.1, iw],
    [-(hd + (iw / 2 - hd) / 2), front - 0.05, iw / 2 - hd, 0.1],
    [hd + (iw / 2 - hd) / 2, front - 0.05, iw / 2 - hd, 0.1],
  ] as const) {
    add('box', 'hallMarble', x, T, zz, w, 1.5, d, TILE);
    add('box', 'gold', x, T + 1.5, zz, w + (d > 1 ? 0.1 : 0), 0.15, d + (w > 1 ? 0.1 : 0) + 0.06, GOLD);
    add('box', 'gold', x, T + 12.4, zz, w, 0.35, d + 0.1, GOLD);
    add('box', 'gold', x, T + BH - 1.2, zz, w, 1.2, d + 0.5, '#c89a40');
  }
  // the colonnade: sixteen marble columns in a ring, arches between them and an entablature
  const R = 11;
  for (let q = 0; q < 16; q++) {
    const a = ((q + 0.5) / 16) * Math.PI * 2;
    const x = Math.sin(a) * R;
    const cz = z + Math.cos(a) * R;
    add('box', 'hallMarble', x, T, cz, 1.7, 0.6, 1.7, '#e8e0d0', a);
    add('cyl', 'gold', x, T + 0.6, cz, 1.5, 0.25, 1.5, GOLD);
    add('cyl', 'hallMarble', x, T + 0.85, cz, 1.15, 10.3, 1.15, '#f2ece2');
    add('cyl', 'gold', x, T + 4.2, cz, 1.25, 0.2, 1.25, GOLD);
    add('cone', 'gold', x, T + 11.15, cz, 1.9, 0.85, 1.9, GOLD, 0, Math.PI);
    add('box', 'stone', x, T + 11.15, cz, 1.9, 0.5, 1.9, STONE, a);
    const m = a + Math.PI / 16;
    const mx = Math.sin(m) * R;
    const mz = z + Math.cos(m) * R;
    const chord = 2 * R * Math.sin(Math.PI / 16);
    add('halfTorus', 'lit', mx, T + 11.65, mz, (chord - 0.6) / 0.9, 1.8 / 0.45, 3, IVORY, m);
    add('box', 'lit', mx, T + 13.45, mz, chord + 0.3, 1.2, 1.4, IVORY, m);
    add('box', 'gold', mx, T + 14.65, mz, chord + 0.4, 0.3, 1.6, GOLD, m);
    add('sphere', 'lamp', mx, T + 10.6, mz, 0.5, 0.75, 0.5, '#ffd890');
    add('rod', 'gold', mx, T + 12, mz, 0.05, 2, 0.05, GOLD);
  }
  // the ceiling round the dome opening: painted lapis panels with gilt rosettes
  for (const [x, zz, w, d] of [
    [0, z - 14.45, iw, 2.1],
    [0, z + 14.45, iw, 2.1],
    [-14.45, z, 2.1, iw],
    [14.45, z, 2.1, iw],
  ] as const) add('box', 'ceiling', x, T + BH - 0.12, zz, w, 0.1, d, LAPIS);
  // the drum and dome from inside: windows glowing round the drum, a lapis dome with gold ribs
  // and stars, a gilt ledge at its foot and a glowing oculus at the crown
  add('octTube', 'ceiling', 0, T + BH, z, 29, dy + 9.6 - T - BH, 29, '#f2e6cc', Math.PI / 8);
  add('octTube', 'gold', 0, T + BH, z, 29.2, 0.6, 29.2, GOLD, Math.PI / 8);
  for (let q = 0; q < 8; q++) {
    const a = (q / 8) * Math.PI * 2;
    archWindow(add, Math.sin(a) * 13.3, dy + 1.3, z + Math.cos(a) * 13.3, 3, 6, 'glow', '#ffd9a0', a + Math.PI);
    add('halfTorus', 'gold', Math.sin(a) * 13.25, dy + 5.8, z + Math.cos(a) * 13.25, 3.6 / 0.9, 1.7 / 0.45, 0.6, GOLD, a);
  }
  add('torus', 'gold', 0, dy + 9.6, z, 33, 3, 33, GOLD);
  add('hemi', 'ceiling', 0, dy + 9.6, z, 28, 40, 28, LAPIS);
  domeRibs(add, 0, dy + 9.6, z, 13.8, 19.7, 16, 7, 0.3);
  for (let j = 1; j <= 4; j++) {
    const t = (j / 5) * (Math.PI / 2);
    const n = [20, 16, 12, 6][j - 1];
    for (let q = 0; q < n; q++) {
      const a = ((q + 0.5 * (j % 2)) / n) * Math.PI * 2 + Math.PI / 16;
      add('sphere', 'glow', Math.sin(a) * 13.6 * Math.cos(t), dy + 9.6 + 19.5 * Math.sin(t), z + Math.cos(a) * 13.6 * Math.cos(t), 0.35, 0.35, 0.35, '#ffe2a0');
    }
  }
  add('cyl', 'glow', 0, dy + 9.6 + 19.6, z, 3, 0.2, 3, '#fff4dc');
  // the great chandelier hanging from the crown of the dome
  chandelier(add, 0, dy + 9.6 + 19.6, z, 4.5, dy + 9.6 + 19.6 - (T + 13));
  // the dais: three marble tiers with gilt edges, the crimson runner climbing them
  for (let i = 0; i < 3; i++) {
    const w = daisW - 2.4 * i;
    const d = daisD - 1.6 * i;
    add('box', 'hallMarble', 0, T + daisStep * i, back + d / 2, w, daisStep, d, i % 2 ? '#f2ece2' : '#e6dccb');
    add('box', 'gold', 0, T + daisStep * (i + 1) - 0.06, back + d, w, 0.08, 0.1, GOLD);
    add('box', 'rug', 0, T + daisStep * (i + 1), back + d - 0.9, 3.4, 0.03, 1.8, CRIMSON);
  }
  const ty = T + daisStep * 3;
  const tz = back + 2.6;
  // the throne: a gilded seat with crimson cushions, arms, a tall arched back and finials
  add('box', 'gold', 0, ty, tz, 2.4, 1, 2, GOLD);
  add('box', 'rug', 0, ty + 1, tz + 0.1, 2, 0.28, 1.7, CRIMSON);
  for (const s of [-1, 1]) {
    add('box', 'gold', s * 1.15, ty + 1, tz + 0.1, 0.3, 0.75, 1.9, GOLD);
    add('sphere', 'gold', s * 1.15, ty + 1.85, tz + 1, 0.4, 0.4, 0.4, GOLD);
    add('sphere', 'gold', s * 1.1, ty + 4.5, tz - 0.9, 0.5, 0.5, 0.5, GOLD);
  }
  add('box', 'gold', 0, ty + 1, tz - 0.9, 2.4, 3.3, 0.4, GOLD);
  add('arch', 'gold', 0, ty + 4.3, tz - 0.9, 2.4, 1.2, 0.4, GOLD);
  add('box', 'rug', 0, ty + 1.4, tz - 0.68, 1.9, 2.6, 0.06, CRIMSON);
  add('sphere', 'lamp', 0, ty + 5.7, tz - 0.9, 0.45, 0.45, 0.45, '#ffe8b0');
  // the canopy over it on four gilt columns, with drapes
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      add('cyl', 'gold', sx * 3, ty, tz + sz * 2.4, 0.32, 7, 0.32, GOLD);
      add('box', 'rug', sx * 3.15, ty + 3.2, tz + sz * 2.4, 0.08, 3.8, 1.3, CRIMSON);
    }
  add('box', 'gold', 0, ty + 7, tz, 6.8, 0.5, 5.6, GOLD);
  add('hemi', 'gold', 0, ty + 7.5, tz, 5.4, 4, 4.6, GOLD);
  add('cone', 'gold', 0, ty + 9.4, tz, 0.4, 1.6, 0.4, GOLD);
  // behind it, a great lapis niche framed in gold on the back wall
  archWindow(add, 0, T + 0.6, back + 0.08, 9, 15, 'hallMarble', LAPIS);
  add('halfTorus', 'gold', 0, T + 0.6 + 15 - 4.5, back + 0.15, 9.6 / 0.9, 4.8 / 0.45, 2, GOLD);
  for (const s of [-1, 1]) add('box', 'gold', s * 4.8, T + 0.6, back + 0.15, 0.3, 10.5, 0.2, GOLD);
  for (let q = 0; q < 7; q++) add('box', 'gold', -3 + q, T + 13.6 - Math.abs(q - 3) * 0.3, back + 0.14, 0.35, 0.35, 0.05, GOLD, 0, 0, Math.PI / 4);
  // braziers and standing lamps either side of the dais; benches along the side walls
  for (const s of [-1, 1]) {
    add('cyl', 'gold', s * 8.5, T, back + 4, 0.25, 2.6, 0.25, GOLD);
    add('cone', 'gold', s * 8.5, T + 2.6, back + 4, 1.4, 0.8, 1.4, GOLD, 0, Math.PI);
    add('sphere', 'lamp', s * 8.5, T + 2.9, back + 4, 0.8, 0.6, 0.8, '#ffb060');
    for (const zz of [z - 9, z - 1, z + 7]) {
      add('box', 'rug', s * (iw / 2 - 0.6), T, zz, 1.1, 0.45, 5, CRIMSON);
      add('box', 'rug', s * (iw / 2 - 0.25), T + 0.45, zz, 0.4, 0.75, 5, '#9a2a30');
      for (const o of [-1.6, 0, 1.6]) add('box', 'rug', s * (iw / 2 - 0.55), T + 0.45, zz + o, 0.25, 0.55, 0.9, '#d8b25a');
      add('cyl', 'gold', s * (iw / 2 - 2.2), T, zz - 3.4, 0.2, 2.2, 0.2, GOLD);
      add('sphere', 'lamp', s * (iw / 2 - 2.2), T + 2.4, zz - 3.4, 0.5, 0.65, 0.5, '#ffd890');
    }
  }
}

/** A chandelier hanging from a ceiling at height `ceil`: a chain, three gilt rings of lights, a crystal drop. */
function chandelier(add: Add, x: number, ceil: number, z: number, r: number, drop: number) {
  const y = ceil - drop;
  add('rod', 'gold', x, (ceil + y + 0.8) / 2, z, Math.max(0.06, r * 0.025), ceil - y - 0.8, Math.max(0.06, r * 0.025), GOLD);
  add('cyl', 'gold', x, ceil - 0.15, z, r * 0.4, 0.15, r * 0.4, GOLD);
  add('cyl', 'gold', x, y - 0.2, z, r * 0.08, 1.4, r * 0.08, GOLD);
  for (const [k, f] of [
    [0, 1],
    [1, 0.68],
    [2, 0.4],
  ] as const) {
    const yy = y + 0.8 - k * r * 0.12;
    add('torus', 'gold', x, yy, z, (r * f) / 0.42, 1.2, (r * f) / 0.42, GOLD);
    const n = Math.max(6, Math.round(12 * f));
    for (let q = 0; q < n; q++) {
      const a = (q / n) * Math.PI * 2 + k * 0.3;
      add('sphere', 'lamp', x + Math.sin(a) * r * f, yy + 0.2, z + Math.cos(a) * r * f, 0.16 + r * 0.03, 0.24 + r * 0.04, 0.16 + r * 0.03, '#fff0c8');
      if (k === 0) add('cone', 'lamp', x + Math.sin(a) * r * f, yy - 0.5 - r * 0.05, z + Math.cos(a) * r * f, 0.1 + r * 0.02, 0.4 + r * 0.06, 0.1 + r * 0.02, '#fffaf0', 0, Math.PI);
    }
  }
  add('sphere', 'lamp', x, y - 0.4, z, r * 0.3, r * 0.42, r * 0.3, '#fff4dc');
}

/** Gilt ribs following a dome of radius `R` and height `h` whose foot is at (cx, cy, cz). */
function domeRibs(add: Add, cx: number, cy: number, cz: number, R: number, h: number, n: number, seg: number, th: number) {
  for (let q = 0; q < n; q++) {
    const a = (q / n) * Math.PI * 2;
    for (let k = 0; k < seg; k++) {
      const t0 = (k / seg) * (Math.PI / 2);
      const t1 = ((k + 1) / seg) * (Math.PI / 2);
      const r0 = R * Math.cos(t0);
      const r1 = R * Math.cos(t1);
      const y0 = h * Math.sin(t0);
      const y1 = h * Math.sin(t1);
      const len = Math.hypot(r1 - r0, y1 - y0);
      // each segment follows the dome's curve: tilted in towards the axis as it climbs
      add('rod', 'gold', cx + (Math.sin(a) * (r0 + r1)) / 2, cy + (y0 + y1) / 2, cz + (Math.cos(a) * (r0 + r1)) / 2, th, len, th, '#c89a40', a + Math.PI, Math.atan2(r0 - r1, y1 - y0));
    }
  }
}

/**
 * The side wings: upper storeys over long ground-floor reception galleries entered from the
 * courtyard arcade. Inside: patterned marble, a crimson runner, two rows of columns carrying
 * arches, a coffered lapis ceiling, chandeliers, and majlis seating between the windows.
 */
function galleries(add: Add, W: number, D: number, T: number, H: number, wing: number) {
  const { wall: wt, galleryH: GH, galleryDoor: gd } = PALACE;
  const g0 = -D / 2 + wing;
  const g1 = D / 2 - wing;
  const L = g1 - g0;
  for (const s of [-1, 1]) {
    const cx = s * (W / 2 - wing / 2);
    const ox = s * (W / 2 - wt);
    const ix = s * (W / 2 - wing + wt);
    // the storeys above, the outer wall, and the courtyard wall broken by doors
    add('box', 'lit', cx, T + GH, 0, wing, H - GH, L, IVORY);
    add('box', 'lit', s * (W / 2 - wt / 2), T, 0, wt, GH, L, IVORY);
    const doors = palaceGalleryDoors(D, s).sort((a, b) => a - b);
    let from = g0;
    for (const dz of [...doors, Infinity]) {
      const to = dz === Infinity ? g1 : dz - gd;
      if (to > from) {
        add('box', 'lit', s * (W / 2 - wing + wt / 2), T, (from + to) / 2, wt, GH, to - from, IVORY);
        add('box', 'hallMarble', ix + s * 0.05, T, (from + to) / 2, 0.1, 1.2, to - from, TILE);
        add('box', 'gold', ix + s * 0.05, T + 1.2, (from + to) / 2, 0.16, 0.12, to - from, GOLD);
      }
      if (dz !== Infinity) {
        add('box', 'lit', s * (W / 2 - wing + wt / 2), T + 4.6, dz, wt, GH - 4.6, 2 * gd, IVORY);
        for (const e of [-1, 1]) {
          add('box', 'lit', s * (W / 2 - wing + wt / 2), T + 3.7, dz + e * (gd - 0.3), wt, 0.9, 0.6, IVORY);
          add('box', 'lit', s * (W / 2 - wing + wt / 2), T + 4.2, dz + e * (gd - 0.85), wt, 0.4, 0.5, IVORY);
        }
        add('halfTorus', 'gold', ix + s * 0.08, T + 3, dz, (2 * gd + 0.3) / 0.9, gd / 0.45, 1.6, GOLD, Math.PI / 2);
        from = dz + gd;
      }
    }
    // windows seen from inside: on the outer wall (between the facade's bays) and the courtyard wall
    for (let wz = -57; wz <= 57; wz += 6) if (wz > g0 + 2 && wz < g1 - 2) archWindow(add, ox - s * 0.05, T + 0.6, wz, 3.4, 5.6, 'glass', '#ffcf8a', (-s * Math.PI) / 2);
    const n = Math.floor(L / 6);
    for (let k = 1; k < n; k += 2) {
      const a = -((n - 1) * 6) / 2 + k * 6;
      archWindow(add, ix + s * 0.05, T + 0.3, s * a, 3.2, 4.6, 'glass', '#ffcf8a', (s * Math.PI) / 2);
    }
    add('box', 'hallMarble', ox - s * 0.05, T, 0, 0.1, 0.6, L, TILE);
    // the floor: bays of two marbles with gilt joints, and the runner down the middle
    for (let b = g0, k = 0; b < g1 - 0.1; b += 6, k++) {
      add('box', 'hallMarble', cx, T, b + 3, wing - 2 * wt, 0.04, 6, k % 2 ? '#f2ece0' : '#e0d3bc');
      add('box', 'gold', cx, T, b, wing - 2 * wt, 0.06, 0.12, GOLD);
    }
    add('box', 'rug', cx, T, 0, 3.2, 0.1, L - 4, CRIMSON);
    for (const e of [-1, 1]) add('box', 'gold', cx + e * 1.65, T, 0, 0.16, 0.11, L - 4, GOLD);
    // two rows of columns, arches along each row and across the gallery
    for (let b = g0 + 6; b < g1 - 1; b += 6)
      for (const e of [-1, 1]) {
        const x = cx + e * 3.5;
        add('box', 'hallMarble', x, T, b, 1.2, 0.45, 1.2, '#e8e0d0');
        add('cyl', 'hallMarble', x, T + 0.45, b, 0.8, 4.3, 0.8, '#f2ece2');
        add('cyl', 'gold', x, T + 1.6, b, 0.9, 0.15, 0.9, GOLD);
        add('cone', 'gold', x, T + 4.75, b, 1.3, 0.5, 1.3, GOLD, 0, Math.PI);
        add('box', 'stone', x, T + 4.75, b, 1.3, 0.3, 1.3, STONE);
      }
    for (const e of [-1, 1]) {
      const x = cx + e * 3.5;
      for (let b = g0 + 6; b < g1 - 7; b += 6) add('halfTorus', 'lit', x, T + 5.05, b + 3, 5.2 / 0.9, 1.0 / 0.45, 2, IVORY, Math.PI / 2);
      add('box', 'lit', x, T + 5.8, 0, 0.8, GH - 5.8, L - 12, IVORY);
    }
    for (let b = g0 + 6; b < g1 - 1; b += 6) add('halfTorus', 'lit', cx, T + 5.05, b, 6.2 / 0.9, 1.2 / 0.45, 2, IVORY);
    // the coffered ceiling: gilt beams, lapis panels with gilt rosettes
    for (let b = g0; b <= g1 + 0.1; b += 6) add('box', 'gold', cx, T + GH - 0.3, b, wing - 2 * wt, 0.3, 0.35, GOLD);
    for (let b = g0; b < g1 - 0.1; b += 6)
      for (const e of [-1, 0, 1]) {
        add('box', 'ceiling', cx + e * 4.9, T + GH - 0.08, b + 3, 4.3, 0.06, 5.2, LAPIS);
        add('cyl', 'gold', cx + e * 4.9, T + GH - 0.14, b + 3, 1, 0.06, 1, GOLD);
      }
    // chandeliers down the middle
    for (let b = g0 + 9; b < g1 - 2; b += 12) chandelier(add, cx, T + GH - 0.3, b, 1.5, 2.1);
    // majlis groups in the outer aisle: a rug, a long sofa against the wall, two chairs, a low
    // table with a brass coffee pot, and a lantern; potted palms in the courtyard aisle
    const mx = s * (W / 2 - wt - 2.1);
    for (let mz = g0 + 6; mz < g1 - 3; mz += 12) {
      add('box', 'rug', mx, T, mz, 3.4, 0.05, 4.6, '#9a3a24');
      add('box', 'rug', mx, T, mz, 2.6, 0.06, 3.8, '#c8a050');
      add('box', 'rug', mx + s * 1.25, T, mz, 0.9, 0.45, 2.5, CRIMSON);
      add('box', 'rug', mx + s * 1.6, T + 0.45, mz, 0.25, 0.6, 2.5, '#9a2a30');
      for (const o of [-0.8, 0.8]) add('box', 'rug', mx + s * 1.4, T + 0.45, mz + o, 0.2, 0.45, 0.6, '#d8b25a');
      for (const o of [-1, 1]) {
        add('box', 'rug', mx - s * 0.2, T, mz + o * 1.7, 0.9, 0.45, 0.8, CRIMSON);
        add('box', 'rug', mx - s * 0.2, T + 0.45, mz + o * 2.0, 0.9, 0.5, 0.2, '#9a2a30');
      }
      add('box', 'wood', mx, T, mz, 0.9, 0.38, 1.2, '#5a3218');
      add('cyl', 'gold', mx, T + 0.38, mz, 0.22, 0.32, 0.22, GOLD);
      add('cone', 'gold', mx, T + 0.7, mz, 0.18, 0.22, 0.18, GOLD);
      add('cyl', 'gold', mx + 0.25, T + 0.38, mz + 0.3, 0.1, 0.08, 0.1, GOLD);
      add('cyl', 'dark', mx + s * 1.3, T, mz + 1.95, 0.35, 1.2, 0.35, '#2a2420');
      add('oct', 'gold', mx + s * 1.3, T + 1.2, mz + 1.95, 0.5, 0.7, 0.5, GOLD);
      add('sphere', 'lamp', mx + s * 1.3, T + 1.55, mz + 1.95, 0.35, 0.5, 0.35, '#ffc070');
    }
    for (let k = 1; k < n; k += 2) {
      const pz = s * (-((n - 1) * 6) / 2 + k * 6);
      const px = ix + s * 1.3;
      add('cyl', 'hallMarble', px, T, pz, 0.9, 0.8, 0.9, '#e8e0d0');
      add('cyl', 'gold', px, T + 0.75, pz, 1, 0.08, 1, GOLD);
      add('cone', 'leaf', px, T + 0.8, pz, 1.6, 2.4, 1.6, '#3a6a30');
    }
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
  // citrus trees in gilt-rimmed marble planters lining the pool
  for (let z = z0 + 4; z < z1 - 3; z += 6.5)
    for (const s of [-1, 1]) {
      const x = s * 7;
      add('box', 'marble', x, T, z, 1.5, 1.1, 1.5, '#ebe4d6');
      add('box', 'gold', x, T + 1.05, z, 1.62, 0.12, 1.62, GOLD);
      add('cyl', 'bark', x, T + 1.1, z, 0.16, 0.9, 0.16, '#5a4232');
      add('sphere', 'leaf', x, T + 2.4, z, 2, 1.8, 2, '#3f7a34');
      for (let q = 0; q < 6; q++) add('sphere', 'plaster', x + Math.sin(q * 1.05) * 0.85, T + 2.2 + (q % 3) * 0.35, z + Math.cos(q * 1.05) * 0.85, 0.26, 0.26, 0.26, '#f08a1a');
    }
  // lantern posts along the arcades
  for (let z = z0 + 3; z < z1; z += 9)
    for (const s of [-1, 1]) {
      const x = s * (W / 2 - wing - 4.6);
      add('box', 'stone', x, T, z, 0.6, 0.4, 0.6, STONE);
      add('cyl', 'dark', x, T + 0.4, z, 0.18, 2.8, 0.18, '#2a2420');
      add('oct', 'dark', x, T + 3.2, z, 0.75, 1, 0.75, '#2a2420');
      add('oct', 'lamp', x, T + 3.28, z, 0.6, 0.84, 0.6, '#ffd890');
      add('cone', 'gold', x, T + 4.2, z, 0.9, 0.6, 0.9, GOLD);
    }
  // gilt eight-pointed stars set in the paving: on the cross path, before the hall, at the portal
  const star = (x: number, z: number, r: number) => {
    add('cyl', 'marble', x, T, z, r * 1.25, 0.1, r * 1.25, LAPIS);
    for (const a of [0, Math.PI / 4]) add('box', 'gold', x, T, z, r * 0.8, 0.11, r * 0.8, GOLD, a);
    add('cyl', 'marble', x, T, z, r * 0.45, 0.12, r * 0.45, '#f4efe6');
  };
  for (const s of [-1, 1]) star(s * (iw / 4 + 3), cz, 2.4);
  star(0, z0 + 1.2, 2.2);
  star(0, z1 + 0.4, 2);
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
