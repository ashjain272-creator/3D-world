import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Rng } from '../sim/rng';
import { localHour } from '../sim/time';
import type { Planet } from '../sim/types';
import { getWorld } from '../state/store';
import { routeBetween, type Layout } from './layout';
import type { TerrainData } from './terrain';
import { HAIR_COLORS, PANTS_COLORS, SKIN_TONES, humanoidGeometry, humanoidInstancedMaterial } from './humanoid';

/**
 * Ambient crowd: anonymous, procedurally varied residents that stand in for
 * the millions of people the simulation models only in aggregate. They are
 * purely visual — never clickable and never confused with the simulated
 * individuals (who carry a name label and a highlight ring).
 */

/** Share of the crowd out on the streets for an hour of day and weather. */
export function crowdDensity(hour: number, weather: Planet['environment']['weather']): number {
  // night lull, morning rush, busy working day, evening stroll
  const h = hour;
  let d: number;
  if (h < 5) d = 0.06;
  else if (h < 7) d = 0.06 + ((h - 5) / 2) * 0.5;
  else if (h < 9) d = 0.56 + ((h - 7) / 2) * 0.44;
  else if (h < 18) d = 1;
  else if (h < 21) d = 1 - ((h - 18) / 3) * 0.45;
  else d = 0.55 - ((h - 21) / 3) * 0.49;
  const w = weather === 'storm' ? 0.3 : weather === 'rain' ? 0.6 : weather === 'snow' ? 0.7 : weather === 'dust' ? 0.55 : weather === 'fog' ? 0.85 : weather === 'cloudy' ? 0.95 : 1;
  return Math.max(0, Math.min(1, d * w));
}

export function crowdCapacity(population: number, quality: 'low' | 'medium' | 'high'): number {
  const l = Math.log10(Math.max(10, population));
  if (quality === 'low') return Math.round(Math.min(110, Math.max(40, 30 + l * 12)));
  if (quality === 'medium') return Math.round(Math.min(280, Math.max(80, 60 + l * 35)));
  return Math.round(Math.min(320, Math.max(100, 80 + l * 40)));
}

/** Live counters for diagnostics and automated checks. */
export const crowdStats = { capacity: 0, visible: 0, density: 0 };

interface Agent {
  x: number;
  z: number;
  ox: number;
  oz: number;
  path: [number, number][];
  speed: number;
  scale: number;
  threshold: number;
  side: number;
  pause: number;
  face: number;
  build: number;
}

const CELL = 4;
const noRaycast = () => null;
const crowdMat = humanoidInstancedMaterial();

export function Crowd({ layout, t, population, quality, planetId }: { layout: Layout; t: TerrainData; population: number; quality: 'low' | 'medium' | 'high'; planetId: string }) {
  const count = crowdCapacity(population, quality);
  const body = useRef<THREE.InstancedMesh>(null);
  // one figure geometry per crowd, carrying each person's outfit and walk cadence as instanced attributes
  const geo = useMemo(() => {
    const g = humanoidGeometry(quality !== 'high').clone();
    g.setAttribute('iShirt', new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute('iPants', new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute('iSkin', new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute('iHair', new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4));
    const walk = new THREE.InstancedBufferAttribute(new Float32Array(count * 2), 2);
    walk.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iWalk', walk);
    return g;
  }, [count, quality]);
  useEffect(() => () => geo.dispose(), [geo]);
  const { camera } = useThree();
  const hotspots = useMemo(() => {
    const pts: [number, number][] = [];
    for (const p of layout.plazas) pts.push([p.x, p.z]);
    for (const l of layout.landmarks) if (l.kind === 'market' || l.kind === 'garden' || l.kind === 'temple') pts.push([l.x, l.z]);
    return pts;
  }, [layout]);
  const agents = useMemo<Agent[]>(() => {
    const rng = new Rng(Math.round(layout.radius * 13) + count);
    return Array.from({ length: count }, (_, i) => {
      const n = layout.graph.nodes[Math.floor(rng.next() * layout.graph.nodes.length)] ?? [0, 0];
      return {
        x: n[0] + rng.range(-3, 3),
        z: n[1] + rng.range(-3, 3),
        ox: 0,
        oz: 0,
        path: [],
        speed: rng.range(1.3, 2.5),
        scale: rng.range(0.9, 1.08),
        // evenly spread thresholds so density maps linearly to head-count
        threshold: (i + rng.next()) / count,
        side: rng.chance(0.5) ? 1 : -1,
        pause: 0,
        face: rng.range(0, Math.PI * 2),
        build: rng.range(0.88, 1.14),
      };
    });
  }, [layout, count]);

  useEffect(() => {
    const rng = new Rng(count * 7 + 1);
    const c = new THREE.Color();
    const shirt = geo.getAttribute('iShirt') as THREE.InstancedBufferAttribute;
    const pants = geo.getAttribute('iPants') as THREE.InstancedBufferAttribute;
    const skin = geo.getAttribute('iSkin') as THREE.InstancedBufferAttribute;
    const hair = geo.getAttribute('iHair') as THREE.InstancedBufferAttribute;
    const walk = geo.getAttribute('iWalk') as THREE.InstancedBufferAttribute;
    agents.forEach((_, i) => {
      // clothing: muted palette with occasional bright accents
      const accent = rng.chance(0.18);
      c.setHSL(rng.range(0, 1), accent ? rng.range(0.45, 0.75) : rng.range(0.08, 0.32), accent ? rng.range(0.42, 0.6) : rng.range(0.2, 0.62));
      shirt.setXYZ(i, c.r, c.g, c.b);
      c.set(rng.pick(PANTS_COLORS)).offsetHSL(0, 0, rng.range(-0.05, 0.05));
      pants.setXYZ(i, c.r, c.g, c.b);
      c.set(rng.pick(SKIN_TONES));
      skin.setXYZ(i, c.r, c.g, c.b);
      c.set(rng.pick(HAIR_COLORS));
      hair.setXYZW(i, c.r, c.g, c.b, rng.chance(0.42) ? 1 : 0);
      walk.setXY(i, rng.range(0, 6.28), 0);
    });
    for (const a of [shirt, pants, skin, hair, walk]) a.needsUpdate = true;
  }, [agents, count, geo]);

  const m = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const v = useMemo(() => new THREE.Vector3(), []);
  const sv = useMemo(() => new THREE.Vector3(), []);
  const rng = useMemo(() => new Rng(99), []);
  const grid = useMemo(() => new Map<number, number[]>(), []);
  const hidden = useMemo(() => new THREE.Matrix4().makeScale(0, 0, 0), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);

  useFrame((_, rawDt) => {
    const b = body.current;
    if (!b || !layout.graph.nodes.length) return;
    const walkAttr = geo.getAttribute('iWalk') as THREE.InstancedBufferAttribute;
    const dt = Math.min(rawDt, 0.1);
    const w = getWorld();
    const hour = localHour(w.time, w.planets[planetId]?.dayLengthHours);
    const weather = w.planets[planetId]?.environment.weather ?? 'clear';
    const density = crowdDensity(hour, weather);
    const working = hour >= 9 && hour < 18;
    const camX = camera.position.x;
    const camZ = camera.position.z;
    const maxDist = quality === 'low' ? 110 : 180; // distance culling (LOD)
    // spatial hash for separation steering
    grid.clear();
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      if (a.threshold > density) continue;
      const key = Math.floor((a.x + a.ox) / CELL) * 4096 + Math.floor((a.z + a.oz) / CELL);
      const cell = grid.get(key);
      if (cell) cell.push(i);
      else grid.set(key, [i]);
    }
    let visible = 0;
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      if (a.threshold > density) {
        b.setMatrixAt(i, hidden);
        continue;
      }
      if (!a.path.length) {
        // during working hours markets and plazas draw a bigger share of walkers
        const toHotspot = hotspots.length > 0 && rng.chance(working ? 0.45 : 0.15);
        const target: [number, number] = toHotspot ? hotspots[Math.floor(rng.next() * hotspots.length)] : layout.graph.nodes[Math.floor(rng.next() * layout.graph.nodes.length)];
        a.path = routeBetween(layout.graph, [a.x, a.z], [target[0] + rng.range(-6, 6), target[1] + rng.range(-6, 6)]).slice(0, 10);
        a.pause = toHotspot ? rng.range(2, 8) : 0;
      }
      const [tx, tz] = a.path[0];
      const dx = tx - a.x;
      const dz = tz - a.z;
      const d = Math.hypot(dx, dz);
      let moving = false;
      if (d < 0.6) {
        if (a.path.length === 1 && a.pause > 0) a.pause -= dt;
        else a.path.shift();
      } else {
        a.x += (dx / d) * Math.min(d, a.speed * dt);
        a.z += (dz / d) * Math.min(d, a.speed * dt);
        moving = true;
      }
      // keep to one side of the street
      const lane = moving ? 2.2 * a.side : 0;
      const lx = d > 0 ? (-dz / d) * lane : 0;
      const lz = d > 0 ? (dx / d) * lane : 0;
      // separation steering: push away from close neighbours
      let sx = 0;
      let sz = 0;
      const px = a.x + a.ox;
      const pz = a.z + a.oz;
      const cx = Math.floor(px / CELL);
      const cz = Math.floor(pz / CELL);
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        for (let gz = cz - 1; gz <= cz + 1; gz++) {
          const cell = grid.get(gx * 4096 + gz);
          if (!cell) continue;
          for (const j of cell) {
            if (j === i) continue;
            const o = agents[j];
            const ex = px - (o.x + o.ox);
            const ez = pz - (o.z + o.oz);
            const dd = ex * ex + ez * ez;
            if (dd < 1.44 && dd > 1e-6) {
              const k = (1.2 - Math.sqrt(dd)) / 1.2;
              sx += (ex / Math.sqrt(dd)) * k;
              sz += (ez / Math.sqrt(dd)) * k;
            }
          }
        }
      }
      a.ox += (lx - a.ox) * Math.min(1, dt * 2) + sx * dt * 3;
      a.oz += (lz - a.oz) * Math.min(1, dt * 2) + sz * dt * 3;
      const fx = a.x + a.ox;
      const fz = a.z + a.oz;
      if ((fx - camX) ** 2 + (fz - camZ) ** 2 > maxDist * maxDist) {
        b.setMatrixAt(i, hidden);
        continue;
      }
      visible++;
      const y = t.height(fx, fz);
      if (moving) a.face = Math.atan2(dx, dz);
      q.setFromAxisAngle(up, a.face);
      // slimmer or broader builds around a common height
      sv.set(a.scale * a.build, a.scale, a.scale * a.build);
      v.set(fx, y, fz);
      m.compose(v, q, sv);
      b.setMatrixAt(i, m);
      // stride cadence follows walking speed (rad/s of the leg swing); 0 while standing
      walkAttr.setY(i, moving ? a.speed * 4.2 : 0);
    }
    b.instanceMatrix.needsUpdate = true;
    walkAttr.needsUpdate = true;
    crowdStats.capacity = count;
    crowdStats.visible = visible;
    crowdStats.density = density;
  });

  useEffect(
    () => () => {
      crowdStats.visible = 0;
      crowdStats.capacity = 0;
    },
    [],
  );

  if (!layout.graph.nodes.length) return null;
  return (
    <group>
      <instancedMesh ref={body} args={[geo, crowdMat, count]} frustumCulled={false} raycast={noRaycast} castShadow={quality === 'high'} key={`b${count}${quality}`} />
    </group>
  );
}
