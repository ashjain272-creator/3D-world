import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Geometry library for plants, rocks and props. Every shape comes in a few
 * deterministic variants (different noise seeds) so neighbouring instances
 * never share the exact same silhouette; instances add random non-uniform
 * scale and rotation on top.
 */

const cache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = cache.get(key);
  if (!g) {
    g = make();
    cache.set(key, g);
  }
  return g;
}

function hash3(x: number, y: number, z: number, s: number): number {
  const v = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + s * 4.581) * 43758.5453;
  return v - Math.floor(v);
}

/** Push vertices along their direction by smooth pseudo-noise (shared vertices move together). */
function lumpy(g: THREE.BufferGeometry, seed: number, amount: number, flatBottom = 0): THREE.BufferGeometry {
  g = g.index ? g : g;
  const p = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 2.3 + seed) * Math.cos(v.y * 2.9 - seed * 0.7) * 0.5 + Math.sin(v.z * 3.1 + v.x * 1.7 + seed * 1.3) * 0.35 + (hash3(Math.round(v.x * 40), Math.round(v.y * 40), Math.round(v.z * 40), seed) - 0.5) * 0.4;
    const k = 1 + n * amount;
    v.multiplyScalar(k);
    if (flatBottom && v.y < -flatBottom) v.y = -flatBottom + (v.y + flatBottom) * 0.25;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** Leafy blob: four irregular variants. */
export function blobGeo(variant: number, detail = 1): THREE.BufferGeometry {
  return cached(`blob${variant}:${detail}`, () => lumpy(new THREE.IcosahedronGeometry(1, detail), 1.7 + variant * 2.31, 0.32, 0.55));
}

/** One jagged skirt of a conifer: a cone whose rim is notched into drooping branch tips. */
export function skirtGeo(variant: number, segments = 9): THREE.BufferGeometry {
  return cached(`skirt${variant}:${segments}`, () => {
    const g = new THREE.ConeGeometry(1, 1, segments, 2, false);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (y < 0.49) {
        const a = Math.atan2(z, x);
        const notch = 0.78 + 0.22 * Math.abs(Math.sin(a * (segments / 2) + variant));
        const droop = y < -0.4 ? -0.12 * (1 - notch) : 0;
        p.setXYZ(i, x * notch * (1 + 0.1 * Math.sin(a * 3 + variant * 2)), y + droop, z * notch);
      }
    }
    g.computeVertexNormals();
    return g;
  });
}

/** Tapered trunk with a slight, variant-specific bend. Height 1, base at y=0. */
export function trunkGeo(variant: number, radial = 7): THREE.BufferGeometry {
  return cached(`trunk${variant}:${radial}`, () => {
    const g = new THREE.CylinderGeometry(0.16, 0.34, 1, radial, 4).translate(0, 0.5, 0);
    const p = g.attributes.position as THREE.BufferAttribute;
    const bx = Math.sin(variant * 2.1) * 0.22;
    const bz = Math.cos(variant * 1.7) * 0.22;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const flare = y < 0.1 ? 1 + (0.1 - y) * 3 : 1;
      p.setXYZ(i, p.getX(i) * flare + bx * y * y, y, p.getZ(i) * flare + bz * y * y);
    }
    g.computeVertexNormals();
    return g;
  });
}

/** Curved, ringed palm trunk. Height 1, base at y=0, leaning towards +x. */
export function palmTrunkGeo(variant: number): THREE.BufferGeometry {
  return cached(`palmtrunk${variant}`, () => {
    const g = new THREE.CylinderGeometry(0.1, 0.17, 1, 7, 14).translate(0, 0.5, 0);
    const p = g.attributes.position as THREE.BufferAttribute;
    const lean = 0.18 + variant * 0.1;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const ring = 1 + 0.12 * Math.abs(Math.sin(y * 44));
      p.setXYZ(i, p.getX(i) * ring + lean * y * y, y, p.getZ(i) * ring);
    }
    g.computeVertexNormals();
    return g;
  });
}

/** Crown of drooping palm fronds radiating from the origin. */
export function frondsGeo(variant: number): THREE.BufferGeometry {
  return cached(`fronds${variant}`, () => {
    const parts: THREE.BufferGeometry[] = [];
    const n = 8 + variant;
    for (let k = 0; k < n; k++) {
      const leaf = new THREE.PlaneGeometry(1, 0.28, 6, 1).translate(0.5, 0, 0);
      const p = leaf.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        const w = Math.sin(Math.min(1, x) * Math.PI) * 0.9 + 0.1;
        p.setXYZ(i, x, -x * x * 0.55, p.getY(i) * w);
      }
      leaf.rotateX(Math.PI / 2);
      leaf.rotateZ(0.25 + (k % 3) * 0.12);
      leaf.rotateY((k / n) * Math.PI * 2 + variant * 0.4);
      parts.push(leaf);
    }
    const g = mergeGeometries(parts);
    g.computeVertexNormals();
    return g;
  });
}

/** Ribbed barrel cactus / column: cylinder with vertical ribs, base at y=0. */
export function ribbedGeo(ribs = 12, rounded = false): THREE.BufferGeometry {
  return cached(`ribbed${ribs}:${rounded}`, () => {
    const g = rounded ? new THREE.SphereGeometry(0.5, ribs * 2, 10).translate(0, 0.5, 0) : new THREE.CapsuleGeometry(0.45, 1, 4, ribs * 2).translate(0, 0.95, 0).scale(1, 1 / 1.9, 1);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const a = Math.atan2(z, x);
      const k = 1 + 0.09 * Math.cos(a * ribs);
      p.setXYZ(i, x * k, p.getY(i), z * k);
    }
    g.computeVertexNormals();
    return g;
  });
}

/** Ground-cover tuft of `blades` tapered blades, height 1, base at y=0. */
export function tuftGeo(blades: number, spread: number, lean: number, width = 0.07): THREE.BufferGeometry {
  return cached(`tuft${blades}:${spread}:${lean}:${width}`, () =>
    mergeGeometries(
      Array.from({ length: blades }, (_, k) => {
        const g = new THREE.ConeGeometry(width, 1, 3, 1, true).translate(0, 0.5, 0);
        g.rotateZ(lean * (0.5 + ((k * 0.37) % 1)));
        g.rotateY((k / blades) * Math.PI * 2 + k);
        g.translate(Math.cos(k * 2.4) * spread, 0, Math.sin(k * 2.4) * spread);
        return g;
      }),
    ),
  );
}

/** Fern: arching fronds made of thin bent planes. */
export function fernGeo(): THREE.BufferGeometry {
  return cached('fern', () => {
    const parts: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 7; k++) {
      const leaf = new THREE.PlaneGeometry(1, 0.22, 5, 1).translate(0.5, 0, 0);
      const p = leaf.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        p.setXYZ(i, x * 0.9, Math.sin(x * 2.2) * 0.55 - x * x * 0.25, p.getY(i) * (1 - x * 0.7));
      }
      leaf.rotateX(Math.PI / 2);
      leaf.rotateY((k / 7) * Math.PI * 2);
      parts.push(leaf);
    }
    const g = mergeGeometries(parts);
    g.computeVertexNormals();
    return g;
  });
}

/** Elongated, faceted ice/quartz crystal, base at y=0. */
export function crystalGeo(variant: number): THREE.BufferGeometry {
  return cached(`crystal${variant}`, () => {
    const g = new THREE.CylinderGeometry(0, 0.35, 0.35, 6, 1).translate(0, 1.175, 0);
    const body = new THREE.CylinderGeometry(0.35, 0.3, 1, 6, 1).translate(0, 0.5, 0);
    const m = mergeGeometries([body.toNonIndexed(), g.toNonIndexed()]);
    m.rotateY(variant * 0.5);
    m.computeVertexNormals();
    return m;
  });
}

/** Boulders: three lumpy variants, flattened underneath. */
export function rockGeo(variant: number, detail = 1): THREE.BufferGeometry {
  return cached(`rock${variant}:${detail}`, () => {
    const g = lumpy(new THREE.IcosahedronGeometry(1, detail), 5.3 + variant * 3.7, 0.38, 0.35);
    g.scale(1, 0.75, 1);
    g.computeVertexNormals();
    return g;
  });
}

/** Lying log, axis along x, radius 1, length 1. */
export function logGeo(): THREE.BufferGeometry {
  return cached('log', () => new THREE.CylinderGeometry(1, 1.1, 1, 8, 1).rotateZ(Math.PI / 2));
}

export const unitBoxBase = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
export const unitCylBase = new THREE.CylinderGeometry(0.5, 0.5, 1, 12).translate(0, 0.5, 0);
export const unitConeBase = new THREE.ConeGeometry(0.5, 1, 12).translate(0, 0.5, 0);
export const pyramidBase = new THREE.ConeGeometry(0.7071, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0);
export const hemiBase = new THREE.SphereGeometry(0.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
export const discBase = new THREE.CircleGeometry(0.5, 32).rotateX(-Math.PI / 2);

/** Lily pad: a flat disc with a notch, lying in the xz plane. */
export function lilyGeo(): THREE.BufferGeometry {
  return cached('lily', () => new THREE.CircleGeometry(1, 14, 0.35, Math.PI * 2 - 0.7).rotateX(-Math.PI / 2));
}
