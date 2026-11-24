import { type Building, themeParkFrame } from './layout';
import { type Add, type DistrictData, frame, hashRand, lounger, palm } from './districts';
import { type Pose, type TrackPoint, coaster, cruise } from './movers';


/**
 * A theme park and water park on one site. The theme-park half has a looping roller coaster with
 * cars that ride it, an observation wheel that turns, a drop tower, a carousel, food stalls and
 * gardens. The water-park half has a wave pool with a beach, a lazy river with rings drifting
 * round it, a slide tower with spiral flumes into a splash pool, and a splash pad. A wall with a
 * themed gate surrounds it all.
 */
export function themePark(out: DistrictData, b: Building, y0: number, warm: boolean) {
  const r = hashRand(b.tone * 1000 + 11);
  const f = frame(out, b.x, b.z, y0, b.door);
  const { add } = f;
  const { W, D } = themeParkFrame(b);
  const hw = W / 2;
  const hd = D / 2;
  const tree = (x: number, z: number, k: number, h = 7) => {
    if (warm) palm(add, x, z, h + r(k) * 2.5, r, k);
    else {
      add('cyl', 'bark', x, 0, z, 0.35, 1.2, 0.35, '#5a4232');
      for (const [q, w] of [[0.15, 0.62], [0.42, 0.48], [0.66, 0.32]] as const) add('cone', 'leaf', x, h * q, z, h * w, h * 0.42, h * w, '#2f5e3a');
    }
  };
  const toWorld = (lx: number, ly: number, lz: number, yaw: number, pitch: number): TrackPoint => ({ x: f.wx(lx, lz), y: ly, z: f.wz(lx, lz), yaw: yaw + f.ry, pitch });
  // ground: lawns, coloured paving paths, the wall and the gate
  add('box', 'lawn', 0, 0, 0, W, 0.06, D, '#5e9a48');
  add('box', 'stone', 0, 0.02, hd - 9, W - 4, 0.08, 6, '#e8c8a0');
  add('box', 'stone', 0, 0.02, 0, 6, 0.08, D - 6, '#e8c8a0');
  add('box', 'stone', 0, 0.02, -hd * 0.25, W - 8, 0.08, 5, '#e0b890');
  for (const [x0, z0, x1, z1] of [[-hw, -hd, hw, -hd], [-hw, -hd, -hw, hd], [hw, -hd, hw, hd], [-hw, hd, -8, hd], [8, hd, hw, hd]] as const) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const t = Math.atan2(x1 - x0, z1 - z0);
    add('box', 'plaster', (x0 + x1) / 2, 0, (z0 + z1) / 2, 0.6, 2.6, len, '#f2e2c8', t);
    add('box', 'plaster', (x0 + x1) / 2, 2.6, (z0 + z1) / 2, 0.9, 0.3, len, '#d86a3a', t);
  }
  // the gate: twin towers in candy colours with onion tops, an arch with the park's lit name
  for (const sd of [-1, 1]) {
    add('cyl', 'plaster', sd * 9, 0, hd, 5, 13, 5, '#f4c84a');
    add('cyl', 'plaster', sd * 9, 13, hd, 5.6, 1, 5.6, '#d8402e');
    add('sphere', 'plaster', sd * 9, 15.5, hd, 5, 6, 5, '#2e8ad8');
    add('cone', 'gold', sd * 9, 18, hd, 1.2, 4, 1.2, '#e8c040');
    for (let k = 0; k < 3; k++) add('box', 'cloth', sd * 9 + sd * 2.6, 3 + k * 3, hd, 0.1, 1.6, 1.6, ['#e8402e', '#2e8ad8', '#3ac85a'][k]);
  }
  add('box', 'plaster', 0, 9, hd, 14, 2.6, 2, '#f4c84a');
  add('box', 'glow', 0, 9.4, hd + 1.05, 12, 1.8, 0.06, '#ff5aa0');
  add('halfTorus', 'gold', 0, 0, hd + 0.4, 16 / 0.9, 9 / 0.45, 2, '#e8c040');
  for (const sd of [-1, 1]) {
    add('box', 'plaster', sd * 17, 0, hd + 2, 4, 3, 3, '#f2e2c8');
    add('cone', 'roof', sd * 17, 3, hd + 2, 5, 2, 4, '#d8402e');
  }
  rollerCoaster(out, add, W, D, toWorld);
  wheel(out, add, f, -hw * 0.68, -hd * 0.62, y0);
  dropTower(out, add, f, -hw * 0.18, -hd * 0.72, y0);
  carousel(out, add, f, -hw * 0.25, hd * 0.3, y0, r);
  waterPark(out, add, f, W, D, r, y0);
  // food stalls along the main walk, benches and trees
  for (let k = 0; k < 6; k++) {
    const x = -hw + 12 + k * 9;
    if (x > -4) break;
    add('box', 'wood', x, 0, hd - 14, 6, 2.6, 4, ['#f4c84a', '#ff8ad8', '#5ad1ff', '#8aff9a'][k % 4]);
    add('box', 'cloth', x, 2.6, hd - 12, 6.6, 0.2, 2.4, ['#d8402e', '#2e8ad8', '#e8c040', '#3ac85a'][k % 4], 0, -0.3);
    add('box', 'glow', x, 2.1, hd - 11.95, 4, 0.5, 0.05, '#fff2d6');
  }
  for (let k = 0; k < 10; k++) {
    const x = -hw + 6 + (k * (W - 12)) / 9;
    tree(x, hd - 4, 2000 + k, 6);
    add('box', 'wood', x + 2.5, 0, hd - 4, 2, 0.45, 0.6, '#8a6a4a');
    add('cyl', 'metal', x + 4.5, 0, hd - 6.5, 0.12, 4, 0.12, '#2a2e34');
    add('sphere', 'glow', x + 4.5, 4.1, hd - 6.5, 0.4, 0.4, 0.4, '#fff2d6');
  }
}

/** The coaster: a lift hill, a big drop, camelback hills, a vertical loop and a helix, on supports. */
function rollerCoaster(out: DistrictData, add: Add, W: number, D: number, toWorld: (x: number, y: number, z: number, yaw: number, pitch: number) => TrackPoint) {
  const cx = -W * 0.22;
  const cz = -D * 0.05;
  const a = W * 0.22;
  const bz = D * 0.2;
  const pts: TrackPoint[] = [];
  const height = (u: number) => {
    if (u < 0.18) return 1.5 + (u / 0.18) * 30;
    if (u < 0.3) return 31.5 - ((u - 0.18) / 0.12) * 29;
    if (u < 0.45) return 2.5 + Math.sin(((u - 0.3) / 0.15) * Math.PI) * 16;
    if (u < 0.58) return 2.5 + Math.sin(((u - 0.45) / 0.13) * Math.PI) * 9;
    if (u < 0.8) return 2.5 + Math.sin(((u - 0.58) / 0.22) * Math.PI) * 5;
    return 1.5 + Math.max(0, (0.86 - u) / 0.06) * 1;
  };
  const N = 160;
  const loopAt = 0.62;
  for (let k = 0; k <= N; k++) {
    const u = k / N;
    const th = u * Math.PI * 2;
    const x = cx + Math.cos(th) * a;
    const z = cz + Math.sin(th) * bz;
    const y = height(u);
    const dx = -Math.sin(th) * a;
    const dz = Math.cos(th) * bz;
    const yaw = Math.atan2(dx, dz);
    const dy = (height(Math.min(1, u + 1 / N)) - height(Math.max(0, u - 1 / N))) / 2;
    const pitch = Math.atan2(dy, (Math.hypot(dx, dz) * Math.PI * 2) / N);
    pts.push({ x, y, z, yaw, pitch, lift: u < 0.18 });
    if (Math.abs(u - loopAt) < 0.5 / N) {
      // a vertical loop: round in the vertical plane of travel, drifting a little sideways
      const rl = 8;
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      for (let q = 1; q < 24; q++) {
        const ph = (q / 24) * Math.PI * 2;
        const side = (q / 24) * 2.6;
        pts.push({ x: x + fx * Math.sin(ph) * rl + fz * side, y: y + rl * (1 - Math.cos(ph)), z: z + fz * Math.sin(ph) * rl - fx * side, yaw, pitch: ph });
      }
    }
  }
  // track: two rails and ties along every segment; supports where the track is above the ground
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i];
    const q = pts[i + 1];
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const dz = q.z - p.z;
    const L = Math.hypot(dx, dy, dz);
    if (L < 0.01) continue;
    const yaw = Math.atan2(dx, dz);
    const el = Math.acos(Math.max(-1, Math.min(1, dy / L)));
    const nx = Math.cos(yaw);
    const nz = -Math.sin(yaw);
    for (const sd of [-0.65, 0.65]) add('rod', 'metal', (p.x + q.x) / 2 + nx * sd, (p.y + q.y) / 2, (p.z + q.z) / 2 + nz * sd, 0.22, L + 0.05, 0.22, '#e8402e', yaw, el);
    add('rod', 'metal', (p.x + q.x) / 2, (p.y + q.y) / 2 - 0.35, (p.z + q.z) / 2, 0.3, L + 0.05, 0.3, '#f4c84a', yaw, el);
    if (i % 3 === 0) add('box', 'dark', p.x, p.y - 0.2, p.z, 1.6, 0.12, 0.3, '#3a3e44', yaw);
    if (i % 4 === 0 && p.y > 2.5 && p.pitch < 1.2 && p.pitch > -1.2) {
      add('cyl', 'metal', p.x, 0, p.z, 0.45, p.y - 0.4, 0.45, '#f4f4f0');
      if (p.y > 12) add('box', 'metal', p.x, p.y * 0.5, p.z, 3, 0.2, 0.2, '#f4f4f0', yaw + Math.PI / 2);
    }
  }
  // the station: a covered platform where the lift begins
  const st = pts[2];
  add('box', 'stone', st.x, 0, st.z, 7, 1.2, 14, '#e8e0d0', st.yaw);
  add('box', 'roof', st.x, 4.5, st.z, 9, 0.4, 16, '#2e8ad8', st.yaw);
  for (const e of [-6, 6]) for (const sd of [-3.5, 3.5]) add('cyl', 'metal', st.x + Math.cos(st.yaw) * sd + Math.sin(st.yaw) * e, 1.2, st.z - Math.sin(st.yaw) * sd + Math.cos(st.yaw) * e, 0.3, 3.3, 0.3, '#f4f4f0');
  // the train: four cars, each its own mover a car's length behind the one in front
  const world = pts.map((p) => toWorld(p.x, p.y + 0.5, p.z, p.yaw, p.pitch));
  for (let c = 0; c < 4; c++) {
    const local: DistrictData = { pieces: [], lights: [] };
    const g = frame(local, 0, 0, 0, [0, 1]);
    g.add('box', 'plaster', 0, 0, 0, 1.8, 0.9, 2.6, ['#2e8ad8', '#f4c84a', '#e8402e', '#3ac85a'][c]);
    g.add('box', 'dark', 0, 0.9, -0.3, 1.6, 0.5, 0.4, '#1a1c20');
    for (const sx of [-0.45, 0.45]) g.add('sphere', 'plaster', sx, 1.05, 0.4, 0.5, 0.6, 0.5, ['#f0c8a0', '#8a5a3a', '#3a2a1a'][(c + (sx > 0 ? 1 : 0)) % 3]);
    if (c === 0) g.add('cone', 'plaster', 0, 0.2, 1.6, 1.6, 1.2, 1.6, '#2e8ad8', 0, Math.PI / 2);
    const ride = coaster(world, 8, c * 2.9);
    out.movers?.push({ pieces: local.pieces, pose: (t: number): Pose => ride(t) });
  }
}

/** The observation wheel: two rims on spokes round a hub on A-frame legs, gondolas on the rim. */
function wheel(out: DistrictData, add: Add, f: ReturnType<typeof frame>, x: number, z: number, y0: number) {
  const R = 16;
  const hub = R + 3;
  for (const sd of [-1, 1]) {
    for (const lean of [-0.32, 0.32]) add('box', 'metal', x + Math.sin(lean) * hub, 0, z + sd * 2.2, 0.6, hub / Math.cos(lean), 0.6, '#f4f4f0', 0, 0, lean);
  }
  add('box', 'stone', x, 0, z + 5, 10, 1.2, 4, '#e8e0d0');
  const local: DistrictData = { pieces: [], lights: [] };
  const g = frame(local, 0, 0, 0, [0, 1]);
  g.add('cyl', 'metal', 0, 0, -2.4, 2, 4.8, 2, '#c8ccd0', 0, Math.PI / 2);
  // two rims of thin segments, lit along their edge
  for (const sd of [-1.4, 1.4])
    for (let k = 0; k < 40; k++) {
      const a0 = (k / 40) * Math.PI * 2;
      const a1 = ((k + 1) / 40) * Math.PI * 2;
      const mx = ((Math.cos(a0) + Math.cos(a1)) / 2) * R;
      const my = ((Math.sin(a0) + Math.sin(a1)) / 2) * R;
      const seg = 2 * R * Math.sin(Math.PI / 40) + 0.05;
      g.add('rod', 'metal', mx, my, sd, 0.3, seg, 0.3, '#f4f4f0', 0, 0, (a0 + a1) / 2);
      if (k % 2 === 0) g.add('sphere', 'glow', mx, my, sd + Math.sign(sd) * 0.2, 0.25, 0.25, 0.25, '#ff8ad8');
    }
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    g.add('rod', 'metal', Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5, 0, 0.15, R, 0.15, '#e0e4e8', 0, 0, a - Math.PI / 2);
    const gx = Math.cos(a) * R;
    const gy = Math.sin(a) * R;
    g.add('box', 'plaster', gx, gy - 1.6, 0, 2, 1.8, 2, ['#e8402e', '#f4c84a', '#2e8ad8', '#3ac85a'][k % 4]);
    g.add('box', 'glass', gx, gy - 1.2, 0, 2.05, 0.8, 2.05, '#9ec4d8');
    g.add('sphere', 'glow', gx, gy, 0, 0.5, 0.5, 0.5, '#ffd27a');
  }
  const wx = f.wx(x, z);
  const wz = f.wz(x, z);
  out.movers?.push({ pieces: local.pieces, pose: (t) => ({ x: wx, y: hub, z: wz, yaw: f.ry, roll: t * 0.06 }) });
  void y0;
}

/** The drop tower: a lattice mast with a ring of seats that climbs slowly and falls fast. */
function dropTower(out: DistrictData, add: Add, f: ReturnType<typeof frame>, x: number, z: number, y0: number) {
  const H = 48;
  add('cyl', 'metal', x, 0, z, 3, H, 3, '#d8402e');
  for (let y = 4; y < H; y += 4) add('cyl', 'glow', x, y, z, 3.1, 0.15, 3.1, '#ffd27a');
  add('cone', 'metal', x, H, z, 3.4, 4, 3.4, '#f4c84a');
  add('cyl', 'stone', x, 0, z, 9, 0.6, 9, '#e8e0d0');
  const local: DistrictData = { pieces: [], lights: [] };
  const g = frame(local, 0, 0, 0, [0, 1]);
  g.add('cyl', 'metal', 0, 0, 0, 6, 1, 6, '#2e8ad8');
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    g.add('box', 'plaster', Math.cos(a) * 3.4, -0.6, Math.sin(a) * 3.4, 0.9, 1.4, 0.7, '#f4c84a', -a);
    g.add('sphere', 'plaster', Math.cos(a) * 3.8, 0.4, Math.sin(a) * 3.8, 0.45, 0.55, 0.45, ['#f0c8a0', '#8a5a3a', '#3a2a1a'][k % 3]);
  }
  const wx = f.wx(x, z);
  const wz = f.wz(x, z);
  out.movers?.push({
    pieces: local.pieces,
    pose: (t) => {
      const u = ((t % 30) + 30) % 30;
      const y = u < 14 ? 2 + (u / 14) * (H - 8) : u < 17 ? H - 6 : u < 19 ? H - 6 - ((u - 17) / 2) ** 2 * (H - 8) : 2;
      return { x: wx, y, z: wz, yaw: f.ry + t * 0.1 };
    },
  });
  void y0;
}

/** The carousel: a striped canopy over a turning platform of horses. */
function carousel(out: DistrictData, add: Add, f: ReturnType<typeof frame>, x: number, z: number, y0: number, r: (k: number) => number) {
  add('cyl', 'stone', x, 0, z, 16, 0.5, 16, '#e8e0d0');
  const local: DistrictData = { pieces: [], lights: [] };
  const g = frame(local, 0, 0, 0, [0, 1]);
  g.add('cyl', 'wood', 0, 0.5, 0, 14, 0.4, 14, '#c8a050');
  g.add('cyl', 'gold', 0, 0.9, 0, 2, 5.6, 2, '#e8c040');
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const hx = Math.cos(a) * 5.4;
    const hz = Math.sin(a) * 5.4;
    g.add('cyl', 'gold', hx, 0.9, hz, 0.12, 5.6, 0.12, '#e8c040');
    g.add('box', 'plaster', hx, 1.8 + (k % 2) * 0.5, hz, 0.5, 0.9, 1.6, ['#f4f2ea', '#8a5a3a', '#2a2a2a', '#c8a050'][Math.floor(r(k) * 4)], -a);
    g.add('sphere', 'glow', Math.cos(a) * 7.6, 6.4, Math.sin(a) * 7.6, 0.35, 0.35, 0.35, '#ffd27a');
  }
  g.add('cone', 'cloth', 0, 6.5, 0, 16, 3.2, 16, '#e8402e');
  g.add('cyl', 'gold', 0, 6.2, 0, 16.2, 0.4, 16.2, '#e8c040');
  for (let k = 0; k < 12; k++) g.add('box', 'cloth', Math.cos((k / 12) * Math.PI * 2) * 4.2, 7.7, Math.sin((k / 12) * Math.PI * 2) * 4.2, 0.6, 0.06, 8.4, '#f4f2ea', -(k / 12) * Math.PI * 2 + Math.PI / 2, 0, 0);
  g.add('cone', 'gold', 0, 9.7, 0, 1, 2, 1, '#e8c040');
  const wx = f.wx(x, z);
  const wz = f.wz(x, z);
  out.movers?.push({ pieces: local.pieces, pose: (t) => ({ x: wx, y: 0, z: wz, yaw: t * 0.35 }) });
  void y0;
}

/** The water park: wave pool and beach, lazy river with drifting rings, slide tower, splash pad. */
function waterPark(out: DistrictData, add: Add, f: ReturnType<typeof frame>, W: number, D: number, r: (k: number) => number, y0: number) {
  const hw = W / 2;
  const hd = D / 2;
  // the wave pool: deep end against the wave-machine house, a sand beach shelving in
  const px = hw * 0.55;
  const pz = -hd * 0.42;
  add('box', 'marble', px, 0, pz, 44, 0.5, 34, '#ece6da');
  add('box', 'water', px, 0.42, pz - 2, 40, 0.12, 24, '#3ab8d8');
  for (let k = 0; k < 5; k++) add('box', 'water', px, 0.5, pz - 12 + k * 4, 40, 0.1, 0.5, '#e8f8ff');
  add('box', 'stone', px, 0.4, pz + 12, 40, 0.15, 8, '#ecdcb6');
  add('box', 'plaster', px, 0, pz - 16, 44, 7, 3, '#2e8ad8');
  add('box', 'glow', px, 5.5, pz - 14.45, 30, 1, 0.05, '#7ae0ff');
  for (let k = 0; k < 8; k++) lounger(add, px - 18 + k * 5, pz + 19, Math.PI);
  for (const sd of [-1, 1]) {
    add('cyl', 'metal', px + sd * 21, 0, pz + 6, 0.2, 3.2, 0.2, '#f4f4f0');
    add('box', 'plaster', px + sd * 21, 3.2, pz + 6, 1.2, 0.2, 1, '#e8402e');
  }
  // the lazy river: a ring channel round a planted island, rings drifting round it
  const lx = hw * 0.55;
  const lz = hd * 0.3;
  const lr = 15;
  const N = 28;
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2;
    const a2 = ((k + 1) / N) * Math.PI * 2;
    const x0 = lx + Math.cos(a) * lr;
    const z0 = lz + Math.sin(a) * lr;
    const x1 = lx + Math.cos(a2) * lr;
    const z1 = lz + Math.sin(a2) * lr;
    const t = Math.atan2(x1 - x0, z1 - z0);
    const len = Math.hypot(x1 - x0, z1 - z0) + 0.4;
    add('box', 'marble', (x0 + x1) / 2, 0, (z0 + z1) / 2, 7.4, 0.4, len, '#ece6da', t);
    add('box', 'water', (x0 + x1) / 2, 0.32, (z0 + z1) / 2, 5.6, 0.12, len, '#3ab8d8', t);
  }
  add('cyl', 'lawn', lx, 0.05, lz, (lr - 3.7) * 2, 0.3, (lr - 3.7) * 2, '#5e9a48');
  for (let k = 0; k < 5; k++) {
    const a = k * 1.25;
    add('sphere', 'leaf', lx + Math.cos(a) * 5, 1.6, lz + Math.sin(a) * 5, 3, 2.6, 3, '#4f8a3a');
  }
  const ring: [number, number][] = [];
  for (let k = 0; k <= 32; k++) {
    const a = (k / 32) * Math.PI * 2;
    ring.push([f.wx(lx + Math.cos(a) * lr, lz + Math.sin(a) * lr), f.wz(lx + Math.cos(a) * lr, lz + Math.sin(a) * lr)]);
  }
  for (let k = 0; k < 7; k++) {
    const local: DistrictData = { pieces: [], lights: [] };
    const g = frame(local, 0, 0, 0, [0, 1]);
    g.add('torus', 'plaster', 0, 0.35, 0, 2.2, 2.2, 2.2, ['#e8402e', '#f4c84a', '#2e8ad8', '#3ac85a', '#ff8ad8'][k % 5]);
    g.add('sphere', 'plaster', 0, 0.75, 0, 0.5, 0.6, 0.5, ['#f0c8a0', '#8a5a3a', '#3a2a1a'][k % 3]);
    out.movers?.push({ pieces: local.pieces, pose: cruise(ring, 0.9, k / 7, 0, 0.05) });
  }
  // the slide tower: stairs to a platform, three spiral flumes and a straight speed slide
  const sx = hw * 0.15;
  const sz = -hd * 0.2;
  const H = 18;
  add('box', 'metal', sx, 0, sz, 6, H, 6, '#2e8ad8');
  add('box', 'stone', sx, H, sz, 9, 0.5, 9, '#e8e0d0');
  add('cone', 'cloth', sx, H + 0.5, sz, 12, 3.5, 12, '#e8402e');
  for (let y = 1; y < H; y += 1.2) add('box', 'metal', sx + 3.6, y, sz - 3 + ((y * 0.8) % 6), 1.4, 0.15, 1, '#f4f4f0');
  add('cyl', 'water', sx - 14, 0, sz + 10, 18, 0.5, 18, '#3ab8d8');
  add('cyl', 'marble', sx - 14, 0, sz + 10, 19, 0.4, 19, '#ece6da');
  for (const [k, col] of [[0, '#f4c84a'], [1, '#3ac85a'], [2, '#ff8ad8']] as const) {
    const turns = 2.2 + k * 0.3;
    const cxs = sx - 7 - k * 2;
    const czs = sz + 4 + k * 2;
    const rad = 5 + k * 1.5;
    let prev: [number, number, number] | null = null;
    const steps = 48;
    for (let q = 0; q <= steps; q++) {
      const u = q / steps;
      const a = u * turns * Math.PI * 2 + k * 2;
      const p: [number, number, number] = [cxs + Math.cos(a) * rad, H - 0.5 - u * (H - 1.2), czs + Math.sin(a) * rad];
      if (prev) {
        const dx = p[0] - prev[0];
        const dy = p[1] - prev[1];
        const dz = p[2] - prev[2];
        const L = Math.hypot(dx, dy, dz);
        add('rod', 'plaster', (p[0] + prev[0]) / 2, (p[1] + prev[1]) / 2, (p[2] + prev[2]) / 2, 1.6, L + 0.1, 1.6, col, Math.atan2(dx, dz), Math.acos(Math.max(-1, Math.min(1, dy / L))));
        if (q % 8 === 0) add('cyl', 'metal', p[0], 0, p[2], 0.25, p[1], 0.25, '#f4f4f0');
      }
      prev = p;
    }
  }
  // the speed slide: a steep straight drop into a run-out
  {
    const a0: [number, number, number] = [sx + 3, H, sz + 3];
    const a1: [number, number, number] = [sx + 12, 0.6, sz + 22];
    const dx = a1[0] - a0[0];
    const dy = a1[1] - a0[1];
    const dz = a1[2] - a0[2];
    const L = Math.hypot(dx, dy, dz);
    add('rod', 'plaster', (a0[0] + a1[0]) / 2, (a0[1] + a1[1]) / 2, (a0[2] + a1[2]) / 2, 1.8, L, 1.8, '#e8402e', Math.atan2(dx, dz), Math.acos(dy / L));
    for (const u of [0.25, 0.5, 0.75]) add('cyl', 'metal', a0[0] + dx * u, 0, a0[2] + dz * u, 0.3, a0[1] + dy * u, 0.3, '#f4f4f0');
  }
  add('box', 'water', sx + 12, 0.3, sz + 22, 3, 0.12, 10, '#3ab8d8');
  // the splash pad: coloured mushroom fountains and jets
  const ex = hw * 0.15;
  const ez = hd * 0.42;
  add('cyl', 'stone', ex, 0, ez, 18, 0.15, 18, '#7ac8e8');
  for (let k = 0; k < 7; k++) {
    const a = k * 0.9;
    const mx = ex + Math.cos(a) * 5;
    const mz = ez + Math.sin(a) * 5;
    add('cyl', 'plaster', mx, 0, mz, 0.5, 2.4 + (k % 3), 0.5, '#f4f4f0');
    add('hemi', 'plaster', mx, 2.4 + (k % 3), mz, 3, 1.5, 3, ['#e8402e', '#f4c84a', '#3ac85a', '#2e8ad8'][k % 4]);
    add('cone', 'water', mx, 0.1, mz + 2, 0.1, 1.5, 0.1, '#e8f8ff');
  }
  // cabanas along the side
  for (let k = 0; k < 6; k++) {
    const x = hw - 6;
    const z = -hd + 12 + k * 9;
    add('box', 'cloth', x, 2.4, z, 4, 0.2, 4, k % 2 ? '#f4f2ea' : '#2e8ad8');
    for (const [dx, dz] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]] as const) add('cyl', 'wood', x + dx, 0, z + dz, 0.15, 2.4, 0.15, '#8a6a4a');
    lounger(add, x, z, Math.PI / 2);
  }
  void r;
  void y0;
}
