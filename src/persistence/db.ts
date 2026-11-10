/**
 * IndexedDB persistence.
 *
 *  - 'saves'   : the hot universe under 'autosave' (+ a rotating 'backup' and save metadata).
 *  - 'archive' : archived history chunks, keyed `${seed}:${chunkKey}`, loaded lazily.
 *
 * Chunks are append-only and written in the same transaction as the save that
 * first references them, so a save can never point at a chunk that is missing.
 * Corrupted saves are quarantined rather than deleted.
 */
import type { HistoryEvent, World } from '../sim/types';
import { markChunksPersisted, pendingArchiveChunks } from '../sim/history';
import { SaveError, validateAndMigrate } from './validate';

const DB_NAME = 'project-genesis';
const SAVES = 'saves';
const ARCHIVE = 'archive';
let dbPromise: Promise<IDBDatabase> | null = null;
let saveCount = 0;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable in this browser.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(SAVES)) req.result.createObjectStore(SAVES);
      if (!req.result.objectStoreNames.contains(ARCHIVE)) req.result.createObjectStore(ARCHIVE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open database'));
  });
  dbPromise.catch(() => (dbPromise = null));
  return dbPromise;
}

function tx<T>(stores: string | string[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => IDBRequest<T> | void): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const t = db.transaction(stores, mode);
        const req = fn(t);
        let result: T | undefined;
        if (req) req.onsuccess = () => (result = req.result);
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error ?? new Error('Transaction failed'));
        t.onabort = () => reject(t.error ?? new Error('Transaction aborted'));
      }),
  );
}

export interface SaveMeta {
  seed: string;
  savedAt: number;
  time: number;
  galaxy: string;
}

const chunkKey = (seed: string, key: string) => `${seed}:${key}`;

export async function saveWorld(world: World): Promise<void> {
  world.savedAtReal = Date.now();
  saveCount++;
  if (saveCount % 6 === 0) {
    const prev = await tx<unknown>(SAVES, 'readonly', (t) => t.objectStore(SAVES).get('autosave'));
    if (prev) await tx(SAVES, 'readwrite', (t) => void t.objectStore(SAVES).put(prev, 'backup'));
  }
  const chunks = pendingArchiveChunks(world);
  await tx([SAVES, ARCHIVE], 'readwrite', (t) => {
    const a = t.objectStore(ARCHIVE);
    for (const c of chunks) a.put(c.events, chunkKey(world.seed, c.key));
    const s = t.objectStore(SAVES);
    s.put(world, 'autosave');
    s.put({ seed: world.seed, savedAt: world.savedAtReal, time: world.time, galaxy: world.galaxy.name } satisfies SaveMeta, 'meta');
  });
  markChunksPersisted(
    world,
    chunks.map((c) => c.key),
  );
}

export type LoadResult =
  | { status: 'ok'; world: World; recoveredFromBackup?: boolean }
  | { status: 'empty' }
  | { status: 'corrupt'; reason: string };

export async function loadWorld(): Promise<LoadResult> {
  let raw: unknown;
  try {
    raw = await tx<unknown>(SAVES, 'readonly', (t) => t.objectStore(SAVES).get('autosave'));
  } catch (e) {
    return { status: 'corrupt', reason: `Storage could not be read: ${(e as Error).message}` };
  }
  if (!raw) return { status: 'empty' };
  try {
    return { status: 'ok', world: validateAndMigrate(raw) };
  } catch (e) {
    const reason = e instanceof SaveError ? e.message : `Unreadable save (${(e as Error).message})`;
    await tx(SAVES, 'readwrite', (t) => void t.objectStore(SAVES).put(raw, `corrupt-${Date.now()}`)).catch(() => undefined);
    const backup = await tx<unknown>(SAVES, 'readonly', (t) => t.objectStore(SAVES).get('backup')).catch(() => undefined);
    if (backup) {
      try {
        return { status: 'ok', world: validateAndMigrate(backup), recoveredFromBackup: true };
      } catch {
        /* fall through */
      }
    }
    return { status: 'corrupt', reason };
  }
}

/** Load one archived chunk from the database (undefined if absent). */
export async function readArchiveChunk(seed: string, key: string): Promise<HistoryEvent[] | undefined> {
  return tx<HistoryEvent[]>(ARCHIVE, 'readonly', (t) => t.objectStore(ARCHIVE).get(chunkKey(seed, key)));
}

/** Total stored size estimate of a universe's archive (bytes of JSON). */
export async function archiveStats(seed: string): Promise<{ chunks: number; bytes: number }> {
  const all = await tx<HistoryEvent[][]>(ARCHIVE, 'readonly', (t) => t.objectStore(ARCHIVE).getAll(IDBKeyRange.bound(`${seed}:`, `${seed}:￿`)));
  return { chunks: all?.length ?? 0, bytes: (all ?? []).reduce((a, c) => a + JSON.stringify(c).length, 0) };
}

export async function clearSaves(): Promise<void> {
  await tx([SAVES, ARCHIVE], 'readwrite', (t) => {
    t.objectStore(SAVES).clear();
    t.objectStore(ARCHIVE).clear();
  });
}

interface ExportFile {
  format: 'genesis-export';
  version: 2;
  world: World;
  archive: { key: string; events: HistoryEvent[] }[];
}

/** Export the universe including its archived history. */
export async function exportWorld(world: World): Promise<Blob> {
  const archive: ExportFile['archive'] = [];
  for (const c of world.history.chunks) {
    const pending = pendingArchiveChunks(world).find((p) => p.key === c.key);
    const events = pending?.events ?? (await readArchiveChunk(world.seed, c.key).catch(() => undefined));
    if (events) archive.push({ key: c.key, events });
  }
  const file: ExportFile = { format: 'genesis-export', version: 2, world, archive };
  return new Blob([JSON.stringify(file)], { type: 'application/json' });
}

export async function importWorld(file: File): Promise<World> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new SaveError('The file is not valid JSON.');
  }
  const asExport = parsed as Partial<ExportFile>;
  const world = validateAndMigrate(asExport.format === 'genesis-export' ? asExport.world : parsed);
  if (asExport.format === 'genesis-export' && asExport.archive?.length) {
    await tx(ARCHIVE, 'readwrite', (t) => {
      const a = t.objectStore(ARCHIVE);
      for (const c of asExport.archive!) a.put(c.events, chunkKey(world.seed, c.key));
    }).catch(() => undefined);
  }
  return world;
}
