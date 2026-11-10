/// <reference lib="webworker" />
/**
 * Simulation worker. Owns the World; the main thread holds a read-only
 * snapshot kept current with field-level patches at the UI refresh rate.
 * Saving (and archive-chunk persistence) also happens here, off the main thread.
 */
import { SimHost, type Command } from './host';
import { peekPendingChunk } from './history';
import { causality } from './world';
import type { World } from './types';
import { exportWorld, saveWorld } from '../persistence/db';
import type { ToWorker, FromWorker } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

let host: SimHost | null = null;
let refreshMs = 250;
let autosaveMs = 30000;
let feedSettlement: string | null = null;
let last = performance.now();
let lastPatch = 0;
let lastSave = performance.now();
let lastFeed = 0;
let saving = false;

const post = (m: FromWorker, transfer?: Transferable[]) => self.postMessage(m, transfer ?? []);

async function save(): Promise<{ ok: boolean; error?: string }> {
  if (!host || saving) return { ok: false, error: saving ? 'A save is already in progress' : 'No universe' };
  saving = true;
  try {
    await saveWorld(host.world);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  } finally {
    saving = false;
  }
}

function loop(): void {
  const now = performance.now();
  const dt = (now - last) / 1000;
  last = now;
  if (!host) return;
  try {
    host.tick(dt, 40);
  } catch (e) {
    post({ type: 'error', message: (e as Error).message });
  }
  if (now - lastPatch >= refreshMs) {
    lastPatch = now;
    post({ type: 'patch', patch: host.makePatch() });
  }
  if (feedSettlement && now - lastFeed >= 100) {
    lastFeed = now;
    post({ type: 'feed', settlementId: feedSettlement, entries: host.feed(feedSettlement) });
  }
  if (now - lastSave >= autosaveMs) {
    lastSave = now;
    void save().then((r) => !r.ok && r.error && post({ type: 'error', message: `Autosave failed: ${r.error}` }));
  }
}

setInterval(loop, 50);

self.onmessage = async (ev: MessageEvent<ToWorker>) => {
  const m = ev.data;
  switch (m.type) {
    case 'init':
      causality.strict = m.strict;
      host = new SimHost(m.world as World);
      host.speed = m.speed;
      refreshMs = 1000 / Math.max(1, m.refreshHz);
      autosaveMs = m.autosaveSeconds * 1000;
      last = performance.now();
      post({ type: 'ready' });
      break;
    case 'speed':
      if (host) host.speed = m.speed;
      break;
    case 'settings':
      refreshMs = 1000 / Math.max(1, m.refreshHz);
      autosaveMs = m.autosaveSeconds * 1000;
      break;
    case 'cmd': {
      if (!host) return post({ type: 'result', id: m.id, error: 'No universe' });
      try {
        const result = host.exec(m.cmd as Command);
        // push the consequences immediately so the UI sees them with the result
        post({ type: 'patch', patch: host.makePatch() });
        post({ type: 'result', id: m.id, result });
      } catch (e) {
        post({ type: 'result', id: m.id, error: (e as Error).message });
      }
      break;
    }
    case 'save': {
      const r = await save();
      post({ type: 'result', id: m.id, result: r, error: r.ok ? undefined : r.error });
      break;
    }
    case 'export': {
      if (!host) return post({ type: 'result', id: m.id, error: 'No universe' });
      const blob = await exportWorld(host.world);
      post({ type: 'result', id: m.id, result: blob });
      break;
    }
    case 'chunk': {
      const events = host ? peekPendingChunk(host.world, m.key) : undefined;
      post({ type: 'result', id: m.id, result: events ?? null });
      break;
    }
    case 'feed':
      feedSettlement = m.settlementId;
      lastFeed = 0;
      break;
    case 'snapshot': {
      post({ type: 'result', id: m.id, result: host?.world ?? null });
      break;
    }
  }
};
