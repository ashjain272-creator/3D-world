import { AIRCRAFT, type AircraftKind, type AirportPlan, type ARect } from './layout';
import { type Add, type DistrictData, frame, hashRand, palm } from './districts';

/**
 * The capital's international airport, drawn from `layout.features.airport`: the runway with its
 * markings, lights and approach lighting, the taxiways and apron, the terminal under its vaulted
 * roof with a tree-column canopy over the kerb, the long glazed concourse with jet bridges, parked
 * aircraft with ground service around them, the control tower, hangars, cargo terminal, fire
 * station, fuel farm, car parks and the perimeter fence.
 */

/** Liveries: fuselage, tail, cheatline and engine colours. */
export const LIVERIES = [
  { body: '#f4f4f2', tail: '#b0122a', stripe: '#c8a050', engine: '#f4f4f2' },
  { body: '#f4f4f2', tail: '#0e5a3a', stripe: '#c8102e', engine: '#d8d8d8' },
  { body: '#f0f2f4', tail: '#1a3a7a', stripe: '#1a3a7a', engine: '#1a3a7a' },
  { body: '#f6f4ee', tail: '#5a2a6a', stripe: '#d8b25a', engine: '#5a2a6a' },
  { body: '#e8eef4', tail: '#0a7aa8', stripe: '#0a7aa8', engine: '#f0f0f0' },
  { body: '#f4f4f2', tail: '#d86a1a', stripe: '#3a3a3a', engine: '#3a3a3a' },
  { body: '#f2f2f2', tail: '#2a2a2e', stripe: '#c8102e', engine: '#2a2a2e' },
];
export type Livery = (typeof LIVERIES)[number];

/**
 * An airliner with its nose along local +z, standing on its gear at y = 0: fuselage with nose and
 * tail cones, swept wings with winglets and flap fairings, engines on pylons with intakes and
 * exhausts, tailplane, fin with the airline's emblem, cabin windows, cockpit glazing, doors, gear
 * and navigation lights.
 */
export function aircraft(add: Add, kind: AircraftKind, liv: Livery, opts: { freighter?: boolean; gearUp?: boolean } = {}) {
  const p = AIRCRAFT[kind];
  const L = p.len;
  const d = p.d;
  const cy = p.belly + d / 2;
  const zFwd = L * 0.36;
  const zAft = -L * 0.3;
  // fuselage, nose and tail cone, belly fairing
  add('cyl', 'plaster', 0, cy, zAft, d, zFwd - zAft, d, liv.body, 0, Math.PI / 2);
  add('sphere', 'plaster', 0, cy - d * 0.04, zFwd, d * 0.98, d * 0.94, d * 2.1, liv.body);
  add('cone', 'plaster', 0, cy + d * 0.12, zAft, d * 0.98, L * 0.2, d * 0.98, liv.body, 0, -Math.PI / 2 + 0.06);
  add('sphere', 'plaster', 0, p.belly + d * 0.18, L * 0.02, d * 1.08, d * 0.5, L * 0.3, '#d8dadc');
  // cheatline and the lower fuselage in pale grey
  for (const s of [-1, 1]) {
    add('box', 'plaster', s * (d / 2 - 0.02), cy - d * 0.12, (zFwd + zAft) / 2, 0.06, d * 0.08, zFwd - zAft - 2, liv.stripe);
    add('box', 'plaster', s * (d / 2 - 0.06), cy - d * 0.33, (zFwd + zAft) / 2, 0.05, d * 0.18, zFwd - zAft - 4, '#c8ccd0');
  }
  // cabin windows (or none on a freighter), two decks on the four-engined jet
  if (!opts.freighter) {
    const rows = kind === 'quad' ? [cy + d * 0.12, cy + d * 0.36] : [cy + d * 0.14];
    for (const [ri, wy] of rows.entries())
      for (let z = zAft + 3; z < zFwd - (ri === 1 ? L * 0.08 : 3.5); z += 0.95)
        for (const s of [-1, 1]) add('box', 'dark', s * (d / 2 - (ri === 1 ? 0.35 : 0.04)) * 1.0, wy, z, 0.05, 0.42, 0.3, '#1c2228');
  }
  // cockpit glazing and doors
  for (const s of [-1, 1]) {
    add('box', 'dark', s * d * 0.28, cy + d * 0.22, zFwd + d * 0.62, 0.05, d * 0.13, d * 0.34, '#141a20', s * 0.5);
    add('box', 'dark', s * d * 0.12, cy + d * 0.3, zFwd + d * 0.76, d * 0.2, d * 0.1, 0.05, '#141a20', 0, -0.6);
    for (const dz of [zFwd - 3, (zFwd + zAft) / 2 + 2, zAft + 2.5]) add('box', 'plaster', s * (d / 2 + 0.01), p.belly + d * 0.3, dz, 0.04, Math.min(1.9, d * 0.42), 1.05, '#d0d4d8');
  }
  // wings: one swept, tapered panel a side with a little dihedral, winglets, flap-track fairings
  const wy = p.belly + d * 0.18;
  const root = d * 0.4;
  const b = p.span / 2 - root;
  const c1 = L * 0.2;
  const leRoot = L * 0.14;
  const thick = kind === 'narrow' ? 0.42 : 0.65;
  const le = (f: number) => leRoot - 1.6 * c1 * f;
  const chord = (f: number) => c1 * (1 - 0.75 * f);
  for (const s of [-1, 1]) {
    const dih = 0.06;
    add(s > 0 ? 'wingR' : 'wingL', 'plaster', s * root, wy, leRoot, b, thick, c1, liv.body, 0, 0, s * dih);
    const tipY = wy + b * Math.sin(dih);
    add('fin', 'plaster', s * (root + b), tipY, le(1) + 0.2, 0.18, kind === 'narrow' ? 2.2 : 3.4, chord(1) * 0.9, liv.tail, 0, 0, -s * 0.22);
    add('sphere', 'glow', s * (root + b), tipY, le(1) - 0.3, 0.35, 0.35, 0.35, s < 0 ? '#ff2a2a' : '#2aff6a');
    for (const f of [0.22, 0.45, 0.68]) add('box', 'plaster', s * (root + b * f), wy + b * f * Math.sin(dih) - 0.45, le(f) - chord(f) * 0.75, 0.45, 0.5, chord(f) * 0.6, '#d8dadc');
    // engines: one a side on a twin, two a side on the four-engined jet
    const fracs = kind === 'quad' ? [0.3, 0.62] : [0.34];
    const de = kind === 'narrow' ? 2.1 : kind === 'wide' ? 3.6 : 3.0;
    const len = de * 1.9;
    for (const f of fracs) {
      const ex = s * (root + b * f);
      const ez = le(f) + len * 0.35;
      const ey = wy + b * f * Math.sin(dih) - de * 0.62;
      add('cyl', 'plaster', ex, ey, ez - len * 0.5, de, len, de, liv.engine, 0, Math.PI / 2);
      add('torus', 'metal', ex, ey, ez + len * 0.5, de * 1.18, de * 1.18, de * 0.6, '#c8ccd0', 0, Math.PI / 2);
      add('cyl', 'dark', ex, ey, ez + len * 0.42, de * 0.86, 0.1, de * 0.86, '#2a2e34', 0, Math.PI / 2);
      add('cone', 'metal', ex, ey, ez + len * 0.44, de * 0.28, de * 0.3, de * 0.28, '#e0e4e8', 0, Math.PI / 2);
      add('cone', 'metal', ex, ey, ez - len * 0.5, de * 0.6, de * 0.9, de * 0.6, '#8a8e94', 0, -Math.PI / 2);
      add('box', 'plaster', ex, ey + de * 0.4, ez - len * 0.15, 0.4, de * 0.5, len * 0.8, liv.body);
    }
  }
  // tailplane and fin with the airline's emblem, a dorsal fillet into the fuselage
  const zt = -L * 0.34;
  for (const s of [-1, 1]) add(s > 0 ? 'wingR' : 'wingL', 'plaster', s * d * 0.18, cy + d * 0.2, zt, p.span * 0.17, 0.35, L * 0.1, liv.body, 0, 0, s * 0.1);
  const c0 = L * 0.16;
  const finBase = cy + d * 0.3;
  const finLE = zt + L * 0.03;
  add('fin', 'plaster', 0, finBase, finLE, 0.5, p.fin, c0, liv.tail);
  add('box', 'plaster', 0, cy + d * 0.38, finLE + L * 0.05, 0.4, d * 0.18, L * 0.12, liv.body, 0, 0.14);
  for (const s of [-1, 1]) {
    const ey = finBase + p.fin * 0.5;
    const ez = finLE - 0.89 * c0;
    add('cyl', 'plaster', s * 0.27, ey, ez, p.fin * 0.32, 0.04, p.fin * 0.32, liv.stripe, 0, 0, Math.PI / 2);
    add('cyl', 'plaster', s * 0.3, ey, ez, p.fin * 0.19, 0.04, p.fin * 0.19, liv.body, 0, 0, Math.PI / 2);
  }
  // beacons and the tail strobe
  add('sphere', 'glow', 0, cy + d / 2 + 0.1, 0, 0.3, 0.2, 0.3, '#ff2020');
  add('sphere', 'glow', 0, p.belly - 0.05, L * 0.04, 0.3, 0.2, 0.3, '#ff2020');
  add('sphere', 'glow', 0, cy + d * 0.15, zAft - L * 0.2, 0.25, 0.25, 0.25, '#ffffff');
  // landing gear: a twin-wheel nose leg and the main bogies
  if (!opts.gearUp) {
    const nz = zFwd - 1;
    add('cyl', 'metal', 0, 0.4, nz, 0.25, p.belly + d * 0.1, 0.25, '#c8ccd0');
    for (const s of [-1, 1]) add('cyl', 'dark', s * 0.3, 0.45, nz, 0.9, 0.3, 0.9, '#1a1a1c', 0, 0, Math.PI / 2);
    const axles = kind === 'narrow' ? [0] : kind === 'wide' ? [-1.4, 0, 1.4] : [-0.8, 0.8];
    const legs = kind === 'quad' ? [-d * 0.35, d * 0.35, -d * 0.9, d * 0.9] : [-d * 0.6, d * 0.6];
    for (const lx of legs) {
      add('cyl', 'metal', lx, 0.6, L * 0.0, 0.35, p.belly + 0.4, 0.35, '#c8ccd0');
      for (const az of axles) for (const s of [-1, 1]) add('cyl', 'dark', lx + s * 0.45, 0.6, L * 0.0 + az, 1.2, 0.4, 1.2, '#1a1a1c', 0, 0, Math.PI / 2);
    }
  }
  // antennas on the crown, the APU exhaust at the tail
  add('box', 'dark', 0, cy + d / 2, L * 0.15, 0.08, 0.5, 0.6, '#3a3e44', 0, -0.4);
  add('cyl', 'dark', 0, cy + d * 0.18, zAft - L * 0.205, 0.35, 0.4, 0.35, '#2a2e34', 0, -Math.PI / 2);
}

// ───────────────────────── The airport ─────────────────────────

export function airport(out: DistrictData, a: AirportPlan, y0: number, warm: boolean) {
  const first = out.pieces.length;
  const { add } = frame(out, 0, 0, y0, [0, 1]);
  const r = hashRand(a.xa * 3.7 + a.runZ);
  const paint = (x: number, z: number, w: number, d: number, col = '#f4f4f0', rot = 0, y = 0.13) => add('box', 'paint', x, y, z, w, 0.01, d, col, rot);
  const tree = (x: number, z: number, k: number) => {
    if (warm) palm(add, x, z, 7 + r(k) * 3, r, k);
    else {
      add('cyl', 'bark', x, 0, z, 0.35, 1.4, 0.35, '#5a4232');
      for (const [f, w] of [[0.15, 0.62], [0.42, 0.48], [0.66, 0.32]] as const) add('cone', 'leaf', x, 6 * f, z, 6 * w, 2.6, 6 * w, '#2f5e3a');
    }
  };
  runway(add, a, paint);
  taxiways(add, a, paint);
  apron(out, y0, add, a, r, paint);
  terminal(add, a, r, tree);
  concourse(add, a, r);
  tower(add, a);
  support(out, add, a, r, paint);
  landside(add, a, r, tree, paint);
  fence(add, a);
  floodlights(add, a);
  // the airfield's lights read from across the city at night: never cull them as small props
  for (let i = first; i < out.pieces.length; i++) if (out.pieces[i].mat === 'glow' || out.pieces[i].mat === 'nightBeam') out.pieces[i].small = false;
  // two aircraft that fly: one landing, one taking off, on the same runway in turn
  out.flights = (['land', 'takeoff'] as const).map((mode, i) => {
    const local: DistrictData = { pieces: [], lights: [] };
    const f = frame(local, 0, 0, 0, [0, 1]);
    aircraft(f.add, mode === 'land' ? 'narrow' : 'wide', LIVERIES[i === 0 ? 0 : 3]);
    // landing lights on the wing roots
    for (const sx of [-1, 1]) f.add('sphere', 'glow', sx * 3, AIRCRAFT[mode === 'land' ? 'narrow' : 'wide'].belly + 0.6, 6, 0.6, 0.6, 0.6, '#fffbe8');
    return { pieces: local.pieces, mode, runZ: a.runZ, runX0: a.runX0, runX1: a.runX1 };
  });
}

/**
 * Where a flying aircraft is at time t (seconds) in its 110 s cycle: position (y above the airfield),
 * heading and pitch, or null while it is out of sight between cycles. Both land and take off
 * towards -x, into the same wind.
 */
export function flightPose(mode: 'land' | 'takeoff', runX0: number, runX1: number, t: number): { x: number; y: number; pitch: number } | null {
  const T = ((t % 110) + 110) % 110;
  if (mode === 'land') {
    const xTD = runX1 - 300;
    const v = 70;
    const tApp = 1900 / v;
    if (T < tApp) {
      const x = xTD + 1900 - v * T;
      const left = tApp - T;
      // a 3 degree glide, flaring over the last three seconds
      const glide = (x - xTD) * 0.0524;
      const y = left < 3 ? glide * (left / 3) * (left / 3) * 0.6 + glide * 0.4 * (left / 3) : glide;
      return { x, y: y + 0.01, pitch: left < 3 ? 0.035 + (3 - left) * 0.02 : 0.035 };
    }
    const tr = T - tApp;
    const a = 2.6;
    const tStop = (v - 8) / a;
    if (tr > tStop) return null;
    const x = xTD - (v * tr - (a * tr * tr) / 2);
    if (x < runX0 + 40) return null;
    return { x, y: 0, pitch: tr < 2 ? 0.095 * (1 - tr / 2) : 0 };
  }
  const t0 = 52;
  if (T < t0) return null;
  const tt = T - t0;
  const a = 3.2;
  const vR = 78;
  const tR = vR / a;
  const x0 = runX1 - 40;
  if (tt < tR) return { x: x0 - (a * tt * tt) / 2, y: 0, pitch: 0 };
  const xR = x0 - (a * tR * tR) / 2;
  const tc = tt - tR;
  if (tc > 32) return null;
  const v = 85;
  const pitch = Math.min(0.14, tc * 0.05);
  const climb = tc < 3 ? 0 : (tc - 3) * v * 0.14;
  return { x: xR - v * tc, y: climb + (tc < 3 ? tc * tc * 0.6 : 5.4), pitch };
}

/** Seven-segment runway designator digits, drawn along the runway (reading from the threshold). */
function digit(paint: (x: number, z: number, w: number, d: number) => void, x: number, z: number, n: number, dir: number) {
  // segments a..g on an 18 m tall, 6 m wide digit; the digit's "up" points along -dir in x
  const segs = ['abcdef', 'bc', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgedc', 'abc', 'abcdefg', 'abfgcd'][n];
  const H = 18;
  const W = 6;
  const T = 1.4;
  // local u across the runway (z), v along it (x, towards the threshold)
  const put = (u: number, v: number, du: number, dv: number) => paint(x - dir * v, z + u, dv, du);
  const map: Record<string, () => void> = {
    a: () => put(0, H / 2, W, T),
    g: () => put(0, 0, W, T),
    d: () => put(0, -H / 2, W, T),
    f: () => put(-W / 2, H / 4, T, H / 2),
    b: () => put(W / 2, H / 4, T, H / 2),
    e: () => put(-W / 2, -H / 4, T, H / 2),
    c: () => put(W / 2, -H / 4, T, H / 2),
  };
  for (const ch of segs) map[ch]();
}

function runway(add: Add, a: AirportPlan, paint: (x: number, z: number, w: number, d: number, col?: string, rot?: number, y?: number) => void) {
  const { runX0: x0, runX1: x1, runZ: z, runW: w } = a;
  const len = x1 - x0;
  // shoulders, the grooved asphalt and a darker rubbered touchdown zone at each end
  add('box', 'stone', 0, 0.02, z, len + 120, 0.08, w + 16, '#7c7e80');
  add('box', 'dark', 0, 0.05, z, len, 0.08, w, '#3a3c40');
  for (const s of [-1, 1]) add('box', 'dark', s * (len / 2 - 220), 0.06, z, 380, 0.08, 14, '#2a2c30');
  // blast pads with yellow chevrons beyond each threshold
  for (const s of [-1, 1]) {
    add('box', 'dark', s * (len / 2 + 30), 0.05, z, 60, 0.08, w, '#45474c');
    for (let k = 0; k < 4; k++)
      for (const t of [-1, 1]) paint(s * (len / 2 + 10 + k * 14), z + t * w * 0.22, 14, 1.2, '#f2c21a', t * s * 0.9);
  }
  // edge lines, centreline dashes, threshold piano keys, designators, aiming points, touchdown zones
  for (const t of [-1, 1]) paint(0, z + t * (w / 2 - 1), len, 0.9);
  for (let x = x0 + 120; x < x1 - 120; x += 50) paint(x, z, 30, 0.9);
  for (const s of [-1, 1]) {
    const th = s < 0 ? x0 : x1;
    const inn = -s;
    for (let k = 0; k < 8; k++) for (const t of [-1, 1]) paint(th + inn * 21, z + t * (3 + k * 2.4), 30, 1.8);
    paint(th + inn * 3, z, 1.8, w - 2);
    // "09" at the west end, "27" at the east end, read by a pilot landing over that threshold
    const nums = s < 0 ? [0, 9] : [2, 7];
    digit(paint, th + inn * 60, z + 4.5 * (s < 0 ? -1 : 1), nums[0], inn);
    digit(paint, th + inn * 60, z - 4.5 * (s < 0 ? -1 : 1), nums[1], inn);
    for (const t of [-1, 1]) paint(th + inn * 300, z + t * 9, 45, 8);
    for (const [k, n] of [[150, 3], [450, 2], [550, 1]] as const) for (const t of [-1, 1]) for (let q = 0; q < n; q++) paint(th + inn * k, z + t * (6 + q * 3), 22, 1.8);
  }
  // lights: white edges every 60 m, green thresholds facing in, red ends facing out, centreline
  for (let x = x0; x <= x1 + 0.1; x += 60) for (const t of [-1, 1]) add('cyl', 'glow', x, 0.1, z + t * (w / 2 + 1.5), 0.3, 0.4, 0.3, '#fff6e0');
  for (let x = x0 + 15; x < x1 - 15; x += 15) add('cyl', 'glow', x, 0.12, z, 0.25, 0.04, 0.25, '#fff6e0');
  for (const s of [-1, 1]) {
    const th = s < 0 ? x0 : x1;
    for (let t = -w / 2; t <= w / 2; t += 3) {
      add('cyl', 'glow', th - s * 0.6, 0.1, z + t, 0.3, 0.35, 0.3, '#40ff70');
      add('cyl', 'glow', th + s * 0.6, 0.1, z + t, 0.3, 0.35, 0.3, '#ff2a20');
    }
    // approach lighting: a row of light bars on posts out to 300 m, a crossbar at 150 m
    for (let k = 1; k <= 10; k++) {
      const x = th + s * k * 30;
      const ph = 0.6 + k * 0.08;
      add('cyl', 'metal', x, 0, z, 0.18, ph, 0.18, '#6a6e74');
      add('box', 'metal', x, ph, z, 0.3, 0.2, 4.5, '#3a3e44');
      for (let q = -2; q <= 2; q++) add('sphere', 'glow', x, ph + 0.25, z + q, 0.32, 0.32, 0.32, '#fff2d6');
      if (k === 5) {
        add('box', 'metal', x, ph, z, 0.3, 0.2, 30, '#3a3e44');
        for (let q = -14; q <= 14; q += 2) add('sphere', 'glow', x, ph + 0.25, z + q, 0.32, 0.32, 0.32, '#fff2d6');
      }
    }
    // PAPI: four boxes on the left of the touchdown zone, two showing red and two white
    for (let q = 0; q < 4; q++) {
      const px = th - s * 300;
      const pz = z - s * (w / 2 + 14 + q * 9);
      add('box', 'metal', px, 0, pz, 1.4, 0.9, 1.1, '#e8e8e8');
      add('box', 'glow', px + s * 0.71, 0.4, pz, 0.05, 0.35, 0.8, q < 2 ? '#ff3020' : '#fff6e0');
    }
    // the windsock beside the threshold
    const wx = th - s * 120;
    const wz = z + w / 2 + 40;
    add('cyl', 'metal', wx, 0, wz, 0.2, 7, 0.2, '#e8e8e8');
    for (let q = 0; q < 5; q++) add('cyl', 'cloth', wx + 0.6 + q * 0.9, 6.6 - q * 0.12, wz, 1.2 - q * 0.12, 0.9, 1.2 - q * 0.12, q % 2 ? '#f4f4f0' : '#f26a1a', 0, 0, -Math.PI / 2 + 0.15);
  }
}

function taxiways(add: Add, a: AirportPlan, paint: (x: number, z: number, w: number, d: number, col?: string, rot?: number, y?: number) => void) {
  const tz = a.taxiZ;
  const tx0 = a.runX0 + 10;
  const tx1 = a.runX1 - 10;
  const yellow = '#f2c21a';
  const strip = (x: number, z: number, w: number, d: number, rot = 0) => {
    add('box', 'dark', x, 0.04, z, w + 6, 0.08, d + 6, '#6c6e72', rot);
    add('box', 'dark', x, 0.06, z, w, 0.08, d, '#45474c', rot);
  };
  // the parallel taxiway, with a yellow centreline and blue edge lights
  strip((tx0 + tx1) / 2, tz, tx1 - tx0, 23);
  paint((tx0 + tx1) / 2, tz, tx1 - tx0, 0.3, yellow);
  for (let x = tx0; x <= tx1; x += 30) for (const t of [-1, 1]) add('cyl', 'glow', x, 0.1, tz + t * 13, 0.25, 0.35, 0.25, '#3a6aff');
  // links from the taxiway onto the runway: square ones at the ends, two rapid exits
  const links: [number, number][] = [
    [tx0 + 15, 0],
    [tx1 - 15, 0],
  ];
  for (const [lx] of links) {
    const z0 = tz + 11;
    const z1 = a.runZ - a.runW / 2;
    strip(lx, (z0 + z1) / 2, 23, z1 - z0);
    paint(lx, (z0 + z1) / 2, 0.3, z1 - z0, yellow);
    // holding position: two solid and two dashed yellow lines across the link
    for (const [k, dash] of [[0, false], [1, false], [2, true], [3, true]] as const) {
      const hz = z1 - 18 - k * 0.9;
      if (!dash) paint(lx, hz, 22, 0.3, yellow);
      else for (let q = -10; q < 11; q += 2) paint(lx + q, hz, 1.2, 0.3, yellow);
    }
    // a lit sign board at the holding point
    add('box', 'dark', lx + 16, 0, z1 - 20, 0.3, 1.1, 0.2, '#2a2a2a');
    add('box', 'glow', lx + 16, 1.1, z1 - 20, 3.4, 0.9, 0.3, '#c8102e');
  }
  for (const s of [-1, 1]) {
    // rapid exits leave the runway at 30 degrees towards the taxiway
    const cx = s * 230;
    const dz = a.runZ - a.runW / 2 - (tz + 11);
    const len = dz / Math.sin(0.52);
    const rot = s * 0.52;
    strip(cx, tz + 11 + dz / 2, 23, len, rot);
    paint(cx, tz + 11 + dz / 2, 0.3, len, yellow, rot);
  }
  // apron links from the stands down to the taxiway
  for (const lx of [a.conc.x0 + 20, a.xa, a.conc.x1 - 20]) {
    strip(lx, (a.apronZ1 + tz) / 2, 25, tz - a.apronZ1 - 2);
    paint(lx, (a.apronZ1 + tz) / 2, 0.3, tz - a.apronZ1, yellow);
  }
}

function apron(out: DistrictData, y0: number, add: Add, a: AirportPlan, r: (k: number) => number, paint: (x: number, z: number, w: number, d: number, col?: string, rot?: number, y?: number) => void) {
  const yellow = '#f2c21a';
  const z0 = a.conc.z1;
  const z1 = a.apronZ1;
  const x0 = Math.min(a.conc.x0, a.cargo.x0, a.hangars[0].x0) - 20;
  const x1 = Math.max(a.conc.x1, a.cargo.x1, a.hangars[1].x1) + 20;
  // concrete slabs with expansion joints, a taxilane along the stands
  add('box', 'stone', (x0 + x1) / 2, 0.02, (z0 + z1) / 2 + 2, x1 - x0, 0.1, z1 - z0 + 4, '#b8b6b0');
  for (let x = x0 + 10; x < x1; x += 10) add('box', 'dark', x, 0.13, (z0 + z1) / 2 + 2, 0.08, 0.01, z1 - z0, '#9a9890');
  for (let z = z0 + 10; z < z1; z += 10) add('box', 'dark', (x0 + x1) / 2, 0.13, z, x1 - x0, 0.01, 0.08, '#9a9890');
  paint((x0 + x1) / 2, z1 - 10, x1 - x0 - 10, 0.3, yellow);
  // the stands: a lead-in line, a stop bar, a red equipment line, a stand number; and the aircraft
  for (const [i, g] of a.gates.entries()) {
    const p = AIRCRAFT[g.kind];
    const nose = z0 + 7;
    paint(g.x, (nose + z1 - 10) / 2, 0.3, z1 - 10 - nose, yellow);
    paint(g.x, nose + 2, 4, 0.4, yellow);
    for (const s of [-1, 1]) paint(g.x + s * (p.span / 2 + 3), (z0 + z1) / 2, 0.3, z1 - z0 - 14, '#c8102e');
    add('box', 'dark', g.x - 6, 0.13, z0 + 4, 3, 0.01, 2, '#202020');
    add('box', 'paint', g.x - 6, 0.14, z0 + 4, 1.2, 0.01, 1.6, yellow);
    parked(out, y0, g.x, nose, g.kind, LIVERIES[Math.floor(r(30 + i) * LIVERIES.length)], 0);
    jetBridge(add, a, g.x, g.kind);
    service(add, g.x, nose, g.kind, r, i);
  }
  // an aircraft taxiing out and one holding short of the runway
  parked(out, y0, a.runX0 + 160, a.taxiZ, 'narrow', LIVERIES[2], Math.PI / 2);
  parked(out, y0, a.runX1 - 25, a.taxiZ + 22, 'wide', LIVERIES[4], Math.PI);
  // a freighter at the cargo stand
  const fc = (a.cargo.x0 + a.cargo.x1) / 2;
  parked(out, y0, fc, a.cargo.z1 + 8, 'wide', { body: '#f2f2f2', tail: '#2a4a8a', stripe: '#f2a21a', engine: '#e8e8e8' }, 0, { freighter: true });
  // airliners in the hangars
  for (const [k, h] of a.hangars.entries()) parked(out, y0, (h.x0 + h.x1) / 2, h.z0 + 6, 'narrow', LIVERIES[5 + (k % 2)], 0);
}

/** An aircraft standing with its nose at (x, nose) pointing at `heading` (0 = towards -z). */
function parked(out: DistrictData, y0: number, x: number, nose: number, kind: AircraftKind, liv: Livery, heading: number, opts: { freighter?: boolean } = {}) {
  const p = AIRCRAFT[kind];
  // the aircraft's frame: local +z along the nose
  const dir: [number, number] = [-Math.sin(heading), -Math.cos(heading)];
  const cx = x - dir[0] * p.len * 0.42;
  const cz = nose - dir[1] * p.len * 0.42;
  const f = frame(out, cx, cz, y0, [cx + dir[0], cz + dir[1]]);
  aircraft(f.add, kind, liv, opts);
}

function jetBridge(add: Add, a: AirportPlan, gx: number, kind: AircraftKind) {
  const p = AIRCRAFT[kind];
  const doorX = gx - p.d / 2 - 1.2;
  const doorZ = a.conc.z1 + 7 + p.len * 0.07;
  const sill = p.belly + p.d * 0.3 + 0.2;
  // the rotunda against the concourse, then the telescopic tunnel angled out to the front door
  const rx = gx - p.d / 2 - 10;
  const rz = a.conc.z1 + 3;
  add('cyl', 'metal', rx, 0, rz, 3.2, sill + 2.8, 3.2, '#c8ccd0');
  const dx = doorX - rx;
  const dz = doorZ - rz;
  const len = Math.hypot(dx, dz);
  const rot = Math.atan2(dx, dz);
  const mx = (rx + doorX) / 2;
  const mz = (rz + doorZ) / 2;
  add('box', 'metal', mx, sill, mz, 3, 2.7, len, '#d4d8dc', rot);
  add('box', 'atrium', mx, sill + 0.6, mz, 3.05, 1.2, len - 1, '#bfe2f0', rot);
  add('box', 'metal', doorX - 0.2, sill, doorZ, 3.6, 2.9, 2.2, '#b8bcc0', rot);
  // the drive column with its wheel bogie
  const cx = rx + dx * 0.7;
  const cz = rz + dz * 0.7;
  for (const s of [-1, 1]) add('box', 'metal', cx + s * 0.9, 0, cz, 0.3, sill, 0.3, '#8a8e94', rot);
  add('box', 'dark', cx, 0, cz, 2.6, 0.8, 1, '#2a2e34', rot);
}

function service(add: Add, gx: number, nose: number, kind: AircraftKind, r: (k: number) => number, i: number) {
  const p = AIRCRAFT[kind];
  const k = 100 + i * 9;
  // a pushback tug at the nose, cones at the wingtips and engines
  add('box', 'metal', gx, 0, nose - 3.5, 2.4, 1.2, 4.2, '#f2c21a');
  add('box', 'dark', gx, 1.2, nose - 4.6, 1.8, 0.9, 1.4, '#2a3440');
  for (const s of [-1, 1]) {
    add('cone', 'cloth', gx + s * (p.span / 2 + 1), 0, nose + p.len * 0.55, 0.45, 0.8, 0.45, '#f26a1a');
    add('cone', 'cloth', gx + s * p.span * 0.22, 0, nose + p.len * 0.3, 0.45, 0.8, 0.45, '#f26a1a');
  }
  // a belt loader at the forward hold and a train of baggage carts behind its tractor
  const side = gx + p.d / 2 + 1.5;
  const hz = nose + p.len * 0.25;
  add('box', 'metal', side + 1.2, 0, hz, 2, 1, 6, '#e8e8e8');
  add('box', 'dark', side + 0.5, 1.2, hz, 0.8, 0.15, 7, '#2a2e34', 0, 0.12, -0.35);
  add('box', 'metal', side + 6, 0, hz - 6, 1.8, 1.6, 2.6, '#3a6a9a');
  for (let q = 0; q < 3; q++) {
    add('box', 'metal', side + 6, 0.3, hz - 2.5 + q * 3.2, 1.8, 0.2, 2.6, '#8a8e94');
    for (let b = 0; b < 3; b++) add('box', 'cloth', side + 5.5 + (b % 2) * 0.8, 0.5, hz - 3.3 + q * 3.2 + b * 0.7, 0.6, 0.45 + r(k + q + b) * 0.3, 0.5, ['#2a2a2a', '#7a1a1a', '#1a3a6a', '#6a5a3a'][b]);
  }
  // a catering truck with its box raised to the rear door on the far side
  if (kind !== 'narrow') {
    const cxx = gx + p.d / 2 + 2.2;
    const cz = nose + p.len * 0.78;
    add('box', 'metal', cxx + 1, 0, cz, 2.3, 1.2, 6.5, '#e8e8e8');
    add('box', 'metal', cxx + 1, 1.2, cz, 1.2, p.belly + p.d * 0.3 - 1.4, 1.2, '#8a8e94');
    add('box', 'plaster', cxx + 0.8, p.belly + p.d * 0.3 - 0.2, cz, 2.5, 2.5, 5, '#f4f4f2');
    // a fuel truck under the wing
    add('box', 'metal', gx + p.span * 0.25, 0, nose + p.len * 0.52, 2.4, 1.1, 8, '#e8e8e8');
    add('cyl', 'metal', gx + p.span * 0.25, 1.6, nose + p.len * 0.52 - 3, 2.2, 6, 2.2, '#d8d8d8', 0, Math.PI / 2);
    add('box', 'dark', gx + p.span * 0.25, 1.1, nose + p.len * 0.52 + 3.2, 2.3, 1.4, 1.6, '#2a3440');
  }
  // a ground power unit
  add('box', 'metal', gx - p.d / 2 - 3, 0, nose + 3, 1.4, 1.2, 2.2, '#f2c21a');
}

function terminal(add: Add, a: AirportPlan, r: (k: number) => number, tree: (x: number, z: number, k: number) => void) {
  const t = a.term;
  const W = t.x1 - t.x0;
  const D = t.z1 - t.z0;
  const cx = (t.x0 + t.x1) / 2;
  const cz = (t.z0 + t.z1) / 2;
  const H = 17;
  // plinth, glass curtain walls with mullions, a lit interior glow
  add('box', 'marble', cx, 0, cz, W + 4, 0.4, D + 4, '#e6e1d6');
  add('box', 'glass', cx, 0.4, cz, W, H - 0.4, D, '#6f9cbc');
  for (let x = t.x0; x <= t.x1 + 0.01; x += 3) for (const z of [t.z0 - 0.1, t.z1 + 0.1]) add('box', 'metal', x, 0.4, z, 0.18, H - 0.4, 0.3, '#e8ecf0');
  for (const y of [5.5, 11]) for (const z of [t.z0 - 0.12, t.z1 + 0.12]) add('box', 'metal', cx, y, z, W, 0.25, 0.3, '#e8ecf0');
  // the vaulted roof: a faceted shell spanning front to back with deep overhangs, white ribs below
  const over = 14;
  const span = D + over * 2;
  const rise = 9;
  const n = 16;
  const R0 = (span * span) / (8 * rise) + rise / 2;
  const half = Math.asin(span / 2 / R0);
  const yc = H + rise - R0;
  for (let k = 0; k < n; k++) {
    const th0 = -half + (2 * half * k) / n;
    const th1 = -half + (2 * half * (k + 1)) / n;
    const zA = cz + R0 * Math.sin(th0);
    const zB = cz + R0 * Math.sin(th1);
    const yA = yc + R0 * Math.cos(th0);
    const yB = yc + R0 * Math.cos(th1);
    const tilt = Math.atan2(yB - yA, zB - zA);
    add('box', k === n / 2 - 1 || k === n / 2 ? 'skylight' : 'metal', cx, (yA + yB) / 2 - 0.3, (zA + zB) / 2, W + 24, 0.6, Math.hypot(zB - zA, yB - yA) + 0.1, k === n / 2 - 1 || k === n / 2 ? '#bfe4f4' : '#f2f4f6', 0, -tilt);
  }
  add('box', 'glow', cx, H - 0.6, t.z0 - over + 0.6, W + 22, 0.15, 0.3, '#fff0d4');
  // tree columns carrying the overhang above the kerb: a trunk branching into four arms
  for (let x = t.x0 - 6; x <= t.x1 + 6.01; x += 18) {
    const z = t.z0 - over + 3;
    add('cyl', 'metal', x, 0, z, 1, 9, 1, '#e8ecf0');
    for (let q = 0; q < 4; q++) {
      const ang = q * (Math.PI / 2) + Math.PI / 4;
      add('cyl', 'metal', x + Math.cos(ang) * 1.6, 8.6, z + Math.sin(ang) * 1.6, 0.45, 8, 0.45, '#e8ecf0', 0, Math.sin(ang) * 0.42, -Math.cos(ang) * 0.42);
    }
  }
  // the glazed end walls under the vault
  for (const s of [-1, 1]) for (let q = 0; q < 6; q++) add('box', 'atrium', cx + s * (W / 2 + 0.1), H, cz - D / 2 + (q + 0.5) * (D / 6), 0.12, rise * Math.cos(((q + 0.5) / 6 - 0.5) * 2.2) * 0.9, D / 6, '#bfe2f0');
  // departures signage, entrance doors, flags along the kerb
  add('box', 'dark', cx, 12.5, t.z0 - 0.4, 34, 2.4, 0.3, '#1e2024');
  add('box', 'glow', cx, 12.8, t.z0 - 0.56, 30, 1.6, 0.05, '#ffd27a');
  for (let x = t.x0 + 20; x < t.x1 - 10; x += 26) {
    add('box', 'glow', x, 0.4, t.z0 - 0.3, 5, 3, 0.06, '#fff0d4');
    add('box', 'metal', x, 3.4, t.z0 - 0.3, 6, 0.35, 0.5, '#d8dce0');
  }
  for (let k = 0; k < 12; k++) {
    const x = t.x0 + 8 + (k * (W - 16)) / 11;
    add('cyl', 'metal', x, 0, t.z0 - over - 4, 0.15, 11, 0.15, '#e0e4e8');
    add('box', 'cloth', x + 1, 9, t.z0 - over - 4, 2, 1.3, 0.05, ['#b0122a', '#0e5a3a', '#1a3a7a', '#d8b25a', '#f4f4f2', '#5a2a6a'][k % 6]);
  }
  // the link bridges airside to the concourse, glazed tubes on pillars
  for (const s of [-1, 1]) {
    const lx = cx + s * 60;
    const zA = t.z1;
    const zB = a.conc.z0;
    add('box', 'atrium', lx, 6, (zA + zB) / 2, 9, 5, zB - zA, '#bfe2f0');
    add('box', 'metal', lx, 11, (zA + zB) / 2, 9.6, 0.5, zB - zA, '#e8ecf0');
    add('box', 'metal', lx, 5.6, (zA + zB) / 2, 9.6, 0.4, zB - zA, '#e8ecf0');
    for (const z of [zA + 5, zB - 5]) add('cyl', 'metal', lx, 0, z, 1.2, 5.6, 1.2, '#d8dce0');
  }
  // palms or evergreens along the forecourt
  for (let x = t.x0; x <= t.x1; x += 12) tree(x, a.curbZ - 9, 40 + x);
  void r;
}

function concourse(add: Add, a: AirportPlan, r: (k: number) => number) {
  const c = a.conc;
  const W = c.x1 - c.x0;
  const D = c.z1 - c.z0;
  const cx = (c.x0 + c.x1) / 2;
  const cz = (c.z0 + c.z1) / 2;
  const H = 12;
  add('box', 'marble', cx, 0, cz, W + 2, 0.4, D + 2, '#e6e1d6');
  add('box', 'glass', cx, 0.4, cz, W, H - 0.4, D, '#6f9cbc');
  for (let x = c.x0; x <= c.x1 + 0.01; x += 2.5) for (const z of [c.z0 - 0.1, c.z1 + 0.1]) add('box', 'metal', x, 0.4, z, 0.14, H - 0.4, 0.25, '#e8ecf0');
  add('box', 'metal', cx, 5.6, c.z1 + 0.12, W, 0.3, 0.3, '#e8ecf0');
  // a glazed vault the length of the concourse, ribbed every 6 m, ending in rounded glass ends
  const n = 10;
  const rise = 6;
  const R0 = (D * D) / (8 * rise) + rise / 2;
  const half = Math.asin(D / 2 / R0);
  const yc = H + rise - R0;
  for (let k = 0; k < n; k++) {
    const th0 = -half + (2 * half * k) / n;
    const th1 = -half + (2 * half * (k + 1)) / n;
    const zA = cz + R0 * Math.sin(th0);
    const zB = cz + R0 * Math.sin(th1);
    const yA = yc + R0 * Math.cos(th0);
    const yB = yc + R0 * Math.cos(th1);
    add('box', 'atrium', cx, (yA + yB) / 2 - 0.15, (zA + zB) / 2, W, 0.3, Math.hypot(zB - zA, yB - yA) + 0.05, '#bfe2f0', 0, -Math.atan2(yB - yA, zB - zA));
  }
  for (let x = c.x0; x <= c.x1 + 0.01; x += 6) add('halfTorus', 'metal', x, H - 0.2, cz, D / 0.9 + 0.4, (rise + 0.4) / 0.45, 1, '#f2f4f6', Math.PI / 2);
  for (const s of [-1, 1]) add('hemi', 'atrium', cx + s * W / 2, 0.4, cz, D * 0.9, H * 2.6, D, '#bfe2f0');
  // gate numbers glowing on the airside face
  for (const [i, g] of a.gates.entries()) {
    add('box', 'dark', g.x - 8, 8.5, c.z1 + 0.3, 3.6, 1.8, 0.2, '#1e2024');
    add('box', 'glow', g.x - 8, 8.7, c.z1 + 0.42, 3.2, 1.4, 0.05, i % 2 ? '#ffd27a' : '#7ae0ff');
  }
  void r;
}

function tower(add: Add, a: AirportPlan) {
  const { x, z } = a.tower;
  const H = 88;
  // base building, a tapering shaft with four sweeping fins, the glazed cab, the radar dome, beacons
  add('box', 'stone', x, 0, z, 22, 8, 18, '#e2dac8');
  add('box', 'glass', x, 0.4, z + 9.05, 18, 6, 0.1, '#6f9cbc');
  for (let k = 0; k < 6; k++) add('cyl', 'stone', x, 8 + k * 11, z, 8.6 - k * 0.6, 11.2, 8.6 - k * 0.6, '#ece6da');
  for (let q = 0; q < 4; q++) {
    const ang = q * (Math.PI / 2);
    add('box', 'metal', x + Math.sin(ang) * 4.6, 6, z + Math.cos(ang) * 4.6, 0.4, H - 16, 1.8, '#d8dce0', ang);
  }
  for (let k = 0; k < 10; k++) add('cyl', 'glow', x, 12 + k * 6.5, z, 7.4 - k * 0.3, 0.15, 7.4 - k * 0.3, '#7ae0ff');
  add('cyl', 'stone', x, H - 12, z, 13, 3, 13, '#e2dac8');
  add('cone', 'stone', x, H - 15, z, 13, 3, 13, '#e2dac8', 0, Math.PI);
  add('oct', 'stone', x, H - 9, z, 16, 2, 16, '#e8e2d4');
  add('oct', 'glass', x, H - 7, z, 17.5, 4.8, 17.5, '#3f6a88');
  add('oct', 'glow', x, H - 6.6, z, 17.0, 0.1, 17.0, '#7ae0ff');
  add('oct', 'stone', x, H - 2.2, z, 18.4, 1.2, 18.4, '#e8e2d4');
  add('cyl', 'stone', x, H - 1, z, 9, 2.4, 9, '#ece6da');
  add('sphere', 'plaster', x, H + 3.2, z, 6, 6, 6, '#f4f4f2');
  add('cyl', 'metal', x, H + 6, z, 0.3, 9, 0.3, '#c8ccd0');
  add('sphere', 'glow', x, H + 15.2, z, 0.7, 0.7, 0.7, '#ff2020');
  for (const s of [-1, 1]) add('sphere', 'glow', x + s * 9, H - 1.6, z, 0.4, 0.4, 0.4, '#ff2020');
}

function support(out: DistrictData, add: Add, a: AirportPlan, r: (k: number) => number, paint: (x: number, z: number, w: number, d: number, col?: string, rot?: number, y?: number) => void) {
  // hangars: steel sheds with a curved roof and open doors facing the apron, lit inside
  for (const h of a.hangars) {
    const W = h.x1 - h.x0;
    const D = h.z1 - h.z0;
    const cx = (h.x0 + h.x1) / 2;
    const cz = (h.z0 + h.z1) / 2;
    const Hh = 20;
    add('box', 'stone', cx, 0, h.z0 + 0.5, W, Hh, 1, '#c8ccd0');
    for (const s of [-1, 1]) add('box', 'stone', cx + s * (W / 2 - 0.5), 0, cz, 1, Hh, D, '#c8ccd0');
    for (let z = h.z0 + 3; z < h.z1; z += 6) for (const s of [-1, 1]) add('box', 'metal', cx + s * (W / 2 + 0.05), 0, z, 0.1, Hh, 0.3, '#9aa0a8');
    const rise = 6;
    const n = 12;
    const R0 = (W * W) / (8 * rise) + rise / 2;
    const half = Math.asin(W / 2 / R0);
    const yc = Hh + rise - R0;
    for (let k = 0; k < n; k++) {
      const th0 = -half + (2 * half * k) / n;
      const th1 = -half + (2 * half * (k + 1)) / n;
      const xA = cx + R0 * Math.sin(th0);
      const xB = cx + R0 * Math.sin(th1);
      const yA = yc + R0 * Math.cos(th0);
      const yB = yc + R0 * Math.cos(th1);
      add('box', 'metal', (xA + xB) / 2, (yA + yB) / 2 - 0.2, cz, Math.hypot(xB - xA, yB - yA) + 0.05, 0.4, D + 1, '#d0d4d8', 0, 0, Math.atan2(yB - yA, xB - xA));
    }
    add('box', 'stone', cx, Hh - 2.5, h.z1, W, 2.5, 1, '#c8ccd0');
    add('box', 'glow', cx, Hh - 1.9, h.z1 + 0.52, W * 0.4, 1.2, 0.05, '#ffffff');
    add('box', 'stone', cx, 0.05, cz, W - 2, 0.1, D - 2, '#d8d8d4');
    for (let x = h.x0 + 8; x < h.x1 - 4; x += 12) add('box', 'glow', x, Hh - 0.6, cz, 1.4, 0.2, D - 6, '#fff6e0');
    for (const s of [-1, 1]) add('box', 'metal', cx + s * (W / 2 + 3), 0, h.z1 + 0.5, 6, Hh - 2.5, 0.8, '#b8bcc0');
  }
  // the cargo terminal: a long shed with dock doors, containers and trucks at the landside
  const c = a.cargo;
  const ccx = (c.x0 + c.x1) / 2;
  const ccz = (c.z0 + c.z1) / 2;
  add('box', 'stone', ccx, 0, ccz, c.x1 - c.x0, 14, c.z1 - c.z0, '#d8d4cc');
  add('box', 'metal', ccx, 14, ccz, c.x1 - c.x0 + 1, 0.6, c.z1 - c.z0 + 1, '#a8aeb4');
  for (let x = c.x0 + 6; x < c.x1 - 4; x += 8) {
    add('box', 'dark', x, 0, c.z0 - 0.05, 4.5, 5, 0.1, '#5a6068');
    add('box', 'dark', x, 0, c.z1 + 0.05, 5.5, 6, 0.1, '#5a6068');
  }
  add('box', 'glow', ccx, 10.5, c.z1 + 0.1, 30, 2, 0.05, '#f2a21a');
  for (let k = 0; k < 14; k++) {
    const x = c.x0 + 6 + (k % 7) * 15;
    const z = c.z1 + 22 + Math.floor(k / 7) * 4 + 30;
    add('box', 'metal', x, 0, z, 3.1, 1.6, 2.4, ['#c8ccd0', '#8a8e94', '#b8a070'][k % 3]);
  }
  for (let k = 0; k < 4; k++) {
    const x = c.x0 + 10 + k * 25;
    add('box', 'metal', x, 0, c.z0 - 9, 2.6, 3.8, 12, '#e8e8e8');
    add('box', 'metal', x, 0, c.z0 - 2, 2.6, 3, 3, ['#1a3a6a', '#7a1a1a', '#2a2a2a', '#0e5a3a'][k]);
  }
  // the fire station: bays with red doors and two crash tenders on the apron
  const f = a.fire;
  const fcx = (f.x0 + f.x1) / 2;
  add('box', 'stone', fcx, 0, (f.z0 + f.z1) / 2, f.x1 - f.x0, 9, f.z1 - f.z0, '#e8e4dc');
  for (let q = 0; q < 4; q++) add('box', 'cloth', f.x0 + 6 + q * 11, 0, f.z1 + 0.05, 8, 6, 0.1, '#c8102e');
  add('box', 'stone', fcx, 9, f.z0 + 8, 8, 6, 8, '#e8e4dc');
  add('box', 'glass', fcx, 11, f.z0 + 8, 8.2, 3, 8.2, '#4f7a98');
  for (let q = 0; q < 2; q++) {
    const x = f.x0 + 10 + q * 22;
    const z = f.z1 + 9;
    add('box', 'metal', x, 0.6, z, 3.2, 3, 11, '#d81e1e');
    add('box', 'dark', x, 2.2, z + 4.4, 3, 1.2, 1.8, '#2a3440');
    add('box', 'metal', x, 3.6, z - 1, 0.4, 0.4, 5, '#c8ccd0', 0, 0.1);
    for (const s of [-1, 1]) for (let w = -1; w <= 1; w++) add('cyl', 'dark', x + s * 1.6, 0.65, z + w * 3.5, 1.3, 0.5, 1.3, '#1a1a1c', 0, 0, Math.PI / 2);
    add('box', 'glow', x, 3.6, z + 4.6, 2.4, 0.25, 0.4, '#3a6aff');
  }
  // the fuel farm: four white tanks with spiral stairs in a walled bund
  const u = a.fuel;
  add('box', 'stone', (u.x0 + u.x1) / 2, 0, (u.z0 + u.z1) / 2, u.x1 - u.x0, 1.2, u.z1 - u.z0, '#b8b4ac');
  for (let k = 0; k < 4; k++) {
    const tx = u.x0 + 8 + (k % 2) * 44;
    const tz = u.z0 + 8 + Math.floor(k / 2) * 14;
    add('cyl', 'plaster', tx, 0, tz, 12, 9, 12, '#f2f2f0');
    add('cyl', 'metal', tx, 9, tz, 12.4, 0.4, 12.4, '#c8ccd0');
    add('cone', 'plaster', tx, 9.4, tz, 12, 1.2, 12, '#e8e8e6');
    add('box', 'cloth', tx, 4, tz + 6.05, 4, 1.2, 0.05, '#c8102e');
    for (let q = 0; q < 9; q++) add('box', 'metal', tx + Math.sin(q * 0.35) * 6.3, q, tz + Math.cos(q * 0.35) * 6.3, 1.2, 0.12, 0.5, '#8a8e94', q * 0.35);
  }
  // the radar: a lattice mast with a rotating dish (static here) beside the runway
  const rxp = (a.runX0 + a.runX1) / 2 + 80;
  const rzp = a.runZ + 40;
  for (let k = 0; k < 4; k++) add('box', 'metal', rxp + (k % 2 ? 1.2 : -1.2), 0, rzp + (k < 2 ? 1.2 : -1.2), 0.25, 18, 0.25, '#c8ccd0');
  for (let y = 2; y < 18; y += 3) add('box', 'metal', rxp, y, rzp, 2.6, 0.15, 2.6, '#c8ccd0');
  add('box', 'metal', rxp, 18.4, rzp, 12, 1.6, 0.6, '#e8e8e8', 0.6);
  add('sphere', 'glow', rxp, 20, rzp, 0.5, 0.5, 0.5, '#ff2020');
  void r;
  void out;
  void paint;
}

function landside(add: Add, a: AirportPlan, r: (k: number) => number, tree: (x: number, z: number, k: number) => void, paint: (x: number, z: number, w: number, d: number, col?: string, rot?: number, y?: number) => void) {
  // the forecourt: paving between the kerb and the terminal, a taxi rank and buses at the kerb
  const t = a.term;
  add('box', 'marble', (t.x0 + t.x1) / 2, 0, (a.curbZ + 7 + t.z0) / 2, t.x1 - t.x0 + 30, 0.25, t.z0 - a.curbZ - 7, '#ddd8cc');
  for (let k = 0; k < 8; k++) {
    const x = t.x0 + 30 + k * 8;
    add('box', 'metal', x, 0.42, a.curbZ - 3.5, 1.9, 1.2, 4.4, '#f2c21a');
    add('box', 'dark', x, 1.6, a.curbZ - 3.5, 1.7, 0.6, 2.4, '#2a3440');
  }
  for (let k = 0; k < 3; k++) {
    const x = t.x1 - 30 - k * 16;
    add('box', 'plaster', x, 0.42, a.curbZ - 3.8, 2.6, 3.2, 12, '#f4f4f2');
    add('box', 'dark', x, 1.6, a.curbZ - 3.8, 2.65, 1.4, 11, '#2a3440');
    add('box', 'plaster', x, 0.42, a.curbZ - 3.8, 2.62, 0.6, 12, '#b0122a');
  }
  // car parks: three decks of parked cars with ramps, lit at the edges
  const carCols = ['#e8e8e8', '#202226', '#9a1e1e', '#3a5a8a', '#c0c4c8', '#1e3a2a', '#c8a050'];
  for (const [pi, p] of a.parks.entries()) {
    const cx = (p.x0 + p.x1) / 2;
    const cz = (p.z0 + p.z1) / 2;
    const w = p.x1 - p.x0 - 8;
    const d = p.z1 - p.z0 - 4;
    for (let lv = 0; lv < 3; lv++) {
      const y = lv * 3.2;
      add('box', 'stone', cx, y, cz, w, 0.4, d, '#b8b4ac');
      add('box', 'stone', cx, y + 0.4, p.z0 + 2.2, w, 1, 0.3, '#d8d2c4');
      add('box', 'glow', cx, y + 1.45, p.z0 + 2.1, w, 0.08, 0.05, '#fff2d6');
      for (let x = p.x0 + 6; x < p.x1 - 6; x += 2.8)
        for (const zz of [cz - d / 4, cz + d / 4])
          if (r(pi * 1000 + lv * 100 + x + zz) < 0.72) add('box', 'metal', x, y + 0.4, zz, 1.8, 1.3, 4.3, carCols[Math.floor(r(500 + x + lv + zz) * carCols.length)]);
      for (let x = p.x0 + 4; x <= p.x1 - 4; x += 9) for (const zz of [p.z0 + 2.4, p.z1 - 2.4]) add('box', 'stone', x, y, zz, 0.6, 3.2, 0.6, '#c8c2b4');
    }
    add('box', 'stone', cx, 9.6, cz, w, 0.3, d, '#a8a49c');
    for (const s of [-1, 1]) {
      add('cyl', 'metal', cx + s * w * 0.3, 9.9, cz, 0.2, 5, 0.2, '#3a3e44');
      add('box', 'glow', cx + s * w * 0.3, 14.9, cz, 1.2, 0.2, 0.6, '#fff2d6');
    }
    add('box', 'glow', p.x0 + 6, 7, p.z0 + 2, 2.4, 2.4, 0.08, '#3a6aff');
  }
  // the gateway: a lit sign beside the access road where it reaches the airport
  add('box', 'stone', a.xa + 14, 0, a.rect.z0 + 18, 2, 6, 12, '#e2dac8');
  add('box', 'glow', a.xa + 13, 2.5, a.rect.z0 + 18, 0.05, 2, 10, '#ffd27a');
  for (let z = a.rect.z0 + 4; z < a.curbZ - 10; z += 10) for (const s of [-1, 1]) tree(a.xa + s * 12, z, 700 + z + s);
  void paint;
}

/** Apron floodlight masts: a tall pole, a head of lamps facing the stands, light pooling after dark. */
function floodlights(add: Add, a: AirportPlan) {
  const z = a.apronZ1 - 3;
  const x0 = Math.min(a.conc.x0, a.cargo.x0, a.hangars[0].x0);
  const x1 = Math.max(a.conc.x1, a.cargo.x1, a.hangars[1].x1);
  for (let x = x0; x <= x1 + 0.1; x += 62) {
    add('cyl', 'metal', x, 0, z, 1.4, 1, 1.4, '#9aa0a8');
    add('cyl', 'metal', x, 1, z, 0.7, 27, 0.7, '#c8ccd0');
    add('box', 'metal', x, 27.5, z - 0.4, 6, 2.2, 0.8, '#5a6068');
    for (let q = -2; q <= 2; q++) add('box', 'glow', x + q * 1.15, 27.8, z - 0.85, 0.9, 1.4, 0.05, '#fff4dc');
    add('beamCone', 'nightBeam', x, 0.2, z - 22, 34, 27.3, 30, '#fff2d6');
  }
}

function fence(add: Add, a: AirportPlan) {
  // the airside fence: posts every 12 m with mesh panels, around everything beyond the terminal
  const R: ARect = { x0: a.rect.x0 + 6, x1: a.rect.x1 - 6, z0: a.conc.z0 - 6, z1: a.rect.z1 - 6 };
  const run = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / 12));
    const rot = Math.atan2(x1 - x0, z1 - z0);
    for (let k = 0; k <= n; k++) add('cyl', 'metal', x0 + ((x1 - x0) * k) / n, 0, z0 + ((z1 - z0) * k) / n, 0.12, 3, 0.12, '#8a8e94');
    add('box', 'net', (x0 + x1) / 2, 0, (z0 + z1) / 2, 0.05, 2.8, len, '#9aa0a8', rot);
  };
  run(R.x0, R.z1, R.x1, R.z1);
  run(R.x0, R.z0, R.x0, R.z1);
  run(R.x1, R.z0, R.x1, R.z1);
  // the airside line between the terminal ends and the fence
  run(R.x0, R.z0, Math.min(a.conc.x0, a.cargo.x0, a.hangars[0].x0) - 8, R.z0);
  run(Math.max(a.conc.x1, a.cargo.x1, a.hangars[1].x1) + 8, R.z0, R.x1, R.z0);
}

