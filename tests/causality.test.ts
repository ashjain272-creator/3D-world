import { describe, expect, it } from 'vitest';
import { advance } from '../src/sim/engine';
import { MINUTES_PER_DAY } from '../src/sim/time';
import { applyIntervention } from '../src/sim/interventions';
import { causality, CausalityError, isKnownEventId, recordEvent } from '../src/sim/world';
import { resolveId, retainedChunks } from '../src/sim/history';
import type { HistoryEvent, World } from '../src/sim/types';
import { freshWorld } from './helpers';

/** Longest backward chain from an event (depth-first, bounded). */
export function backDepth(w: World, e: HistoryEvent, seen = new Set<string>(), limit = 12): number {
  if (seen.has(e.id) || limit <= 0) return 0;
  seen.add(e.id);
  let best = 0;
  for (const id of e.causeIds) {
    const c = resolveId(w, id, (k) => retainedChunks(w).get(k));
    if (c) best = Math.max(best, 1 + backDepth(w, c, seen, limit - 1));
  }
  return best;
}

describe('causal history', () => {
  const w = freshWorld('causality-5y');
  advance(w, 5 * 360 * MINUTES_PER_DAY);
  // all history: hot events plus archived chunks (held in memory in tests)
  const all = [...w.events, ...[...retainedChunks(w).values()].flat()];
  const important = all.filter((e) => e.importance >= 2 && e.source === 'simulation');

  it('at least 90% of important simulated events cite a valid cause', () => {
    const exempt = (e: HistoryEvent) => e.source !== 'simulation';
    const pool = all.filter((e) => e.importance >= 2 && !exempt(e));
    const withCause = pool.filter((e) => e.causeIds.length > 0 && e.causeIds.every((id) => isKnownEventId(w, id)));
    const share = withCause.length / pool.length;
    console.log(`[causality] ${withCause.length}/${pool.length} important events have causes (${(share * 100).toFixed(1)}%)`);
    expect(pool.length).toBeGreaterThan(50);
    expect(share).toBeGreaterThanOrEqual(0.9);
  });

  it('builds chains at least 3 levels deep for most important events', () => {
    const depths = important.map((e) => backDepth(w, e));
    const deep = depths.filter((d) => d >= 3).length / depths.length;
    const max = Math.max(...depths);
    console.log(`[causality] depth≥3: ${(deep * 100).toFixed(1)}%  max depth ${max}  mean ${(depths.reduce((a, b) => a + b, 0) / depths.length).toFixed(2)}`);
    expect(deep).toBeGreaterThan(0.6);
    expect(max).toBeGreaterThanOrEqual(5);
  });

  it('back-links every cause to its consequence', () => {
    for (const e of all) {
      for (const cid of e.causeIds) {
        const c = resolveId(w, cid, (k) => retainedChunks(w).get(k));
        if (c) expect([...c.consequenceIds, ...(w.history.lateConsequences[c.id] ?? [])]).toContain(e.id);
      }
    }
  });

  it('carries creator roots through downstream chains', () => {
    const v = freshWorld('creator-roots');
    const civ = Object.values(v.civs)[0];
    const r = applyIntervention(v, 'changeEnvironment', [civ.homeworldId, { kind: 'disturbance', name: 'great drought' }]);
    expect(r.ok).toBe(true);
    v.planets[civ.homeworldId].environment.climateYield = 0.1;
    v.planets[civ.homeworldId].environment.disturbanceDays = 300;
    civ.economy.stockpile.food = 0;
    advance(v, 90 * MINUTES_PER_DAY);
    const downstream = v.events.filter((e) => e.source === 'simulation' && e.rootSource === 'creator');
    expect(downstream.length).toBeGreaterThan(0);
    expect(v.interventionLog.at(-1)!.kind).toBe('changeEnvironment');
  });

  it('the strict guard rejects an important event with no cause', () => {
    expect(causality.strict).toBe(true);
    const v = freshWorld();
    expect(() => recordEvent(v, { category: 'economy', title: 'Uncaused', description: '', importance: 3, cause: 'none' })).toThrow(CausalityError);
    expect(() => recordEvent(v, { category: 'economy', title: 'Natural', description: '', importance: 3, cause: 'chance', root: true })).not.toThrow();
  });
});
