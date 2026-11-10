import { describe, expect, it } from 'vitest';
import { soundscapeMix, type SoundscapeInput } from '../src/audio/ambient';
import { DEFAULT_SETTINGS } from '../src/state/settings';

const base: SoundscapeInput = { view: 'explorer', weather: 'clear', hour: 12, crowd: 0, cloud: false, volume: 1 };

describe('procedural soundscape', () => {
  it('is off by default', () => {
    expect(DEFAULT_SETTINGS.audioEnabled).toBe(false);
  });

  it('plays a space drone in the universe view and nothing else', () => {
    const m = soundscapeMix({ ...base, view: 'universe' });
    expect(m.drone).toBeGreaterThan(0);
    expect(m.wind + m.rain + m.crowd + m.night).toBe(0);
  });

  it('follows weather, crowd, time of day and location', () => {
    expect(soundscapeMix({ ...base, weather: 'rain' }).rain).toBeGreaterThan(0);
    expect(soundscapeMix(base).rain).toBe(0);
    expect(soundscapeMix({ ...base, weather: 'storm' }).wind).toBeGreaterThan(soundscapeMix(base).wind);
    expect(soundscapeMix({ ...base, crowd: 200 }).crowd).toBeGreaterThan(soundscapeMix({ ...base, crowd: 20 }).crowd);
    expect(soundscapeMix({ ...base, hour: 23 }).night).toBeGreaterThan(0);
    expect(soundscapeMix(base).night).toBe(0);
    expect(soundscapeMix({ ...base, hour: 23, cloud: true }).night).toBe(0);
    expect(soundscapeMix({ ...base, cloud: true }).wind).toBeGreaterThan(soundscapeMix(base).wind);
  });

  it('scales every layer with volume and goes silent at zero', () => {
    const m = soundscapeMix({ ...base, weather: 'storm', crowd: 300, volume: 0 });
    expect(Object.values(m).every((x) => x === 0)).toBe(true);
  });
});
