import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { validateAndMigrate, SaveError } from '../src/persistence/validate';
import { loadWorld, saveWorld, clearSaves } from '../src/persistence/db';
import { advance } from '../src/sim/engine';
import { MINUTES_PER_DAY } from '../src/sim/time';
import { freshWorld } from './helpers';

describe('save validation', () => {
  it('accepts a valid world after a JSON round trip', () => {
    const w = freshWorld();
    advance(w, 5 * MINUTES_PER_DAY);
    const back = validateAndMigrate(JSON.parse(JSON.stringify(w)));
    expect(back.time).toBe(w.time);
    expect(Object.keys(back.characters).length).toBe(Object.keys(w.characters).length);
  });

  it('repairs older saves with missing optional fields', () => {
    const w = JSON.parse(JSON.stringify(freshWorld()));
    delete w.customTechs;
    delete w.player;
    for (const c of Object.values(w.characters) as Record<string, unknown>[]) {
      delete c.recent;
      delete c.discontent;
    }
    for (const c of Object.values(w.civs) as Record<string, unknown>[]) delete c.causeLinks;
    w.schemaVersion = 1;
    const fixed = validateAndMigrate(w);
    expect(fixed.customTechs).toEqual([]);
    expect(fixed.player.discoveredLandmarkIds).toEqual([]);
    expect(Object.values(fixed.characters)[0].recent).toEqual([]);
    expect(fixed.schemaVersion).toBeGreaterThan(1);
    // and the repaired world still simulates
    advance(fixed, 3 * MINUTES_PER_DAY);
  });

  it('rejects corrupted data with a reason', () => {
    expect(() => validateAndMigrate('nonsense')).toThrow(SaveError);
    expect(() => validateAndMigrate({ schemaVersion: 3 })).toThrow(/missing/);
    const w = JSON.parse(JSON.stringify(freshWorld()));
    w.time = 'later';
    expect(() => validateAndMigrate(w)).toThrow(/clock/);
    const future = JSON.parse(JSON.stringify(freshWorld()));
    future.schemaVersion = 999;
    expect(() => validateAndMigrate(future)).toThrow(/newer/);
  });
});

describe('IndexedDB persistence', () => {
  it('saves and restores a universe', async () => {
    await clearSaves();
    expect((await loadWorld()).status).toBe('empty');
    const w = freshWorld();
    advance(w, 2 * MINUTES_PER_DAY);
    await saveWorld(w);
    const res = await loadWorld();
    expect(res.status).toBe('ok');
    if (res.status === 'ok') {
      expect(res.world.time).toBe(w.time);
      expect(res.world.seed).toBe(w.seed);
      expect(res.world.events.length).toBe(w.events.length);
    }
  });

  it('reports a corrupted autosave instead of crashing', async () => {
    await clearSaves();
    const req = indexedDB.open('project-genesis', 2);
    await new Promise<void>((resolve, reject) => {
      req.onsuccess = () => {
        const tx = req.result.transaction('saves', 'readwrite');
        tx.objectStore('saves').put({ schemaVersion: 3, garbage: true }, 'autosave');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
    const res = await loadWorld();
    expect(res.status).toBe('corrupt');
  });
});
