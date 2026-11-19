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
  const y0 = t.flatHeight;
  const R = layout.radius;
  const roads: Road[] = [];
  // grid spacing from the street network
  let spacing = Infinity;
  for (const s of layout.streets) for (const v of [s.a[0], s.a[1]]) if (Math.abs(v) > 1) spacing = Math.min(spacing, Math.abs(v));
  if (!isFinite(spacing)) spacing = 40;
  const clearOfLandmarks = (vertical: boolean, c: number) => layout.landmarks.every((l) => Math.abs((vertical ? l.x : l.z) - c) > l.radius + 10);
  const pickAvenue = (vertical: boolean, prefer: number[]) => prefer.map((k) => k * spacing).find((c) => clearOfLandmarks(vertical, c) && Math.abs(c) < R - 20) ?? prefer[0] * spacing;
  const ax = pickAvenue(true, [2, -2, 3, -3, 1, -1]);
  const az = pickAvenue(false, [-2, 2, -3, 3, -1, 1]);

  const ringR = R + 32;
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
  express(true, ax, 13);
  express(false, az, 20);

  // ── ramps from the ring down to ground level in the countryside
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    const pts: THREE.Vector3[] = [];
    for (let d = 0; d <= 100; d += 10) {
      const r = ringR + d;
      const tangent = (d / 100) * 0.35;
      const x = Math.cos(a + tangent) * r;
      const z = Math.sin(a + tangent) * r;
      const f = d / 100;
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
      const q = r.pts[i - 1];
      const ang = Math.atan2(p.x - q.x, p.z - q.z);
      pillars.push({ x: p.x, z: p.z, h, y: ground, w: r.width, ang });
      colliders.push({ type: 'circle', x: p.x, z: p.z, hw: 1.2, hd: 0 });
    }
  }
  return { roads, pillars, colliders };
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
