import { generateUniverse } from '../src/sim/generate/universe';
import type { World } from '../src/sim/types';

const cache = new Map<string, string>();

/** Fresh deep copy of a generated universe (generation cached per seed for speed). */
export function freshWorld(seed = 'test-seed'): World {
  let json = cache.get(seed);
  if (!json) {
    json = JSON.stringify(generateUniverse(seed).world);
    cache.set(seed, json);
  }
  return JSON.parse(json) as World;
}

export function stripVolatile(w: World): string {
  // `stats.ticks` counts advance() calls, which legitimately differs when a span is split.
  return JSON.stringify({ ...w, createdAtReal: 0, savedAtReal: 0, stats: { ...w.stats, ticks: 0 } });
}
