import * as THREE from 'three';
import type { Collider, Layout } from './layout';
import type { TerrainData } from './terrain';

/**
 * Multi-level road network for futuristic cities: an elevated ring road
 * around the city, two expressways on different decks that cross the city
 * along off-centre avenues and meet in a stacked interchange, on/off ramps
 * from the ring down to the countryside, and ground-level boulevards.
 */
export type RoadKind = 'ring' | 'express' | 'ramp' | 'street';

export interface Road {
  kind: RoadKind;
  /** World positions (y is absolute height of the road surface). */
  pts: THREE.Vector3[];
  /** Cumulative distance along the road at each point. */
  dist: number[];
  width: number;
  /** Lanes per direction. */
  lanes: number;
  closed: boolean;
  /** Draw a deck, barriers and pillars (false for ground streets). */
  elevated: boolean;
}

export interface HighwayData {
  roads: Road[];
  pillars: { x: number; z: number; h: number; y: number; w: number; ang: number }[];
  colliders: Collider[];
  /**
   * Walkable deck surface under a walker at (x, z) with feet at height y:
   * the highest deck surface no more than a step above the feet, or null.
   */
  surface: (x: number, z: number, y: number) => number | null;
  /** True where a walker on a deck would run into the central median barrier. */
  blocked: (x: number, z: number, y: number) => boolean;
}

function finishRoad(kind: RoadKind, raw: THREE.Vector3[], width: number, lanes: number, closed: boolean, elevated: boolean): Road {
  // densify to ~6 m steps so decks follow curves and height changes smoothly
  const pts: THREE.Vector3[] = [];
  const n = closed ? raw.length : raw.length - 1;
  for (let i = 0; i < n; i++) {
    const a = raw[i];
    const b = raw[(i + 1) % raw.length];
    const steps = Math.max(1, Math.ceil(a.distanceTo(b) / 6));
    for (let k = 0; k < steps; k++) pts.push(a.clone().lerp(b, k / steps));
  }
  pts.push(closed ? raw[0].clone() : raw[raw.length - 1].clone());
  const dist = [0];
  for (let i = 1; i < pts.length; i++) dist.push(dist[i - 1] + pts[i].distanceTo(pts[i - 1]));
  return { kind, pts, dist, width, lanes, closed, elevated };
}

export function generateHighways(layout: Layout, t: TerrainData): HighwayData | null {
  if (layout.style !== 'futuristic' || layout.radius <= 0) return null;
  if (layout.features) return corridorHighways(layout, t);
  const y0 = t.flatHeight;
  const R = layout.radius;
  const roads: Road[] = [];
  // grid spacing from the street network
  let spacing = Infinity;
  for (const s of layout.streets) for (const v of [s.a[0], s.a[1]]) if (Math.abs(v) > 1) spacing = Math.min(spacing, Math.abs(v));
  if (!isFinite(spacing)) spacing = 40;
  // expressways must not cross landmarks or pass over the stadium and arena roofs
  const venues = layout.buildings.filter((b) => b.kind === 'stadium' || b.kind === 'arena');
  const clearOfLandmarks = (vertical: boolean, c: number) =>
    layout.landmarks.every((l) => Math.abs((vertical ? l.x : l.z) - c) > l.radius + 10) && venues.every((v) => Math.abs((vertical ? v.x : v.z) - c) > (vertical ? v.w : v.d) / 2 + 8);
  // the first clear avenue; with stadiums in the way an expressway may have none, and is left out
  // rather than being driven over a roof
  const pickAvenue = (vertical: boolean, prefer: number[]) => prefer.map((k) => k * spacing).find((c) => clearOfLandmarks(vertical, c) && Math.abs(c) < R - 20) ?? null;
  const ax = pickAvenue(true, [2, -2, 3, -3, 1, -1, 4, -4, 5, -5]);
  const az = pickAvenue(false, [-2, 2, -3, 3, -1, 1, -4, 4, 5, -5]);

  const ringR = R + 26;
  const ringY = (x: number, z: number) => Math.max(y0 + 8, t.height(x, z) + 6);
  // ── ring road (level 1)
  const ring: THREE.Vector3[] = [];
  const seg = 56;
  for (let k = 0; k < seg; k++) {
    const a = (k / seg) * Math.PI * 2;
    const x = Math.cos(a) * ringR;
    const z = Math.sin(a) * ringR;
    ring.push(new THREE.Vector3(x, ringY(x, z), z));
  }
  roads.push(finishRoad('ring', ring, 18, 2, true, true));

  // ── expressways (levels 2 and 3), rising out of the ring at each end
  const express = (vertical: boolean, c: number, h: number) => {
    const pts: THREE.Vector3[] = [];
    const ext = Math.sqrt(Math.max(0, ringR * ringR - c * c));
    for (let s = -ext; s <= ext + 0.01; s += 8) {
      const x = vertical ? c : s;
      const z = vertical ? s : c;
      // ramp from ring height up to the deck height over the 70 m inside the ring
      const edge = ext - Math.abs(s);
      const k = Math.min(1, edge / 70);
      const e = k * k * (3 - 2 * k);
      pts.push(new THREE.Vector3(x, ringY(x, z) * (1 - e) + (y0 + h) * e, z));
    }
    roads.push(finishRoad('express', pts, 13, 2, false, true));
  };
  if (ax !== null) express(true, ax, 13);
  if (az !== null) express(false, az, 20);

  // ── ramps from the ring down to ground level in the countryside
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    const pts: THREE.Vector3[] = [];
    for (let d = 0; d <= 80; d += 10) {
      const r = ringR + d;
      const tangent = (d / 80) * 0.35;
      const x = Math.cos(a + tangent) * r;
      const z = Math.sin(a + tangent) * r;
      const f = d / 80;
      pts.push(new THREE.Vector3(x, ringY(x, z) * (1 - f) + (t.height(x, z) + 0.3) * f, z));
    }
    if (pts[pts.length - 1].distanceTo(new THREE.Vector3()) < t.size * 0.47) roads.push(finishRoad('ramp', pts, 9, 1, false, true));
  }

  // ── ground boulevards on the two central avenues
  // (split around the central plaza so traffic never drives through it)
  for (const vertical of [true, false])
    for (const sgn of [-1, 1]) {
      const p0 = sgn * 36;
      const p1 = sgn * (R - 6);
      const pts = [new THREE.Vector3(vertical ? 0 : p0, y0 + 0.08, vertical ? p0 : 0), new THREE.Vector3(vertical ? 0 : p1, y0 + 0.08, vertical ? p1 : 0)];
      roads.push(finishRoad('street', pts, 12, 1, false, false));
    }

  // ── pillars every ~24 m under elevated decks, kept off the plaza and landmarks
  const pillars: HighwayData['pillars'] = [];
  const colliders: Collider[] = [];
  for (const r of roads) {
    if (!r.elevated) continue;
    let next = 10;
    for (let i = 1; i < r.pts.length; i++) {
      if (r.dist[i] < next) continue;
      next = r.dist[i] + (r.kind === 'ramp' ? 18 : 24);
      const p = r.pts[i];
      const ground = t.height(p.x, p.z);
      const h = p.y - 1.4 - ground;
      if (h < 2.5) continue;
      if (Math.hypot(p.x, p.z) < 34) continue;
      if (layout.landmarks.some((l) => Math.hypot(l.x - p.x, l.z - p.z) < l.radius + 3)) continue;
      // decks span parks and villa gardens without standing in them
      if (layout.buildings.some((b) => (b.kind === 'park' || b.kind === 'stadium' || b.kind === 'arena' || b.plot) && Math.abs(p.x - (b.plot?.x ?? b.x)) < (b.plot?.w ?? b.w) / 2 && Math.abs(p.z - (b.plot?.z ?? b.z)) < (b.plot?.d ?? b.d) / 2)) continue;
      const q = r.pts[i - 1];
      const ang = Math.atan2(p.x - q.x, p.z - q.z);
      pillars.push({ x: p.x, z: p.z, h, y: ground, w: r.width, ang });
      colliders.push({ type: 'circle', x: p.x, z: p.z, hw: 1.2, hd: 0, top: ground + h });
    }
  }
  const sampler = deckSampler(roads);
  return { roads, pillars, colliders, surface: sampler.surface, blocked: sampler.blocked };
}

/**
 * Highways of a coastal corridor city (see layout `futuristic`): the spine expressway along the
 * coast on pillars over its ground boulevard and the metro, a second expressway inland over the
 * canal, connectors crossing above the spine at a third level, ramps down to the countryside at
 * the ends, and ground boulevards (coastal road, spine, arterial) with traffic.
 */
function corridorHighways(layout: Layout, t: TerrainData): HighwayData {
  const f = layout.features!;
  const y0 = t.flatHeight;
  const R = layout.radius;
  const chord = (z: number) => Math.sqrt(Math.max(0, R * R - z * z));
  const roads: Road[] = [];
  const inWorld = (x: number, z: number) => Math.abs(x) < t.size * 0.47 && Math.abs(z) < t.size * 0.47;
  const level = (x: number, z: number, h: number) => Math.max(y0 + h, t.height(x, z) + h * 0.6);
  // a straight elevated road along x with ramps down to the ground at both ends
  const alongX = (z: number, h: number, half: number, width: number, lanes: number) => {
    const pts: THREE.Vector3[] = [];
    for (let x = -half; x <= half + 0.01; x += 8) pts.push(new THREE.Vector3(x, level(x, z, h), z));
    roads.push(finishRoad('express', pts, width, lanes, false, true));
    for (const s of [-1, 1]) {
      const ramp: THREE.Vector3[] = [];
      for (let d = 0; d <= 96; d += 8) {
        const x = s * (half + d);
        if (!inWorld(x, z)) break;
        const k = d / 96;
        ramp.push(new THREE.Vector3(x, level(s * half, z, h) * (1 - k) + (t.height(x, z) + 0.3) * k, z));
      }
      if (ramp.length > 3) roads.push(finishRoad('ramp', s > 0 ? ramp : ramp, width - 4, 1, false, true));
    }
  };
  alongX(f.spineZ, 13, chord(f.spineZ) + 30, 15, 3);
  const inlandZ = f.arterialZ - 36;
  alongX(inlandZ, 10, chord(inlandZ) + 24, 13, 2);
  // connectors from the coastal belt over the spine (a third level) down into the inland band
  const venues = layout.buildings.filter((b) => b.kind === 'stadium' || b.kind === 'arena');
  const za = f.coastRoadZ + 20;
  const zb = inlandZ - 14;
  const clear = (x: number) =>
    layout.landmarks.every((l) => Math.abs(l.x - x) > l.radius + 10 || l.z < za || l.z > zb) &&
    venues.every((v) => Math.abs(v.x - x) > v.w / 2 + 8 || v.z - v.d / 2 > zb || v.z + v.d / 2 < za) &&
    f.lakes.every((l) => Math.abs(l.x - x) > l.rx + 8 || l.z + l.rz < za || l.z - l.rz > zb) &&
    (!f.downtown || x < f.downtown.x0 - 4 || x > f.downtown.x1 + 4);
  const candidates = f.downtown ? [f.downtown.x0 - 36, f.downtown.x1 + 36, f.downtown.x0 - 72, f.downtown.x1 + 72] : [-72, 72, -108, 108];
  const chosen: number[] = [];
  for (const x of candidates) if (chosen.length < 2 && clear(x) && chosen.every((c) => Math.abs(c - x) > 60) && Math.abs(x) < chord(f.spineZ) - 30) chosen.push(x);
  for (const x of chosen) {
    const pts: THREE.Vector3[] = [];
    const up0 = za;
    const up1 = f.spineZ - 30;
    const dn0 = f.spineZ + 30;
    const dn1 = zb;
    for (let z = za; z <= zb + 0.01; z += 8) {
      const ground = t.height(x, z) + 0.3;
      let k = 1;
      if (z < up1) k = (z - up0) / (up1 - up0);
      else if (z > dn0) k = 1 - (z - dn0) / (dn1 - dn0);
      k = Math.max(0, Math.min(1, k));
      const e = k * k * (3 - 2 * k);
      pts.push(new THREE.Vector3(x, ground * (1 - e) + (y0 + 20) * e, z));
    }
    roads.push(finishRoad('express', pts, 13, 2, false, true));
  }
  // ground boulevards with traffic
  for (const z of [f.coastRoadZ, f.spineZ, f.arterialZ]) {
    const half = chord(z) - 8;
    if (half < 40) continue;
    roads.push(finishRoad('street', [new THREE.Vector3(-half, y0 + 0.08, z), new THREE.Vector3(half, y0 + 0.08, z)], 12, 1, false, false));
  }
  // pillars every ~24 m, kept off parks, gardens, venues, lakes and landmarks
  const pillars: HighwayData['pillars'] = [];
  const colliders: Collider[] = [];
  for (const r of roads) {
    if (!r.elevated) continue;
    let next = 10;
    for (let i = 1; i < r.pts.length; i++) {
      if (r.dist[i] < next) continue;
      next = r.dist[i] + (r.kind === 'ramp' ? 18 : 24);
      const p = r.pts[i];
      const ground = t.height(p.x, p.z);
      const h = p.y - 1.4 - ground;
      if (h < 2.5) continue;
      if (layout.landmarks.some((l) => Math.hypot(l.x - p.x, l.z - p.z) < l.radius + 3)) continue;
      if (f.lakes.some((l) => ((p.x - l.x) / (l.rx + 2)) ** 2 + ((p.z - l.z) / (l.rz + 2)) ** 2 < 1)) continue;
      if (layout.buildings.some((b) => (b.kind === 'park' || b.kind === 'stadium' || b.kind === 'arena' || b.plot) && Math.abs(p.x - (b.plot?.x ?? b.x)) < (b.plot?.w ?? b.w) / 2 && Math.abs(p.z - (b.plot?.z ?? b.z)) < (b.plot?.d ?? b.d) / 2)) continue;
      const q = r.pts[i - 1];
      const ang = Math.atan2(p.x - q.x, p.z - q.z);
      pillars.push({ x: p.x, z: p.z, h, y: ground, w: r.width, ang });
      colliders.push({ type: 'circle', x: p.x, z: p.z, hw: 1.2, hd: 0, top: ground + h });
    }
  }
  const sampler = deckSampler(roads);
  return { roads, pillars, colliders, surface: sampler.surface, blocked: sampler.blocked };
}

/** Position and heading at distance d along a road (wrapping for closed roads). */
export function sampleRoad(r: Road, d: number, out: THREE.Vector3): number {
  const total = r.dist[r.dist.length - 1];
  if (r.closed) d = ((d % total) + total) % total;
  else d = Math.max(0, Math.min(total, d));
  let lo = 0;
  let hi = r.dist.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (r.dist[mid] <= d) lo = mid;
    else hi = mid;
  }
  const a = r.pts[lo];
  const b = r.pts[hi];
  const span = r.dist[hi] - r.dist[lo] || 1;
  out.copy(a).lerp(b, (d - r.dist[lo]) / span);
  return Math.atan2(b.x - a.x, b.z - a.z);
}

/**
 * Spatial index over the elevated deck segments. A point is on a deck when it
 * lies within the deck's width (inside the barriers); the surface height is
 * interpolated along the segment.
 */
export function deckSampler(roads: Road[]): { surface: (x: number, z: number, y: number) => number | null; blocked: (x: number, z: number, y: number) => boolean } {
  const CELL = 12;
  type Seg = { ax: number; az: number; ay: number; bx: number; bz: number; by: number; hw: number; median: boolean };
  const grid = new Map<number, Seg[]>();
  for (const r of roads) {
    if (!r.elevated) continue;
    const hw = r.width / 2 - 0.35;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const a = r.pts[i];
      const b = r.pts[i + 1];
      const seg: Seg = { ax: a.x, az: a.z, ay: a.y, bx: b.x, bz: b.z, by: b.y, hw, median: r.lanes >= 2 };
      const x0 = Math.floor((Math.min(a.x, b.x) - hw) / CELL);
      const x1 = Math.floor((Math.max(a.x, b.x) + hw) / CELL);
      const z0 = Math.floor((Math.min(a.z, b.z) - hw) / CELL);
      const z1 = Math.floor((Math.max(a.z, b.z) + hw) / CELL);
      for (let gx = x0; gx <= x1; gx++)
        for (let gz = z0; gz <= z1; gz++) {
          const k = gx * 65536 + gz;
          const list = grid.get(k);
          if (list) list.push(seg);
          else grid.set(k, [seg]);
        }
    }
  }
  const blocked = (x: number, z: number, y: number) => {
    const list = grid.get(Math.floor(x / CELL) * 65536 + Math.floor(z / CELL));
    if (!list) return false;
    for (const s of list) {
      if (!s.median) continue;
      const dx = s.bx - s.ax;
      const dz = s.bz - s.az;
      const len2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / len2));
      const h = s.ay + (s.by - s.ay) * t;
      if (Math.abs(h - y) > 1) continue;
      if ((x - (s.ax + dx * t)) ** 2 + (z - (s.az + dz * t)) ** 2 < 0.6 * 0.6) return true;
    }
    return false;
  };
  const surface = (x: number, z: number, y: number) => {
    const list = grid.get(Math.floor(x / CELL) * 65536 + Math.floor(z / CELL));
    if (!list) return null;
    let best: number | null = null;
    for (const s of list) {
      const dx = s.bx - s.ax;
      const dz = s.bz - s.az;
      const len2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / len2));
      const px = s.ax + dx * t;
      const pz = s.az + dz * t;
      if ((x - px) ** 2 + (z - pz) ** 2 > s.hw * s.hw) continue;
      const h = s.ay + (s.by - s.ay) * t;
      // only surfaces you could step onto from here: not decks far overhead
      if (h > y + 1.1) continue;
      if (best === null || h > best) best = h;
    }
    return best;
  };
  return { surface, blocked };
}

