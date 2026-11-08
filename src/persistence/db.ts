/**
 * IndexedDB persistence. The universe is stored as a structured-clone object
 * under the 'autosave' key; every few saves the previous copy is kept as a
 * 'backup'. Corrupted saves are quarantined rather than deleted.
 */
import type { World } from '../sim/types';
import { SaveError, validateAndMigrate } from './validate';

const DB_NAME = 'project-genesis';
const STORE = 'saves';
let dbPromise: Promise<IDBDatabase> | null = null;
let saveCount = 0;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable in this browser.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open database'));
  });
  dbPromise.catch(() => (dbPromise = null));
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);
        const req = fn(store);
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

export async function saveWorld(world: World): Promise<void> {
  world.savedAtReal = Date.now();
  saveCount++;
  if (saveCount % 6 === 0) {
    const prev = await tx<unknown>('readonly', (s) => s.get('autosave'));
    if (prev) await tx('readwrite', (s) => s.put(prev, 'backup'));
  }
  await tx('readwrite', (s) => {
    s.put(world, 'autosave');
    s.put({ seed: world.seed, savedAt: world.savedAtReal, time: world.time, galaxy: world.galaxy.name } satisfies SaveMeta, 'meta');
  });
}

export type LoadResult =
  | { status: 'ok'; world: World; recoveredFromBackup?: boolean }
  | { status: 'empty' }
  | { status: 'corrupt'; reason: string };

export async function loadWorld(): Promise<LoadResult> {
  let raw: unknown;
  try {
    raw = await tx<unknown>('readonly', (s) => s.get('autosave'));
  } catch (e) {
    return { status: 'corrupt', reason: `Storage could not be read: ${(e as Error).message}` };
  }
  if (!raw) return { status: 'empty' };
  try {
    return { status: 'ok', world: validateAndMigrate(raw) };
  } catch (e) {
    const reason = e instanceof SaveError ? e.message : `Unreadable save (${(e as Error).message})`;
    await tx('readwrite', (s) => s.put(raw, `corrupt-${Date.now()}`)).catch(() => undefined);
    const backup = await tx<unknown>('readonly', (s) => s.get('backup')).catch(() => undefined);
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

export async function clearSaves(): Promise<void> {
  await tx('readwrite', (s) => s.clear());
}

export function exportWorld(world: World): Blob {
  return new Blob([JSON.stringify(world)], { type: 'application/json' });
}

export async function importWorld(file: File): Promise<World> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new SaveError('The file is not valid JSON.');
  }
  return validateAndMigrate(parsed);
}
