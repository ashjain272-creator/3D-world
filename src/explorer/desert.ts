import type { Layout } from './layout';
import type { TerrainData } from './terrain';
import { inFlat } from './terrain';
import { type DistrictData, frame, hashRand, palm } from './districts';
import { type Pose, type P2, cruise } from './movers';

/**
 * The desert beyond a futuristic city on a dry world: a safari camp round an oasis, a camel
 * racing track with camels running laps and a grandstand, and a dune-buggy course where buggies
 * race over the dunes. Everything sits on the terrain as it is (heights are sampled), on sites
 * chosen outside the city, the airport and the sea.
 */
export function desertEdge(out: DistrictData, layout: Layout, t: TerrainData, y0: number) {
  const r = hashRand(layout.radius * 5.1 + 3);
  const f = layout.features!;
  const R = layout.radius;
  const lim = t.size * 0.47 - 40;
  const free = (x: number, z: number, rad: number) =>
    Math.hypot(x, z) > R + 40 + rad &&
    Math.abs(x) < lim - rad &&
    Math.abs(z) < lim - rad &&
    z > f.shoreZ + 60 + rad &&
    !inFlat(t, x, z, rad + 20) &&
    (t.waterLevel === null || t.height(x, z) > t.waterLevel + 1.5);
  // pick sites round the city, apart from one another, preferring gentle ground
  const sites: { x: number; z: number; rad: number }[] = [];
  const pick = (rad: number) => {
    let best: { x: number; z: number; s: number } | null = null;
    for (let k = 0; k < 140; k++) {
      const a = r(k * 3 + rad) * Math.PI * 2;
      const d = R + 60 + rad + r(k * 3 + rad + 1) * 320;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      if (!free(x, z, rad) || sites.some((s) => Math.hypot(s.x - x, s.z - z) < s.rad + rad + 30)) continue;
      let lo = Infinity;
      let hi = -Infinity;
      for (let q = 0; q < 8; q++) {
        const h = t.height(x + Math.cos(q * 0.785) * rad, z + Math.sin(q * 0.785) * rad);
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
      }
      const s = -(hi - lo) - d * 0.004;
      if (!best || s > best.s) best = { x, z, s };
    }
    if (best) sites.push({ x: best.x, z: best.z, rad });
    return best;
  };
  // the camp and the track stand on graded ground the terrain levels for them (desertFlats)
  const camp = { x: f.desertSites.camp[0], z: f.desertSites.camp[1] };
  const track = { x: f.desertSites.track[0], z: f.desertSites.track[1] };
  sites.push({ ...camp, rad: 36 }, { ...track, rad: 62 });
  const dunes = pick(60);
  const gy = (x: number, z: number) => t.height(x, z) - y0;
  safariCamp(out, camp.x, camp.z, gy, y0, r);
  camelTrack(out, track.x, track.z, gy, y0, r);
  if (dunes) buggies(out, dunes.x, dunes.z, gy, y0, r);
  out.desert = { camp: [camp.x, camp.z], track: [track.x, track.z], dunes: dunes ? [dunes.x, dunes.z] : null };
}

function safariCamp(out: DistrictData, cx: number, cz: number, gy: (x: number, z: number) => number, y0: number, r: (k: number) => number) {
  const { add } = frame(out, 0, 0, y0, [0, 1]);
  const at = (a: number, d: number): [number, number] => [cx + Math.cos(a) * d, cz + Math.sin(a) * d];
  // a low mud-brick wall round the camp with a gate, lanterns on its posts
  for (let k = 0; k < 36; k++) {
    if (k === 9) continue;
    const a0 = (k / 36) * Math.PI * 2;
    const a1 = ((k + 1) / 36) * Math.PI * 2;
    const [x0, z0] = at(a0, 28);
    const [x1, z1] = at(a1, 28);
    add('box', 'plaster', (x0 + x1) / 2, gy((x0 + x1) / 2, (z0 + z1) / 2) - 0.3, (z0 + z1) / 2, 0.8, 1.9, Math.hypot(x1 - x0, z1 - z0) + 0.2, '#c8a070', Math.atan2(x1 - x0, z1 - z0));
    if (k % 4 === 0) add('sphere', 'glow', x0, gy(x0, z0) + 1.9, z0, 0.35, 0.45, 0.35, '#ffb050');
  }
  // the oasis: a pond under date palms
  const [ox, oz] = at(0.6, 12);
  add('cyl', 'stone', ox, gy(ox, oz) - 0.2, oz, 13, 0.5, 11, '#b89a6a');
  add('cyl', 'water', ox, gy(ox, oz) + 0.1, oz, 11.5, 0.12, 9.5, '#2a8aa8');
  for (let k = 0; k < 7; k++) {
    const [px, pz] = [ox + Math.cos(k * 0.9) * 8, oz + Math.sin(k * 0.9) * 7];
    palm(add, px, pz, 7 + r(k) * 3, r, 50 + k, gy(px, pz));
  }
  // Bedouin tents round the majlis: dark goat-hair roofs on poles, rugs and cushions under them
  for (let k = 0; k < 7; k++) {
    const a = 2.2 + (k / 7) * Math.PI * 1.5;
    const [tx, tz] = at(a, 19);
    const y = gy(tx, tz);
    const rot = -a + Math.PI / 2;
    add('box', 'cloth', tx, y, tz, 7, 0.05, 5, ['#8a2a2a', '#2a3a6a', '#7a5a2a'][k % 3], rot);
    add('gable', 'cloth', tx, y + 2.2, tz, 7.4, 1.2, 5.4, '#3a2e26', rot);
    for (const [dx, dz] of [[-3.3, -2.3], [3.3, -2.3], [-3.3, 2.3], [3.3, 2.3]] as const) add('cyl', 'wood', tx + dx * Math.cos(rot) + dz * Math.sin(rot), y, tz - dx * Math.sin(rot) + dz * Math.cos(rot), 0.15, 2.3, 0.15, '#5a4030');
    for (let q = 0; q < 3; q++) add('box', 'cloth', tx + (q - 1) * 2 * Math.cos(rot), y + 0.05, tz - (q - 1) * 2 * Math.sin(rot), 1.6, 0.4, 0.8, ['#c8402e', '#e8b040', '#2e6a8a'][q], rot);
  }
  // the majlis: a ring of carpets and low cushions round a fire pit
  const [mx, mz] = at(Math.PI + 0.4, 6);
  const my = gy(mx, mz);
  add('cyl', 'cloth', mx, my + 0.02, mz, 12, 0.05, 12, '#8a2a2a');
  add('cyl', 'stone', mx, my, mz, 2.4, 0.4, 2.4, '#6a6058');
  add('cone', 'glow', mx, my + 0.4, mz, 1.6, 1.4, 1.6, '#ff8a2a');
  for (let k = 0; k < 10; k++) add('box', 'cloth', mx + Math.cos(k * 0.63) * 4.6, my + 0.05, mz + Math.sin(k * 0.63) * 4.6, 1.8, 0.45, 0.8, ['#c8402e', '#e8b040'][k % 2], -k * 0.63 + Math.PI / 2);
  // camels couched by the gate, and the safari 4x4s parked outside it
  const [gx, gz] = at((9.5 / 36) * Math.PI * 2, 34);
  for (let k = 0; k < 4; k++) camel(add, gx + k * 3 - 4.5, gz + 4, gy(gx + k * 3, gz + 4), k * 0.7, true);
  for (let k = 0; k < 4; k++) {
    const vx = gx + k * 4.5 - 7;
    const vz = gz - 6;
    const vy = gy(vx, vz);
    add('box', 'metal', vx, vy + 0.6, vz, 2.1, 1.3, 4.8, ['#f4f4f2', '#c8a070', '#3a3e44', '#f4f4f2'][k]);
    add('box', 'glass', vx, vy + 1.9, vz - 0.3, 1.9, 0.8, 2.6, '#2a3440');
    for (const [dx, dz] of [[-1, -1.6], [1, -1.6], [-1, 1.6], [1, 1.6]] as const) add('cyl', 'dark', vx + dx, vy + 0.4, vz + dz, 0.9, 0.35, 0.9, '#1a1a1c', 0, 0, Math.PI / 2);
    add('box', 'metal', vx, vy + 2.4, vz, 1.8, 0.15, 3, '#5a5e64');
  }
}

/** A camel standing (or couched) with its head forward along local +z after a turn. */
function camel(add: ReturnType<typeof frame>['add'], x: number, z: number, y: number, rot: number, couched = false) {
  const col = '#c8a070';
  const legs = couched ? 0.4 : 1.4;
  const s = Math.sin(rot);
  const c = Math.cos(rot);
  const P = (lx: number, lz: number): [number, number] => [x + lx * c + lz * s, z - lx * s + lz * c];
  if (!couched) for (const [lx, lz] of [[-0.35, 0.7], [0.35, 0.7], [-0.35, -0.7], [0.35, -0.7]] as const) add('box', 'plaster', ...spread(P(lx, lz), y, legs), col, rot);
  const [bx, bz] = P(0, 0);
  add('sphere', 'plaster', bx, y + legs + 0.35, bz, 1, 0.9, 2, col, rot);
  const [hx, hz] = P(0, -0.1);
  add('sphere', 'plaster', hx, y + legs + 0.85, hz, 0.7, 0.7, 0.8, '#b8905a', rot);
  const [nx, nz] = P(0, 1.1);
  add('box', 'plaster', nx, y + legs + 0.4, nz, 0.3, 1.1, 0.3, col, rot, 0.5);
  const [qx, qz] = P(0, 1.55);
  add('box', 'plaster', qx, y + legs + 1.25, qz, 0.32, 0.32, 0.65, col, rot);
}

function spread([x, z]: [number, number], y: number, h: number): [number, number, number, number, number, number] {
  return [x, y, z, 0.18, h, 0.18];
}

function camelTrack(out: DistrictData, cx: number, cz: number, gy: (x: number, z: number) => number, y0: number, r: (k: number) => number) {
  const { add } = frame(out, 0, 0, y0, [0, 1]);
  const a = 48;
  const b = 26;
  const N = 48;
  const ring = (rr: number): P2[] => {
    const pts: P2[] = [];
    for (let k = 0; k <= N; k++) {
      const th = (k / N) * Math.PI * 2;
      pts.push([cx + Math.cos(th) * (a + rr), cz + Math.sin(th) * (b + rr)]);
    }
    return pts;
  };
  // the sand track between white rails
  for (let k = 0; k < N; k++) {
    const th0 = (k / N) * Math.PI * 2;
    const th1 = ((k + 1) / N) * Math.PI * 2;
    const x0 = cx + Math.cos(th0) * a;
    const z0 = cz + Math.sin(th0) * b;
    const x1 = cx + Math.cos(th1) * a;
    const z1 = cz + Math.sin(th1) * b;
    const t = Math.atan2(x1 - x0, z1 - z0);
    const len = Math.hypot(x1 - x0, z1 - z0) + 0.3;
    const mx = (x0 + x1) / 2;
    const mz = (z0 + z1) / 2;
    add('box', 'stone', mx, gy(mx, mz) - 0.15, mz, 9, 0.3, len, '#e0c08a', t);
    for (const rr of [-4.6, 4.6]) {
      const px = mx + Math.cos(t) * rr;
      const pz = mz - Math.sin(t) * rr;
      add('box', 'plaster', px, gy(px, pz) + 0.9, pz, 0.12, 0.12, len, '#f4f4f0', t);
      add('cyl', 'plaster', px, gy(px, pz), pz, 0.12, 1, 0.12, '#f4f4f0');
    }
  }
  // the grandstand on the home straight, with a shaded royal box
  const sx = cx;
  const sz = cz + b + 12;
  const sy = gy(sx, sz);
  for (let row = 0; row < 6; row++) add('box', 'stone', sx, sy + row * 0.6, sz + row * 0.9, 40, 0.6, 1, '#e8e0d0');
  add('box', 'cloth', sx, sy + 6, sz + 2.5, 42, 0.2, 7, '#f4f2ea', 0, -0.12);
  add('box', 'gold', sx, sy + 4, sz + 1, 8, 2.5, 3, '#d8b25a');
  for (const e of [-20, 20]) add('cyl', 'metal', sx + e, sy, sz + 5, 0.3, 6, 0.3, '#e8e8e8');
  // the camels, each running laps on its own line, with jockey robots on their humps
  const ridden = [0, 1, 2, 3, 4, 5];
  for (const k of ridden) {
    const local: DistrictData = { pieces: [], lights: [] };
    const g = frame(local, 0, 0, 0, [0, 1]);
    camel(g.add, 0, 0, 0, 0);
    g.add('box', 'metal', 0, 2.75, -0.1, 0.25, 0.5, 0.25, ['#e8402e', '#2e8ad8', '#f4c84a', '#3ac85a', '#ff8ad8', '#f4f4f0'][k]);
    const lane = ring(-3 + k * 1.2);
    const ride = cruise(lane, 9 + r(k) * 2, k * 0.03, 0);
    out.movers?.push({
      pieces: local.pieces,
      pose: (tt): Pose => {
        const p = ride(tt);
        return { ...p, y: gy(p.x, p.z) + Math.abs(Math.sin(tt * 6 + k)) * 0.15 };
      },
    });
  }
}

function buggies(out: DistrictData, cx: number, cz: number, gy: (x: number, z: number) => number, y0: number, r: (k: number) => number) {
  const { add } = frame(out, 0, 0, y0, [0, 1]);
  // a course of flags over the dunes and a starting hut
  const course: P2[] = [];
  for (let k = 0; k <= 40; k++) {
    const th = (k / 40) * Math.PI * 2;
    const rr = 50 + Math.sin(th * 3) * 10;
    course.push([cx + Math.cos(th) * rr, cz + Math.sin(th) * rr * 0.75]);
  }
  for (let k = 0; k < course.length - 1; k += 2) {
    const [x, z] = course[k];
    add('cyl', 'metal', x, gy(x, z), z, 0.08, 2.4, 0.08, '#e8e8e8');
    add('box', 'cloth', x + 0.5, gy(x, z) + 1.9, z, 1, 0.6, 0.04, k % 4 ? '#f26a1a' : '#f4f4f0');
  }
  const [hx, hz] = course[0];
  add('box', 'wood', hx + 12, gy(hx + 12, hz), hz, 6, 3, 4, '#a07a52');
  add('box', 'cloth', hx + 12, gy(hx + 12, hz) + 3, hz, 7, 0.2, 5, '#f26a1a');
  // the buggies: open frames on fat wheels, bouncing along the course over the ground
  for (let k = 0; k < 5; k++) {
    const local: DistrictData = { pieces: [], lights: [] };
    const g = frame(local, 0, 0, 0, [0, 1]);
    const col = ['#f26a1a', '#f4c84a', '#2e8ad8', '#e8402e', '#3ac85a'][k];
    g.add('box', 'metal', 0, 0.5, 0, 1.6, 0.3, 2.8, col);
    for (const sx of [-0.7, 0.7]) {
      g.add('box', 'metal', sx, 0.8, -0.2, 0.1, 1.2, 0.1, '#2a2e34', 0, 0.3);
      for (const sz of [-1, 1]) g.add('cyl', 'dark', sx * 1.1, 0.45, sz, 0.9, 0.4, 0.9, '#1a1a1c', 0, 0, Math.PI / 2);
    }
    g.add('box', 'metal', 0, 1.9, -0.4, 1.5, 0.1, 1.4, '#2a2e34');
    g.add('sphere', 'plaster', 0, 1.25, -0.2, 0.45, 0.5, 0.45, '#f4f4f0');
    const ride = cruise(course, 11 + r(k + 10) * 3, k / 5, 0);
    out.movers?.push({
      pieces: local.pieces,
      pose: (tt): Pose => {
        const p = ride(tt);
        // pitch with the slope of the dune under the buggy
        const ahead = gy(p.x + Math.sin(p.yaw) * 1.5, p.z + Math.cos(p.yaw) * 1.5);
        const behind = gy(p.x - Math.sin(p.yaw) * 1.5, p.z - Math.cos(p.yaw) * 1.5);
        return { ...p, y: gy(p.x, p.z) + Math.abs(Math.sin(tt * 9 + k)) * 0.12, pitch: Math.atan2(ahead - behind, 3) };
      },
    });
  }
}
