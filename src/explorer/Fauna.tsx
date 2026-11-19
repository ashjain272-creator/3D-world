import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Rng } from '../sim/rng';
import { nightUniform } from './City';
import type { TerrainData } from './terrain';

/**
 * Ambient wildlife. Purely visual and never simulated: flocks of birds
 * wheeling overhead (vultures circling over deserts), butterflies drifting
 * over meadows by day and fireflies blinking in the grass at night.
 */
export function Fauna({ t, quality, city }: { t: TerrainData; quality: 'low' | 'medium' | 'high'; city: boolean }) {
  const kind = t.look.vegetation;
  const snow = t.look.snow ?? 0;
  const green = (kind === 'broadleaf' || kind === 'conifer' || kind === 'jungle') && snow < 0.4;
  if (quality === 'low') return null;
  return (
    <group>
      {snow < 0.9 && <Birds t={t} vultures={kind === 'cactus'} count={kind === 'cactus' ? 5 : city ? 14 : 22} />}
      {green && <Butterflies t={t} count={quality === 'high' ? 40 : 24} />}
      {green && <Fireflies t={t} count={quality === 'high' ? 220 : 120} />}
    </group>
  );
}

/** A bird: two wings that flap around a body line. Built along +z (forward). */
const birdGeo = (() => {
  const g = new THREE.BufferGeometry();
  // body tip, two wing tips, tail; wings are separate triangles so the vertex shader can flap them
  const v = new Float32Array([
    0, 0, 0.5, -1, 0, 0, 0, 0, -0.3,
    0, 0, 0.5, 0, 0, -0.3, 1, 0, 0,
  ]);
  g.setAttribute('position', new THREE.BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
})();

function Birds({ t, vultures, count }: { t: TerrainData; vultures: boolean; count: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const { camera } = useThree();
  const birds = useMemo(() => {
    const rng = new Rng(t.seed + 77);
    const flocks = vultures ? 1 : 2;
    return Array.from({ length: count }, (_, i) => {
      const f = i % flocks;
      return {
        flock: f,
        r: vultures ? rng.range(25, 45) : rng.range(3, 14),
        speed: vultures ? rng.range(0.18, 0.28) : rng.range(0.7, 1.1),
        phase: rng.range(0, Math.PI * 2),
        h: rng.range(-4, 4),
        flap: rng.range(6, 10),
        size: vultures ? rng.range(1.6, 2.2) : rng.range(0.45, 0.7),
      };
    });
  }, [t.seed, vultures, count]);
  const mat = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ color: vultures ? '#2a2420' : '#1e2228', side: THREE.DoubleSide, fog: true });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      m.userData.shader = shader;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
            float ph = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.3;
            transformed.y += abs(transformed.x) * sin(uTime * ${vultures ? '2.0' : '9.0'} + ph) * ${vultures ? '0.18' : '0.7'};
          #endif`,
        );
    };
    return m;
  }, [vultures]);
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), v: new THREE.Vector3(), s: new THREE.Vector3(), e: new THREE.Euler() }), []);
  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const time = clock.elapsedTime;
    if (mat.userData.shader) mat.userData.shader.uniforms.uTime.value = time;
    birds.forEach((b, i) => {
      // each flock wanders on a slow loop around the player; birds orbit their flock centre
      const fa = time * 0.04 + b.flock * 2.4;
      const cx = camera.position.x + Math.cos(fa) * (vultures ? 40 : 70);
      const cz = camera.position.z + Math.sin(fa * 1.3) * (vultures ? 40 : 60);
      const base = Math.max(t.height(cx, cz), t.waterLevel ?? -1e9) + (vultures ? 55 : 28);
      const a = time * b.speed + b.phase;
      const x = cx + Math.cos(a) * b.r;
      const z = cz + Math.sin(a) * b.r;
      const y = base + b.h + Math.sin(time * 0.5 + b.phase) * 1.5;
      tmp.e.set(vultures ? 0.25 : 0.1, -a, 0);
      tmp.q.setFromEuler(tmp.e);
      tmp.v.set(x, y, z);
      tmp.s.setScalar(b.size);
      tmp.m.compose(tmp.v, tmp.q, tmp.s);
      mesh.setMatrixAt(i, tmp.m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    // birds roost at night
    mesh.visible = nightUniform.value < 0.6;
  });
  return <instancedMesh ref={ref} args={[birdGeo, mat, count]} frustumCulled={false} />;
}

const wingGeo = (() => {
  const g = new THREE.BufferGeometry();
  const v = new Float32Array([0, 0, 0, -1, 0, 0.6, -1, 0, -0.6, 0, 0, 0, 1, 0, -0.6, 1, 0, 0.6]);
  g.setAttribute('position', new THREE.BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
})();

function Butterflies({ t, count }: { t: TerrainData; count: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const { camera } = useThree();
  const flies = useMemo(() => {
    const rng = new Rng(t.seed + 313);
    return Array.from({ length: count }, () => ({ ox: rng.range(-25, 25), oz: rng.range(-25, 25), phase: rng.range(0, 6.28), speed: rng.range(0.3, 0.7), c: new THREE.Color(rng.pick(['#f4c430', '#f08a30', '#e8e8f0', '#6aa8f0', '#d070c0'])) }));
  }, [t.seed, count]);
  const mat = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      m.userData.shader = shader;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x * 3.1 + instanceMatrix[3].z * 1.7;
          transformed.y += abs(transformed.x) * sin(uTime * 18.0 + ph) * 0.9;
        #endif`,
      );
    };
    return m;
  }, []);
  const colored = useRef(false);
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), v: new THREE.Vector3(), s: new THREE.Vector3(0.14, 0.14, 0.14) }), []);
  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const time = clock.elapsedTime;
    if (mat.userData.shader) mat.userData.shader.uniforms.uTime.value = time;
    if (!colored.current) {
      flies.forEach((f, i) => mesh.setColorAt(i, f.c));
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      colored.current = true;
    }
    // wrap each butterfly's home point around the camera so the meadow always has some
    const cx = Math.round(camera.position.x / 50) * 50;
    const cz = Math.round(camera.position.z / 50) * 50;
    flies.forEach((f, i) => {
      const hx = cx + f.ox;
      const hz = cz + f.oz;
      const a = time * f.speed + f.phase;
      const x = hx + Math.sin(a) * 2.5 + Math.sin(a * 2.3) * 0.8;
      const z = hz + Math.cos(a * 0.8) * 2.5;
      const y = t.height(x, z) + 0.7 + Math.abs(Math.sin(a * 1.7)) * 0.9;
      tmp.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a * 2);
      tmp.v.set(x, y, z);
      tmp.m.compose(tmp.v, tmp.q, tmp.s);
      mesh.setMatrixAt(i, tmp.m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.visible = nightUniform.value < 0.4;
  });
  return <instancedMesh ref={ref} args={[wingGeo, mat, count]} frustumCulled={false} />;
}

function Fireflies({ t, count }: { t: TerrainData; count: number }) {
  const ref = useRef<THREE.Points>(null);
  const { camera } = useThree();
  const seeds = useMemo(() => {
    const rng = new Rng(t.seed + 515);
    return Array.from({ length: count }, () => [rng.range(-35, 35), rng.range(-35, 35), rng.range(0, 6.28), rng.range(0.2, 0.5)] as const);
  }, [t.seed, count]);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute('blink', new THREE.BufferAttribute(new Float32Array(count), 1));
    return g;
  }, [count]);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uNight: nightUniform },
        vertexShader: 'attribute float blink; varying float vB; void main(){ vB = blink; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = 90.0 / -mv.z; gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'uniform float uNight; varying float vB; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vec3(0.75, 1.0, 0.35) * a * vB * uNight, 1.0); }',
      }),
    [],
  );
  useFrame(({ clock }) => {
    const p = ref.current;
    if (!p || nightUniform.value < 0.3) {
      if (p) p.visible = false;
      return;
    }
    p.visible = true;
    const time = clock.elapsedTime;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const blink = geo.attributes.blink as THREE.BufferAttribute;
    const cx = Math.round(camera.position.x / 70) * 70;
    const cz = Math.round(camera.position.z / 70) * 70;
    seeds.forEach(([ox, oz, ph, sp], i) => {
      const a = time * sp + ph;
      const x = cx + ox + Math.sin(a) * 1.5;
      const z = cz + oz + Math.cos(a * 1.3) * 1.5;
      pos.setXYZ(i, x, t.height(x, z) + 0.6 + Math.sin(a * 2.1) * 0.4, z);
      blink.setX(i, Math.max(0, Math.sin(time * 1.6 + ph * 3)) ** 6);
    });
    pos.needsUpdate = true;
    blink.needsUpdate = true;
  });
  return <points ref={ref} geometry={geo} material={mat} frustumCulled={false} />;
}
