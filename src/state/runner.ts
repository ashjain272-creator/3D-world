/**
 * Drives the simulation in real time, independent of rendering.
 * A fixed 10 Hz interval advances the world by speed × elapsed time with a
 * per-step CPU budget; UI re-renders are throttled separately.
 */
import { advance } from '../sim/engine';
import { SPEEDS } from '../sim/time';
import type { World } from '../sim/types';
import { saveWorld } from '../persistence/db';
import { getWorld, maybeWorld, useApp } from './store';

let interval: number | null = null;
let last = 0;
let lastBump = 0;
let lastSave = 0;
let lastEventCount = 0;
let debt = 0;
let saving = false;

export function startRunner(): void {
  if (interval !== null) return;
  last = performance.now();
  lastSave = last;
  const w = maybeWorld();
  lastEventCount = w ? w.events.length : 0;
  interval = window.setInterval(step, 100);
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', onHide);
}

export function stopRunner(): void {
  if (interval !== null) window.clearInterval(interval);
  interval = null;
  document.removeEventListener('visibilitychange', onHide);
  window.removeEventListener('pagehide', onHide);
}

function onHide(): void {
  if (document.visibilityState === 'hidden') void saveNow();
}

export async function saveNow(): Promise<boolean> {
  const w = maybeWorld();
  if (!w || saving) return false;
  saving = true;
  try {
    await saveWorld(w);
    return true;
  } catch (e) {
    useApp.getState().toast({ kind: 'error', title: 'Autosave failed', body: (e as Error).message });
    return false;
  } finally {
    saving = false;
  }
}

/** Reset event watermark after loading/replacing a world. */
export function resetRunnerWatermark(world: World): void {
  lastEventCount = world.events.length;
  debt = 0;
}

function step(): void {
  const now = performance.now();
  const dt = Math.min(1, (now - last) / 1000);
  last = now;
  const app = useApp.getState();
  if (app.phase !== 'ready') return;
  const world = getWorld();
  const rate = SPEEDS[app.speed]?.rate ?? 0;
  if (rate > 0) {
    const want = rate * dt + debt;
    const res = advance(world, want, 14);
    debt = Math.min(rate * 2, want - res.advanced); // never accumulate more than 2s of backlog
  }
  if (world.events.length < lastEventCount) lastEventCount = world.events.length; // pruned
  if (world.events.length > lastEventCount) {
    const threshold = app.settings.notifyImportance;
    const fresh = world.events.slice(lastEventCount).filter((e) => e.importance >= threshold);
    for (const e of fresh.slice(-3)) app.toast({ kind: 'event', title: e.title, body: e.description, eventId: e.id });
    lastEventCount = world.events.length;
  }
  const refresh = 1000 / Math.max(1, app.settings.uiRefreshHz);
  if (now - lastBump > refresh) {
    lastBump = now;
    app.bump();
  }
  if (now - lastSave > app.settings.autosaveSeconds * 1000) {
    lastSave = now;
    void saveNow();
  }
}
