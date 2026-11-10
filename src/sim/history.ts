/**
 * History retention without broken links.
 *
 * Hot history (`world.events`) keeps the last few years in full plus every
 * milestone (importance ≥ 4) forever. Older events are moved out of the save:
 *
 *  - importance 2–3 events are *archived*: stored whole in numbered chunks
 *    that live in a separate IndexedDB object store and are loaded lazily;
 *  - importance 1 events are *compacted* into one summary event per month and
 *    civilisation. The summary inherits the members' outside causes and
 *    consequences, and `history.redirects` maps every member id to it.
 *
 * Every id ever issued therefore resolves to something: a hot event, an
 * archived event (via chunk id ranges), or a summary (via redirects).
 */
import type { ArchiveChunkMeta, HistoryEvent, Id, World } from './types';
import { DAYS_PER_YEAR, MINUTES_PER_DAY, MONTH_NAMES, toDate } from './time';
import { eventIndex, eventNum, newId } from './world';

export const HOT_WINDOW_DAYS = DAYS_PER_YEAR * 3;
export const MAINTENANCE_INTERVAL_DAYS = 360;

export interface ArchiveChunk {
  key: string;
  events: HistoryEvent[];
}

/** Chunks produced by maintenance and not yet persisted (or kept in memory where no database exists). */
const pendingChunks = new WeakMap<World, Map<string, HistoryEvent[]>>();

function pendingFor(world: World): Map<string, HistoryEvent[]> {
  let m = pendingChunks.get(world);
  if (!m) {
    m = new Map();
    pendingChunks.set(world, m);
  }
  return m;
}

/** Chunks waiting to be written. The caller persists them, then calls `markChunksPersisted`. */
export function pendingArchiveChunks(world: World): ArchiveChunk[] {
  return [...pendingFor(world)].map(([key, events]) => ({ key, events }));
}

export function markChunksPersisted(world: World, keys: string[]): void {
  const m = pendingFor(world);
  for (const k of keys) m.delete(k);
}

/** In-memory chunk lookup (for unsaved chunks, and for headless runs with no database). */
export function peekPendingChunk(world: World, key: string): HistoryEvent[] | undefined {
  return pendingFor(world).get(key);
}

/** Keep chunks in memory permanently (tests and headless soak runs). */
export function retainedChunks(world: World): Map<string, HistoryEvent[]> {
  return pendingFor(world);
}

function mapIds(ids: Id[], redirects: Record<Id, Id>, self?: Id): Id[] {
  const out: Id[] = [];
  for (const id of ids) {
    const r = redirects[id] ?? id;
    if (r !== self && !out.includes(r)) out.push(r);
  }
  return out;
}

/**
 * Move old history out of the hot list. Deterministic: depends only on world
 * state, so worker and main-thread runs stay identical.
 */
export function maintainHistory(world: World, force = false): { archived: number; compacted: number; summaries: number } {
  const today = Math.floor(world.time / MINUTES_PER_DAY);
  const h = world.history;
  if (!force && today - h.lastMaintenanceDay < MAINTENANCE_INTERVAL_DAYS) return { archived: 0, compacted: 0, summaries: 0 };
  h.lastMaintenanceDay = today;
  const cutoff = world.time - HOT_WINDOW_DAYS * MINUTES_PER_DAY;
  const keep: HistoryEvent[] = [];
  const archive: HistoryEvent[] = [];
  const compact = new Map<string, HistoryEvent[]>();
  for (const e of world.events) {
    if (e.t >= cutoff || e.importance >= 4) keep.push(e);
    else if (e.importance === 1 && e.category !== 'summary') {
      const d = toDate(e.t, world.epochYear);
      const group = `${d.year}-${d.month}|${e.civIds[0] ?? 'world'}`;
      const list = compact.get(group);
      if (list) list.push(e);
      else compact.set(group, [e]);
    } else archive.push(e);
  }
  if (!archive.length && !compact.size) return { archived: 0, compacted: 0, summaries: 0 };

  // 1. Fold low-importance events into monthly summaries.
  const summaries: HistoryEvent[] = [];
  for (const [group, members] of compact) {
    const id = newId(world, 'e');
    const memberIds = new Set(members.map((m) => m.id));
    for (const m of members) h.redirects[m.id] = id;
    const civId = group.split('|')[1];
    const civ = civId === 'world' ? undefined : world.civs[civId];
    const d = toDate(members[0].t, world.epochYear);
    const byCat = new Map<string, number>();
    for (const m of members) byCat.set(m.category, (byCat.get(m.category) ?? 0) + 1);
    const causeIds: Id[] = [];
    const consequenceIds: Id[] = [];
    const characterIds: Id[] = [];
    let creator = false;
    for (const m of members) {
      for (const c of m.causeIds) if (!memberIds.has(c) && !causeIds.includes(c) && causeIds.length < 16) causeIds.push(c);
      for (const c of m.consequenceIds) if (!memberIds.has(c) && !consequenceIds.includes(c)) consequenceIds.push(c);
      for (const c of m.characterIds) if (!characterIds.includes(c) && characterIds.length < 24) characterIds.push(c);
      if ((m.rootSource ?? m.source) === 'creator') creator = true;
    }
    summaries.push({
      id,
      t: members[0].t,
      category: 'summary',
      title: `${civ ? civ.name : 'The galaxy'}: ${members.length} minor event${members.length > 1 ? 's' : ''} in ${MONTH_NAMES[d.month]} ${d.year}`,
      description: [...byCat].map(([c, n]) => `${n} ${c}`).join(', ') + ` — e.g. ${members.slice(0, 3).map((m) => m.title).join('; ')}.`,
      importance: 1,
      civIds: civ ? [civ.id] : [],
      characterIds,
      cause: 'Compacted from low-importance events to keep long histories compact. Their causes and consequences are preserved here.',
      causeIds,
      effects: [],
      consequenceIds,
      source: 'simulation',
      rootSource: creator ? 'creator' : 'simulation',
      compactedCount: members.length,
    });
  }

  // 2. Rewrite references to compacted ids everywhere still in memory.
  const redirects = h.redirects;
  const fix = (e: HistoryEvent) => {
    e.causeIds = mapIds(e.causeIds, redirects, e.id);
    e.consequenceIds = mapIds(e.consequenceIds, redirects, e.id);
  };
  for (const e of keep) fix(e);
  for (const e of archive) fix(e);
  for (const s of summaries) fix(s);
  for (const [k, list] of Object.entries(world.causes)) world.causes[k] = mapIds(list, redirects);
  for (const [k, list] of Object.entries(h.lateConsequences)) {
    const target = redirects[k];
    const mapped = mapIds(list, redirects);
    if (target) {
      delete h.lateConsequences[k];
      (h.lateConsequences[target] ??= []).push(...mapped.filter((x) => x !== target));
    } else h.lateConsequences[k] = mapped;
  }
  // Causes already archived in earlier passes cannot be edited in place:
  // record the summary as a late consequence so the back-link still exists.
  const inMemory = new Set<Id>([...keep, ...archive, ...summaries].map((e) => e.id));
  for (const sm of summaries) {
    for (const cid of sm.causeIds) {
      if (inMemory.has(cid)) continue;
      const late = (h.lateConsequences[cid] ??= []);
      if (!late.includes(sm.id)) late.push(sm.id);
    }
  }
  for (const c of Object.values(world.characters)) c.eventIds = mapIds(c.eventIds, redirects);
  for (const fd of Object.values(world.firstDiscoveries)) fd.eventId = redirects[fd.eventId] ?? fd.eventId;

  // 3. Write archived events and summaries into chunks with compact id ranges.
  const writeChunk = (prefix: string, events: HistoryEvent[]) => {
    if (!events.length) return;
    const nums = events.map((e) => eventNum(e.id));
    const meta: ArchiveChunkMeta = {
      key: `${prefix}${h.chunks.length}`,
      from: Math.min(...nums),
      to: Math.max(...nums),
      tFrom: Math.min(...events.map((e) => e.t)),
      tTo: Math.max(...events.map((e) => e.t)),
      count: events.length,
    };
    h.chunks.push(meta);
    pendingFor(world).set(meta.key, events);
  };
  writeChunk('a', archive);
  writeChunk('s', summaries);
  h.archivedCount += archive.length;
  h.compactedCount += [...compact.values()].reduce((a, l) => a + l.length, 0);
  world.events = keep;
  // the index is keyed on the events array; touching it forces a rebuild
  eventIndex(world);
  return { archived: archive.length, compacted: h.compactedCount, summaries: summaries.length };
}

/**
 * Synchronous resolution for integrity checks: hot → redirect → chunk.
 * `chunkLoader` supplies archived chunk contents (memory or database).
 */
export function resolveId(world: World, id: Id, chunkLoader: (key: string) => HistoryEvent[] | undefined): HistoryEvent | undefined {
  const idx = eventIndex(world);
  const target = world.history.redirects[id] ?? id;
  const hot = idx.get(target);
  if (hot) return hot;
  const n = eventNum(target);
  for (const c of world.history.chunks) {
    if (n < c.from || n > c.to) continue;
    const found = chunkLoader(c.key)?.find((e) => e.id === target);
    if (found) return found;
  }
  return undefined;
}
