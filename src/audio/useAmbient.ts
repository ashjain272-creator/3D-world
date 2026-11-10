import { useEffect } from 'react';
import { crowdStats } from '../explorer/Crowd';
import { hasSurface } from '../sim/generate/cosmos';
import { localHour } from '../sim/time';
import { getWorld, useApp } from '../state/store';
import { ambient, soundscapeMix, type SoundscapeInput } from './ambient';

function currentInput(volume: number): SoundscapeInput {
  const h = location.hash.replace(/^#\/?/, '').split('/');
  const section = h[0] || 'universe';
  const w = getWorld();
  if (section !== 'explorer') return { view: section === 'universe' ? 'universe' : 'other', weather: 'clear', hour: 12, crowd: 0, cloud: false, volume };
  const s = w.settlements[h[1]];
  const planet = s ? w.planets[s.planetId] : w.planets[h[1]];
  return {
    view: 'explorer',
    weather: planet?.environment.weather ?? 'clear',
    hour: planet ? localHour(w.time, planet.dayLengthHours) : 12,
    crowd: crowdStats.visible,
    cloud: !!planet && !hasSurface(planet.type),
    volume,
  };
}

/** Keeps the procedural soundscape in step with settings, view and world state. */
export function useAmbientAudio(): void {
  const enabled = useApp((s) => s.settings.audioEnabled);
  const volume = useApp((s) => s.settings.audioVolume);
  useEffect(() => {
    if (!enabled) {
      ambient.disable();
      return;
    }
    // a saved "on" setting still needs a user gesture before sound may start
    const kick = () => ambient.enable();
    kick();
    window.addEventListener('pointerdown', kick, { once: true });
    const iv = window.setInterval(() => ambient.update(soundscapeMix(currentInput(volume))), 250);
    return () => {
      window.removeEventListener('pointerdown', kick);
      window.clearInterval(iv);
    };
  }, [enabled, volume]);
}
