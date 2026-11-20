import * as THREE from 'three';

/**
 * Colour theory for settlements. Every city takes its palette from its
 * civilisation's colour: walls are low-saturation analogous tints of it
 * (so a district reads as one place), roofs sit on the warm side of the
 * wheel, and small accents — awnings, doors, shutters, banners — use the
 * split-complementary hues so they pop without clashing.
 */
export interface CityPalette {
  walls: string[];
  glass: string[];
  stone: string[];
  roofs: string[];
  domes: string[];
  accents: string[];
  trim: string;
}

function hsl(h: number, s: number, l: number): string {
  return '#' + new THREE.Color().setHSL(((h % 1) + 1) % 1, Math.max(0, Math.min(1, s)), Math.max(0, Math.min(1, l))).getHexString();
}

export function cityPalette(civColor: string, style: string): CityPalette {
  const c = new THREE.Color(civColor);
  const { h } = c.getHSL({ h: 0, s: 0, l: 0 });
  const comp = h + 0.5;
  // analogous wall tints: hue ±0.06, desaturated, a spread of values for rhythm
  const walls =
    style === 'futuristic'
      ? [hsl(h, 0.1, 0.78), hsl(h + 0.05, 0.08, 0.66), hsl(h - 0.04, 0.12, 0.86), hsl(0.6, 0.06, 0.58), hsl(h + 0.02, 0.05, 0.92), hsl(comp, 0.07, 0.72), hsl(0.08, 0.1, 0.74), hsl(0.1, 0.24, 0.72), hsl(0.06, 0.2, 0.6), hsl(0.6, 0.05, 0.34), hsl(0.12, 0.16, 0.82)]
      : [hsl(0.09, 0.32, 0.72), hsl(0.11, 0.28, 0.8), hsl(h, 0.14, 0.78), hsl(0.07, 0.36, 0.66), hsl(0.13, 0.22, 0.86), hsl(comp, 0.12, 0.76)];
  const stone = [hsl(0.1, 0.16, 0.66), hsl(0.09, 0.14, 0.58), hsl(0.11, 0.18, 0.74), hsl(0.08, 0.12, 0.52), hsl(h, 0.08, 0.62)];
  // roofs: warm terracotta / slate split, nudged towards the civ hue
  const roofs = [hsl(0.03, 0.5, 0.36), hsl(0.05, 0.42, 0.3), hsl(0.6, 0.12, 0.3), hsl(0.02, 0.38, 0.42), hsl(h, 0.22, 0.3), hsl(0.07, 0.3, 0.26)];
  const domes = [hsl(0.11, 0.3, 0.82), hsl(0.13, 0.26, 0.74), hsl(0.22, 0.2, 0.74), hsl(0.08, 0.32, 0.78), hsl(h, 0.2, 0.8), hsl(comp, 0.16, 0.78)];
  const glass = [hsl(0.58, 0.32, 0.22), hsl(0.52, 0.28, 0.24), hsl(h, 0.3, 0.2), hsl(0.1, 0.25, 0.2)];
  // split-complementary accents at full-ish saturation, plus the civ colour itself
  const accents = [hsl(h, 0.62, 0.5), hsl(comp - 0.08, 0.58, 0.52), hsl(comp + 0.08, 0.55, 0.48), hsl(h + 0.33, 0.5, 0.5), hsl(0.1, 0.7, 0.55)];
  return { walls, glass, stone, roofs, domes, accents, trim: hsl(h, 0.08, 0.36) };
}
