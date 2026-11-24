import type { PalmPlan } from './layout';
import { type Add, type DistrictData, frame, lounger, palm } from './districts';
import { type P2, cruise, loopRoute } from './movers';
import { royalPalace } from './palace';

/**
 * The palm island as one royal estate: sand over the trunk, fronds and crescent; a gatehouse and a
 * ceremonial avenue of fountains up the trunk to the palace on its terrace; royal gardens behind
 * it to a domed rotunda at the tip; formal gardens down every frond with pavilions and a guest
 * palace at each tip; the crescent's breakwater and beaches; the sea pavilion at the apex with the
 * royal yachts; and boats in the lagoon.
 */
export function palmIsland(out: DistrictData, add: Add, p: PalmPlan, r: (k: number) => number, warm: boolean, y0 = 0) {
  const sand = '#ecdcb6';
  const tree = (x: number, z: number, k: number, h = 7) => {
    if (warm) palm(add, x, z, h + r(k) * 3, r, k);
    else {
      add('cyl', 'bark', x, 0, z, 0.35, 1.3, 0.35, '#5a4232');
      for (const [f, w] of [[0.15, 0.62], [0.42, 0.48], [0.66, 0.32]] as const) add('cone', 'leaf', x, h * f, z, h * w, h * 0.42, h * w, '#2f5e3a');
    }
  };
  // sand over every strip of the island, with round ends
  for (const [i, [ax, az, bx, bz, rr]] of p.land.entries()) {
    const len = Math.hypot(bx - ax, bz - az);
    const t = Math.atan2(bx - ax, bz - az);
    // the sand's top sits just above the ground and just below the roads, which draw over it
    add('box', 'stone', (ax + bx) / 2, -0.18, (az + bz) / 2, rr * 2, 0.2, len, sand, t);
    // a wet sand skirt shelving down into the water all round
    add('box', 'stone', (ax + bx) / 2, -1.2, (az + bz) / 2, rr * 2 + 5, 1.1, len, '#cdb88e', t);
    if (i > 1)
      for (const [x, z] of [[ax, az], [bx, bz]] as const) {
        add('cyl', 'stone', x, -0.18, z, rr * 2, 0.2, rr * 2, sand);
        add('cyl', 'stone', x, -1.2, z, rr * 2 + 5, 1.1, rr * 2 + 5, '#cdb88e');
      }
  }
  const { xp, zBase, zTip } = p;
  const pal = p.palace;
  // ── the gatehouse across the trunk: two towers under golden domes and an arch between them
  const gz = zBase - 10;
  for (const sd of [-1, 1]) {
    add('oct', 'plaster', xp + sd * 13, 0, gz, 9, 24, 9, '#e8dcc4');
    for (const y of [8, 16]) add('oct', 'gold', xp + sd * 13, y, gz, 9.3, 0.3, 9.3, '#d8b25a');
    add('oct', 'stone', xp + sd * 13, 24, gz, 10.5, 0.8, 10.5, '#d8ccb4');
    add('hemi', 'gold', xp + sd * 13, 24.8, gz, 8, 7, 8, '#d8b25a');
    add('cone', 'gold', xp + sd * 13, 31.5, gz, 0.5, 3, 0.5, '#d8b25a');
    add('box', 'plaster', xp + sd * 20.5, 0, gz, 6, 6, 3, '#e8dcc4');
    for (let a = 0; a < 6; a += 1.5) add('box', 'plaster', xp + sd * (17.75 + a), 6, gz, 0.8, 1.2, 3, '#f4ecdc');
  }
  add('box', 'plaster', xp, 14, gz, 17, 6, 6, '#f4ecdc');
  add('halfTorus', 'gold', xp, 0.5, gz + 3.1, 17 / 0.9, 14 / 0.45, 1.4, '#d8b25a');
  add('box', 'glow', xp, 16, gz + 3.05, 12, 1.4, 0.05, '#ffd27a');
  // ── the ceremonial avenue from the gate to the palace: a channel of fountains, palms, lamps, flags
  const az0 = gz - 8;
  const az1 = pal.z + pal.d / 2 + 25 + 26 + 22;
  add('box', 'marble', xp, 0, (az0 + az1) / 2, 4, 0.5, az0 - az1, '#ece6da');
  add('box', 'water', xp, 0.42, (az0 + az1) / 2, 3.2, 0.12, az0 - az1 - 1, '#2ab8e8');
  for (let z = az0 - 6; z > az1 + 3; z -= 8) add('cone', 'water', xp, 0.5, z, 0.12, 2.6, 0.12, '#e8f8ff');
  for (let z = az0 - 4; z > az1; z -= 10) {
    for (const sd of [-1, 1]) {
      tree(xp + sd * 15, z, 900 + z + sd, 8);
      if (Math.round(z / 10) % 2 === 0) {
        add('cyl', 'metal', xp + sd * 9, 0, z, 0.18, 6, 0.18, '#2a2420');
        add('sphere', 'glow', xp + sd * 9, 6.2, z, 0.6, 0.8, 0.6, '#ffd890');
      } else {
        add('cyl', 'metal', xp + sd * 9.5, 0, z, 0.14, 10, 0.14, '#e8e8e8');
        add('box', 'cloth', xp + sd * 9.5 + 0.9, 8.4, z, 1.8, 1.2, 0.05, sd < 0 ? '#0e6a3a' : '#c8102e');
      }
    }
  }
  for (const sd of [-1, 1]) add('box', 'lawn', xp + sd * 15, 0.02, (az0 + az1) / 2, 7, 0.08, az0 - az1, '#5e9a48');
  // ── the royal gardens behind the palace to the tip, round a domed rotunda
  const rz0 = pal.z - pal.d / 2 - 60;
  for (let z = rz0; z > zTip + 18; z -= 14) {
    for (const sd of [-1, 1]) {
      add('box', 'leaf', xp + sd * 8, 0, z, 6, 1, 10, '#2f5a2a');
      add('box', 'leaf', xp + sd * 8, 1, z, 3, 0.4, 7, ['#c84a7a', '#e8c040'][Math.abs(Math.round(z)) % 2]);
      tree(xp + sd * 17, z, 1000 + z + sd, 7);
    }
  }
  add('cyl', 'marble', xp, 0, zTip + 8, 20, 1.2, 20, '#ece6da');
  for (let q = 0; q < 10; q++) add('cyl', 'marble', xp + Math.cos(q * 0.628) * 8, 1.2, zTip + 8 + Math.sin(q * 0.628) * 8, 0.9, 7, 0.9, '#f2eee6');
  add('cyl', 'stone', xp, 8.2, zTip + 8, 18, 1, 18, '#d8ccb4');
  add('hemi', 'gold', xp, 9.2, zTip + 8, 16, 8, 16, '#d8b25a');
  add('cone', 'gold', xp, 17, zTip + 8, 0.6, 3, 0.6, '#d8b25a');
  // ── the fronds: formal gardens with a channel of jets down each, hedges, pavilions, beaches, and a
  // guest palace with its yacht at the tip
  for (const [i, f] of p.fronds.entries()) {
    const dx = f.bx - f.ax;
    const dz = f.bz - f.az;
    const len = Math.hypot(dx, dz);
    const ux = dx / len;
    const uz = dz / len;
    const t = Math.atan2(dx, dz);
    const at = (d: number, o: number): [number, number] => [f.ax + ux * d - uz * o, f.az + uz * d + ux * o];
    const g0 = Math.max(20, pal.terraceR - 20);
    const glen = len - 24 - g0;
    if (glen > 10) {
      const [mx, mz] = at(g0 + glen / 2, 0);
      add('box', 'marble', mx, 0, mz, 3, 0.45, glen, '#ece6da', t);
      add('box', 'water', mx, 0.38, mz, 2.2, 0.1, glen - 1, '#2ab8e8', t);
      for (const o of [-1, 1]) {
        const [px, pz] = at(g0 + glen / 2, o * 4.5);
        add('box', 'stone', px, 0.01, pz, 3, 0.08, glen, '#e2d6c0', t);
        const [hx, hz] = at(g0 + glen / 2, o * 2.4);
        add('box', 'leaf', hx, 0, hz, 0.8, 0.9, glen, '#2f5a2a', t);
      }
    }
    for (let d = g0 + 6; d < len - 24; d += 9) {
      const [jx, jz] = at(d, 0);
      add('cone', 'water', jx, 0.45, jz, 0.1, 1.8, 0.1, '#e8f8ff');
      for (const o of [-1, 1]) {
        const [tx, tz] = at(d, o * 9);
        tree(tx, tz, 2000 + i * 37 + d * o, 6);
        const [bx2, bz2] = at(d + 4.5, o * 13);
        add('box', 'leaf', bx2, 0, bz2, 3, 0.6, 3, ['#c84a7a', '#e8c040', '#e86a3a', '#7a4ac8'][(i + Math.round(d)) % 4], t);
      }
    }
    // two domed pavilions on slender columns along each frond
    for (const u of [0.42, 0.7]) {
      const [kx, kz] = at(g0 + (len - 24 - g0) * u, 0);
      add('cyl', 'marble', kx, 0, kz, 9, 0.8, 9, '#ece6da');
      for (let q = 0; q < 8; q++) add('cyl', 'marble', kx + Math.cos(q * 0.785) * 3.6, 0.8, kz + Math.sin(q * 0.785) * 3.6, 0.45, 4.2, 0.45, '#f2eee6');
      add('cyl', 'stone', kx, 5, kz, 8.6, 0.6, 8.6, '#d8ccb4');
      add('hemi', 'gold', kx, 5.6, kz, 7.6, 4.6, 7.6, '#d8b25a');
      add('cone', 'gold', kx, 10.1, kz, 0.35, 1.8, 0.35, '#d8b25a');
      add('sphere', 'glow', kx, 4.2, kz, 0.6, 0.8, 0.6, '#ffd890');
    }
    // the guest palace at the tip: two storeys, corner turrets, a dome, a pool on the water side
    const [gx2, gz2] = at(len - 12, 0);
    add('box', 'marble', gx2, 0, gz2, 22, 1, 20, '#ece6da', t);
    add('box', 'plaster', gx2, 1, gz2, 16, 10, 14, '#f4ecdc', t);
    add('box', 'gold', gx2, 6, gz2, 16.2, 0.3, 14.2, '#d8b25a', t);
    add('box', 'stone', gx2, 11, gz2, 17, 0.6, 15, '#d8ccb4', t);
    for (const sa of [-1, 1])
      for (const so of [-1, 1]) {
        const [cx2, cz2] = at(len - 12 + sa * 7.5, so * 6.5);
        add('oct', 'plaster', cx2, 1, cz2, 3.6, 13, 3.6, '#e8dcc4');
        add('hemi', 'gold', cx2, 14, cz2, 3.4, 3, 3.4, '#d8b25a');
      }
    add('oct', 'plaster', gx2, 11.6, gz2, 8, 2.4, 8, '#f4ecdc');
    add('hemi', 'gold', gx2, 14, gz2, 7.6, 5.6, 7.6, '#d8b25a');
    add('cone', 'gold', gx2, 19.4, gz2, 0.4, 2.2, 0.4, '#d8b25a');
    for (const so of [-1, 1])
      for (let q = -2; q <= 2; q++) {
        const [wx, wz] = at(len - 12 + q * 3, so * 7.05);
        add('box', 'glass', wx, 2.5, wz, 1.6, 3, 0.1, '#3f5a70', t + Math.PI / 2);
        add('box', 'glass', wx, 7, wz, 1.4, 2.6, 0.1, '#3f5a70', t + Math.PI / 2);
      }
    const [plx, plz] = at(len - 1.5, 0);
    add('box', 'water', plx, 0.3, plz, 10, 0.12, 3.5, '#2ab8e8', t);
    lounger(add, ...at(len - 1.5, 6), t + Math.PI / 2);
    lounger(add, ...at(len - 1.5, -6), t + Math.PI / 2);
    // the private jetty with its yacht
    const [jx2, jz2] = at(len + 10, 0);
    add('box', 'wood', jx2, 0.2, jz2, 2.4, 0.2, 18, '#8a6440', t);
    const [yx, yz] = at(len + 12, 5);
    add('box', 'plaster', yx, -0.4, yz, 3.6, 1.5, 14, '#f4f6f8', t);
    add('box', 'glass', yx, 1.1, yz, 3, 0.9, 7, '#2a3a4a', t);
    add('box', 'dark', yx, -0.4, yz, 3.65, 0.35, 14, '#0a3a5a', t);
  }
  // the causeway: railings and lamps out across the water to the gate
  const { z0, z1 } = p.causeway;
  for (const sd of [-1, 1]) {
    add('box', 'metal', xp + sd * 7.5, 0.1, (z0 + z1) / 2, 0.15, 1, z0 - z1, '#e8ebef');
    for (let z = z1 + 4; z < z0; z += 14) {
      add('cyl', 'metal', xp + sd * 7.8, 0, z, 0.15, 6, 0.15, '#2a2e34');
      add('sphere', 'glow', xp + sd * 7.8, 6.1, z, 0.4, 0.4, 0.4, '#ffe2b0');
    }
  }
  royalPalace(out, p, y0, warm, r);
  crescent(out, add, p, r, tree);
  seaPavilion(add, p);
}

function crescent(out: DistrictData, add: Add, p: PalmPlan, r: (k: number) => number, tree: (x: number, z: number, k: number, h?: number) => void) {
  const c = p.crescent;
  const at = (th: number, rr: number): [number, number] => [c.cx + Math.sin(th) * rr, c.cz - Math.cos(th) * rr];
  // the breakwater: boulders along the open-sea side; resort beaches along the lagoon side
  for (let th = -c.th; th <= c.th; th += 0.022) {
    const [x, z] = at(th, c.r + c.w / 2 + 1);
    const k = Math.round(th * 1000);
    add('sphere', 'stone', x, -0.6, z, 3 + r(k) * 2, 2 + r(k + 1) * 1.6, 3 + r(k + 2) * 2, '#8a8478');
  }
  // the estate's sea wall along the crescent: crenellated, with watchtowers under golden domes
  const segs = 64;
  for (let k = 0; k < segs; k++) {
    const t0 = -c.th + 0.05 + ((2 * c.th - 0.1) * k) / segs;
    const t1 = -c.th + 0.05 + ((2 * c.th - 0.1) * (k + 1)) / segs;
    if (Math.abs((t0 + t1) / 2) < 0.2) continue;
    const [ax, az] = at(t0, c.r + c.w / 2 - 3);
    const [bx, bz] = at(t1, c.r + c.w / 2 - 3);
    const len = Math.hypot(bx - ax, bz - az);
    const rot = Math.atan2(bx - ax, bz - az);
    add('box', 'plaster', (ax + bx) / 2, 0, (az + bz) / 2, 2, 4.5, len + 0.2, '#e8dcc4', rot);
    for (let d = 0.6; d < len; d += 1.6) add('box', 'plaster', ax + ((bx - ax) * d) / len, 4.5, az + ((bz - az) * d) / len, 2, 1, 0.8, '#f4ecdc', rot);
    if (k % 6 === 3) {
      add('cyl', 'plaster', ax, 0, az, 6, 11, 6, '#e8dcc4');
      add('cyl', 'stone', ax, 11, az, 7, 0.8, 7, '#d8ccb4');
      for (let q = 0; q < 10; q++) add('box', 'plaster', ax + Math.cos(q * 0.628) * 3.2, 11.8, az + Math.sin(q * 0.628) * 3.2, 0.9, 1, 0.9, '#f4ecdc');
      add('hemi', 'gold', ax, 11.8, az, 4.2, 3.6, 4.2, '#d8b25a');
      add('sphere', 'glow', ax, 9, az, 0.8, 0.8, 0.8, '#ffd890');
    }
  }
  for (let th = -c.th + 0.08; th <= c.th - 0.08; th += 0.035) {
    if (Math.abs(th) < 0.36) continue;
    const [x, z] = at(th, c.r - c.w / 2 + 1.5);
    const k = Math.round(th * 997);
    if (Math.round(th / 0.035) % 2 === 0) {
      add('cyl', 'metal', x, 0, z, 0.08, 2.4, 0.08, '#d8d8d8');
      add('cone', 'cloth', x, 2.2, z, 3, 0.6, 3, ['#f4f2ea', '#0a7aa8', '#e8c040'][Math.abs(k) % 3]);
    } else lounger(add, x, z, -th);
    if (Math.round(th / 0.035) % 4 === 1) {
      const [tx, tz] = at(th, c.r + 6);
      tree(tx, tz, 1200 + k, 7);
    }
  }
  // boats in the lagoon: a loop just inside the crescent, round from one end to the other
  const arc: P2[] = [];
  for (let k = 0; k <= 24; k++) arc.push(at(-c.th + 0.25 + ((2 * c.th - 0.5) * k) / 24, c.r - c.w / 2 - 14));
  const loop = loopRoute(arc, 5);
  for (let k = 0; k < 4; k++) {
    const local: DistrictData = { pieces: [], lights: [] };
    const f = frame(local, 0, 0, 0, [0, 1]);
    const L = 10 + k * 3;
    f.add('box', 'plaster', 0, 0.05, 0, 3.2, 1.3, L, '#f4f6f8');
    f.add('cone', 'plaster', 0, 0.05, L / 2 + 1.1, 3.2, 1.3, 2.4, '#f4f6f8', 0, Math.PI / 2);
    f.add('box', 'glass', 0, 1.35, -0.8, 2.6, 0.8, L * 0.45, '#2a3a4a');
    f.add('box', 'dark', 0, 0.05, 0, 3.25, 0.3, L, k % 2 ? '#1e2a3a' : '#0a5a7a');
    out.movers?.push({ pieces: local.pieces, pose: cruise(loop, 4 + k * 0.6, k / 4, 0, 0.08) });
  }
}

/**
 * The sea pavilion at the crescent's apex: an octagonal arcaded hall under a great golden dome,
 * four slim towers, and jetties out into the lagoon with the royal yachts.
 */
function seaPavilion(add: Add, p: PalmPlan) {
  const { x, z } = p.hotel;
  add('oct', 'marble', x, 0, z, 34, 1.5, 34, '#ece6da');
  add('oct', 'plaster', x, 1.5, z, 26, 13, 26, '#f4ecdc');
  for (let q = 0; q < 8; q++) {
    const a = (q / 8) * Math.PI * 2 + Math.PI / 8;
    const wx = x + Math.sin(a) * 12.5;
    const wz = z + Math.cos(a) * 12.5;
    add('box', 'glass', wx, 2, wz, 4.5, 6, 0.15, '#3f5a70', a);
    add('halfTorus', 'gold', wx + Math.sin(a) * 0.15, 6, wz + Math.cos(a) * 0.15, 5 / 0.9, 2.4 / 0.45, 0.6, '#d8b25a', a);
    add('box', 'glass', wx, 9, wz, 3, 3, 0.15, '#3f5a70', a);
    if (q % 2 === 0) {
      const tx = x + Math.sin(a + Math.PI / 8) * 17;
      const tz = z + Math.cos(a + Math.PI / 8) * 17;
      add('cyl', 'plaster', tx, 1.5, tz, 3, 26, 3, '#f4ecdc');
      add('cyl', 'gold', tx, 18, tz, 3.4, 0.4, 3.4, '#d8b25a');
      add('hemi', 'gold', tx, 27.5, tz, 3, 3, 3, '#d8b25a');
    }
  }
  add('oct', 'gold', x, 14.5, z, 26.4, 0.5, 26.4, '#d8b25a');
  add('cyl', 'plaster', x, 15, z, 18, 4, 18, '#f4ecdc');
  add('hemi', 'gold', x, 19, z, 18, 14, 18, '#d8b25a');
  add('cyl', 'gold', x, 33, z, 1.6, 2, 1.6, '#d8b25a');
  add('cone', 'gold', x, 35, z, 0.7, 5, 0.7, '#d8b25a');
  add('beamCone', 'nightBeam', x, 33, z + 22, 22, 33, 10, '#ffe8c0', 0, Math.PI);
  for (const sd of [-1, 1]) {
    add('box', 'wood', x + sd * 22, 0.2, z + 30, 3, 0.25, 26, '#8a6440');
    add('box', 'plaster', x + sd * 27, -0.4, z + 34, 4.2, 1.8, 22, '#f4f6f8');
    add('box', 'plaster', x + sd * 27, 1.4, z + 33, 3.4, 2, 11, '#f4f6f8');
    add('box', 'glass', x + sd * 27, 1.9, z + 33, 3.5, 0.9, 10, '#2a3a4a');
    add('box', 'dark', x + sd * 27, -0.4, z + 34, 4.25, 0.4, 22, '#0a3a5a');
  }
}
