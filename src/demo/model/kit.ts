import * as THREE from 'three';

/**
 * A tiny instancing kit for the scale-model demo: pieces are added as (shape, material, position,
 * size, colour, turn) and built into one InstancedMesh per shape and material. Boxes, cylinders
 * and cones stand on their base; spheres are centred.
 */
export type Shape = 'box' | 'sphere' | 'cyl' | 'cone' | 'hemi' | 'oct';
export type Mat = 'white' | 'wall' | 'charcoal' | 'window' | 'railing' | 'glow' | 'leaf' | 'trunk' | 'lawn' | 'paving' | 'asphalt' | 'paint' | 'water' | 'car' | 'carGlass' | 'metal' | 'plinth' | 'figure' | 'court' | 'glass' | 'sand' | 'gold' | 'stone';

const GEOMETRY: Record<Shape, THREE.BufferGeometry> = {
  box: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
  sphere: new THREE.IcosahedronGeometry(0.5, 2),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10).translate(0, 0.5, 0),
  cone: new THREE.ConeGeometry(0.5, 1, 10).translate(0, 0.5, 0),
  // a dome: half a sphere standing on its base (full height at y scale 2)
  hemi: new THREE.SphereGeometry(0.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  oct: new THREE.CylinderGeometry(0.5, 0.5, 1, 8).translate(0, 0.5, 0),
};

interface Item {
  m: THREE.Matrix4;
  c: THREE.Color;
}

export class Kit {
  private groups = new Map<string, { shape: Shape; mat: Mat; items: Item[] }>();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  count = 0;

  /** Turns are applied yaw, then pitch about x, then roll about z (Euler order YXZ). */
  add(shape: Shape, mat: Mat, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: THREE.ColorRepresentation = '#ffffff', rotY = 0, rotX = 0, rotZ = 0) {
    const key = `${shape}|${mat}`;
    let g = this.groups.get(key);
    if (!g) {
      g = { shape, mat, items: [] };
      this.groups.set(key, g);
    }
    this.q.setFromEuler(this.e.set(rotX, rotY, rotZ, 'YXZ'));
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), this.q, new THREE.Vector3(sx, sy, sz));
    g.items.push({ m, c: new THREE.Color(color) });
    this.count++;
  }

  build(mats: Record<Mat, THREE.Material>, shadows: (m: Mat) => { cast: boolean; receive: boolean }): THREE.Group {
    const out = new THREE.Group();
    for (const g of this.groups.values()) {
      const mesh = new THREE.InstancedMesh(GEOMETRY[g.shape], mats[g.mat], g.items.length);
      g.items.forEach((it, i) => {
        mesh.setMatrixAt(i, it.m);
        mesh.setColorAt(i, it.c);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      const s = shadows(g.mat);
      mesh.castShadow = s.cast;
      mesh.receiveShadow = s.receive;
      mesh.name = `${g.shape}|${g.mat}`;
      out.add(mesh);
    }
    return out;
  }
}

/** A small seeded random generator so the demo looks the same every time. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
