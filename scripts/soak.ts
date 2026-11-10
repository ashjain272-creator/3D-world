/**
 * Headless long-run soak test.
 *
 *   npx vite-node scripts/soak.ts [years=100] [seed=soak-100]
 *
 * Runs the simulation in Node exactly as the worker does: strict causality
 * checking on, IndexedDB (fake-indexeddb) saves every 10 years. At the end it
 * reports peak memory, save size, event counts, dangling links and the share
 * of important events that cite a cause, and writes them to soak-report.json.
 */
import 'fake-indexeddb/auto';
import { writeFileSync } from 'node:fs';
import { advance } from '../src/sim/engine';
import { generateUniverse } from '../src/sim/generate/universe';
import { resolveId, retainedChunks } from '../src/sim/history';
import type { HistoryEvent, World } from '../src/sim/types';
import { DAYS_PER_YEAR, MINUTES_PER_DAY } from '../src/sim/time';
import { causality, isKnownEventId } from '../src/sim/world';
import { clearSaves, loadWorld, readArchiveChunk, saveWorld } from '../src/persistence/db';

const years = Number(process.argv[2] ?? 100);
const seed = process.argv[3] ?? 'soak-100';
causality.strict = true;

const mb = (b: number) => +(b / 1e6).toFixed(2);
const w: World = generateUniverse(seed).world;
await clearSaves();

let peakHeap = 0;
let peakRss = 0;
const sampleMemory = () => {
  const m = process.memoryUsage();
  peakHeap = Math.max(peakHeap, m.heapUsed);
  peakRss = Math.max(peakRss, m.rss);
};

// importance>=2 coverage, counted once per event as it is first seen in hot history
const seen = new Set<string>();
let important = 0;
let withCause = 0;
let withCauseOrRoot = 0;
const scan = () => {
  for (const e of w.events) {
    if (seen.has(e.id) || e.category === 'summary') continue;
    seen.add(e.id);
    if (e.importance < 2) continue;
    important++;
    if (e.causeIds.length) withCause++;
    if (e.causeIds.length || e.root) withCauseOrRoot++;
  }
};

const t0 = Date.now();
const perYearMs: number[] = [];
for (let y = 1; y <= years; y++) {
  const ty = Date.now();
  advance(w, DAYS_PER_YEAR * MINUTES_PER_DAY);
  perYearMs.push(Date.now() - ty);
  scan();
  sampleMemory();
  if (y % 10 === 0) {
    await saveWorld(w);
    sampleMemory();
    const alive = Object.values(w.characters).filter((c) => c.alive).length;
    console.log(`[soak] year ${y}: hot ${w.events.length}, archived ${w.history.archivedCount}, compacted ${w.history.compactedCount}, chunks ${w.history.chunks.length}, individuals ${alive}, heap ${mb(process.memoryUsage().heapUsed)} MB, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
}
await saveWorld(w);

// Load every archived chunk back from IndexedDB and check every reference.
const chunks = new Map<string, HistoryEvent[]>(retainedChunks(w));
for (const c of w.history.chunks) {
  if (!chunks.has(c.key)) {
    const data = await readArchiveChunk(w.seed, c.key);
    if (data) chunks.set(c.key, data);
  }
}
const missingChunks = w.history.chunks.filter((c) => !chunks.has(c.key)).map((c) => c.key);
const all: HistoryEvent[] = [...w.events, ...[...chunks.values()].flat()];
const refs = new Set<string>();
for (const e of all) {
  for (const id of e.causeIds) refs.add(id);
  for (const id of e.consequenceIds) refs.add(id);
}
for (const [k, list] of Object.entries(w.history.lateConsequences)) {
  refs.add(k);
  for (const id of list) refs.add(id);
}
for (const list of Object.values(w.causes)) for (const id of list) refs.add(id);
for (const c of Object.values(w.characters)) {
  for (const id of c.eventIds) refs.add(id);
  for (const m of c.memories) if (m.eventId) refs.add(m.eventId);
}
for (const fd of Object.values(w.firstDiscoveries)) refs.add(fd.eventId);
const dangling = [...refs].filter((id) => !isKnownEventId(w, id) || !resolveId(w, id, (k) => chunks.get(k)));

const saveBytes = JSON.stringify(w).length;
const archiveBytes = [...chunks.values()].reduce((a, c) => a + JSON.stringify(c).length, 0);
const loaded = await loadWorld();
const milestones = w.events.filter((e) => e.importance >= 4).length;

const report = {
  seed,
  years,
  wallSeconds: Math.round((Date.now() - t0) / 1000),
  msPerSimYear: { mean: Math.round(perYearMs.reduce((a, b) => a + b, 0) / perYearMs.length), max: Math.max(...perYearMs) },
  peakHeapMB: mb(peakHeap),
  peakRssMB: mb(peakRss),
  saveMB: mb(saveBytes),
  archiveMB: mb(archiveBytes),
  reloadStatus: loaded.status,
  events: {
    recordedTotal: w.events.length + w.history.archivedCount + w.history.compactedCount,
    hot: w.events.length,
    archived: w.history.archivedCount,
    compactedIntoSummaries: w.history.compactedCount,
    chunks: w.history.chunks.length,
    milestonesHot: milestones,
  },
  danglingLinks: dangling.length,
  danglingSample: dangling.slice(0, 5),
  missingChunks,
  important: { total: important, withCause, withCauseOrRoot, shareWithCause: +(withCause / Math.max(1, important)).toFixed(4), shareWithCauseOrRoot: +(withCauseOrRoot / Math.max(1, important)).toFixed(4) },
  population: {
    civs: Object.keys(w.civs).length,
    settlements: Object.keys(w.settlements).length,
    individualsAlive: Object.values(w.characters).filter((c) => c.alive).length,
    individualsEver: Object.keys(w.characters).length,
  },
};
console.log(JSON.stringify(report, null, 2));
writeFileSync('soak-report.json', JSON.stringify(report, null, 2) + '\n');
if (dangling.length || missingChunks.length) process.exit(1);
