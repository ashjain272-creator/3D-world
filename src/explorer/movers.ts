import type { DPiece } from './districts';

/**
 * Things that move along fixed routes: metro trains, water taxis, dhows, yachts. Each mover is a
 * set of pieces built around the origin with its front along local +z, and a pose function that
 * says where it is at time t (seconds). Poses are pure functions of time so every mover is in a
 * known place at any moment (tests and screenshots can ask).
 */
export interface Pose {
  x: number;
  y: number;
  z: number;
  /** Turn about y: the mover's front points along (sin yaw, cos yaw). */
  yaw: number;
  roll?: number;
  /** Nose up about the mover's own sideways axis (a coaster car going round a loop). */
  pitch?: number;
}

export interface Mover {
  pieces: DPiece[];
  pose: (t: number) => Pose | null;
}

export type P2 = [number, number];

const smooth = (u: number) => u * u * (3 - 2 * u);

/** Cumulative lengths along a polyline. */
function lengths(pts: P2[]): number[] {
  const d = [0];
  for (let i = 1; i < pts.length; i++) d.push(d[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return d;
}

/** Position and heading at distance s along a polyline. */
export function along(pts: P2[], dist: number[], s: number): { x: number; z: number; yaw: number } {
  const total = dist[dist.length - 1];
  s = Math.max(0, Math.min(total, s));
  let i = 1;
  while (i < dist.length - 1 && dist[i] < s) i++;
  const a = pts[i - 1];
  const b = pts[i];
  const seg = dist[i] - dist[i - 1] || 1;
  const u = (s - dist[i - 1]) / seg;
  return { x: a[0] + (b[0] - a[0]) * u, z: a[1] + (b[1] - a[1]) * u, yaw: Math.atan2(b[0] - a[0], b[1] - a[1]) };
}

/** The polyline moved sideways by `off` (positive to the right of travel). */
export function offset(pts: P2[], off: number): P2[] {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    // right of travel along +z is -x when facing +z with yaw 0: use (dz, -dx)
    return [p[0] + (dz / l) * off, p[1] + (-dx / l) * off] as P2;
  });
}

/** A closed loop: out along one side of the route, a U-turn, back along the other side. */
export function loopRoute(pts: P2[], half: number): P2[] {
  const out = offset(pts, half);
  const back = offset([...pts].reverse(), half);
  const turn = (from: P2, to: P2, centre: P2): P2[] => {
    const a0 = Math.atan2(from[0] - centre[0], from[1] - centre[1]);
    let a1 = Math.atan2(to[0] - centre[0], to[1] - centre[1]);
    while (a1 > a0) a1 -= Math.PI * 2;
    const rr = Math.hypot(from[0] - centre[0], from[1] - centre[1]);
    const n = 8;
    const res: P2[] = [];
    for (let k = 1; k < n; k++) {
      const a = a0 + ((a1 - a0) * k) / n;
      res.push([centre[0] + Math.sin(a) * rr, centre[1] + Math.cos(a) * rr]);
    }
    return res;
  };
  return [...out, ...turn(out[out.length - 1], back[0], pts[pts.length - 1]), ...back, ...turn(back[back.length - 1], out[0], pts[0]), out[0]];
}

/** Cruise round a closed route at a steady speed, bobbing on the water. */
export function cruise(route: P2[], speed: number, phase: number, y = 0, bob = 0): (t: number) => Pose {
  const dist = lengths(route);
  const total = dist[dist.length - 1];
  return (t) => {
    const s = (((t * speed + phase * total) % total) + total) % total;
    const p = along(route, dist, s);
    return { x: p.x, y: y + Math.sin(t * 1.3 + phase * 9) * bob, z: p.z, yaw: p.yaw, roll: Math.sin(t * 0.9 + phase * 5) * bob * 0.04 };
  };
}

/**
 * Shuttle back and forth along a route, easing in and out of each stop and waiting there: metro
 * trains between stations, water taxis between piers. `stops` are distances along the route.
 */
export function shuttle(route: P2[], stops: number[], speed: number, dwell: number, phase: number, y = 0, bob = 0): (t: number) => Pose {
  const dist = lengths(route);
  const total = dist[dist.length - 1];
  const st = [...new Set([0, ...stops.map((s) => Math.max(0, Math.min(total, s))), total])].sort((a, b) => a - b);
  // one way: legs between consecutive stops, each taking 1.4x its length / speed, then a dwell
  const legs: { from: number; to: number; time: number }[] = [];
  for (let i = 0; i < st.length - 1; i++) legs.push({ from: st[i], to: st[i + 1], time: ((st[i + 1] - st[i]) / speed) * 1.4 });
  const oneWay = legs.reduce((s, l) => s + l.time + dwell, 0);
  const cycle = oneWay * 2;
  return (t) => {
    let u = (((t + phase * cycle) % cycle) + cycle) % cycle;
    const back = u >= oneWay;
    if (back) u -= oneWay;
    let s = 0;
    for (const l of back ? [...legs].reverse() : legs) {
      const a = back ? l.to : l.from;
      const b = back ? l.from : l.to;
      if (u < dwell) {
        s = a;
        break;
      }
      u -= dwell;
      if (u < l.time) {
        s = a + (b - a) * smooth(u / l.time);
        break;
      }
      u -= l.time;
      s = b;
    }
    const p = along(route, dist, s);
    return { x: p.x, y: y + Math.sin(t * 1.5 + phase * 7) * bob, z: p.z, yaw: back ? p.yaw + Math.PI : p.yaw };
  };
}

/** A point on a ride's track: position, heading and pitch (pitch can run a full turn in a loop). */
export interface TrackPoint {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  /** Chain lift: the car is pulled up slowly here. */
  lift?: boolean;
}

/**
 * Ride a closed track like a coaster: crawl up the lift, then run at the speed the drop gives
 * (energy from the highest point), waiting at the station between circuits. `lag` puts cars of a
 * train behind one another (metres).
 */
export function coaster(track: TrackPoint[], dwell: number, lag: number): (t: number) => Pose {
  const n = track.length;
  const top = Math.max(...track.map((p) => p.y));
  const seg: number[] = [];
  const time: number[] = [0];
  for (let i = 0; i < n - 1; i++) {
    const a = track[i];
    const b = track[i + 1];
    const ds = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    seg.push(ds);
    const v = a.lift ? 3.2 : Math.max(4, Math.sqrt(16 + 2 * 9.81 * Math.max(0, top - (a.y + b.y) / 2)) * 0.85);
    time.push(time[i] + ds / v);
  }
  const run = time[n - 1];
  const cycle = run + dwell;
  const lagT = lag / 6;
  const lerpAng = (a: number, b: number, u: number) => {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * u;
  };
  return (t) => {
    let u = (((t - lagT) % cycle) + cycle) % cycle;
    if (u >= run) u = 0;
    let i = 0;
    while (i < n - 2 && time[i + 1] < u) i++;
    const f = (u - time[i]) / (time[i + 1] - time[i] || 1);
    const a = track[i];
    const b = track[i + 1];
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f, yaw: lerpAng(a.yaw, b.yaw, f), pitch: a.pitch + (b.pitch - a.pitch) * f };
  };
}
