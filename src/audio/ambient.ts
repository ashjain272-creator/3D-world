/**
 * Optional procedural soundscape (WebAudio only, no audio files).
 *
 * Off by default. Turning it on happens from a user gesture (Settings or the
 * top-bar speaker button), which is what browsers require before an
 * AudioContext may produce sound.
 *
 * Layers, each a gain driven by `soundscapeMix`:
 *  - drone: two detuned oscillators through a slow-moving low-pass (space)
 *  - wind:  low-passed noise, louder in storms and on cloud platforms
 *  - rain:  high-passed noise during rain and storms
 *  - crowd: band-passed noise, scaled by how many people are in view
 *  - night: short sine chirps (insects) on surface worlds after dark
 */

export type Weather = 'clear' | 'cloudy' | 'rain' | 'storm' | 'snow' | 'fog' | 'dust';

export interface SoundscapeInput {
  view: 'universe' | 'explorer' | 'other';
  weather: Weather;
  /** Local hour 0..24 (explorer only). */
  hour: number;
  /** Visible ambient figures. */
  crowd: number;
  /** Floating platform on a gas/ice giant. */
  cloud: boolean;
  volume: number;
}

export interface SoundscapeMix {
  drone: number;
  wind: number;
  rain: number;
  crowd: number;
  night: number;
}

/** Pure mixing rule: what each layer's level should be for a situation. */
export function soundscapeMix(i: SoundscapeInput): SoundscapeMix {
  const v = Math.max(0, Math.min(1, i.volume));
  if (i.view !== 'explorer') return { drone: (i.view === 'universe' ? 0.5 : 0.25) * v, wind: 0, rain: 0, crowd: 0, night: 0 };
  const dark = i.hour < 5.5 || i.hour > 20.5;
  const storm = i.weather === 'storm';
  const wet = storm || i.weather === 'rain';
  const windBase = i.cloud ? 0.55 : i.weather === 'dust' || i.weather === 'snow' ? 0.4 : 0.18;
  return {
    drone: 0.08 * v,
    wind: Math.min(1, windBase + (storm ? 0.35 : 0)) * v,
    rain: wet ? (storm ? 0.6 : 0.4) * v : 0,
    crowd: Math.min(1, i.crowd / 220) * 0.45 * v,
    night: dark && !wet && !i.cloud ? 0.35 * v : 0,
  };
}

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  // deterministic LCG noise: no Math.random needed
  let x = 22695477;
  let last = 0;
  for (let k = 0; k < len; k++) {
    x = (x * 1103515245 + 12345) >>> 0;
    const white = x / 4294967296 - 0.5;
    last = last * 0.97 + white * 0.25; // slightly pinked
    d[k] = white * 0.6 + last;
  }
  return buf;
}

class Ambient {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private layers: Record<keyof SoundscapeMix, GainNode> | null = null;
  private chirpTimer = 0;
  private nightLevel = 0;
  private x = 7;
  enabled = false;

  /** Must be called from a user gesture the first time. */
  enable(): boolean {
    this.enabled = true;
    if (typeof window === 'undefined') return false;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return false;
    if (!this.ctx) this.build(new Ctor());
    void this.ctx!.resume();
    return true;
  }

  disable(): void {
    this.enabled = false;
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
      window.setTimeout(() => {
        if (!this.enabled) void this.ctx?.suspend();
      }, 600);
    }
  }

  get state(): string {
    return this.ctx?.state ?? 'none';
  }

  private build(ctx: AudioContext): void {
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    this.master = master;
    const noise = noiseBuffer(ctx);
    const src = () => {
      const s = ctx.createBufferSource();
      s.buffer = noise;
      s.loop = true;
      s.start(0, Math.abs(this.next()) * 1.9);
      return s;
    };
    const layer = () => {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(master);
      return g;
    };
    // drone
    const drone = layer();
    const dl = ctx.createBiquadFilter();
    dl.type = 'lowpass';
    dl.frequency.value = 420;
    dl.connect(drone);
    for (const [f, type] of [[55, 'sine'], [82.6, 'triangle'], [110.4, 'sine']] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = 0.18;
      o.connect(og).connect(dl);
      o.start();
    }
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 220;
    lfo.connect(lfoGain).connect(dl.frequency);
    lfo.start();
    // wind
    const wind = layer();
    const wl = ctx.createBiquadFilter();
    wl.type = 'lowpass';
    wl.frequency.value = 500;
    wl.Q.value = 3;
    src().connect(wl).connect(wind);
    const gust = ctx.createOscillator();
    gust.frequency.value = 0.11;
    const gustGain = ctx.createGain();
    gustGain.gain.value = 260;
    gust.connect(gustGain).connect(wl.frequency);
    gust.start();
    // rain
    const rain = layer();
    const rh = ctx.createBiquadFilter();
    rh.type = 'highpass';
    rh.frequency.value = 2400;
    src().connect(rh).connect(rain);
    // crowd murmur
    const crowd = layer();
    const cb = ctx.createBiquadFilter();
    cb.type = 'bandpass';
    cb.frequency.value = 650;
    cb.Q.value = 0.9;
    src().connect(cb).connect(crowd);
    const mur = ctx.createOscillator();
    mur.frequency.value = 0.7;
    const murGain = ctx.createGain();
    murGain.gain.value = 180;
    mur.connect(murGain).connect(cb.frequency);
    mur.start();
    // night insects: scheduled chirps into this gain
    const night = layer();
    night.gain.value = 1;
    this.layers = { drone, wind, rain, crowd, night };
  }

  private next(): number {
    this.x = (this.x * 1664525 + 1013904223) >>> 0;
    return this.x / 4294967296;
  }

  /** Apply a mix; call a few times a second. */
  update(mix: SoundscapeMix): void {
    if (!this.ctx || !this.layers || !this.master) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.enabled ? 1 : 0, t, 0.3);
    for (const k of ['drone', 'wind', 'rain', 'crowd'] as const) this.layers[k].gain.setTargetAtTime(mix[k] * 0.6, t, 0.8);
    this.nightLevel = mix.night;
    if (this.enabled && this.nightLevel > 0 && t > this.chirpTimer) {
      this.chirp(t);
      this.chirpTimer = t + 0.25 + this.next() * 0.9;
    }
  }

  private chirp(t: number): void {
    const ctx = this.ctx!;
    const f = 3800 + this.next() * 1400;
    const pulses = 2 + Math.floor(this.next() * 3);
    for (let k = 0; k < pulses; k++) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const g = ctx.createGain();
      const s = t + k * 0.07;
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(0.05 * this.nightLevel, s + 0.01);
      g.gain.linearRampToValueAtTime(0, s + 0.045);
      o.connect(g).connect(this.layers!.night);
      o.start(s);
      o.stop(s + 0.06);
    }
  }
}

export const ambient = new Ambient();
