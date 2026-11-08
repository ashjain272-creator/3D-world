import * as THREE from 'three';
import { createNoise3D } from 'simplex-noise';
import { Rng } from '../sim/rng';
import type { Biome, Planet, World } from '../sim/types';

export const BIOME_COLORS: Record<Biome, [number, number, number]> = {
  ocean: [20, 60, 110],
  coast: [196, 186, 140],
  grassland: [104, 146, 72],
  forest: [44, 98, 52],
  jungle: [30, 110, 48],
  desert: [214, 176, 112],
  tundra: [150, 156, 130],
  ice: [236, 242, 248],
  mountain: [120, 110, 100],
  volcanic: [70, 44, 36],
  wasteland: [140, 120, 100],
};

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Direction on the unit sphere for a texel, matching THREE.SphereGeometry UVs. */
export function texelDir(u: number, v: number): [number, number, number] {
  const theta = v * Math.PI;
  const phi = u * Math.PI * 2;
  return [-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta)];
}

export function regionDir(lat: number, lon: number): [number, number, number] {
  const r = Math.sqrt(Math.max(0, 1 - lat * lat));
  return [Math.cos(lon * Math.PI) * r, lat, Math.sin(lon * Math.PI) * r];
}

export function seaLevel(p: Planet): number {
  switch (p.type) {
    case 'ocean':
      return 0.62;
    case 'terran':
      return 0.5;
    case 'jungle':
      return 0.4;
    case 'arctic':
      return 0.38;
    case 'desert':
      return 0.18;
    default:
      return -1;
  }
}

/** Terrain height in 0..1 at a sphere direction (shared by globe and explorer). */
export function makeHeightField(p: Planet) {
  const rng = new Rng(p.seed);
  const n3 = createNoise3D(() => rng.next());
  return (x: number, y: number, z: number) => {
    let a = 0.5,
      f = 1.6,
      s = 0;
    for (let o = 0; o < 5; o++) {
      s += a * n3(x * f, y * f, z * f);
      a *= 0.5;
      f *= 2.03;
    }
    return 0.5 + s * 0.55;
  };
}

interface TexOptions {
  width: number;
  showTerritory?: boolean;
}

const cache = new Map<string, { color: THREE.CanvasTexture; clouds: THREE.CanvasTexture | null }>();

function territorySignature(p: Planet): string {
  return p.regions.map((r) => r.ownerCivId ?? '-').join(',') + `|${p.environment.temperatureOffset}`;
}

export function planetTextures(world: World, p: Planet, opts: TexOptions): { color: THREE.CanvasTexture; clouds: THREE.CanvasTexture | null } {
  const key = `${p.id}:${opts.width}:${opts.showTerritory ? territorySignature(p) : 'plain'}`;
  const hit = cache.get(key);
  if (hit) return hit;
  // evict old variants for this planet
  for (const k of cache.keys()) {
    if (k.startsWith(`${p.id}:${opts.width}:`)) {
      cache.get(k)!.color.dispose();
      cache.get(k)!.clouds?.dispose();
      cache.delete(k);
    }
  }
  const W = opts.width;
  const H = W / 2;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const data = img.data;
  const pal = p.palette;
  const deep = hex(pal.deep),
    shallow = hex(pal.shallow),
    low = hex(pal.low),
    mid = hex(pal.mid),
    high = hex(pal.high),
    peak = hex(pal.peak);
  const height = makeHeightField(p);
  const rng = new Rng(p.seed + 7);
  const n3 = createNoise3D(() => rng.next());
  const giant = p.type === 'gas_giant' || p.type === 'ice_giant';
  const sea = seaLevel(p);
  const regions = p.regions.map((r) => ({ r, d: regionDir(r.lat, r.lon) }));
  const civColor = (id: string | null) => (id ? hex(world.civs[id]?.color ?? '#ffffff') : null);
  const regionIdx = new Int16Array(W * H);
  const temp = p.baseTemperature + p.environment.temperatureOffset;
  const iceLat = giant ? 2 : Math.max(0.35, Math.min(0.98, 0.82 - (temp - 15) * 0.012));

  for (let y = 0; y < H; y++) {
    const v = (y + 0.5) / H;
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W;
      const [dx, dy, dz] = texelDir(u, v);
      let col: [number, number, number];
      const i = (y * W + x) * 4;
      if (giant) {
        const turb = n3(dx * 3, dy * 3, dz * 3) * 0.12 + n3(dx * 9, dy * 9, dz * 9) * 0.04;
        const band = Math.sin((dy + turb) * 18 + n3(dy * 2, 0, 0) * 2) * 0.5 + 0.5;
        const band2 = Math.sin((dy + turb * 1.5) * 41) * 0.5 + 0.5;
        col = mix(mix(low, mid, band), mix(high, peak, band2), 0.35 + turb);
        const storm = n3(dx * 1.4, dy * 5, dz * 1.4);
        if (storm > 0.72) col = mix(col, deep, (storm - 0.72) * 2.5);
      } else {
        const h = height(dx, dy, dz);
        // nearest region (for biome tint and territory)
        let best = 0,
          bd = -2;
        for (let k = 0; k < regions.length; k++) {
          const d = regions[k].d;
          const dot = d[0] * dx + d[1] * dy + d[2] * dz + n3(dx * 4, dy * 4, dz * 4) * 0.04;
          if (dot > bd) {
            bd = dot;
            best = k;
          }
        }
        regionIdx[y * W + x] = best;
        if (sea > 0 && h < sea) {
          const t = Math.max(0, Math.min(1, (h - (sea - 0.25)) / 0.25));
          col = mix(deep, shallow, t * t);
        } else {
          const t = sea > 0 ? (h - sea) / (1 - sea) : h;
          col = t < 0.25 ? mix(low, mid, t / 0.25) : t < 0.6 ? mix(mid, high, (t - 0.25) / 0.35) : mix(high, peak, Math.min(1, (t - 0.6) / 0.3));
          if (regions.length) col = mix(col, BIOME_COLORS[regions[best].r.biome], 0.32);
          const detail = n3(dx * 22, dy * 22, dz * 22) * 10;
          col = [col[0] + detail, col[1] + detail, col[2] + detail];
        }
        if (Math.abs(dy) > iceLat + n3(dx * 6, dy * 6, dz * 6) * 0.05) col = mix(col, [240, 246, 252], 0.85);
        if (p.type === 'volcanic' && h > 0.62) col = mix(col, [255, 110, 40], Math.min(1, (h - 0.62) * 4));
      }
      data[i] = col[0];
      data[i + 1] = col[1];
      data[i + 2] = col[2];
      data[i + 3] = 255;
    }
  }
  if (opts.showTerritory && regions.length) {
    for (let y = 1; y < H - 1; y++) {
      for (let x = 0; x < W; x++) {
        const idx = y * W + x;
        const r = regionIdx[idx];
        const owner = regions[r].r.ownerCivId;
        const cc = civColor(owner);
        if (!cc) continue;
        const i = idx * 4;
        // tint owned territory slightly, draw border where ownership changes
        data[i] = data[i] * 0.86 + cc[0] * 0.14;
        data[i + 1] = data[i + 1] * 0.86 + cc[1] * 0.14;
        data[i + 2] = data[i + 2] * 0.86 + cc[2] * 0.14;
        const right = regionIdx[y * W + ((x + 1) % W)];
        const down = regionIdx[idx + W];
        if (regions[right].r.ownerCivId !== owner || regions[down].r.ownerCivId !== owner) {
          data[i] = cc[0];
          data[i + 1] = cc[1];
          data[i + 2] = cc[2];
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  const color = new THREE.CanvasTexture(canvas);
  color.colorSpace = THREE.SRGBColorSpace;
  color.anisotropy = 4;

  let clouds: THREE.CanvasTexture | null = null;
  if (p.atmosphere.pressure > 0.3 && !giant) {
    const cw = Math.min(W, 512);
    const ch = cw / 2;
    const cc = document.createElement('canvas');
    cc.width = cw;
    cc.height = ch;
    const cctx = cc.getContext('2d')!;
    const cimg = cctx.createImageData(cw, ch);
    const crng = new Rng(p.seed + 99);
    const cn = createNoise3D(() => crng.next());
    const cover = p.type === 'jungle' || p.type === 'ocean' ? 0.05 : p.type === 'desert' ? 0.45 : 0.2;
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const [dx, dy, dz] = texelDir((x + 0.5) / cw, (y + 0.5) / ch);
        let s = 0,
          a = 0.5,
          f = 2.2;
        for (let o = 0; o < 4; o++) {
          s += a * cn(dx * f, dy * f * 1.6, dz * f);
          a *= 0.5;
          f *= 2.1;
        }
        const alpha = Math.max(0, Math.min(1, (s - cover) * 2.4));
        const i = (y * cw + x) * 4;
        cimg.data[i] = 255;
        cimg.data[i + 1] = 255;
        cimg.data[i + 2] = 255;
        cimg.data[i + 3] = alpha * 220;
      }
    }
    cctx.putImageData(cimg, 0, 0);
    clouds = new THREE.CanvasTexture(cc);
    clouds.colorSpace = THREE.SRGBColorSpace;
  }
  const out = { color, clouds };
  cache.set(key, out);
  return out;
}

/** Soft round sprite used for stars and particles. */
let spriteTex: THREE.Texture | null = null;
export function glowSprite(): THREE.Texture {
  if (spriteTex) return spriteTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.18, 'rgba(255,255,255,0.85)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.22)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  spriteTex = new THREE.CanvasTexture(c);
  return spriteTex;
}
