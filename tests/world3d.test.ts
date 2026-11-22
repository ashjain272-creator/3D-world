import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { coastLine, generateLayout, mallGeometry, groundWildLayout, lineOfSight, settlementRadius, wildLayout, type Building, type Layout } from '../src/explorer/layout';
import { generateTerrain, type TerrainData } from '../src/explorer/terrain';
import { generateVegetation } from '../src/explorer/vegetation';
import { deckSampler, generateHighways, sampleRoad } from '../src/explorer/roadNetwork';
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
      for (const b of l.buildings) {
        expect(b.district).toBeDefined();
        expect(b.z).toBeGreaterThan(f.coastRoadZ - 1);
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
