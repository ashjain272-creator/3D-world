/**
 * Resolves event ids for the UI: hot events come from the in-memory world,
 * compacted ids resolve to their monthly summary, and archived ids are loaded
 * lazily from the archive store and cached.
 */
import { useEffect, useReducer } from 'react';
import type { HistoryEvent, Id } from '../sim/types';
import { eventNum, findEvent } from '../sim/world';
import { getWorld } from './store';
import { loadArchiveChunk } from '../persistence/archive';

const cache = new Map<Id, HistoryEvent>();
const chunkState = new Map<string, 'loading' | 'done'>();
const pending = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

export type Resolved = HistoryEvent | 'loading' | 'missing';

function chunksFor(id: Id) {
  const w = getWorld();
  const n = eventNum(id);
  return w.history.chunks.filter((c) => n >= c.from && n <= c.to);
}

function load(key: string): Promise<void> {
  let p = pending.get(key);
  if (!p) {
    chunkState.set(key, 'loading');
    p = loadArchiveChunk(getWorld().seed, key)
      .then((events) => {
        for (const e of events ?? []) cache.set(e.id, e);
      })
      .finally(() => {
        chunkState.set(key, 'done');
        listeners.forEach((l) => l());
      });
    pending.set(key, p);
  }
  return p;
}

/** Resolve synchronously if possible; otherwise start loading and report 'loading'. */
export function resolveEvent(rawId: Id): Resolved {
  const w = getWorld();
  const id = w.history.redirects[rawId] ?? rawId;
  const hot = findEvent(w, id);
  if (hot) return hot;
  const cached = cache.get(id);
  if (cached) return withLate(cached);
  const chunks = chunksFor(id);
  if (!chunks.length) return 'missing';
  let loading = false;
  for (const c of chunks) {
    if (chunkState.get(c.key) !== 'done') {
      void load(c.key);
      loading = true;
    }
  }
  return loading ? 'loading' : 'missing';
}

/** Archived events gain consequences after archival; merge them in. */
function withLate(e: HistoryEvent): HistoryEvent {
  const late = getWorld().history.lateConsequences[e.id];
  return late?.length ? { ...e, consequenceIds: [...new Set([...e.consequenceIds, ...late])] } : e;
}

/** Async resolution (used by integrity checks). */
export async function resolveEventAsync(id: Id): Promise<HistoryEvent | null> {
  let r = resolveEvent(id);
  for (let i = 0; i < 3 && r === 'loading'; i++) {
    await Promise.all(chunksFor(getWorld().history.redirects[id] ?? id).map((c) => load(c.key)));
    r = resolveEvent(id);
  }
  return r === 'loading' || r === 'missing' ? null : r;
}

/** Re-render when archived chunks finish loading. */
export function useArchiveUpdates(): void {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    listeners.add(force);
    return () => {
      listeners.delete(force);
    };
  }, []);
}

export function clearHistoryCache(): void {
  cache.clear();
  pending.clear();
  chunkState.clear();
}
