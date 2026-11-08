/**
 * Deterministic pseudo-random number generation.
 *
 * All simulation and generation code draws randomness from an `Rng` so that a
 * given seed reproduces an identical universe, and a saved simulation resumes
 * with the exact same random stream. `Math.random` is never used in /sim.
 */

/** FNV-1a style 32-bit string hash. */
export function hashString(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Combine numbers into a 32-bit hash (for stable per-entity sub-seeds). */
export function hashInts(...values: number[]): number {
  let h = 0x9e3779b9;
  for (const v of values) {
    h ^= Math.imul((v | 0) ^ (v >>> 16), 0x85ebca6b);
    h = Math.imul((h << 13) | (h >>> 19), 5) + 0xe6546b64;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export class Rng {
  /** Internal mulberry32 state; serialisable. */
  state: number;

  constructor(seed: number | string) {
    this.state = (typeof seed === 'string' ? hashString(seed) : seed >>> 0) || 0x6d2b79f5;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  int(min: number, maxInclusive: number): number {
    return Math.floor(this.range(min, maxInclusive + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('Rng.pick on empty array');
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Weighted pick; weights must be non-negative. Falls back to uniform. */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T {
    let total = 0;
    for (const it of items) total += Math.max(0, weight(it));
    if (total <= 0) return this.pick(items);
    let r = this.next() * total;
    for (const it of items) {
      r -= Math.max(0, weight(it));
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  }

  /** Approximately normal via Irwin–Hall (sum of 3 uniforms). */
  normal(mean = 0, sd = 1): number {
    const n = (this.next() + this.next() + this.next() - 1.5) / 0.5;
    return mean + n * sd;
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** Derive an independent generator (does not advance much of this one). */
  fork(salt: string | number): Rng {
    const s = typeof salt === 'string' ? hashString(salt) : salt;
    return new Rng(hashInts(this.state, s, Math.floor(this.next() * 1e9)));
  }
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
