import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Planet } from '../sim/types';
import { CLOUD_SEA_LEVEL, type CloudCity } from './cloudCity';

/**
 * Geometry for a floating platform complex: deck slabs with tapered
 * undersides, railed sky-bridges, anchor cables and lift-engine glows above
 * an animated cloud sea.
 */
export function CloudPlatforms({ city, planet }: { city: CloudCity; planet: Planet }) {
  const { deckGeo, underGeo, railGeo, cableGeo, glowGeo } = useMemo(() => {
    const deck: THREE.BufferGeometry[] = [];
    const under: THREE.BufferGeometry[] = [];
    const rail: THREE.BufferGeometry[] = [];
    const cable: THREE.BufferGeometry[] = [];
    const glow: THREE.BufferGeometry[] = [];
    for (const d of city.decks) {
      const slab = new THREE.CylinderGeometry(d.r, d.r, 2.4, 64, 1);
      slab.translate(d.x, -1.2, d.z);
      deck.push(slab);
      const cone = new THREE.CylinderGeometry(d.r * 0.98, d.r * 0.25, d.r * 0.55, 48, 1, true);
      cone.translate(d.x, -2.4 - d.r * 0.275, d.z);
      under.push(cone);
      const ring = new THREE.TorusGeometry(d.r - 0.3, 0.09, 6, 96);
      ring.rotateX(Math.PI / 2);
      ring.translate(d.x, 1.05, d.z);
      rail.push(ring);
      const posts = Math.round(d.r * 0.9);
      for (let i = 0; i < posts; i++) {
        const a = (i / posts) * Math.PI * 2;
        const p = new THREE.CylinderGeometry(0.06, 0.06, 1.05, 4);
        p.translate(d.x + Math.cos(a) * (d.r - 0.3), 0.52, d.z + Math.sin(a) * (d.r - 0.3));
        rail.push(p);
      }
      const g = new THREE.CircleGeometry(d.r * 0.22, 32);
      g.rotateX(Math.PI / 2);
      g.translate(d.x, -2.5 - d.r * 0.55, d.z);
      glow.push(g);
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + d.x * 0.01;
        const top = new THREE.Vector3(d.x + Math.cos(a) * d.r * 0.5, -2.4 - d.r * 0.2, d.z + Math.sin(a) * d.r * 0.5);
        const len = top.y - CLOUD_SEA_LEVEL + 20;
        const c = new THREE.CylinderGeometry(0.25, 0.25, len, 5);
        c.translate(top.x, top.y - len / 2, top.z);
        cable.push(c);
      }
    }
    for (const b of city.bridges) {
      const dx = b.b[0] - b.a[0];
      const dz = b.b[1] - b.a[1];
      const len = Math.hypot(dx, dz);
      const ang = -Math.atan2(dz, dx);
      const mx = (b.a[0] + b.b[0]) / 2;
      const mz = (b.a[1] + b.b[1]) / 2;
      const slab = new THREE.BoxGeometry(len, 1.2, b.w);
      slab.rotateY(ang);
      slab.translate(mx, -0.6, mz);
      deck.push(slab);
      for (const side of [-1, 1]) {
        const r = new THREE.BoxGeometry(len, 0.12, 0.12);
        r.translate(0, 1.05, (side * b.w) / 2 - side * 0.15);
        r.rotateY(ang);
        r.translate(mx, 0, mz);
        rail.push(r);
        const posts = Math.round(len / 3);
        for (let i = 0; i <= posts; i++) {
          const p = new THREE.BoxGeometry(0.1, 1.05, 0.1);
          p.translate(-len / 2 + (i / posts) * len, 0.52, (side * b.w) / 2 - side * 0.15);
          p.rotateY(ang);
          p.translate(mx, 0, mz);
          rail.push(p);
        }
      }
    }
    const merge = (parts: THREE.BufferGeometry[]) => mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
    return { deckGeo: merge(deck), underGeo: merge(under), railGeo: merge(rail), cableGeo: merge(cable), glowGeo: merge(glow) };
  }, [city]);

  return (
    <group>
      <mesh geometry={deckGeo} receiveShadow castShadow>
        <meshStandardMaterial color="#8a96a4" roughness={0.55} metalness={0.45} />
      </mesh>
      <mesh geometry={underGeo}>
        <meshStandardMaterial color="#4a5562" roughness={0.6} metalness={0.6} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={railGeo}>
        <meshStandardMaterial color="#c8d4e0" roughness={0.3} metalness={0.8} />
      </mesh>
      <mesh geometry={cableGeo}>
        <meshStandardMaterial color="#2a3038" roughness={0.7} metalness={0.5} />
      </mesh>
      <mesh geometry={glowGeo}>
        <meshBasicMaterial color="#9fe8ff" toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <CloudSea planet={planet} />
    </group>
  );
}

const seaVert = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const seaFrag = /* glsl */ `
uniform float uTime;
uniform vec3 uLight;
uniform vec3 uDark;
uniform vec3 uBand;
varying vec2 vUv;
varying vec3 vWorld;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}
void main() {
  vec2 p = vWorld.xz * 0.004;
  float bands = sin(vWorld.z * 0.006 + fbm(p * 1.5 + uTime * 0.01) * 3.0) * 0.5 + 0.5;
  float c = fbm(p * 3.0 + vec2(uTime * 0.02, 0.0));
  vec3 col = mix(uDark, uLight, smoothstep(0.25, 0.8, c));
  col = mix(col, uBand, bands * 0.35);
  float dist = length(vWorld.xz - cameraPosition.xz);
  float fade = smoothstep(2600.0, 900.0, dist);
  gl_FragColor = vec4(col, fade);
}`;

function CloudSea({ planet }: { planet: Planet }) {
  const mat = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: seaVert,
      fragmentShader: seaFrag,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uLight: { value: new THREE.Color(planet.palette.high) },
        uDark: { value: new THREE.Color(planet.palette.low) },
        uBand: { value: new THREE.Color(planet.palette.mid) },
      },
    });
  }, [planet]);
  useFrame((_, dt) => {
    mat.uniforms.uTime.value += dt;
  });
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, CLOUD_SEA_LEVEL, 0]} material={mat}>
      <planeGeometry args={[6000, 6000, 1, 1]} />
    </mesh>
  );
}
