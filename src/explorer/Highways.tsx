import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Rng } from '../sim/rng';
import { nightUniform } from './City';
import { texturedMaterial } from './env';
import { distanceScale } from './lod';
import { sampleRoad, type HighwayData, type Road } from './roadNetwork';

type Quality = 'low' | 'medium' | 'high';

/** Per-point left/right offset vectors for a road. */
function frames(r: Road): THREE.Vector3[] {
  return r.pts.map((_, i) => {
    const a = r.pts[Math.max(0, i - 1)];
    const b = r.pts[Math.min(r.pts.length - 1, i + 1)];
    const d = new THREE.Vector3(b.x - a.x, 0, b.z - a.z).normalize();
    return new THREE.Vector3(-d.z, 0, d.x);
  });
}

/** Builds the asphalt (with lane uvs), concrete (deck sides, underside, barriers) and glow-strip geometry for all elevated roads. */
function buildDecks(roads: Road[]) {
  const asphalt = { p: [] as number[], uv: [] as number[], w: [] as number[], l: [] as number[] };
  const conc = { p: [] as number[] };
  const glow = { p: [] as number[] };
  const quad = (arr: number[], a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => arr.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
  const v = (p: THREE.Vector3, n: THREE.Vector3, s: number, dy: number) => new THREE.Vector3(p.x + n.x * s, p.y + dy, p.z + n.z * s);
  for (const r of roads) {
    if (!r.elevated) continue;
    const N = frames(r);
    const hw = r.width / 2;
    const T = 1.3;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const p0 = r.pts[i];
      const p1 = r.pts[i + 1];
      const n0 = N[i];
      const n1 = N[i + 1];
      // asphalt top, uv.x = metres from the left edge, uv.y = metres along
      const L0 = v(p0, n0, hw, 0.02), R0 = v(p0, n0, -hw, 0.02), L1 = v(p1, n1, hw, 0.02), R1 = v(p1, n1, -hw, 0.02);
      asphalt.p.push(L0.x, L0.y, L0.z, R0.x, R0.y, R0.z, R1.x, R1.y, R1.z, L0.x, L0.y, L0.z, R1.x, R1.y, R1.z, L1.x, L1.y, L1.z);
      const d0 = r.dist[i];
      const d1 = r.dist[i + 1];
      asphalt.uv.push(0, d0, r.width, d0, r.width, d1, 0, d0, r.width, d1, 0, d1);
      for (let k = 0; k < 6; k++) {
        asphalt.w.push(r.width);
        asphalt.l.push(r.lanes);
      }
      // deck sides and underside
      for (const side of [1, -1]) {
        const a = v(p0, n0, side * hw, 0), b = v(p1, n1, side * hw, 0), c = v(p1, n1, side * hw, -T), d = v(p0, n0, side * hw, -T);
        quad(conc.p, a, b, c, d);
        // jersey barrier on top of the edge, with an inner and outer face and a cap
        const bi0 = v(p0, n0, side * (hw - 0.5), 0), bi1 = v(p1, n1, side * (hw - 0.5), 0);
        const t0 = v(p0, n0, side * (hw - 0.15), 1.05), t1 = v(p1, n1, side * (hw - 0.15), 1.05);
        const o0 = v(p0, n0, side * hw, 1.05), o1 = v(p1, n1, side * hw, 1.05);
        quad(conc.p, bi0, bi1, t1, t0);
        quad(conc.p, t0, t1, o1, o0);
        quad(conc.p, a, b, o1, o0);
        // a thin light strip along the fascia
        quad(glow.p, v(p0, n0, side * (hw + 0.02), -0.35), v(p1, n1, side * (hw + 0.02), -0.35), v(p1, n1, side * (hw + 0.02), -0.55), v(p0, n0, side * (hw + 0.02), -0.55));
      }
      quad(conc.p, v(p0, n0, -hw, -T), v(p1, n1, -hw, -T), v(p1, n1, hw, -T), v(p0, n0, hw, -T));
      if (r.lanes >= 2) {
        // central median barrier on two-way roads
        quad(conc.p, v(p0, n0, 0.35, 0), v(p1, n1, 0.35, 0), v(p1, n1, 0.2, 0.9), v(p0, n0, 0.2, 0.9));
        quad(conc.p, v(p0, n0, -0.2, 0.9), v(p1, n1, -0.2, 0.9), v(p1, n1, -0.35, 0), v(p0, n0, -0.35, 0));
        quad(conc.p, v(p0, n0, 0.2, 0.9), v(p1, n1, 0.2, 0.9), v(p1, n1, -0.2, 0.9), v(p0, n0, -0.2, 0.9));
      }
    }
  }
  const g = (arr: number[]) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    geo.computeVertexNormals();
    return geo;
  };
  const a = g(asphalt.p);
  a.setAttribute('uv', new THREE.Float32BufferAttribute(asphalt.uv, 2));
  a.setAttribute('aWidth', new THREE.Float32BufferAttribute(asphalt.w, 1));
  a.setAttribute('aLanes', new THREE.Float32BufferAttribute(asphalt.l, 1));
  return { asphalt: a, concrete: g(conc.p), glow: g(glow.p) };
}

/** Asphalt with lane markings: solid edge lines, dashed lane dividers, double yellow at the median, wear and tyre tracks. */
function asphaltMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: '#3a3e44', roughness: 0.8, metalness: 0.05, side: THREE.DoubleSide });
  m.customProgramCacheKey = () => 'asphalt-deck';
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aWidth;\nattribute float aLanes;\nvarying vec2 vRoad;\nvarying float vW;\nvarying float vL;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvRoad = uv;\nvW = aWidth;\nvL = aLanes;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vRoad;\nvarying float vW;\nvarying float vL;\nfloat hh(vec2 p){ vec3 q3 = fract(vec3(p.xyx) * 0.1031); q3 += dot(q3, q3.yzx + 33.33); return fract((q3.x + q3.y) * q3.z); }')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float u = vRoad.x;
          float along = vRoad.y;
          float fw = max(fwidth(u), 0.02);
          float lineW = 0.15;
          float paint = 0.0;
          vec3 paintCol = vec3(0.92);
          // edge lines
          paint = max(paint, 1.0 - smoothstep(lineW, lineW + fw, abs(u - 0.75)));
          paint = max(paint, 1.0 - smoothstep(lineW, lineW + fw, abs(u - (vW - 0.75))));
          float half_ = vW * 0.5;
          float laneW = (half_ - 1.2) / max(vL, 1.0);
          float dash = step(fract(along / 9.0), 0.45);
          if (vL >= 2.0) {
            // double yellow at the centre, dashed white between lanes on each side
            float y1 = 1.0 - smoothstep(lineW * 0.8, lineW * 0.8 + fw, abs(u - half_ + 0.55));
            float y2 = 1.0 - smoothstep(lineW * 0.8, lineW * 0.8 + fw, abs(u - half_ - 0.55));
            if (max(y1, y2) > 0.0) paintCol = vec3(0.95, 0.75, 0.2);
            paint = max(paint, max(y1, y2));
            for (float k = 1.0; k < 4.0; k++) {
              if (k >= vL) break;
              paint = max(paint, dash * (1.0 - smoothstep(lineW, lineW + fw, abs(u - (0.75 + k * laneW)))));
              paint = max(paint, dash * (1.0 - smoothstep(lineW, lineW + fw, abs(u - (vW - 0.75 - k * laneW)))));
            }
          }
          // asphalt grain, patch repairs and darker tyre tracks in each lane
          float grain = hh(floor(vec2(u, along) * 12.0)) * 0.08;
          float patch_ = step(0.93, hh(floor(vec2(u / 3.0, along / 7.0)))) * 0.08;
          float lanePos = fract((u - 0.75) / max(laneW, 0.1));
          float track = (1.0 - smoothstep(0.08, 0.16, abs(lanePos - 0.3))) + (1.0 - smoothstep(0.08, 0.16, abs(lanePos - 0.7)));
          diffuseColor.rgb *= (0.92 + grain - patch_) * (1.0 - 0.1 * track);
          diffuseColor.rgb = mix(diffuseColor.rgb, paintCol, paint * 0.9);
          roughnessFactor = mix(roughnessFactor, 0.5, paint);
        }`,
      );
  };
  return m;
}

const pillarGeo = new THREE.CylinderGeometry(0.9, 1.1, 1, 14).translate(0, 0.5, 0);
const capGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 1, 6).translate(0, 0.5, 0);
const lampGeo = new THREE.BoxGeometry(1, 1, 1);
const carBody = new THREE.CapsuleGeometry(0.85, 2.6, 3, 8).rotateX(Math.PI / 2).scale(1, 0.62, 1);
const carCabin = new THREE.CapsuleGeometry(0.6, 1.2, 3, 8).rotateX(Math.PI / 2).scale(1, 0.75, 1).translate(0, 0.55, -0.15);
// flattened lamp lenses that sit flush with the nose and tail
const lightGeo = new THREE.SphereGeometry(0.16, 8, 4).scale(1.3, 0.55, 0.35);
const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 10).rotateZ(Math.PI / 2);

export function Highways({ data, quality, civColor }: { data: HighwayData; quality: Quality; civColor: string }) {
  const shadows = quality === 'high';
  const decks = useMemo(() => buildDecks(data.roads), [data]);
  const mats = useMemo(
    () => ({
      asphalt: asphaltMaterial(),
      concrete: texturedMaterial('plaster', { color: '#b8bcc2', roughness: 0.85, side: THREE.DoubleSide }),
      glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(civColor), toneMapped: false, side: THREE.DoubleSide }),
      pillar: texturedMaterial('plaster', { color: '#c4c7cc', roughness: 0.9 }),
      metal: new THREE.MeshStandardMaterial({ color: '#8a9098', roughness: 0.4, metalness: 0.7 }),
      lamp: new THREE.MeshBasicMaterial({ color: '#fff2d8', toneMapped: false }),
      sign: new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }),
      car: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3, metalness: 0.65 }),
      glass: new THREE.MeshStandardMaterial({ color: '#1a2230', roughness: 0.1, metalness: 0.8 }),
      carLight: new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }),
      tyre: new THREE.MeshStandardMaterial({ color: '#16181b', roughness: 0.9 }),
    }),
    [civColor],
  );
  useEffect(() => () => {
    Object.values(mats).forEach((m) => m.dispose());
    Object.values(decks).forEach((g) => g.dispose());
  }, [mats, decks]);
  useFrame(() => {
    // fascia strips and signs glow brighter after dark
    const n = nightUniform.value;
    mats.glow.color.set(civColor).multiplyScalar(0.35 + n * 1.1);
    mats.lamp.color.setRGB(0.4 + n * 0.9, 0.38 + n * 0.82, 0.33 + n * 0.65);
  });

  // pillars, cap beams, lamp posts and sign gantries as instances
  const parts = useMemo(() => {
    const pil: THREE.Matrix4[] = [];
    const caps: THREE.Matrix4[] = [];
    const poles: THREE.Matrix4[] = [];
    const lamps: THREE.Matrix4[] = [];
    const gantry: THREE.Matrix4[] = [];
    const signs: { m: THREE.Matrix4; c: THREE.Color }[] = [];
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const M = (x: number, y: number, z: number, sx: number, sy: number, sz: number, ang: number) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q.clone().setFromAxisAngle(up, ang), new THREE.Vector3(sx, sy, sz));
    for (const p of data.pillars) {
      pil.push(M(p.x, p.y - 0.5, p.z, 1, p.h + 0.5, 1, p.ang));
      caps.push(M(p.x, p.y + p.h - 0.2, p.z, p.w * 0.75, 1.3, 2.2, p.ang));
    }
    const rng = new Rng(data.roads.length * 17 + 3);
    const tmp = new THREE.Vector3();
    for (const r of data.roads) {
      if (!r.elevated) continue;
      const total = r.dist[r.dist.length - 1];
      for (let d = 15; d < total - 5; d += 32) {
        const ang = sampleRoad(r, d, tmp);
        const side = r.lanes >= 2 ? 0 : r.width / 2 - 0.4;
        const nx = Math.cos(ang);
        const nz = -Math.sin(ang);
        const px = tmp.x + nx * side;
        const pz = tmp.z + nz * side;
        poles.push(M(px, tmp.y + 0.9, pz, 1, 8, 1, ang));
        for (const s of r.lanes >= 2 ? [1, -1] : [-1]) lamps.push(M(px + nx * s * 1.6, tmp.y + 8.8, pz + nz * s * 1.6, 2.4, 0.18, 0.5, ang + Math.PI / 2));
      }
      // sign gantries on the expressways and ring
      if (r.kind !== 'ramp') {
        for (let d = 60; d < total - 30; d += r.kind === 'ring' ? 180 : 140) {
          const ang = sampleRoad(r, d, tmp);
          const nx = Math.cos(ang);
          const nz = -Math.sin(ang);
          const hw = r.width / 2;
          for (const s of [1, -1]) gantry.push(M(tmp.x + nx * s * (hw - 0.3), tmp.y + 1, tmp.z + nz * s * (hw - 0.3), 0.35, 6.5, 0.35, ang));
          gantry.push(M(tmp.x, tmp.y + 7.2, tmp.z, r.width, 0.5, 0.5, ang + Math.PI / 2));
          const panels = r.lanes >= 2 ? 3 : 1;
          for (let k = 0; k < panels; k++) {
            const off = panels === 1 ? 0 : (k - 1) * (r.width / 3);
            signs.push({ m: M(tmp.x + nx * off, tmp.y + 6.1, tmp.z + nz * off, r.width / 3.6, 1.7, 0.12, ang), c: new THREE.Color(rng.pick(['#1f7a4a', '#1f4a8a', '#1f7a4a', '#c8a020'])) });
          }
        }
      }
    }
    return { pil, caps, poles, lamps, gantry, signs };
  }, [data]);

  return (
    <group>
      <mesh geometry={decks.asphalt} material={mats.asphalt} receiveShadow />
      <mesh geometry={decks.concrete} material={mats.concrete} castShadow={shadows} receiveShadow />
      <mesh geometry={decks.glow} material={mats.glow} />
      <Inst list={parts.pil} geo={pillarGeo} mat={mats.pillar} shadow={shadows} />
      <Inst list={parts.caps} geo={capGeo} mat={mats.pillar} shadow={shadows} />
      <Inst list={parts.poles} geo={poleGeo} mat={mats.metal} />
      <Inst list={parts.lamps} geo={lampGeo} mat={mats.lamp} />
      <Inst list={parts.gantry} geo={capGeo} mat={mats.metal} />
      <InstC list={parts.signs} geo={capGeo} mat={mats.sign} />
      {quality !== 'low' && <Traffic roads={data.roads} quality={quality} mats={mats} />}
    </group>
  );
}

function Inst({ list, geo, mat, shadow }: { list: THREE.Matrix4[]; geo: THREE.BufferGeometry; mat: THREE.Material; shadow?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    list.forEach((x, i) => m.setMatrixAt(i, x));
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [list]);
  if (!list.length) return null;
  return <instancedMesh ref={ref} args={[geo, mat, list.length]} castShadow={shadow} receiveShadow={shadow} />;
}

function InstC({ list, geo, mat }: { list: { m: THREE.Matrix4; c: THREE.Color }[]; geo: THREE.BufferGeometry; mat: THREE.Material }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    list.forEach((x, i) => {
      m.setMatrixAt(i, x.m);
      m.setColorAt(i, x.c);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [list]);
  if (!list.length) return null;
  return <instancedMesh ref={ref} args={[geo, mat, list.length]} />;
}

const CAR_COLORS = ['#e8e8ec', '#1c1e22', '#8a9098', '#b8262a', '#1f3f7a', '#f0f0f0', '#2a2a2e', '#c8c4b8', '#5a6a3a', '#d8a020'];

/** Cars driving on every road level, both directions, each in its lane at its own speed, with head and tail lights. */
function Traffic({ roads, quality, mats }: { roads: Road[]; quality: Quality; mats: Record<string, THREE.Material> }) {
  const { camera } = useThree();
  const cars = useMemo(() => {
    const rng = new Rng(roads.length * 101 + 9);
    const out: { r: Road; d: number; dir: number; lane: number; speed: number; c: THREE.Color }[] = [];
    const density = quality === 'high' ? 1 : 0.6;
    for (const r of roads) {
      const total = r.dist[r.dist.length - 1];
      const perLane = Math.round((total / (r.kind === 'street' ? 55 : 38)) * density);
      const dirs = r.lanes >= 2 || r.kind === 'street' ? [1, -1] : [1];
      for (const dir of dirs) for (let lane = 0; lane < Math.max(1, r.lanes); lane++) for (let k = 0; k < perLane; k++) out.push({ r, d: rng.range(0, total), dir, lane, speed: (r.kind === 'street' ? 9 : r.kind === 'ramp' ? 14 : 20) + rng.range(-3, 6) - lane * 2, c: new THREE.Color(rng.pick(CAR_COLORS)) });
    }
    return out;
  }, [roads, quality]);
  const body = useRef<THREE.InstancedMesh>(null);
  const cabin = useRef<THREE.InstancedMesh>(null);
  const lights = useRef<THREE.InstancedMesh>(null);
  const wheels = useRef<THREE.InstancedMesh>(null);
  const tmp = useMemo(() => ({ v: new THREE.Vector3(), m: new THREE.Matrix4(), q: new THREE.Quaternion(), one: new THREE.Vector3(1, 1, 1), up: new THREE.Vector3(0, 1, 0), p: new THREE.Vector3() }), []);
  const init = useRef(false);
  useFrame((_, rawDt) => {
    const b = body.current;
    const c = cabin.current;
    const l = lights.current;
    const wh = wheels.current;
    if (!b || !c || !l || !wh) return;
    const dt = Math.min(rawDt, 0.1);
    if (!init.current) {
      const head = new THREE.Color('#fff6e0');
      const tail = new THREE.Color('#ff2a1a');
      cars.forEach((car, i) => {
        b.setColorAt(i, car.c);
        l.setColorAt(i * 4, head);
        l.setColorAt(i * 4 + 1, head);
        l.setColorAt(i * 4 + 2, tail);
        l.setColorAt(i * 4 + 3, tail);
      });
      if (b.instanceColor) b.instanceColor.needsUpdate = true;
      if (l.instanceColor) l.instanceColor.needsUpdate = true;
      init.current = true;
    }
    // every car keeps driving, but only those near the camera are drawn: they are packed into the
    // front of the instance buffers and the draw count is cut to them
    const reach = 520 * distanceScale(0.45);
    const camX = camera.position.x;
    const camZ = camera.position.z;
    let i = 0;
    cars.forEach((car) => {
      const r = car.r;
      const total = r.dist[r.dist.length - 1];
      car.d += car.speed * dt * car.dir;
      if (!r.closed) {
        if (car.d > total) car.d -= total;
        if (car.d < 0) car.d += total;
      }
      let ang = sampleRoad(r, car.d, tmp.p);
      if ((tmp.p.x - camX) ** 2 + (tmp.p.z - camZ) ** 2 > reach * reach) return;
      b.setColorAt(i, car.c);
      if (car.dir < 0) ang += Math.PI;
      // keep right: offset from the centre line by lane
      const laneW = r.kind === 'street' ? 2.6 : (r.width / 2 - 1.2) / Math.max(1, r.lanes);
      const off = r.lanes >= 2 || r.kind === 'street' ? 0.9 + laneW * (car.lane + 0.5) : 0;
      const nx = -Math.cos(ang);
      const nz = Math.sin(ang);
      tmp.v.set(tmp.p.x + nx * off, tmp.p.y + 0.72, tmp.p.z + nz * off);
      tmp.q.setFromAxisAngle(tmp.up, ang);
      tmp.m.compose(tmp.v, tmp.q, tmp.one);
      b.setMatrixAt(i, tmp.m);
      c.setMatrixAt(i, tmp.m);
      const fx = Math.sin(ang);
      const fz = Math.cos(ang);
      const sx = Math.cos(ang);
      const sz = -Math.sin(ang);
      const put = (k: number, along: number, side: number, y: number) => {
        tmp.m.compose(new THREE.Vector3(tmp.v.x + fx * along + sx * side, tmp.v.y + y, tmp.v.z + fz * along + sz * side), tmp.q, tmp.one);
        l.setMatrixAt(i * 4 + k, tmp.m);
      };
      put(0, 2.1, 0.5, 0.0);
      put(1, 2.1, -0.5, 0.0);
      put(2, -2.1, 0.5, 0.08);
      put(3, -2.1, -0.5, 0.08);
      let k = 0;
      for (const along of [1.35, -1.35])
        for (const side of [0.8, -0.8]) {
          tmp.m.compose(new THREE.Vector3(tmp.v.x + fx * along + sx * side, tmp.v.y - 0.36, tmp.v.z + fz * along + sz * side), tmp.q, tmp.one);
          wh.setMatrixAt(i * 4 + k++, tmp.m);
        }
      i++;
    });
    b.count = i;
    c.count = i;
    l.count = i * 4;
    wh.count = i * 4;
    if (b.instanceColor) b.instanceColor.needsUpdate = true;
    b.instanceMatrix.needsUpdate = true;
    c.instanceMatrix.needsUpdate = true;
    l.instanceMatrix.needsUpdate = true;
    wh.instanceMatrix.needsUpdate = true;
  });
  if (!cars.length) return null;
  return (
    <group>
      <instancedMesh ref={body} args={[carBody, mats.car, cars.length]} frustumCulled={false} castShadow={quality === 'high'} />
      <instancedMesh ref={cabin} args={[carCabin, mats.glass, cars.length]} frustumCulled={false} />
      <instancedMesh ref={lights} args={[lightGeo, mats.carLight, cars.length * 4]} frustumCulled={false} />
      <instancedMesh ref={wheels} args={[wheelGeo, mats.tyre, cars.length * 4]} frustumCulled={false} />
    </group>
  );
}
