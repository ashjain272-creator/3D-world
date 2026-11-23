import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { Rng } from '../sim/rng';
import { TiledInstances, type LodLevel } from './lod';
import type { PartItem, PartKey, VegetationData } from './vegetation';
import type { Layout } from './layout';
import { inFlat, type TerrainData } from './terrain';
import { env, foliageMaterial, texturedMaterial } from './env';
import { lilyGeo, blobGeo, crystalGeo, fernGeo, frondsGeo, hemiBase, logGeo, palmTrunkGeo, pyramidBase, ribbedGeo, rockGeo, skirtGeo, trunkGeo, tuftGeo, unitBoxBase, unitConeBase, unitCylBase, discBase } from './flora';
import type { StructMat, StructPiece, StructShape } from './structures';
import { Smoke } from './Smoke';

type Quality = 'low' | 'medium' | 'high';

/** Plants, rocks, structures, ponds and the near-camera ground cover. */
export function Vegetation({ data, t, layout, quality }: { data: VegetationData; t: TerrainData; layout: Layout; quality: Quality }) {
  return (
    <group>
      <Parts data={data} quality={quality} />
      <Structures pieces={data.structures.pieces} quality={quality} />
      <Ponds ponds={data.structures.ponds} />
      {quality !== 'low' && <Smoke sources={data.structures.smoke} perSource={30} />}
      {quality !== 'low' && <GroundCover t={t} layout={layout} data={data} quality={quality} />}
    </group>
  );
}

function Parts({ data, quality }: { data: VegetationData; quality: Quality }) {
  const shadows = quality === 'high';
  const far = quality === 'low' ? 0.65 : 1;
  const specs = useMemo(() => {
    const snow = data.snow;
    const bark = texturedMaterial('bark', { color: '#ffffff', roughness: 1 });
    const leaf = foliageMaterial({ snow });
    const leafSoft = foliageMaterial({ snow, flat: false, double: true, sway: 0.08 });
    const blade = foliageMaterial({ tip: true, flat: false, snow: snow * 0.5 });
    const cactus = texturedMaterial('bark', { color: '#ffffff', roughness: 0.75 });
    const stone = snowCapped(texturedMaterial('rock', { color: '#ffffff', roughness: 1 }), snow);
    const crystal = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.84, emissive: new THREE.Color('#3f9ad0'), emissiveIntensity: 0.22 });
    const L = (geo: THREE.BufferGeometry, lo: THREE.BufferGeometry | null, mat: THREE.Material, near: number, farD: number, cast = true): LodLevel[] =>
      lo ? [{ geometry: geo, material: mat, maxDist: near * far, castShadow: shadows && cast }, { geometry: lo, material: mat, maxDist: farD * far }] : [{ geometry: geo, material: mat, maxDist: farD * far, castShadow: shadows && cast }];
    const s: Record<PartKey, LodLevel[]> = {
      trunk0: L(trunkGeo(0), trunkGeo(0, 4), bark, 170, 420),
      trunk1: L(trunkGeo(1), trunkGeo(1, 4), bark, 170, 420),
      trunk2: L(trunkGeo(2), trunkGeo(2, 4), bark, 170, 420),
      palmTrunk0: L(palmTrunkGeo(0), null, bark, 0, 480),
      palmTrunk1: L(palmTrunkGeo(1), null, bark, 0, 480),
      blob0: L(blobGeo(0, 1), blobGeo(0, 0), leaf, 200, 560),
      blob1: L(blobGeo(1, 1), blobGeo(1, 0), leaf, 200, 560),
      blob2: L(blobGeo(2, 1), blobGeo(2, 0), leaf, 200, 560),
      blob3: L(blobGeo(3, 1), blobGeo(3, 0), leaf, 200, 560),
      skirt0: L(skirtGeo(0), skirtGeo(0, 5), leaf, 200, 560),
      skirt1: L(skirtGeo(1), skirtGeo(1, 5), leaf, 200, 560),
      fronds0: L(frondsGeo(0), null, leafSoft, 0, 420),
      fronds1: L(frondsGeo(1), null, leafSoft, 0, 420),
      cactus: L(ribbedGeo(10), ribbedGeo(5), cactus, 140, 380),
      barrel: L(ribbedGeo(14, true), null, cactus, 0, 220),
      pad: L(blobGeo(2, 1), null, cactus, 0, 180),
      bush0: L(blobGeo(1, 1), blobGeo(1, 0), leaf, 110, 250),
      bush1: L(blobGeo(3, 1), blobGeo(3, 0), leaf, 110, 250),
      dryshrub: L(blobGeo(0, 1), null, leaf, 0, 200, false),
      fern: L(fernGeo(), null, leafSoft, 0, 110, false),
      reed: L(tuftGeo(6, 0.12, 0.14, 0.035), null, blade, 0, 140, false),
      rock0: L(rockGeo(0, 1), rockGeo(0, 0), stone, 160, 330),
      rock1: L(rockGeo(1, 1), rockGeo(1, 0), stone, 160, 330),
      rock2: L(rockGeo(2, 1), rockGeo(2, 0), stone, 160, 330),
      log: L(logGeo(), null, bark, 0, 160),
      crystal0: L(crystalGeo(0), null, crystal, 0, 420),
      crystal1: L(crystalGeo(1), null, crystal, 0, 420),
      lily: L(lilyGeo(), null, leafSoft, 0, 160, false),
    };
    return { s, mats: [bark, leaf, leafSoft, blade, cactus, stone, crystal] };
  }, [data.snow, shadows, far]);
  useEffect(() => () => specs.mats.forEach((m) => m.dispose()), [specs]);
  return (
    <group>
      {(Object.entries(data.parts) as [PartKey, PartItem[]][]).map(([k, items]) =>
        items.length ? <TiledInstances key={k} items={items} levels={specs.s[k]} tileSize={90} name={k} /> : null,
      )}
    </group>
  );
}

const arcBase = new THREE.TorusGeometry(0.5, 0.055, 8, 24, Math.PI);
const SHAPES: Record<StructShape, THREE.BufferGeometry> = { box: unitBoxBase, cyl: unitCylBase, cone: unitConeBase, pyramid: pyramidBase, hemi: hemiBase, arc: arcBase };

function Structures({ pieces, quality }: { pieces: StructPiece[]; quality: Quality }) {
  const shadows = quality !== 'low';
  const mats = useMemo<Record<StructMat, THREE.Material>>(
    () => ({
      sandstone: texturedMaterial('sandstone', { color: '#ffffff', roughness: 0.92 }),
      stone: texturedMaterial('paving', { color: '#ffffff', roughness: 0.95 }),
      wood: texturedMaterial('wood', { color: '#ffffff', roughness: 0.85 }),
      cloth: texturedMaterial('cloth', { color: '#ffffff', roughness: 0.9, side: THREE.DoubleSide }),
      ice: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.05, metalness: 0.15, transparent: true, opacity: 0.88, emissive: new THREE.Color('#2f7ab0'), emissiveIntensity: 0.18 }),
      snow: texturedMaterial('plaster', { color: '#ffffff', roughness: 0.7 }),
      gold: texturedMaterial('metal', { color: '#ffffff', roughness: 0.3, metalness: 0.75 }),
      metal: texturedMaterial('metal', { color: '#ffffff', roughness: 0.45, metalness: 0.35 }),
      // unlit, so each piece glows in its own instance colour (fires, windows, beacons)
      glow: new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }),
      glowCold: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, toneMapped: false }),
      bone: texturedMaterial('plaster', { color: '#ffffff', roughness: 0.75 }),
      dark: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 }),
    }),
    [],
  );
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  const groups = useMemo(() => {
    const g = new Map<string, StructPiece[]>();
    for (const p of pieces) {
      const k = `${p.shape}|${p.mat}`;
      const list = g.get(k);
      if (list) list.push(p);
      else g.set(k, [p]);
    }
    return [...g.entries()].map(([k, list]) => {
      const [shape, mat] = k.split('|') as [StructShape, StructMat];
      return { k, items: list, levels: [{ geometry: SHAPES[shape], material: mats[mat], maxDist: 1000, castShadow: shadows, receiveShadow: true }] as LodLevel[] };
    });
  }, [pieces, mats, shadows]);
  return (
    <group>
      {groups.map((g) => (
        <TiledInstances key={g.k} items={g.items} levels={g.levels} tileSize={200} name={`struct-${g.k}`} />
      ))}
    </group>
  );
}

function Ponds({ ponds }: { ponds: VegetationData['structures']['ponds'] }) {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2f8a9a', roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.88 }), []);
  useEffect(() => () => mat.dispose(), [mat]);
  return (
    <group>
      {ponds.map((p, i) => (
        <mesh key={i} geometry={discBase} material={mat} position={[p.x, p.y, p.z]} scale={[p.r * 2, 1, p.r * 2]} receiveShadow />
      ))}
    </group>
  );
}

/**
 * Dense grass and flowers in a disc around the camera. Positions come from a
 * fixed world grid with per-cell hashes, so blades stay put as you walk; the
 * instance buffer is rebuilt only when the camera crosses a 4 m cell.
 * Patchy noise drives height, colour (sun-bleached vs lush) and flower
 * meadows whose colours are coherent within a patch.
 */
function GroundCover({ t, layout, data, quality }: { t: TerrainData; layout: Layout; data: VegetationData; quality: Quality }) {
  const kind = t.look.vegetation;
  const snow = data.snow;
  const dry = kind === 'cactus';
  const none = kind === 'none' || (t.look.frozen && snow > 0.9 && kind !== 'sparse');
  const R = quality === 'high' ? 42 : 30;
  const sp = dry ? 1.15 : kind === 'sparse' ? 1.15 : quality === 'high' ? 0.62 : 0.78;
  const n = Math.ceil((2 * R) / sp) ** 2;
  const { camera } = useThree();
  const grass = useRef<THREE.InstancedMesh>(null);
  const flowers = useRef<THREE.InstancedMesh>(null);
  const last = useRef('');
  const geo = useMemo(() => (kind === 'jungle' ? tuftGeo(5, 0.14, 0.45, 0.075) : tuftGeo(4, 0.1, 0.38, 0.055)), [kind]);
  const flowerGeo = useMemo(() => new THREE.IcosahedronGeometry(1, 0), []);
  const mat = useMemo(() => foliageMaterial({ tip: true, flat: false, snow: snow * 0.6, sway: 0.32 }), [snow]);
  const flowerMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.55, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.05 }), []);
  useEffect(() => () => { mat.dispose(); flowerMat.dispose(); flowerGeo.dispose(); }, [mat, flowerMat, flowerGeo]);
  const noise = useMemo(() => {
    const rng = new Rng(t.seed + 911);
    return createNoise2D(() => rng.next());
  }, [t.seed]);
  const base = useMemo(() => new THREE.Color(dry ? '#b8a46a' : t.look.grassColor), [dry, t.look.grassColor]);
  const lush = useMemo(() => base.clone().offsetHSL(0.03, 0.12, -0.05), [base]);
  const bleached = useMemo(() => base.clone().offsetHSL(-0.05, -0.1, 0.1), [base]);
  const petals = useMemo(() => ['#f4e36a', '#f6f2ea', '#e88ab0', '#b79af2', '#f0a05a', '#e85a5a', '#7ab0f0'].map((c) => new THREE.Color(c)), []);
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), v: new THREE.Vector3(), s: new THREE.Vector3(), c: new THREE.Color(), e: new THREE.Euler() }), []);
  const hidden = useMemo(() => new THREE.Matrix4().makeScale(0, 0, 0), []);

  useFrame(() => {
    const g = grass.current;
    const f = flowers.current;
    if (!g || !f || none) return;
    const cx = Math.floor(camera.position.x / 4) * 4;
    const cz = Math.floor(camera.position.z / 4) * 4;
    const key = `${cx},${cz}`;
    if (key === last.current) return;
    last.current = key;
    let gi = 0;
    let fi = 0;
    const g0x = Math.floor((cx - R) / sp);
    const g0z = Math.floor((cz - R) / sp);
    const steps = Math.ceil((2 * R) / sp);
    const fp = data.structures.footprints;
    for (let a = 0; a < steps; a++) {
      for (let b = 0; b < steps; b++) {
        const ix = g0x + a;
        const iz = g0z + b;
        const h1 = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453;
        const r1 = h1 - Math.floor(h1);
        const h2 = Math.sin(ix * 269.5 + iz * 183.3) * 24634.6345;
        const r2 = h2 - Math.floor(h2);
        const x = (ix + r1) * sp;
        const z = (iz + r2) * sp;
        const dx = x - camera.position.x;
        const dz = z - camera.position.z;
        if (dx * dx + dz * dz > R * R) continue;
        if ((layout.radius > 0 && x * x + z * z < (layout.radius + 4) ** 2) || (t.coastZ !== undefined && z < t.coastZ + 4) || inFlat(t, x, z, 4)) continue;
        const patch = noise(x / 22, z / 22) * 0.6 + noise(x / 7 + 40, z / 7) * 0.4;
        const density = dry ? patch - 0.1 : kind === 'sparse' ? patch + 0.05 - snow * 0.4 : patch + 0.75;
        if (r1 * 1.3 > density + 0.35) continue;
        const y = t.height(x, z);
        if (t.waterLevel !== null && y < t.waterLevel + 0.25) continue;
        if (t.slope(x, z) > 0.9) continue;
        let blocked = false;
        for (const p of fp) if ((p.x - x) ** 2 + (p.z - z) ** 2 < p.r * p.r) { blocked = true; break; }
        if (blocked) continue;
        const tall = (0.45 + 0.65 * Math.max(0, patch + 0.4)) * (kind === 'jungle' ? 1.5 : dry ? 0.7 : 1) * (0.75 + r2 * 0.5);
        tmp.e.set((r1 - 0.5) * 0.3, r2 * 6.283, (r2 - 0.5) * 0.3);
        tmp.q.setFromEuler(tmp.e);
        tmp.v.set(x, y - 0.04, z);
        tmp.s.set(0.9 + r2 * 0.4, tall, 0.9 + r1 * 0.4);
        tmp.m.compose(tmp.v, tmp.q, tmp.s);
        if (gi < n) {
          g.setMatrixAt(gi, tmp.m);
          // colour blends between lush and sun-bleached patches, with per-blade jitter
          const k = noise(x / 40 - 9, z / 40 + 5) * 0.5 + 0.5;
          tmp.c.copy(lush).lerp(bleached, k).offsetHSL((r1 - 0.5) * 0.03, 0, (r2 - 0.5) * 0.08);
          g.setColorAt(gi, tmp.c);
          gi++;
        }
        // flower meadows: one or two hues per patch, a few stray colours
        const meadow = noise(x / 30 + 70, z / 30 - 20);
        if (!dry && snow < 0.5 && meadow > 0.35 && r2 > 0.72 && fi < (f.count ?? 0)) {
          const hue = petals[Math.floor((meadow * 10 + (r1 > 0.85 ? 3 : 0)) % petals.length)];
          const fsz = 0.055 + r1 * 0.05;
          tmp.v.set(x + 0.05, y + tall * 0.62, z);
          tmp.s.set(fsz, fsz * 0.7, fsz);
          tmp.m.compose(tmp.v, tmp.q, tmp.s);
          f.setMatrixAt(fi, tmp.m);
          f.setColorAt(fi, hue);
          fi++;
        }
      }
    }
    for (let i = gi; i < n; i++) g.setMatrixAt(i, hidden);
    for (let i = fi; i < f.count; i++) f.setMatrixAt(i, hidden);
    g.instanceMatrix.needsUpdate = true;
    f.instanceMatrix.needsUpdate = true;
    if (g.instanceColor) g.instanceColor.needsUpdate = true;
    if (f.instanceColor) f.instanceColor.needsUpdate = true;
  });

  void env;
  if (none) return null;
  return (
    <group>
      <instancedMesh ref={grass} args={[geo, mat, n]} frustumCulled={false} />
      <instancedMesh ref={flowers} args={[flowerGeo, flowerMat, Math.ceil(n / 5)]} frustumCulled={false} />
    </group>
  );
}

/** Adds snow lying on the upward-facing surfaces of a textured material (uses its world normal varying). */
function snowCapped(m: THREE.MeshStandardMaterial, snow: number): THREE.MeshStandardMaterial {
  if (snow < 0.3) return m;
  const prev = m.onBeforeCompile;
  const prevKey = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => `${prevKey()}|snowcap${snow.toFixed(2)}`;
  m.onBeforeCompile = (shader, renderer) => {
    prev.call(m, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      {
        float cap = smoothstep(0.25, 0.6, normalize(vTN).y) * ${Math.min(1, snow).toFixed(2)};
        float edge = 0.85 + 0.15 * evn(vTP.xz * 3.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.88, 0.92, 0.97) * edge, cap);
        roughnessFactor = mix(roughnessFactor, 0.6, cap);
      }`,
    );
  };
  return m;
}
