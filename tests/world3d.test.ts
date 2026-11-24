import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { AIRCRAFT, airportRect, coastLine, desertFlats, generateLayout, mallGeometry, groundWildLayout, lineOfSight, settlementRadius, wildLayout, type Building, type Layout } from '../src/explorer/layout';
import { generateTerrain, type TerrainData } from '../src/explorer/terrain';
import { generateVegetation } from '../src/explorer/vegetation';
import { deckSampler, generateHighways, sampleRoad } from '../src/explorer/roadNetwork';
import { flightPose } from '../src/explorer/airport';
import { VILLA_STYLES, generateDistricts, villaStyle } from '../src/explorer/districts';
import type { Biome, World } from '../src/sim/types';
import { freshWorld } from './helpers';

const DESERT_KINDS = new Set(['village', 'temple', 'oasis', 'skeleton', 'obelisks', 'hoodoos', 'ruins', 'mesa', 'arch', 'well']);
const FROZEN_KINDS = new Set(['outpost', 'igloo-village', 'ice-cave', 'ice-arch', 'spires', 'igloo', 'ruins', 'tower']);

/** The wild (unsettled) explorer scene for the first region of each requested biome. */
function wildScenes(w: World, biomes: Biome[]): { biome: Biome; t: TerrainData; layout: Layout }[] {
  const out: { biome: Biome; t: TerrainData; layout: Layout }[] = [];
  for (const biome of biomes) {
    for (const p of Object.values(w.planets)) {
      const r = p.regions.find((x) => x.biome === biome && !Object.values(w.settlements).some((s) => s.planetId === p.id && s.regionIndex === x.index));
      if (!r) continue;
      const t = generateTerrain(p, r.index, r.biome, 0);
      out.push({ biome, t, layout: groundWildLayout(wildLayout(p.id, r.index, t.seed, r.name), t) });
      break;
    }
  }
  return out;
}

describe('explorer wilds: vegetation and structures', () => {
  const w = freshWorld();
  const scenes = wildScenes(w, ['forest', 'grassland', 'jungle', 'desert', 'tundra', 'mountain']);

  it('finds wild scenes for most biomes in a fresh universe', () => {
    expect(scenes.length).toBeGreaterThanOrEqual(4);
  });

  it('is deterministic', () => {
    for (const s of scenes) {
      const a = generateVegetation(s.t, s.layout, 'medium');
      const b = generateVegetation(s.t, s.layout, 'medium');
      expect(Object.keys(a.parts).sort()).toEqual(Object.keys(b.parts).sort());
      for (const k of Object.keys(a.parts) as (keyof typeof a.parts)[]) {
        expect(a.parts[k]!.length).toBe(b.parts[k]!.length);
        if (a.parts[k]!.length) expect(a.parts[k]![0].m.elements).toEqual(b.parts[k]![0].m.elements);
      }
      expect(a.structures.footprints).toEqual(b.structures.footprints);
    }
  });

  it('builds structures that suit the biome', () => {
    for (const s of scenes) {
      const v = generateVegetation(s.t, s.layout, 'medium');
      const kinds = v.structures.footprints.map((f) => f.kind ?? '');
      for (const k of kinds) expect(k.length).toBeGreaterThan(0);
      if (s.t.look.vegetation === 'cactus') for (const k of kinds) expect(DESERT_KINDS.has(k)).toBe(true);
      if ((s.t.look.snow ?? 0) >= 0.45) {
        for (const k of kinds) expect(FROZEN_KINDS.has(k)).toBe(true);
        // a campfire in the igloo village smokes
        if (kinds.includes('igloo-village')) expect(v.structures.smoke.length).toBeGreaterThan(0);
      }
      // every collider of a structure sits inside one of the footprints (nothing stray in the open)
      for (const c of v.structures.colliders) expect(v.structures.footprints.some((f) => Math.hypot(f.x - c.x, f.z - c.z) <= f.r + 16)).toBe(true);
    }
  });

  it('puts the spawn point and landmarks on dry ground', () => {
    for (const s of scenes) {
      if (s.t.waterLevel === null) continue;
      expect(s.t.height(s.layout.spawn.x, s.layout.spawn.z)).toBeGreaterThan(s.t.waterLevel + 1);
      for (const l of s.layout.landmarks) expect(s.t.height(l.x, l.z)).toBeGreaterThan(s.t.waterLevel + 1);
      const mono = s.layout.landmarks.find((l) => l.kind === 'monolith')!;
      expect(s.layout.colliders.some((c) => c.x === mono.x && c.z === mono.z)).toBe(true);
    }
  });

  it('keeps the spawn point clear of structures and trees', () => {
    for (const s of scenes) {
      const v = generateVegetation(s.t, s.layout, 'medium');
      for (const f of v.structures.footprints) expect(Math.hypot(f.x - s.layout.spawn.x, f.z - s.layout.spawn.z)).toBeGreaterThan(f.r + 20);
      // no tree or rock collider overlaps the player at spawn
      for (const c of v.colliders) {
        const d = c.type === 'circle' ? Math.hypot(c.x - s.layout.spawn.x, c.z - s.layout.spawn.z) - c.hw : Math.max(Math.abs(c.x - s.layout.spawn.x) - c.hw, Math.abs(c.z - s.layout.spawn.z) - c.hd);
        expect(d).toBeGreaterThan(0.6);
      }
    }
  });
});

describe('explorer road network', () => {
  const w = freshWorld();
  const city = Object.values(w.settlements).find((s) => generateLayout(s).style === 'futuristic')!;
  const layout = generateLayout(city);
  const p = w.planets[city.planetId];
  const t = generateTerrain(p, city.regionIndex, p.regions[city.regionIndex].biome, settlementRadius(city) + 20, coastLine(city));
  const hw = generateHighways(layout, t)!;

  it('only futuristic cities get highways', () => {
    const other = Object.values(w.settlements).find((s) => generateLayout(s).style !== 'futuristic')!;
    const op = w.planets[other.planetId];
    const ot = generateTerrain(op, other.regionIndex, op.regions[other.regionIndex].biome, settlementRadius(other) + 20);
    expect(generateHighways(generateLayout(other), ot)).toBeNull();
    expect(hw).not.toBeNull();
  });

  it('runs expressways along the coastal corridor on several levels, with ramps and pillars', () => {
    const count = (k: string) => hw.roads.filter((r) => r.kind === k).length;
    const f = layout.features!;
    // the spine and the inland expressway run along the coast, the connectors cross them
    const express = hw.roads.filter((r) => r.kind === 'express');
    expect(express.length).toBeGreaterThanOrEqual(3);
    const alongCoast = express.filter((r) => Math.abs(r.pts[0].z - r.pts[r.pts.length - 1].z) < 1);
    expect(alongCoast.some((r) => Math.abs(r.pts[0].z - f.spineZ) < 1)).toBe(true);
    expect(count('ramp')).toBe(4);
    expect(hw.pillars.length).toBeGreaterThan(10);
    // where a connector crosses the spine it is a level above it
    const spine = alongCoast.find((r) => Math.abs(r.pts[0].z - f.spineZ) < 1)!;
    const connector = express.find((r) => Math.abs(r.pts[0].x - r.pts[r.pts.length - 1].x) < 1)!;
    const cross = connector.pts.reduce((p, q) => (Math.abs(q.z - f.spineZ) < Math.abs(p.z - f.spineZ) ? q : p));
    const under = spine.pts.reduce((p, q) => (Math.abs(q.x - cross.x) < Math.abs(p.x - cross.x) ? q : p));
    expect(cross.y - under.y).toBeGreaterThan(4);
    for (const c of hw.colliders) expect(c.top!).toBeGreaterThan(t.height(c.x, c.z) + 2);
  });

  it('samples positions along a road and wraps closed loops', () => {
    const ramp = hw.roads.find((r) => r.kind === 'ramp')!;
    const a = new THREE.Vector3();
    sampleRoad(ramp, -50, a);
    expect(a.distanceTo(ramp.pts[0])).toBeLessThan(1e-6);
    const loop = { ...ramp, closed: true };
    const total = loop.dist[loop.dist.length - 1];
    const b = new THREE.Vector3();
    sampleRoad(loop, 5, a);
    sampleRoad(loop, total + 5, b);
    expect(a.distanceTo(b)).toBeLessThan(1e-6);
  });

  it('gives walkers a deck surface and a median barrier', () => {
    const decks = deckSampler(hw.roads);
    const e = hw.roads.find((r) => r.kind === 'express')!;
    const i = Math.floor(e.pts.length / 2);
    const a = e.pts[i];
    const b = e.pts[i + 1];
    const cx = (a.x + b.x) / 2;
    const cz = (a.z + b.z) / 2;
    const h = (a.y + b.y) / 2;
    // standing on the deck: the surface is under the feet
    expect(decks.surface(cx + 0.01, cz + 0.01, h)).toBeCloseTo(h, 0);
    // walking at street level underneath: the deck overhead is not a floor
    expect(decks.surface(cx, cz, t.flatHeight)).toBeNull();
    // the central barrier blocks on a two-way deck, the lanes beside it do not
    expect(decks.blocked(cx, cz, h)).toBe(true);
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const sx = cx + (-dz / len) * 3;
    const sz = cz + (dx / len) * 3;
    expect(decks.blocked(sx, sz, h)).toBe(false);
    expect(decks.surface(sx, sz, h)).not.toBeNull();
    // beyond the barriers there is no deck
    const ox = cx + (-dz / len) * (e.width / 2 + 2);
    const oz = cz + (dx / len) * (e.width / 2 + 2);
    expect(decks.surface(ox, oz, h)).toBeNull();
  });
});

describe('line of sight', () => {
  const b: Building = { x: 0, z: 0, w: 10, d: 10, h: 20, rot: 0, kind: 'block', role: 'work', tone: 0.5, door: [0, 5] };
  const flat = () => 0;
  it('is blocked by a building in between', () => {
    expect(lineOfSight([b], flat, -20, 2, 0, 20, 2, 0)).toBe(false);
  });
  it('is clear beside or above the building', () => {
    expect(lineOfSight([b], flat, -20, 2, 12, 20, 2, 12)).toBe(true);
    expect(lineOfSight([b], flat, -20, 40, 0, 20, 40, 0)).toBe(true);
    expect(lineOfSight([], flat, -20, 2, 0, 20, 2, 0)).toBe(true);
  });
});

describe('futuristic districts', () => {
  const w = freshWorld();
  const cities = Object.values(w.settlements).filter((s) => generateLayout(s).style === 'futuristic');

  it('never overlaps two buildings in a futuristic city, and puts roundabouts on collector crossings', () => {
    for (const s of cities) {
      const l = generateLayout(s);
      const solid = l.buildings.filter((b) => !b.plot && b.kind !== 'park' && b.kind !== 'stadium' && b.kind !== 'arena');
      for (let i = 0; i < solid.length; i++)
        for (let j = i + 1; j < solid.length; j++) {
          const a = solid[i];
          const b = solid[j];
          const ox = (a.w + b.w) / 2 - Math.abs(a.x - b.x);
          const oz = (a.d + b.d) / 2 - Math.abs(a.z - b.z);
          if (ox > 0.5 && oz > 0.5) throw new Error(`${s.kind}: ${a.kind}@${a.x.toFixed(0)},${a.z.toFixed(0)} overlaps ${b.kind}@${b.x.toFixed(0)},${b.z.toFixed(0)}`);
        }
      if (s.kind === 'capital') {
        expect(l.radius).toBeGreaterThanOrEqual(500);
        expect(l.features!.roundabouts.length).toBeGreaterThan(2);
        // every roundabout sits on a street crossing
        for (const [x, z] of l.features!.roundabouts) expect(l.streets.filter((st) => (st.a[0] === x && st.a[1] === z) || (st.b[0] === x && st.b[1] === z)).length).toBe(4);
      }
    }
  });

  it('makes the palm island one royal estate round a walk-in palace', () => {
    const s = cities.find((c) => c.kind === 'capital')!;
    const l = generateLayout(s);
    const f = l.features!;
    const p = f.palm!;
    expect(p).toBeDefined();
    const dist = (x: number, z: number, [ax, az, bx, bz]: number[]) => {
      const dx = bx - ax;
      const dz = bz - az;
      const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      return Math.hypot(x - ax - dx * u, z - az - dz * u);
    };
    // out in the sea, clear of the creek and marina mouths; fronds inside the crescent and apart
    expect(p.zBase).toBeLessThan(f.shoreZ);
    for (const w of f.waters) {
      if (w.kind === 'canal') continue;
      const mouth = w.pts.reduce((a, b) => (b[1] < a[1] ? b : a));
      expect(Math.abs(mouth[0] - p.xp)).toBeGreaterThan(p.crescent.r + p.crescent.w / 2);
    }
    expect(p.fronds.length).toBe(12);
    for (const fr of p.fronds) expect(Math.hypot(fr.bx - p.crescent.cx, fr.bz - p.crescent.cz) + fr.w / 2).toBeLessThan(p.crescent.r - p.crescent.w / 2);
    // one estate: no houses, flats or hotels on the island; the palace stands on its terrace
    expect(l.buildings.filter((b) => (b.plot?.z ?? b.z) < f.shoreZ)).toEqual([]);
    const pal = p.palace;
    expect(pal.w).toBeGreaterThanOrEqual(90);
    expect(pal.d).toBeGreaterThanOrEqual(110);
    const onLand = (x: number, z: number) => p.land.some((c) => dist(x, z, c) < c[4] - 2);
    for (const [dx, dz] of [[0, 0], [pal.w / 2 + 20, pal.d / 2], [-pal.w / 2 - 20, -pal.d / 2], [0, pal.d / 2 + 25 + 26 + 17]]) expect(onLand(pal.x + dx, pal.z + dz)).toBe(true);
    // level ground under the terrace and the forecourt
    const pl = w.planets[s.planetId];
    const t = generateTerrain(pl, s.regionIndex, pl.regions[s.regionIndex].biome, l.radius + 20, coastLine(s), airportRect(s) ? [airportRect(s)!] : undefined, p.land);
    for (const [dx, dz] of [[0, 0], [40, 50], [-40, -50], [0, 110]]) expect(Math.abs(t.height(pal.x + dx, pal.z + dz) - t.flatHeight)).toBeLessThan(0.1);
    // the road runs from the coast to the forecourt, and you can walk from there through the portal
    // into the courtyard; the wings and towers are solid
    const hit = (x: number, z: number) => l.colliders.some((c) => (c.type === 'circle' ? Math.hypot(c.x - x, c.z - z) < c.hw + 0.3 : Math.abs(c.x - x) < c.hw + 0.3 && Math.abs(c.z - z) < c.hd + 0.3));
    for (let z = pal.z + pal.d / 2 + 25; z > pal.z; z -= 0.5) expect(hit(pal.x, z), `blocked at ${z.toFixed(1)}`).toBe(false);
    expect(hit(pal.x + 30, pal.z + pal.d / 2 - 5)).toBe(true);
    expect(hit(pal.x - pal.w / 2 + 5, pal.z)).toBe(true);
    expect(hit(pal.x, pal.z - pal.d / 2 + 5)).toBe(true);
    // the palace is drawn with real detail: thousands of pieces round its centre, golden domes
    const d = generateDistricts(l, 0, true);
    const near = d.pieces.filter((q) => Math.abs(q.x - pal.x) < pal.w / 2 + 25 && Math.abs(q.z - pal.z) < pal.d / 2 + 30);
    expect(near.length).toBeGreaterThan(3000);
    expect(near.filter((q) => q.shape === 'hemi' && q.mat === 'gold').length).toBeGreaterThanOrEqual(10);
  });

  it('builds a walk-in theme park whose rides move inside its walls', () => {
    for (const s of cities.filter((c) => c.kind === 'capital' || c.kind === 'city')) {
      const l = generateLayout(s);
      const park = l.buildings.find((b) => b.kind === 'themepark')!;
      expect(park).toBeDefined();
      const d = generateDistricts(l, 0, true);
      const inside = (x: number, z: number) => Math.abs(x - park.x) < park.w / 2 + 0.5 && Math.abs(z - park.z) < park.d / 2 + 0.5;
      // every mover that starts inside the park stays inside it: coaster cars, wheel, tower, rings
      const rides = (d.movers ?? []).filter((m) => {
        const p = m.pose(0);
        return p && inside(p.x, p.z);
      });
      expect(rides.length).toBeGreaterThanOrEqual(4 + 3 + 7);
      let looped = false;
      for (const m of rides)
        for (let t = 0; t < 200; t += 0.5) {
          const p = m.pose(t)!;
          expect(inside(p.x, p.z), `ride at ${p.x.toFixed(1)},${p.z.toFixed(1)}`).toBe(true);
          if ((p.pitch ?? 0) > 2.5) looped = true;
        }
      // a coaster car goes over the top of the loop
      expect(looped).toBe(true);
      // the gate is open and the walls hold
      const hit = (x: number, z: number) => l.colliders.some((c) => (c.type === 'circle' ? Math.hypot(c.x - x, c.z - z) < c.hw + 0.3 : Math.abs(c.x - x) < c.hw + 0.3 && Math.abs(c.z - z) < c.hd + 0.3));
      const [gx, gz] = park.door;
      const ux = Math.sign(park.x - gx) * (Math.abs(park.x - gx) > 1 ? 1 : 0);
      const uz = Math.sign(park.z - gz) * (Math.abs(park.z - gz) > 1 ? 1 : 0);
      for (let k = -3; k <= 8; k++) expect(hit(gx + ux * k, gz + uz * k)).toBe(false);
      // (the wall stands 5 m in from the street, where the gate is)
      expect(hit(gx + ux * 5 + uz * 20, gz + uz * 5 + ux * 20)).toBe(true);
    }
  });

  it('puts a safari camp, a camel track and a dune-buggy course in the desert round a city on a dry world', () => {
    const dw = freshWorld('desert-14');
    const s = Object.values(dw.settlements).find((c) => c.name === 'Isearis')!;
    const pl = dw.planets[s.planetId];
    expect(pl.regions[s.regionIndex].biome).toBe('desert');
    const l = generateLayout(s);
    const t = generateTerrain(pl, s.regionIndex, 'desert', l.radius + 20, coastLine(s), [...(airportRect(s) ? [airportRect(s)!] : []), ...desertFlats(s)], l.features?.palm?.land);
    const y0 = t.flatHeight;
    const d = generateDistricts(l, y0, true, t);
    // the camp and the camel track stand on graded ground
    for (const p of [d.desert!.camp!, d.desert!.track!]) for (const [dx, dz] of [[0, 0], [20, 10], [-25, -12]]) expect(Math.abs(t.height(p[0] + dx, p[1] + dz) - y0)).toBeLessThan(0.05);
    expect(d.desert).toBeDefined();
    const sites = [d.desert!.camp, d.desert!.track, d.desert!.dunes];
    for (const p of sites) {
      expect(p).not.toBeNull();
      const [x, z] = p!;
      // out in the desert: beyond the city, on dry land, inside the map
      expect(Math.hypot(x, z)).toBeGreaterThan(l.radius + 40);
      expect(z).toBeGreaterThan(l.features!.shoreZ + 60);
      expect(Math.abs(x)).toBeLessThan(t.size * 0.47);
      expect(Math.abs(z)).toBeLessThan(t.size * 0.47);
    }
    // no road crosses the camp or the track
    const roads = generateHighways(l, t)!.roads;
    for (const p of [d.desert!.camp!, d.desert!.track!])
      for (const rd of roads) for (const q of rd.pts) expect(Math.abs(q.x - p[0]) < 70 && Math.abs(q.z - p[1]) < 48, `road at ${q.x.toFixed(0)},${q.z.toFixed(0)}`).toBe(false);
    // camels and buggies run on the ground, near their own site
    const runners = (d.movers ?? []).filter((m) => {
      const p = m.pose(0)!;
      return sites.some((q) => Math.hypot(p.x - q![0], p.z - q![1]) < 90);
    });
    expect(runners.length).toBe(6 + 5);
    for (const m of runners)
      for (let tt = 0; tt < 120; tt += 1) {
        const p = m.pose(tt)!;
        expect(Math.abs(p.y - (t.height(p.x, p.z) - y0))).toBeLessThan(0.3);
      }
    // and none of it appears on a world that is not dry
    expect(generateDistricts(l, y0, true).desert).toBeUndefined();
  });

  it('breaks the grid with a diagonal avenue and a curved boulevard that nothing stands in', () => {
    for (const s of cities.filter((c) => c.kind === 'capital' || c.kind === 'city')) {
      const l = generateLayout(s);
      const av = l.features!.avenues;
      expect(av.length).toBeGreaterThanOrEqual(1);
      const near = (pts: [number, number][], x: number, z: number) => {
        let best = Infinity;
        for (let i = 0; i < pts.length - 1; i++) {
          const [ax, az] = pts[i];
          const [bx, bz] = pts[i + 1];
          const dx = bx - ax;
          const dz = bz - az;
          const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
          best = Math.min(best, Math.hypot(x - ax - dx * u, z - az - dz * u));
        }
        return best;
      };
      for (const a of av) {
        let len = 0;
        for (let k = 1; k < a.pts.length; k++) len += Math.hypot(a.pts[k][0] - a.pts[k - 1][0], a.pts[k][1] - a.pts[k - 1][1]);
        expect(len).toBeGreaterThan(120);
        // no building's centre lies within the carriageway, and no lake-tower podium sits on it
        for (const b of l.buildings) expect(near(a.pts, b.plot?.x ?? b.x, b.plot?.z ?? b.z), `${b.kind} on the avenue`).toBeGreaterThan(a.w / 2);
        for (const c of l.features!.jlt) expect(near(a.pts, c.x, c.z)).toBeGreaterThan(a.w / 2 + c.s / 2);
      }
      // at least one avenue is not a straight grid line
      expect(av.some((a) => a.pts.some((p, k) => k > 0 && Math.abs(p[0] - a.pts[k - 1][0]) > 1 && Math.abs(p[1] - a.pts[k - 1][1]) > 1))).toBe(true);
    }
  });

  it('runs trains along the metro and boats on the water', () => {
    const s = cities.find((c) => c.kind === 'capital')!;
    const l = generateLayout(s);
    const f = l.features!;
    const d = generateDistricts(l, 0, true);
    const movers = d.movers ?? [];
    expect(movers.length).toBeGreaterThanOrEqual(2 + 3 + 3);
    const near = (pts: [number, number][], x: number, z: number) => {
      let best = Infinity;
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i];
        const [bx, bz] = pts[i + 1];
        const dx = bx - ax;
        const dz = bz - az;
        const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
        best = Math.min(best, Math.hypot(x - ax - dx * u, z - az - dz * u));
      }
      return best;
    };
    let trains = 0;
    let boats = 0;
    const tp = l.buildings.find((b) => b.kind === 'themepark');
    for (const m of movers) {
      const p0 = m.pose(0)!;
      // theme park rides are tested on their own
      if (tp && Math.abs(p0.x - tp.x) < tp.w / 2 + 1 && Math.abs(p0.z - tp.z) < tp.d / 2 + 1) continue;
      if (p0.y > 3) {
        trains++;
        // on the viaduct, between its ends; and it stands at each station at some moment
        const seen = new Set<number>();
        for (let t = 0; t < 600; t += 0.5) {
          const p = m.pose(t)!;
          expect(Math.abs(p.z - f.metro.z)).toBeLessThan(1.3);
          expect(p.x).toBeGreaterThanOrEqual(f.metro.x0);
          expect(p.x).toBeLessThanOrEqual(f.metro.x1);
          f.metro.stations.forEach((sx, i) => {
            if (Math.abs(p.x - sx) < 0.5) seen.add(i);
          });
        }
        expect(seen.size).toBe(f.metro.stations.length);
      } else {
        boats++;
        // always on water: inside a channel, or out at sea beyond the shore
        for (let t = 0; t < 400; t += 1) {
          const p = m.pose(t)!;
          const inside = f.waters.some((w) => near(w.pts, p.x, p.z) < w.w / 2 - 0.5) || p.z < f.shoreZ - 2;
          expect(inside, `boat at ${p.x.toFixed(1)},${p.z.toFixed(1)}`).toBe(true);
        }
      }
    }
    expect(trains).toBe(2);
    expect(boats).toBeGreaterThanOrEqual(6);
  });

  it('gives the capital an airport on flattened ground behind the city, reached by an expressway', () => {
    const s = cities.find((c) => c.kind === 'capital')!;
    const l = generateLayout(s);
    const a = l.features!.airport!;
    expect(a).toBeDefined();
    const rect = airportRect(s)!;
    // the airport lies beyond the city, inland, and inside its flattened rectangle
    expect(a.term.z0).toBeGreaterThan(l.radius);
    for (const r of [a.term, a.conc, a.cargo, a.fire, a.fuel, ...a.hangars, ...a.parks]) {
      expect(r.x0).toBeGreaterThanOrEqual(rect.x0);
      expect(r.x1).toBeLessThanOrEqual(rect.x1);
      expect(r.z1).toBeLessThanOrEqual(rect.z1);
    }
    expect(a.runZ + a.runW / 2).toBeLessThan(rect.z1);
    expect(a.runX1 - a.runX0).toBeGreaterThan(1200);
    // the order from the city outwards: kerb, terminal, concourse, apron, taxiway, runway
    expect(a.curbZ).toBeLessThan(a.term.z0);
    expect(a.term.z1).toBeLessThan(a.conc.z0);
    expect(a.conc.z1).toBeLessThan(a.apronZ1);
    expect(a.apronZ1).toBeLessThan(a.taxiZ);
    expect(a.taxiZ).toBeLessThan(a.runZ - a.runW / 2);
    // parked aircraft never touch wingtips, and all stand at the concourse
    expect(a.gates.length).toBeGreaterThanOrEqual(6);
    for (let i = 1; i < a.gates.length; i++) {
      const p = a.gates[i - 1];
      const q = a.gates[i];
      expect(q.x - p.x).toBeGreaterThan((AIRCRAFT[p.kind].span + AIRCRAFT[q.kind].span) / 2 + 4);
    }
    for (const g of a.gates) expect(Math.abs(g.x - (a.conc.x0 + a.conc.x1) / 2)).toBeLessThan((a.conc.x1 - a.conc.x0) / 2);
    // the terrain is flat under the runway, the apron and the terminal
    const pl = w.planets[s.planetId];
    const t = generateTerrain(pl, s.regionIndex, pl.regions[s.regionIndex].biome, l.radius + 20, coastLine(s), [rect]);
    for (let x = a.runX0 - 100; x <= a.runX1 + 100; x += 50) for (const z of [a.runZ, a.taxiZ, a.conc.z1 + 40, a.term.z0]) expect(Math.abs(t.height(x, z) - t.flatHeight)).toBeLessThan(0.05);
    // the expressway reaches the kerb road at ground level, and nothing tall stands under its deck
    const roads = generateHighways(l, t)!.roads;
    const access = roads.find((r) => r.kind === 'express' && Math.abs(r.pts[0].x - a.xa) < 0.5 && Math.abs(r.pts[r.pts.length - 1].z - a.curbZ) < 4)!;
    expect(access).toBeDefined();
    const end = access.pts[access.pts.length - 1];
    expect(end.y - t.height(end.x, end.z)).toBeLessThan(0.5);
    for (const p of access.pts) {
      for (const b of l.buildings) {
        const hw = (b.plot?.w ?? b.w) / 2;
        const hd = (b.plot?.d ?? b.d) / 2;
        if (Math.abs((b.plot?.x ?? b.x) - p.x) < hw + 6 && Math.abs((b.plot?.z ?? b.z) - p.z) < hd) expect(t.flatHeight + b.h).toBeLessThan(p.y - 1);
      }
    }
    // no city building stands on the airfield, and no trees grow on it
    for (const b of l.buildings) expect(b.z + b.d / 2).toBeLessThan(rect.z0 + 10);
    const veg = generateVegetation(t, l, 'medium');
    for (const c of veg.colliders) expect(c.x > rect.x0 && c.x < rect.x1 && c.z > rect.z0 && c.z < rect.z1).toBe(false);
    // you can walk from the kerb through a door, across the hall, down a link and along the concourse
    const hit = (x: number, z: number) =>
      l.colliders.some((c) => (c.type === 'circle' ? Math.hypot(c.x - x, c.z - z) < c.hw + 0.3 : Math.abs(c.x - x) < c.hw + 0.3 && Math.abs(c.z - z) < c.hd + 0.3));
    const door = a.doors.reduce((p, q) => (Math.abs(q - a.links[0]) < Math.abs(p - a.links[0]) ? q : p));
    const route: [number, number][] = [];
    for (let z = a.curbZ + 9; z < a.term.z0 + 3; z += 0.5) route.push([door, z]);
    for (let x = door; Math.abs(x - a.links[0]) > 0.5; x += Math.sign(a.links[0] - door) * 0.5) route.push([x, a.term.z0 + 3]);
    for (let z = a.term.z0 + 3; z < (a.conc.z0 + a.conc.z1) / 2; z += 0.5) route.push([a.links[0], z]);
    for (let x = a.conc.x0 + 2; x < a.conc.x1 - 2; x += 0.5) route.push([x, (a.conc.z0 + a.conc.z1) / 2]);
    for (const [x, z] of route) expect(hit(x, z), `blocked at ${x.toFixed(1)},${z.toFixed(1)}`).toBe(false);
    // while the halls' walls stand between doors
    expect(hit((a.doors[0] + a.doors[1]) / 2, a.term.z0)).toBe(true);
    expect(hit((a.conc.x0 + a.conc.x1) / 2, a.conc.z1)).toBe(true);
    // no lake opens beside the airfield
    if (t.waterLevel !== null)
      for (let x = rect.x0 - 450; x <= rect.x1 + 450; x += 40)
        for (const z of [rect.z0 - 60, rect.z1 + 60, rect.z1 + 150]) if (Math.abs(x) < t.size * 0.47 && Math.abs(z) < t.size * 0.47) expect(t.height(x, z)).toBeGreaterThan(t.waterLevel);
    // the departing aircraft stows its gear once it is climbing away, the arriving one has it down
    let stowed = false;
    for (let tt = 0; tt < 110; tt += 0.25) {
      const dep = flightPose('takeoff', a.runX0, a.runX1, tt);
      if (dep && dep.y > 40) {
        expect(dep.gear).toBe(false);
        stowed = true;
      }
      if (dep && dep.y < 0.5) expect(dep.gear).toBe(true);
      const arr = flightPose('land', a.runX0, a.runX1, tt);
      if (arr) expect(arr.gear).toBe(true);
    }
    expect(stowed).toBe(true);
    // the flights stay on the runway centreline while on the ground
    for (let tt = 0; tt < 110; tt += 0.5)
      for (const mode of ['land', 'takeoff'] as const) {
        const pose = flightPose(mode, a.runX0, a.runX1, tt);
        if (pose && pose.y < 0.5) {
          expect(pose.x).toBeGreaterThan(a.runX0 - 1);
          expect(pose.x).toBeLessThan(a.runX1 + 1);
        }
      }
  });

  it('lets you walk into a mall through its rotunda doorway', () => {
    const s = cities.find((c) => c.kind === 'capital')!;
    const l = generateLayout(s);
    const malls = l.buildings.filter((b) => b.kind === 'mall');
    expect(malls.length).toBeGreaterThan(0);
    const hit = (x: number, z: number) =>
      l.colliders.some((c) => (c.type === 'circle' ? Math.hypot(c.x - x, c.z - z) < c.hw + 0.3 : Math.abs(c.x - x) < c.hw + 0.3 && Math.abs(c.z - z) < c.hd + 0.3));
    for (const m of malls) {
      const g = mallGeometry(m);
      // the rotunda's centre and the doorway are open; the shopping wings are solid
      expect(hit(...g.toWorld(0, g.rz))).toBe(false);
      expect(hit(...g.toWorld(0, g.rz + g.rd / 2))).toBe(false);
      expect(hit(...g.toWorld(0, -g.D / 2 + 2))).toBe(true);
      expect(hit(...g.toWorld(g.rd / 2 + 3, g.D / 2 - 2))).toBe(true);
      expect(hit(...g.toWorld(0, -g.vd / 2 - 1))).toBe(true);
      // the glass wall either side of the door blocks
      expect(hit(...g.toWorld(g.rd / 2, g.rz))).toBe(true);
      // a walk from the rotunda through the passage and down the concourse is clear
      for (let z = g.rz; z > 0; z -= 0.5) expect(hit(...g.toWorld(0, z))).toBe(false);
      for (let x = -g.coreW / 2 + 1; x < g.coreW / 2 - 1; x += 0.5) expect(hit(...g.toWorld(x, 0))).toBe(false);
      // and the concourse ends at walls
      expect(hit(...g.toWorld(g.coreW / 2 + 0.3, 0))).toBe(true);
    }
  });

  it('lays large futuristic cities out as a coastal corridor of districts', () => {
    const big = cities.filter((s) => s.kind === 'capital' || s.kind === 'city');
    expect(big.length).toBeGreaterThan(0);
    for (const s of big) {
      const l = generateLayout(s);
      const f = l.features!;
      expect(f).toBeDefined();
      const kinds = new Set(l.buildings.map((b) => b.kind));
      for (const k of ['villa', 'shop', 'mosque', 'mosqueSmall', 'oldhouse', 'mall']) expect(kinds.has(k as never)).toBe(true);
      // bands parallel to the coast: sea, coastal road, spine, arterial, in that order inland
      expect(f.shoreZ).toBeLessThan(f.coastRoadZ);
      expect(f.coastRoadZ).toBeLessThan(f.spineZ);
      expect(f.spineZ).toBeLessThan(f.arterialZ);
      // nothing is built in the sea, nothing tall stands in the villa belt
      // (the palm island's buildings stand on its own land out in the sea)
      const onIsland = (x: number, z: number) =>
        !!f.palm?.land.some(([ax, az, bx, bz, r]) => {
          const dx = bx - ax;
          const dz = bz - az;
          const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
          return Math.hypot(x - ax - dx * u, z - az - dz * u) < r;
        });
      for (const b of l.buildings) {
        expect(b.district).toBeDefined();
        if (!onIsland(b.plot?.x ?? b.x, b.plot?.z ?? b.z)) expect(b.z).toBeGreaterThan(f.coastRoadZ - 1);
        if (b.kind === 'villa') expect(b.district).toBe('villas');
        if (b.kind === 'shop' || b.kind === 'oldhouse') expect(b.district).toBe('souk');
        if (b.kind === 'supertall') expect(['downtown', 'marina']).toContain(b.district);
      }
      // tower nodes, not a wall: the old town sits at one end, the marina's towers at the other
      const old = l.buildings.filter((b) => b.kind === 'oldhouse');
      const marina = l.buildings.filter((b) => b.district === 'marina' && (b.kind === 'tower' || b.kind === 'supertall'));
      expect(Math.max(...old.map((b) => b.x))).toBeLessThan(Math.min(...marina.map((b) => b.x)));
      // the creek runs from the sea into the canal, which returns to the sea
      const creek = f.waters.find((w) => w.kind === 'creek')!;
      const canal = f.waters.find((w) => w.kind === 'canal')!;
      expect(creek.pts[0][1]).toBeLessThan(f.shoreZ);
      expect(canal.pts[canal.pts.length - 1][1]).toBeLessThan(f.shoreZ);
      // Downtown: a lake inside a ring with the signature supertall and a mall beside it
      if (s.kind === 'capital') {
        expect(f.downtown).not.toBeNull();
        const sig = l.buildings.filter((b) => b.kind === 'supertall').sort((a, b) => b.h - a.h)[0];
        expect(sig.h).toBeGreaterThan(200);
        expect(Math.hypot(sig.x - f.downtown!.x, sig.z - f.downtown!.z)).toBeLessThan(f.downtown!.a);
      }
      // malls sit on the spine or in Downtown
      for (const m of l.buildings.filter((b) => b.kind === 'mall')) expect(Math.abs(m.z - m.d / 2 - f.spineZ) < 40 || (f.downtown && Math.abs(m.z - f.downtown.z) < f.downtown.b)).toBeTruthy();
      // daily mosques cover every home within walking distance
      const mosques = l.buildings.filter((b) => b.kind === 'mosque' || b.kind === 'mosqueSmall');
      for (const h of l.buildings.filter((b) => b.kind === 'villa' || b.kind === 'oldhouse')) {
        const near = Math.min(...mosques.map((m) => Math.hypot(m.x - h.x, m.z - h.z)));
        expect(near).toBeLessThan(h.kind === 'oldhouse' ? 80 : 115);
      }
      // churches and temples stand in walled compounds, two of them far apart
      expect(f.compounds.length).toBe(2);
      expect(Math.hypot(f.compounds[0].x - f.compounds[1].x, f.compounds[0].z - f.compounds[1].z)).toBeGreaterThan(l.radius * 0.6);
      for (const b of l.buildings.filter((x) => x.kind === 'church' || x.kind === 'temple')) expect(f.compounds.some((c) => Math.abs(c.x - b.x) < c.w / 2 && Math.abs(c.z - b.z) < c.d / 2)).toBe(true);
      // gated estates with a core
      expect(f.estates.length).toBeGreaterThanOrEqual(1);
      expect(l.buildings.some((b) => b.kind === 'villa' && b.plot?.rot !== undefined)).toBe(true);
      // parks in more than one size, including a city park
      const parkSizes = new Set(l.buildings.filter((b) => b.kind === 'park').map((b) => Math.round(b.w * b.d)));
      expect(parkSizes.size).toBeGreaterThanOrEqual(2);
    }
  });

  it('builds every villa style, a souk, worship sites and pools deterministically', () => {
    const s = cities.find((c) => c.kind === 'capital') ?? cities[0];
    const l = generateLayout(s);
    const a = generateDistricts(l, 0, true);
    const b = generateDistricts(l, 0, true);
    expect(a.pieces.length).toBe(b.pieces.length);
    expect(a.pieces[10].m.elements).toEqual(b.pieces[10].m.elements);
    expect(a.pieces.length).toBeGreaterThan(500);
    // pools and fountains are lit at night
    expect(a.lights.length).toBeGreaterThanOrEqual(l.buildings.filter((x) => x.kind === 'villa').length);
    // palms only on warm worlds
    expect(a.pieces.some((p) => p.shape === 'fronds')).toBe(true);
    expect(generateDistricts(l, 0, false).pieces.some((p) => p.shape === 'fronds')).toBe(false);
    // every villa piece stays inside its plot, and nothing of the city stands on a closed estate street
    for (const v of l.buildings.filter((x) => x.kind === 'villa' && x.plot?.rot === undefined)) {
      const pl = v.plot!;
      const own = a.pieces.filter((p) => Math.abs(p.x - pl.x) < pl.w / 2 + 2 && Math.abs(p.z - pl.z) < pl.d / 2 + 2);
      expect(own.length).toBeGreaterThan(80);
      for (const p of own) {
        expect(Math.abs(p.x - pl.x)).toBeLessThan(pl.w / 2 + 0.8);
        expect(Math.abs(p.z - pl.z)).toBeLessThan(pl.d / 2 + 0.8);
      }
    }
    // churches and parks are built too
    expect(l.buildings.some((x) => x.kind === 'church')).toBe(true);
    expect(l.buildings.some((x) => x.kind === 'park')).toBe(true);
  });

  it('spreads mansions over all six styles across the universe', () => {
    const styles = new Set<string>();
    for (const s of cities) for (const b of generateLayout(s).buildings) if (b.kind === 'villa') styles.add(villaStyle(b));
    expect(styles).toEqual(new Set(VILLA_STYLES));
  });

  it('builds a Premier League stadium and an NBA arena at real sizes', () => {
    for (const s of cities.filter((c) => c.kind === 'capital' || c.kind === 'city')) {
      const l = generateLayout(s);
      const stadium = l.buildings.find((b) => b.kind === 'stadium');
      const arena = l.buildings.find((b) => b.kind === 'arena');
      expect(arena).toBeDefined();
      if (s.kind === 'capital') expect(stadium).toBeDefined();
      // room for a 105 x 68 m pitch plus stands, and a 28.65 x 15.24 m court plus a bowl
      if (stadium) expect(Math.min(stadium.w, stadium.d)).toBeGreaterThan(130);
      expect(Math.min(arena!.w, arena!.d)).toBeGreaterThan(120);
      // no street runs through a venue and no expressway pillar stands in one
      for (const v of [stadium, arena]) {
        if (!v) continue;
        for (const st of l.streets) {
          const mx = (st.a[0] + st.b[0]) / 2;
          const mz = (st.a[1] + st.b[1]) / 2;
          expect(Math.abs(mx - v.x) < v.w / 2 - 2 && Math.abs(mz - v.z) < v.d / 2 - 2).toBe(false);
        }
        const p = w.planets[s.planetId];
        const t = generateTerrain(p, s.regionIndex, p.regions[s.regionIndex].biome, settlementRadius(s) + 20);
        const hw = generateHighways(l, t);
        for (const pl of hw?.pillars ?? []) expect(Math.abs(pl.x - v.x) < v.w / 2 && Math.abs(pl.z - v.z) < v.d / 2).toBe(false);
      }
      const d = generateDistricts(l, 0, true);
      const inV = (b: { x: number; z: number; w: number; d: number }) => d.pieces.filter((p) => Math.abs(p.x - b.x) < b.w / 2 && Math.abs(p.z - b.z) < b.d / 2);
      // seats filled with the crowd, pitch and court markings, goals and hoops
      if (stadium) {
        const ps = inV(stadium);
        expect(ps.filter((p) => p.mat === 'crowd').length).toBeGreaterThan(100);
        // markings: painted lines and arcs, raised above the mowing stripes
        const paint = ps.filter((p) => p.mat === 'paint');
        expect(paint.length).toBeGreaterThan(150);
        for (const p of paint) expect(p.m.elements[13]).toBeGreaterThan(0.16);
        expect(ps.filter((p) => p.mat === 'net').length).toBe(2);
      }
      const pa = inV(arena!);
      expect(pa.filter((p) => p.mat === 'crowd').length).toBeGreaterThan(100);
      // court lines lie above the painted keys (tops at 0.23); sponsor panels on the apron above
      // the apron (top at 0.18)
      const courtPaint = pa.filter((p) => p.mat === 'paint');
      expect(courtPaint.length).toBeGreaterThan(80);
      for (const p of courtPaint) expect(p.m.elements[13]).toBeGreaterThan(0.18);
      expect(courtPaint.filter((p) => p.m.elements[13] > 0.23).length).toBeGreaterThan(80);
      expect(pa.filter((p) => p.mat === 'court').length).toBeGreaterThan(4);
    }
  });

  it('leaves other styles alone', () => {
    const other = Object.values(w.settlements).find((s) => generateLayout(s).style !== 'futuristic')!;
    expect(generateDistricts(generateLayout(other), 0, true).pieces.length).toBe(0);
  });
});
