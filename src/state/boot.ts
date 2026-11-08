import { advance, snapshot } from '../sim/engine';
import { generateUniverse, randomSeed, type GenerationReport } from '../sim/generate/universe';
import { MINUTES_PER_DAY, SPEEDS } from '../sim/time';
import type { World } from '../sim/types';
import { clearSaves, loadWorld, saveWorld } from '../persistence/db';
import { resetRunnerWatermark, startRunner } from './runner';
import { setWorldRef, useApp } from './store';

export const WARMUP_DAYS = 45;

export async function boot(): Promise<void> {
  const app = useApp.getState();
  const res = await loadWorld().catch((e: Error) => ({ status: 'corrupt' as const, reason: e.message }));
  if (res.status === 'ok') {
    setWorldRef(res.world);
    if (res.recoveredFromBackup) app.toast({ kind: 'info', title: 'Recovered from backup', body: 'The latest save was damaged; an earlier backup was restored.' });
    await offlineCatchup(res.world);
    resetRunnerWatermark(res.world);
    app.setPhase('ready');
    startRunner();
    return;
  }
  if (res.status === 'corrupt') {
    app.setError(res.reason);
    app.setPhase('error');
    return;
  }
  app.setPhase(app.settings.showIntro ? 'intro' : 'generating');
  if (!app.settings.showIntro) await createUniverse(randomSeed());
}

/** Generate a fresh universe and run a short warm-up so it is already alive. */
export async function createUniverse(seed: string, onStage?: (stage: string, report?: GenerationReport) => void): Promise<World> {
  const { world, report } = generateUniverse(seed);
  world.createdAtReal = Date.now();
  onStage?.('generated', report);
  for (const civ of Object.values(world.civs)) snapshot(world, civ);
  // Warm-up in chunks so the UI stays responsive
  let remaining = WARMUP_DAYS * MINUTES_PER_DAY;
  while (remaining > 0) {
    const chunk = Math.min(remaining, 5 * MINUTES_PER_DAY);
    advance(world, chunk);
    remaining -= chunk;
    await new Promise((r) => setTimeout(r, 0));
  }
  onStage?.('warmed', report);
  setWorldRef(world);
  resetRunnerWatermark(world);
  await saveWorld(world).catch(() => undefined);
  return world;
}

export async function replaceUniverse(seed: string): Promise<void> {
  const app = useApp.getState();
  app.setPhase('generating');
  await clearSaves().catch(() => undefined);
  await createUniverse(seed);
  app.setPhase('ready');
  startRunner();
}

export function adoptWorld(world: World): void {
  setWorldRef(world);
  resetRunnerWatermark(world);
  void saveWorld(world);
  useApp.getState().setPhase('ready');
  startRunner();
}

/** Capped offline progression at real-time speed while the app was closed. */
async function offlineCatchup(world: World): Promise<void> {
  const app = useApp.getState();
  if (!app.settings.offlineProgress || !world.savedAtReal) return;
  const elapsedSec = (Date.now() - world.savedAtReal) / 1000;
  if (elapsedSec < 60) return;
  const total = Math.min(elapsedSec * SPEEDS[1].rate, app.settings.offlineCapDays * MINUTES_PER_DAY);
  const startTime = world.time;
  const startEvents = world.events.length;
  app.setCatchup({ totalMinutes: total, doneMinutes: 0, eventsAdded: 0, startTime });
  app.setPhase('catchup');
  let done = 0;
  while (done < total) {
    const r = advance(world, Math.min(total - done, 10 * MINUTES_PER_DAY), 40);
    done += r.advanced;
    app.setCatchup({ totalMinutes: total, doneMinutes: done, eventsAdded: world.events.length - startEvents, startTime });
    await new Promise((res) => setTimeout(res, 0));
  }
  app.toast({
    kind: 'info',
    title: 'While you were away',
    body: `${Math.round(total / MINUTES_PER_DAY)} days passed and ${world.events.length - startEvents} events were recorded.`,
  });
  app.setCatchup(null);
}
