import { describe, expect, it } from 'vitest';
import { Rng, hashString } from '../src/sim/rng';

describe('Rng', () => {
  it('is deterministic for a seed', () => {
    const a = new Rng('alpha');
    const b = new Rng('alpha');
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
  it('differs across seeds', () => {
    const a = new Rng('alpha');
    const b = new Rng('beta');
    const sa = Array.from({ length: 10 }, () => a.next());
    const sb = Array.from({ length: 10 }, () => b.next());
    expect(sa).not.toEqual(sb);
  });
  it('produces values in range and roughly uniform', () => {
    const r = new Rng(42);
    let sum = 0;
    for (let i = 0; i < 10000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
    }
    expect(sum / 10000).toBeGreaterThan(0.47);
    expect(sum / 10000).toBeLessThan(0.53);
    for (let i = 0; i < 1000; i++) {
      const n = r.int(3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
    }
  });
  it('can resume from serialised state', () => {
    const a = new Rng('resume');
    a.next();
    a.next();
    const b = new Rng(1);
    b.state = a.state;
    expect(b.next()).toBe(a.next());
  });
  it('hashString is stable', () => {
    expect(hashString('genesis')).toBe(hashString('genesis'));
    expect(hashString('genesis')).not.toBe(hashString('Genesis'));
  });
});

describe('determinism guard', () => {
  it('never uses Math.random inside src/sim', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
    const offenders = walk('src/sim')
      .filter((f) => f.endsWith('.ts'))
      .filter((f) => /Math\.random\s*\(/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
