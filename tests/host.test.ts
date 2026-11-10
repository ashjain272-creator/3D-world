import { describe, expect, it } from 'vitest';
import { SimHost, applyPatch } from '../src/sim/host';
import { advance } from '../src/sim/engine';
import { applyIntervention, type InterventionKind } from '../src/sim/interventions';
import { MINUTES_PER_DAY } from '../src/sim/time';
import type { World } from '../src/sim/types';
import { freshWorld, stripVolatile } from './helpers';

function strip(w: World): string {
  const { causes: _c, ...rest } = JSON.parse(stripVolatile(w)) as World;
  void _c;
  return JSON.stringify(rest);
}

describe('simulation host (worker core)', () => {
  it('a host run equals a direct replay of its intervention log', () => {
    const host = new SimHost(freshWorld('host-det'));
    host.speed = 5; // a week per real second
    const civs = Object.keys(host.world.civs);
    const planet = host.world.civs[civs[0]].homeworldId;
    const script: [number, InterventionKind, unknown[]][] = [
      [3, 'historicalIntervention', [civs[0], 'festival']],
      [9, 'changeEnvironment', [planet, { kind: 'temperature', delta: -5 }]],
      [15, 'diplomaticIntervention', [civs[0], civs[1], 'summit']],
      [22, 'discoverStarSystem', []],
      [30, 'historicalIntervention', [civs[1], 'golden_age']],
    ];
    // irregular real-time frames, as a browser would deliver them
    const frames = [0.07, 0.11, 0.09, 0.2, 0.05, 0.13, 0.31, 0.1];
    for (let i = 0; i < 40; i++) {
      host.tick(frames[i % frames.length], Infinity);
      for (const [at, kind, args] of script) if (at === i) host.exec({ type: 'intervene', kind, args });
      if (i === 25) host.exec({ type: 'leap', days: 20 });
    }
    expect(host.world.interventionLog.length).toBe(script.length);

    const replay = freshWorld('host-det');
    for (const rec of host.world.interventionLog) {
      advance(replay, rec.t - replay.time);
      applyIntervention(replay, rec.kind as InterventionKind, rec.args);
    }
    advance(replay, host.world.time - replay.time);
    expect(replay.time).toBe(host.world.time);
    expect(strip(replay)).toBe(strip(host.world));
  });

  it('patches keep the main-thread snapshot identical to the worker world', () => {
    const initial = freshWorld('host-patch');
    const snapshot = structuredClone(initial);
    const host = new SimHost(initial);
    host.speed = 4;
    let bytes = 0;
    for (let i = 0; i < 60; i++) {
      host.tick(0.25, Infinity);
      if (i === 10) host.exec({ type: 'intervene', kind: 'historicalIntervention', args: [Object.keys(initial.civs)[0], 'migration'] });
      if (i === 30) host.exec({ type: 'leap', days: 400 }); // forces a history maintenance pass
      if (i === 40) host.exec({ type: 'player', action: { type: 'follow', characterId: Object.keys(initial.characters)[0] } });
      const patch = host.makePatch();
      bytes += JSON.stringify(patch).length;
      applyPatch(snapshot, patch);
    }
    expect(strip(snapshot)).toBe(strip(host.world));
    // field-level diffs are far smaller than resending the world every refresh
    expect(bytes / 60).toBeLessThan(JSON.stringify(host.world).length * 0.5);
  });

  it('serves a per-settlement activity feed', () => {
    const host = new SimHost(freshWorld());
    const sid = Object.values(host.world.civs)[0].settlementIds[0];
    const feed = host.feed(sid);
    expect(feed.length).toBeGreaterThan(5);
    expect(feed.every((f) => f.settlementId === sid && f.type.length > 0)).toBe(true);
  });

  it('advances to a requested hour deterministically', () => {
    const host = new SimHost(freshWorld());
    host.exec({ type: 'advanceToHour', hour: 22 });
    expect(Math.round((host.world.time % MINUTES_PER_DAY) / 60)).toBe(22);
  });
});
