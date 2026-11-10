import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { advance } from '../src/sim/engine';
import { MINUTES_PER_DAY } from '../src/sim/time';
import { HOT_WINDOW_DAYS, resolveId, retainedChunks } from '../src/sim/history';
import { isKnownEventId } from '../src/sim/world';
import type { HistoryEvent, World } from '../src/sim/types';
import { clearSaves, loadWorld, readArchiveChunk, saveWorld } from '../src/persistence/db';
import { freshWorld } from './helpers';

/** Every id referenced anywhere in the world must resolve. */
function danglingIds(w: World): string[] {
  const chunks = retainedChunks(w);
  const all: HistoryEvent[] = [...w.events, ...[...chunks.values()].flat()];
  const refs = new Set<string>();
  for (const e of all) {
    for (const id of e.causeIds) refs.add(id);
    for (const id of e.consequenceIds) refs.add(id);
  }
  for (const list of Object.values(w.history.lateConsequences)) for (const id of list) refs.add(id);
  for (const k of Object.keys(w.history.lateConsequences)) refs.add(k);
  for (const list of Object.values(w.causes)) for (const id of list) refs.add(id);
  for (const c of Object.values(w.characters)) for (const id of c.eventIds) refs.add(id);
  for (const fd of Object.values(w.firstDiscoveries)) refs.add(fd.eventId);
  for (const c of Object.values(w.characters)) for (const m of c.memories) if (m.eventId) refs.add(m.eventId);
  const bad: string[] = [];
  for (const id of refs) {
    if (!isKnownEventId(w, id) || !resolveId(w, id, (k) => chunks.get(k))) bad.push(id);
  }
  return bad;
}

describe('history retention over 50 years', () => {
  const w = freshWorld('retention-50');
  const milestones = new Set<string>();
  // Record milestones as they happen, decade by decade, so we can check none is lost.
  for (let decade = 0; decade < 5; decade++) {
    advance(w, 10 * 360 * MINUTES_PER_DAY);
    for (const e of w.events) if (e.importance >= 4) milestones.add(e.id);
  }

  it('leaves no dangling ids anywhere', () => {
    const bad = danglingIds(w);
    console.log(`[retention] hot ${w.events.length}, archived ${w.history.archivedCount}, compacted ${w.history.compactedCount}, chunks ${w.history.chunks.length}, dangling ${bad.length}`);
    expect(bad).toEqual([]);
  });

  it('keeps every milestone in hot history', () => {
    const hot = new Set(w.events.map((e) => e.id));
    for (const id of milestones) expect(hot.has(id)).toBe(true);
    expect(milestones.size).toBeGreaterThan(20);
  });

  it('keeps hot history bounded to recent years plus milestones', () => {
    const cutoff = w.time - (HOT_WINDOW_DAYS + 120) * MINUTES_PER_DAY;
    const oldNonMilestone = w.events.filter((e) => e.t < cutoff && e.importance < 4);
    expect(oldNonMilestone.length).toBe(0);
  });

  it('compacted ids resolve to a summary that carries their links', () => {
    const [member, summaryId] = Object.entries(w.history.redirects)[0];
    const s = resolveId(w, member, (k) => retainedChunks(w).get(k));
    expect(s?.id).toBe(summaryId);
    expect(s?.category).toBe('summary');
    expect(s?.compactedCount).toBeGreaterThan(0);
  });

  it('saves under 15 MB and archived chunks load lazily from IndexedDB', async () => {
    const saveBytes = JSON.stringify(w).length;
    const archiveBytes = [...retainedChunks(w).values()].reduce((a, c) => a + JSON.stringify(c).length, 0);
    console.log(`[retention] save ${(saveBytes / 1e6).toFixed(2)} MB, archive ${(archiveBytes / 1e6).toFixed(2)} MB`);
    expect(saveBytes).toBeLessThan(15e6);
    await clearSaves();
    const keys = w.history.chunks.map((c) => c.key);
    await saveWorld(w);
    const res = await loadWorld();
    expect(res.status).toBe('ok');
    const loaded = await readArchiveChunk(w.seed, keys[0]);
    expect(loaded?.length).toBe(w.history.chunks[0].count);
  });

  it('builds the history timeline quickly', () => {
    const t0 = performance.now();
    const filtered = w.events.filter((e) => e.importance >= 2).sort((a, b) => b.t - a.t).slice(0, 150);
    const ms = performance.now() - t0;
    console.log(`[retention] timeline filter over ${w.events.length} hot events: ${ms.toFixed(1)} ms`);
    expect(filtered.length).toBeGreaterThan(0);
    expect(ms).toBeLessThan(300);
  });
});
