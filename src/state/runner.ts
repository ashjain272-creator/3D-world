/**
 * Simulation client for the UI.
 *
 * Worker mode (default): the World lives in a dedicated Web Worker
 * (src/sim/worker.ts). The main thread keeps a read-only snapshot that is
 * updated by field-level patches at the UI refresh rate; every mutation goes
 * through `sim.exec()`.
 *
 * Main-thread mode (fallback when workers are unavailable, or `?sim=main`):
 * the same SimHost runs here and the snapshot *is* the live world.
 */
import { SimHost, applyPatch, type Command, type CommandResult, type FeedEntry } from '../sim/host';
import type { FromWorker, ToWorker } from '../sim/protocol';
import { peekPendingChunk } from '../sim/history';
import type { HistoryEvent, World } from '../sim/types';
import { causality } from '../sim/world';
import { exportWorld, saveWorld } from '../persistence/db';
import { setArchiveMemoryProvider } from '../persistence/archive';
import { getWorld, maybeWorld, setWorldRef, useApp } from './store';

export type SimMode = 'worker' | 'main';

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };
type Request = Extract<ToWorker, { id: number }> extends infer T ? (T extends unknown ? Omit<T, 'id'> : never) : never;

/** Latest activity feed for the settlement shown in Explorer. */
export const explorerFeed = new Map<string, FeedEntry>();

class SimClient {
  mode: SimMode = 'main';
  /** Main-thread milliseconds spent on simulation work (ticks or patch application), for profiling. */
  stats = { mainThreadMs: 0, patches: 0, patchBytes: 0 };
  private worker: Worker | null = null;
  private host: SimHost | null = null;
  private interval: number | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private lastBump = 0;
  private lastSave = 0;
  private last = 0;
  private lastEventCount = 0;
  private started = false;
  private feedSettlement: string | null = null;

  /** Hand a world to the simulation and start running it. */
  async start(world: World): Promise<void> {
    setWorldRef(world);
    this.lastEventCount = world.events.length;
    const app = useApp.getState();
    const forceMain = typeof location !== 'undefined' && new URLSearchParams(location.search).get('sim') === 'main';
    if (this.worker || this.host) this.stopLoops();
    if (!forceMain && typeof Worker !== 'undefined') {
      try {
        await this.startWorker(world, app.speed, app.settings.uiRefreshHz, app.settings.autosaveSeconds);
        this.mode = 'worker';
      } catch (e) {
        console.warn('[Genesis] simulation worker unavailable, running on the main thread:', (e as Error).message);
        this.worker?.terminate();
        this.worker = null;
      }
    }
    if (!this.worker) {
      this.mode = 'main';
      this.host = new SimHost(world);
      this.host.speed = app.speed;
      this.last = performance.now();
      this.lastSave = this.last;
      this.interval = window.setInterval(() => this.mainLoop(), 100);
    }
    setArchiveMemoryProvider((key) => this.chunk(key));
    if (!this.started) {
      this.started = true;
      useApp.subscribe((s, prev) => {
        if (s.speed !== prev.speed) this.setSpeed(s.speed);
        if (s.settings.uiRefreshHz !== prev.settings.uiRefreshHz || s.settings.autosaveSeconds !== prev.settings.autosaveSeconds)
          this.post({ type: 'settings', refreshHz: s.settings.uiRefreshHz, autosaveSeconds: s.settings.autosaveSeconds });
      });
      document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && void this.save());
      window.addEventListener('pagehide', () => void this.save());
    }
    if (this.feedSettlement) this.subscribeFeed(this.feedSettlement);
  }

  private startWorker(world: World, speed: number, refreshHz: number, autosaveSeconds: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const w = new Worker(new URL('../sim/worker.ts', import.meta.url), { type: 'module' });
      const timer = window.setTimeout(() => reject(new Error('worker did not start within 10 s')), 10000);
      w.onerror = (e) => {
        window.clearTimeout(timer);
        reject(new Error(e.message || 'worker failed to load'));
      };
      w.onmessage = (ev: MessageEvent<FromWorker>) => {
        if (ev.data.type === 'ready') {
          window.clearTimeout(timer);
          w.onmessage = (m: MessageEvent<FromWorker>) => this.onMessage(m.data);
          w.onerror = (e) => useApp.getState().toast({ kind: 'error', title: 'Simulation worker error', body: e.message });
          this.worker = w;
          resolve();
        }
      };
      w.postMessage({ type: 'init', world, speed, refreshHz, autosaveSeconds, strict: causality.strict } satisfies ToWorker);
    });
  }

  private post(m: ToWorker): void {
    this.worker?.postMessage(m);
  }

  private request<T>(m: Request): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.post({ ...m, id } as ToWorker);
    });
  }

  private onMessage(m: FromWorker): void {
    switch (m.type) {
      case 'patch': {
        const w = maybeWorld();
        if (!w) return;
        const t0 = performance.now();
        applyPatch(w, m.patch);
        this.stats.mainThreadMs += performance.now() - t0;
        this.stats.patches++;
        this.afterUpdate(!!m.patch.events.replace);
        useApp.getState().bump();
        break;
      }
      case 'feed':
        if (m.settlementId !== this.feedSettlement) return;
        explorerFeed.clear();
        for (const e of m.entries) explorerFeed.set(e.id, e);
        break;
      case 'result': {
        const p = this.pending.get(m.id);
        if (!p) return;
        this.pending.delete(m.id);
        if (m.error && m.result === undefined) p.reject(new Error(m.error));
        else p.resolve(m.result);
        break;
      }
      case 'error':
        useApp.getState().toast({ kind: 'error', title: 'Simulation', body: m.message });
        break;
    }
  }

  private mainLoop(): void {
    const host = this.host;
    if (!host || useApp.getState().phase !== 'ready') return;
    const now = performance.now();
    host.tick((now - this.last) / 1000, 14);
    this.stats.mainThreadMs += performance.now() - now;
    this.last = now;
    if (this.feedSettlement) {
      explorerFeed.clear();
      for (const e of host.feed(this.feedSettlement)) explorerFeed.set(e.id, e);
    }
    const app = useApp.getState();
    if (now - this.lastBump > 1000 / Math.max(1, app.settings.uiRefreshHz)) {
      this.lastBump = now;
      this.afterUpdate(false);
      app.bump();
    }
    if (now - this.lastSave > app.settings.autosaveSeconds * 1000) {
      this.lastSave = now;
      void this.save();
    }
  }

  /** Toast notable new events. */
  private afterUpdate(replaced: boolean): void {
    const w = getWorld();
    if (replaced || w.events.length < this.lastEventCount) {
      this.lastEventCount = w.events.length;
      return;
    }
    if (w.events.length > this.lastEventCount) {
      const app = useApp.getState();
      const fresh = w.events.slice(this.lastEventCount).filter((e) => e.importance >= app.settings.notifyImportance);
      for (const e of fresh.slice(-2)) app.toast({ kind: 'event', title: e.title, body: e.description, eventId: e.id });
      this.lastEventCount = w.events.length;
    }
  }

  setSpeed(speed: number): void {
    if (this.host) this.host.speed = speed;
    this.post({ type: 'speed', speed });
  }

  /** Apply a command (intervention, player action, leap). */
  async exec(cmd: Command): Promise<CommandResult> {
    if (this.host) {
      const r = this.host.exec(cmd);
      this.afterUpdate(false);
      useApp.getState().bump();
      return r;
    }
    return this.request<CommandResult>({ type: 'cmd', cmd });
  }

  async save(): Promise<boolean> {
    try {
      if (this.host) {
        await saveWorld(this.host.world);
        return true;
      }
      if (!this.worker) return false;
      const r = await this.request<{ ok: boolean; error?: string }>({ type: 'save' });
      return r.ok;
    } catch (e) {
      useApp.getState().toast({ kind: 'error', title: 'Save failed', body: (e as Error).message });
      return false;
    }
  }

  async export(): Promise<Blob> {
    if (this.host) return exportWorld(this.host.world);
    return this.request<Blob>({ type: 'export' });
  }

  /** Unsaved archive chunk held by the simulation (for lazy history loading). */
  async chunk(key: string): Promise<HistoryEvent[] | undefined> {
    if (this.host) return peekPendingChunk(this.host.world, key);
    if (!this.worker) return undefined;
    return (await this.request<HistoryEvent[] | null>({ type: 'chunk', key })) ?? undefined;
  }

  subscribeFeed(settlementId: string | null): void {
    this.feedSettlement = settlementId;
    explorerFeed.clear();
    this.post({ type: 'feed', settlementId });
  }

  private stopLoops(): void {
    if (this.interval !== null) window.clearInterval(this.interval);
    this.interval = null;
    this.worker?.terminate();
    this.worker = null;
    this.host = null;
    for (const p of this.pending.values()) p.reject(new Error('Simulation restarted'));
    this.pending.clear();
  }
}

export const sim = new SimClient();

/** Start (or restart) the simulation on the current world. */
export function startRunner(): Promise<void> {
  return sim.start(getWorld());
}

export function saveNow(): Promise<boolean> {
  return sim.save();
}
