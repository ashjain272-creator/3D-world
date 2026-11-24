import type { PalmPlan } from './layout';
import { type Add, type DistrictData, frame, lounger, palm } from './districts';
import { type P2, cruise, loopRoute, shuttle } from './movers';

/**
 * The palm island: sand and planting on the trunk, fronds and crescent; beach clubs at the frond
 * tips and loungers along the private beaches; the causeway; the monorail on its guideway with
 * stations and a train; the crescent's rock breakwater and resort beaches; the grand arched hotel
 * at the apex; and boats in the lagoon.
 */
export function palmIsland(out: DistrictData, add: Add, p: PalmPlan, r: (k: number) => number, warm: boolean) {
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
  // the trunk: a planted median under the monorail, palms, lawns behind the apartment slabs
  const { xp, zBase, zTip } = p;
  add('box', 'lawn', xp - 18.5, 0.02, (zBase + zTip) / 2, 6, 0.08, zBase - zTip - 20, '#5e9a48');
  add('box', 'lawn', xp + 18.5, 0.02, (zBase + zTip) / 2, 6, 0.08, zBase - zTip - 20, '#5e9a48');
  for (let z = zBase - 8; z > zTip + 10; z -= 12) {
    for (const sd of [-1, 1]) tree(xp + sd * 21.5, z, 900 + z + sd, 6);
  }
  add('cyl', 'stone', xp, -0.1, zTip, p.trunkW * 1.4, 0.2, p.trunkW * 1.4, sand);
  add('cyl', 'lawn', xp, 0.02, zTip + 2, 18, 0.1, 18, '#5e9a48');
  add('cyl', 'marble', xp, 0.12, zTip + 2, 7, 0.6, 7, '#ece6da');
  add('cyl', 'water', xp, 0.6, zTip + 2, 6.4, 0.12, 6.4, '#4ab8d8');
  // fronds: loungers and umbrellas on the private beaches, a beach club at each tip
  for (const [i, f] of p.fronds.entries()) {
    const dx = f.bx - f.ax;
    const dz = f.bz - f.az;
    const len = Math.hypot(dx, dz);
    const ux = dx / len;
    const uz = dz / len;
    const t = Math.atan2(dx, dz);
    for (const sd of [1, -1]) {
      const nx = -uz * sd;
      const nz = ux * sd;
      for (let d = 30; d < len - 16; d += 13.5) {
        const bx = f.ax + ux * d + nx * (f.w / 2 - 0.9);
        const bz = f.az + uz * d + nz * (f.w / 2 - 0.9);
        if (Math.floor(d / 13.5) % 2 === 0) {
          add('cyl', 'metal', bx, 0, bz, 0.08, 2.4, 0.08, '#d8d8d8');
          add('cone', 'cloth', bx, 2.2, bz, 2.8, 0.6, 2.8, ['#f4f2ea', '#2e6a8a', '#c8502e'][(i + Math.floor(d)) % 3]);
        } else lounger(add, bx, bz, t + Math.PI / 2);
      }
    }
    // the tip: a turning circle ringed with palms and a thatched beach club with its jetty
    const tx = f.bx - ux * 4;
    const tz = f.bz - uz * 4;
    add('cyl', 'dark', f.bx - ux * 10, 0.03, f.bz - uz * 10, 14, 0.06, 14, '#454b54');
    for (let q = 0; q < 6; q++) tree(f.bx - ux * 10 + Math.cos(q * 1.05) * 9, f.bz - uz * 10 + Math.sin(q * 1.05) * 9, 950 + i * 7 + q, 7);
    add('cyl', 'wood', tx, 0, tz, 9, 0.5, 9, '#a07a52');
    add('cone', 'roof', tx, 3.2, tz, 11, 3, 11, '#c8a46a');
    for (let q = 0; q < 6; q++) add('cyl', 'wood', tx + Math.cos(q * 1.05) * 4, 0.5, tz + Math.sin(q * 1.05) * 4, 0.25, 2.8, 0.25, '#6a4a30');
    add('box', 'wood', f.bx + ux * 10, 0.2, f.bz + uz * 10, 2.4, 0.2, 18, '#8a6440', t);
  }
  // the causeway: railings, lamps and palms out across the water to the trunk
  const { z0, z1 } = p.causeway;
  for (const sd of [-1, 1]) {
    add('box', 'metal', xp + sd * 7.5, 0.1, (z0 + z1) / 2, 0.15, 1, z0 - z1, '#e8ebef');
    for (let z = z1 + 4; z < z0; z += 14) {
      add('cyl', 'metal', xp + sd * 7.8, 0, z, 0.15, 6, 0.15, '#2a2e34');
      add('sphere', 'glow', xp + sd * 7.8, 6.1, z, 0.4, 0.4, 0.4, '#ffe2b0');
    }
  }
  monorail(out, add, p);
  crescent(out, add, p, r, tree);
  grandHotel(add, p);
}

function monorail(out: DistrictData, add: Add, p: PalmPlan) {
  const y = 9;
  const pts = p.monorail.pts;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const t = Math.atan2(bx - ax, bz - az);
    add('box', 'plaster', (ax + bx) / 2, y - 1.4, (az + bz) / 2, 1.2, 1.4, len, '#eef0f2', t);
    add('box', 'glow', (ax + bx) / 2, y - 1.5, (az + bz) / 2, 1.25, 0.08, len, '#bfe0ff', t);
    for (let d = 10; d < len - 4; d += 26) {
      const x = ax + ((bx - ax) * d) / len;
      const z = az + ((bz - az) * d) / len;
      add('box', 'plaster', x, -2, z, 1.4, y + 0.6 - 1.4, 1.4, '#e2e6ea');
      add('box', 'plaster', x, y - 2, z, 2.6, 0.6, 2.6, '#e2e6ea', t);
    }
  }
  // stations: platforms each side of the beam under curved glass canopies
  const dist = [0];
  for (let i = 1; i < pts.length; i++) dist.push(dist[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  for (const s of p.monorail.stops) {
    let i = 1;
    while (i < pts.length - 1 && dist[i] < s) i++;
    const u = (s - dist[i - 1]) / (dist[i] - dist[i - 1] || 1);
    const x = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u;
    const z = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u;
    const t = Math.atan2(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    add('box', 'stone', x, y - 1.6, z, 10, 0.4, 26, '#e8ebef', t);
    add('box', 'atrium', x, y + 3.6, z, 11, 0.3, 27, '#bfe2f0', t);
    for (const sd of [-1, 1]) for (const e of [-12, 0, 12]) add('cyl', 'metal', x + Math.cos(t) * sd * 4.8 + Math.sin(t) * e, y - 1.2, z - Math.sin(t) * sd * 4.8 + Math.cos(t) * e, 0.25, 4.8, 0.25, '#e8ebef');
    add('box', 'plaster', x + Math.cos(t) * 7, 0, z - Math.sin(t) * 7, 4, y - 1.2, 5, '#e2e6ea', t);
  }
  // the train: three rounded cars straddling the beam
  const local: DistrictData = { pieces: [], lights: [] };
  const f = frame(local, 0, 0, 0, [0, 1]);
  for (let c = 0; c < 3; c++) {
    const z = -c * 10.5;
    f.add('box', 'plaster', 0, 0, z, 3, 2.8, 10, '#f4f6f8');
    f.add('box', 'glass', 0, 1.1, z, 3.05, 1, 9.4, '#2a3a4a');
    f.add('box', 'plaster', 0, -0.8, z, 3.05, 0.4, 10, '#0a7aa8');
  }
  f.add('sphere', 'plaster', 0, 1.4, 5, 3, 2.8, 3, '#f4f6f8');
  f.add('sphere', 'plaster', 0, 1.4, -26, 3, 2.8, 3, '#f4f6f8');
  out.movers?.push({ pieces: local.pieces, pose: shuttle(pts as P2[], p.monorail.stops, 13, 10, 0.2, y - 1.2) });
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
 * The grand hotel at the crescent's apex: two towers joined high up by a bridge, with a great
 * arch between them framed in gold, stepped wings along the crescent, and a pool deck on the lagoon.
 */
function grandHotel(add: Add, p: PalmPlan) {
  const { x, z } = p.hotel;
  const H = 92;
  const cream = '#f2e8d4';
  const coral = '#e8b8a0';
  for (const sd of [-1, 1]) {
    const tx = x + sd * 26;
    add('box', 'plaster', tx, 0, z, 22, H, 26, cream);
    for (let y = 6; y < H - 4; y += 3.4) {
      add('box', 'glass', tx, y, z + 13.05, 19, 1.8, 0.1, '#5a7a94');
      add('box', 'glass', tx, y, z - 13.05, 19, 1.8, 0.1, '#5a7a94');
    }
    for (let k = -2; k <= 2; k++) add('box', 'plaster', tx + k * 4.4, 0, z + 13.3, 0.6, H, 0.8, coral);
    add('box', 'plaster', tx, H, z, 24, 2.2, 28, coral);
    add('box', 'plaster', tx, H + 2.2, z, 14, 6, 16, cream);
    add('hemi', 'gold', tx, H + 8.2, z, 12, 9, 12, '#d8b25a');
    add('cone', 'gold', tx, H + 16, z, 1.2, 9, 1.2, '#d8b25a');
    // wings stepping down along the crescent
    for (let k = 0; k < 4; k++) {
      const wx = x + sd * (40 + k * 16);
      const wh = 48 - k * 10;
      add('box', 'plaster', wx, 0, z + k * 2.5, 16, wh, 24, cream);
      add('box', 'plaster', wx, wh, z + k * 2.5, 17, 1.2, 25, coral);
      for (let y = 5; y < wh - 3; y += 3.4) add('box', 'glass', wx, y, z + k * 2.5 + 12.05, 14, 1.8, 0.1, '#5a7a94');
    }
  }
  // the bridge between the towers and the great arch beneath it
  add('box', 'plaster', x, H - 22, z, 30, 22, 22, cream);
  for (let y = H - 20; y < H - 2; y += 3.4) add('box', 'glass', x, y, z + 11.05, 28, 1.8, 0.1, '#5a7a94');
  add('halfTorus', 'gold', x, 0, z + 11.5, 30 / 0.9, (H - 22) / 0.45, 3, '#d8b25a');
  add('arch', 'atrium', x, 0, z + 2, 30, H - 22, 0.3, '#bfe2f0');
  add('box', 'glow', x, H - 23, z + 11.2, 26, 0.3, 0.1, '#ffd890');
  // the pool deck and beach on the lagoon side
  add('box', 'marble', x, 0, z + 21, 120, 0.3, 12, '#ece6da');
  for (const sd of [-1, 0, 1]) {
    add('box', 'water', x + sd * 34, 0.3, z + 21, 24, 0.12, 7, '#3ab8d8');
    add('box', 'glow', x + sd * 34, 0.25, z + 24.55, 24, 0.12, 0.05, '#7ae0ff');
  }
  for (let k = -5; k <= 5; k++) lounger(add, x + k * 10, z + 26, Math.PI);
}
