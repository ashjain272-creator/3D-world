import { useFrame, useThree } from '@react-three/fiber';
import { Sky, Stars } from '@react-three/drei';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Rng } from '../sim/rng';
import { hourOfDay } from '../sim/time';
import type { Planet, StarSystem } from '../sim/types';
import { getWorld } from '../state/store';
import { glowSprite } from '../cosmos/planetTexture';
import { nightUniform } from './City';
import { playerState } from './explorerStore';

function skyParams(planet: Planet) {
  switch (planet.type) {
    case 'desert':
      return { turbidity: 9, rayleigh: 0.9, mie: 0.012, tint: '#f0c890' };
    case 'arctic':
      return { turbidity: 2.5, rayleigh: 2.6, mie: 0.004, tint: '#c8e4ff' };
    case 'jungle':
      return { turbidity: 11, rayleigh: 1.6, mie: 0.008, tint: '#b8e8c8' };
    case 'ocean':
      return { turbidity: 5, rayleigh: 2.4, mie: 0.005, tint: '#a8d8ff' };
    case 'volcanic':
      return { turbidity: 20, rayleigh: 0.4, mie: 0.03, tint: '#ff9a6a' };
    case 'barren':
      return { turbidity: 0.5, rayleigh: 0.1, mie: 0.001, tint: '#8a8a9a' };
    default:
      return { turbidity: 6, rayleigh: 1.8, mie: 0.005, tint: '#bcd8f4' };
  }
}

export interface Environment {
  sunDir: THREE.Vector3;
  night: number;
}

/**
 * Sky, sun, moonlight, fog and weather, all derived from the simulation
 * clock and the planet's atmosphere and current weather.
 */
export function SkyWeather({ planet, system, quality }: { planet: Planet; system: StarSystem; quality: 'low' | 'medium' | 'high' }) {
  const { scene } = useThree();
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const moonLight = useRef<THREE.DirectionalLight>(null);
  const flash = useRef(0);
  const params = useMemo(() => skyParams(planet), [planet]);
  const sunPos = useRef(new THREE.Vector3(0, 1, 0));
  const fogColor = useMemo(() => new THREE.Color(), []);
  const weather = planet.environment.weather;
  const stars = useRef<THREE.Points>(null);
  const sky = useRef<THREE.Mesh>(null);
  const cityGlow = useRef<THREE.PointLight>(null);
  const tilt = (planet.axialTilt / 90) * 0.4;

  useEffect(() => {
    scene.fog = new THREE.Fog('#9fb8d0', 60, 900);
    return () => {
      scene.fog = null;
    };
  }, [scene]);

  useFrame((_, dt) => {
    const w = getWorld();
    const h = hourOfDay(w.time);
    const ang = ((h - 6) / 24) * Math.PI * 2; // sunrise at 6
    const elev = Math.sin(ang);
    sunPos.current.set(Math.cos(ang) * 0.9, elev, tilt + 0.25).normalize();
    // R3F copies vector props once, so drive the sky shader's uniform directly.
    const skyMat = sky.current?.material as THREE.ShaderMaterial | undefined;
    if (skyMat?.uniforms?.sunPosition) skyMat.uniforms.sunPosition.value.copy(sunPos.current);
    const day = THREE.MathUtils.smoothstep(elev, -0.12, 0.18);
    const night = 1 - day;
    nightUniform.value = night;
    const env = getWorld().planets[planet.id]?.environment ?? planet.environment;
    const wx = env.weather;
    const overcast = wx === 'storm' ? 0.65 : wx === 'rain' ? 0.45 : wx === 'cloudy' ? 0.3 : wx === 'fog' ? 0.35 : wx === 'dust' ? 0.4 : wx === 'snow' ? 0.35 : 0;
    if (sun.current) {
      sun.current.position.set(playerState.x + sunPos.current.x * 300, playerState.y + Math.max(0.05, sunPos.current.y) * 300, playerState.z + sunPos.current.z * 300);
      sun.current.target.position.set(playerState.x, playerState.y, playerState.z);
      sun.current.target.updateMatrixWorld();
      const warm = 1 - THREE.MathUtils.smoothstep(elev, 0.05, 0.45);
      sun.current.color.set(system.star.color).lerp(new THREE.Color('#ff9a5a'), warm * 0.6);
      sun.current.intensity = day * 2.6 * (1 - overcast * 0.7);
    }
    if (cityGlow.current) {
      cityGlow.current.position.set(playerState.x, playerState.y + 14, playerState.z);
      cityGlow.current.intensity = night * 70;
    }
    if (moonLight.current) {
      moonLight.current.intensity = night * 0.55;
      moonLight.current.position.set(playerState.x - 200, playerState.y + 260, playerState.z - 120);
      moonLight.current.target.position.set(playerState.x, playerState.y, playerState.z);
      moonLight.current.target.updateMatrixWorld();
    }
    if (flash.current > 0) flash.current = Math.max(0, flash.current - dt * 3);
    if (wx === 'storm' && Math.random() < dt * 0.15) flash.current = 1;
    if (hemi.current) {
      hemi.current.intensity = 0.42 + day * 0.4 + flash.current * 2;
      hemi.current.color.set(params.tint).lerp(new THREE.Color('#34466e'), night * 0.8);
    }
    // fog colour follows the sky: day tint → dusk orange → night navy
    const dusk = Math.max(0, 1 - Math.abs(elev) / 0.25) * day;
    fogColor.set(params.tint).lerp(new THREE.Color('#e89a6a'), dusk * 0.5).lerp(new THREE.Color('#05080f'), night * 0.92);
    if (overcast) fogColor.lerp(new THREE.Color(wx === 'dust' ? '#a08060' : '#7a8490'), overcast * day * 0.8);
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.copy(fogColor);
      const dense = wx === 'fog' ? 0.25 : wx === 'dust' ? 0.35 : wx === 'storm' ? 0.5 : wx === 'snow' ? 0.55 : wx === 'rain' ? 0.65 : 1;
      scene.fog.near = 30 * dense;
      scene.fog.far = (quality === 'low' ? 600 : 950) * dense;
    }
    scene.background = fogColor;
    if (stars.current) (stars.current.material as THREE.PointsMaterial).opacity = night * (1 - overcast);
  });

  const shadowSize = quality === 'high' ? 2048 : 1024;
  return (
    <>
      <Sky ref={sky as never} distance={4500} sunPosition={sunPos.current} turbidity={params.turbidity} rayleigh={params.rayleigh} mieCoefficient={params.mie} mieDirectionalG={0.8} />
      <Stars ref={stars as never} radius={1800} depth={200} count={3000} factor={20} saturation={0.2} fade />
      <SkyMoons planet={planet} />
      <hemisphereLight ref={hemi} args={['#bcd8f4', '#3a3226', 0.6]} />
      <directionalLight
        ref={sun}
        castShadow={quality !== 'low'}
        shadow-mapSize={[shadowSize, shadowSize]}
        shadow-camera-left={-120}
        shadow-camera-right={120}
        shadow-camera-top={120}
        shadow-camera-bottom={-120}
        shadow-camera-near={10}
        shadow-camera-far={700}
        shadow-bias={-0.0004}
      />
      <directionalLight ref={moonLight} color="#8aa8ff" />
      <pointLight ref={cityGlow} color="#bcd0ff" distance={60} decay={1.4} intensity={0} />
      <Weather kind={weather} planetId={planet.id} quality={quality} />
    </>
  );
}

function SkyMoons({ planet }: { planet: Planet }) {
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!group.current) return;
    const h = hourOfDay(getWorld().time);
    group.current.position.set(playerState.x, playerState.y, playerState.z);
    group.current.rotation.z = ((h - 18) / 24) * Math.PI * 2;
  });
  return (
    <group ref={group}>
      {planet.moons.slice(0, 3).map((m, i) => {
        const a = 0.6 + i * 0.7;
        const r = 1400;
        const size = 40 + m.radius * 260;
        return (
          <mesh key={m.name} position={[Math.cos(a) * r, Math.sin(a) * r * 0.6 + 200, -600 - i * 200]}>
            <sphereGeometry args={[size, 24, 16]} />
            <meshBasicMaterial color={m.color} fog={false} />
          </mesh>
        );
      })}
    </group>
  );
}

function Weather({ kind, planetId, quality }: { kind: Planet['environment']['weather']; planetId: string; quality: 'low' | 'medium' | 'high' }) {
  const live = useRef(kind);
  const ref = useRef<THREE.Points>(null);
  const N = quality === 'low' ? 1200 : 3500;
  const geo = useMemo(() => {
    const rng = new Rng(3);
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = rng.range(-60, 60);
      pos[i * 3 + 1] = rng.range(0, 50);
      pos[i * 3 + 2] = rng.range(-60, 60);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }, [N]);
  useEffect(() => () => geo.dispose(), [geo]);
  useFrame((_, dt) => {
    live.current = getWorld().planets[planetId]?.environment.weather ?? kind;
    const k = live.current;
    const pts = ref.current;
    if (!pts) return;
    const active = k === 'rain' || k === 'storm' || k === 'snow' || k === 'dust';
    pts.visible = active;
    if (!active) return;
    const mat = pts.material as THREE.PointsMaterial;
    const fall = k === 'snow' ? 2.5 : k === 'dust' ? 0.6 : 38;
    const drift = k === 'dust' ? 14 : k === 'snow' ? 1.2 : k === 'storm' ? 6 : 1.5;
    mat.color.set(k === 'dust' ? '#c8a070' : k === 'snow' ? '#ffffff' : '#a8c0e0');
    mat.size = k === 'snow' ? 0.28 : k === 'dust' ? 0.3 : 0.16;
    mat.opacity = k === 'dust' ? 0.5 : 0.75;
    const arr = geo.attributes.position.array as Float32Array;
    for (let i = 0; i < N; i++) {
      arr[i * 3 + 1] -= fall * dt;
      arr[i * 3] += drift * dt;
      if (arr[i * 3 + 1] < 0) arr[i * 3 + 1] += 50;
      if (arr[i * 3] > 60) arr[i * 3] -= 120;
    }
    geo.attributes.position.needsUpdate = true;
    pts.position.set(playerState.x, playerState.y - 5, playerState.z);
  });
  return (
    <points ref={ref} geometry={geo} frustumCulled={false}>
      <pointsMaterial transparent depthWrite={false} sizeAttenuation map={glowSprite()} />
    </points>
  );
}
