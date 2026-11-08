import { describe, expect, it } from 'vitest';
import { advance } from '../src/sim/engine';
import { MINUTES_PER_DAY } from '../src/sim/time';
import { civPopulation, findEvent } from '../src/sim/world';
import { freshWorld, stripVolatile } from './helpers';

describe('simulation engine', () => {
  it('advances time and evolves civilisations', () => {
    const w = freshWorld();
    const t0 = w.time;
    const pop0 = Object.values(w.civs).map((c) => civPopulation(w, c));
    const ev0 = w.events.length;
    const res = advance(w, 720 * MINUTES_PER_DAY);
    expect(w.time - t0).toBe(720 * MINUTES_PER_DAY);
    expect(res.daysProcessed).toBe(720);
    const pop1 = Object.values(w.civs).map((c) => civPopulation(w, c));
    expect(pop1).not.toEqual(pop0);
    expect(w.events.length).toBeGreaterThan(ev0 + 20);
    for (const c of Object.values(w.civs)) {
      expect(c.stats.length).toBeGreaterThanOrEqual(23);
      expect(c.economy.gdp).toBeGreaterThan(0);
      expect(c.stability).toBeGreaterThanOrEqual(0);
      expect(c.stability).toBeLessThanOrEqual(100);
    }
    // technology progresses through research, not randomly
    const discoveries = w.events.filter((e) => e.source === 'simulation' && e.category === 'discovery');
    expect(discoveries.length).toBeGreaterThan(0);
    expect(discoveries.every((e) => /research points|Knowledge/.test(e.cause))).toBe(true);
  });

  it('records every simulated event with a cause and valid causal links', () => {
    const w = freshWorld();
    advance(w, 720 * MINUTES_PER_DAY);
    const sim = w.events.filter((e) => e.source === 'simulation');
    expect(sim.length).toBeGreaterThan(20);
    for (const e of sim) {
      expect(e.cause.length).toBeGreaterThan(5);
      for (const cid of e.causeIds) {
        const c = findEvent(w, cid);
        if (c) {
          expect(c.t).toBeLessThanOrEqual(e.t);
          expect(c.consequenceIds).toContain(e.id);
        }
      }
    }
    const categories = new Set(sim.map((e) => e.category));
    expect(categories.size).toBeGreaterThanOrEqual(5);
  });

  it('is deterministic for identical inputs', () => {
    const a = freshWorld('determinism');
    const b = freshWorld('determinism');
    advance(a, 90 * MINUTES_PER_DAY);
    advance(b, 30 * MINUTES_PER_DAY);
    advance(b, 60 * MINUTES_PER_DAY);
    expect(stripVolatile(a)).toBe(stripVolatile(b));
  });

  it('respects a CPU budget and reports partial progress', () => {
    const w = freshWorld();
    const r = advance(w, 3600 * MINUTES_PER_DAY, 1);
    expect(r.advanced).toBeLessThan(3600 * MINUTES_PER_DAY);
    expect(r.advanced).toBeGreaterThan(0);
  });

  it('keeps individuals busy with plausible, bounded state', () => {
    const w = freshWorld();
    advance(w, 10 * MINUTES_PER_DAY);
    const living = Object.values(w.characters).filter((c) => c.alive);
    const types = new Set(living.map((c) => c.activity.type));
    expect(types.size).toBeGreaterThanOrEqual(3);
    for (const c of living) {
      for (const v of Object.values(c.needs)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
      expect(c.mood).toBeGreaterThanOrEqual(-100);
      expect(c.mood).toBeLessThanOrEqual(100);
      expect(c.activity.reason ?? '').not.toBe('');
      expect(c.nextDecisionAt).toBeGreaterThan(w.time - 60 * 12);
    }
  });

  it('runs a decade without breaking invariants', () => {
    const w = freshWorld('decade');
    advance(w, 3600 * MINUTES_PER_DAY);
    for (const c of Object.values(w.civs)) {
      expect(Number.isFinite(c.economy.treasury)).toBe(true);
      for (const g of ['food', 'materials', 'energy', 'goods'] as const) expect(c.economy.stockpile[g]).toBeGreaterThanOrEqual(0);
      expect(w.characters[c.government.leaderId!]?.alive).toBe(true);
      for (const sid of c.settlementIds) expect(w.settlements[sid].population).toBeGreaterThan(0);
    }
    expect(Object.values(w.characters).filter((c) => c.alive).length).toBeGreaterThan(50);
    expect(w.events.length).toBeLessThanOrEqual(6000);
  }, 60000);
});
