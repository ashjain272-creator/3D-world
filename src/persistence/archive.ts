/**
 * Lazy access to archived history chunks for the UI. Unsaved chunks are
 * served from the simulation host's memory; saved ones from IndexedDB.
 */
import type { HistoryEvent } from '../sim/types';
import { readArchiveChunk } from './db';

type Provider = (key: string) => Promise<HistoryEvent[] | undefined> | HistoryEvent[] | undefined;
let memoryProvider: Provider | null = null;

/** The simulation host registers how to read chunks it has not persisted yet. */
export function setArchiveMemoryProvider(p: Provider | null): void {
  memoryProvider = p;
}

export async function loadArchiveChunk(seed: string, key: string): Promise<HistoryEvent[] | undefined> {
  const mem = memoryProvider ? await memoryProvider(key) : undefined;
  if (mem) return mem;
  return readArchiveChunk(seed, key).catch(() => undefined);
}
