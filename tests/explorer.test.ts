import { describe, expect, it } from 'vitest';
import { generateLayout, resolveCollisions, routeBetween, settlementRadius, wildLayout } from '../src/explorer/layout';
import { generateTerrain } from '../src/explorer/terrain';
import { TOPICS, recordConversation, respond } from '../src/explorer/dialogue';
import { freshWorld } from './helpers';

describe('explorer generation', () => {
  const w = freshWorld();

  it('builds a distinct layout for every architectural style', () => {
    const styles = new Set<string>();
    for (const s of Object.values(w.settlements)) {
      const l = generateLayout(s);
      styles.add(l.style);
      expect(l.buildings.length).toBeGreaterThan(5);
      expect(l.graph.nodes.length).toBeGreaterThan(3);
      expect(l.landmarks.length).toBe(s.landmarks.length);
      expect(l.homes.length).toBeGreaterThan(0);
      // deterministic
      expect(JSON.stringify(generateLayout(s).buildings)).toBe(JSON.stringify(l.buildings));
    }
    expect(styles).toEqual(new Set(['futuristic', 'organic', 'frontier']));
  });

  it('routes inhabitants through the street network', () => {
    const s = Object.values(w.settlements)[0];
    const l = generateLayout(s);
    const a = l.graph.nodes[0];
    const b = l.graph.nodes[l.graph.nodes.length - 1];
    const path = routeBetween(l.graph, a, [b[0] + 1, b[1] + 1]);
    expect(path.length).toBeGreaterThan(1);
    expect(path.at(-1)).toEqual([b[0] + 1, b[1] + 1]);
  });

  it('pushes the player out of buildings', () => {
    const s = Object.values(w.settlements)[0];
    const l = generateLayout(s);
    const c = l.colliders.find((x) => x.type === 'box')!;
    const [x, z] = resolveCollisions(l.colliders, c.x, c.z + 0.1, 0.7);
    expect(Math.abs(x - c.x) >= c.hw || Math.abs(z - c.z) >= c.hd).toBe(true);
  });

  it('generates deterministic terrain flattened for the settlement', () => {
    const s = Object.values(w.settlements)[0];
    const p = w.planets[s.planetId];
    const r = p.regions[s.regionIndex];
    const t1 = generateTerrain(p, s.regionIndex, r.biome, settlementRadius(s) + 20);
    const t2 = generateTerrain(p, s.regionIndex, r.biome, settlementRadius(s) + 20);
    expect(t1.heights).toEqual(t2.heights);
    expect(Math.abs(t1.height(10, 10) - t1.flatHeight)).toBeLessThan(0.5);
    const wild = wildLayout(p.id, 0, t1.seed, 'Test');
    expect(wild.landmarks.length).toBe(3);
  });

  it('answers every conversation topic from real state', () => {
    const c = Object.values(w.characters).find((x) => x.alive)!;
    for (const t of TOPICS) {
      const text = respond(w, c, t.id, 1);
      expect(typeof text).toBe('string');
      expect(text.length).toBeGreaterThan(2);
    }
    expect(respond(w, c, 'self', 1)).toContain(String(Math.floor((w.time - c.birthTime) / (360 * 1440))));
    const mem = c.memories.length;
    recordConversation(w, c);
    expect(c.memories.length).toBeGreaterThanOrEqual(Math.min(mem + 1, 36));
    expect(w.player.conversations).toBe(1);
  });
});
