import { useFrame, useThree } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import { skyAt, skyFragment, skyPalette, skyVertex } from './skyDome';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Rng } from '../sim/rng';
import { localHour } from '../sim/time';
import type { Planet, StarSystem } from '../sim/types';
import { getWorld } from '../state/store';
import { glowSprite } from '../cosmos/planetTexture';
import { nightUniform } from './City';
import { playerState } from './explorerStore';
import { NOISE_GLSL, env as envU } from './env';


export interface Environment {
  sunDir: THREE.Vector3;
  night: number;
}

/**
 * Sky, sun, moonlight, fog and weather, all derived from the simulation
 * clock and the planet's atmosphere and current weather.
 */
export function SkyWeather({ planet, system, quality }: { planet: Planet; system: StarSystem; quality: 'low' | 'medium' | 'high' }) {
  const { scene, gl } = useThree();
  const envTimer = useRef(0);
  const envElev = useRef(99);
  const envRT = useRef<THREE.WebGLRenderTarget | null>(null);
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const moonLight = useRef<THREE.DirectionalLight>(null);
  const flash = useRef(0);
  const sunPos = useRef(new THREE.Vector3(0, 1, 0));
  const fogColor = useMemo(() => new THREE.Color(), []);
  const weather = planet.environment.weather;
  const stars = useRef<THREE.Points>(null);
  const sky = useRef<THREE.Mesh>(null);
  const clouds = useRef<THREE.Mesh>(null);
  const cloudMat = useMemo(() => cloudMaterial(), []);
  useEffect(() => () => cloudMat.dispose(), [cloudMat]);
  const palette = useMemo(() => skyPalette(planet, system.star.spectralClass), [planet, system.star.spectralClass]);
  const skyCols = useMemo(() => ({ zenith: new THREE.Color(), horizon: new THREE.Color(), ground: new THREE.Color(), sun: new THREE.Color() }), []);
  const skyUniforms = useMemo(
    () => ({
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uGround: { value: new THREE.Color() },
      uSun: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunSize: { value: 0.0016 * Math.max(0.6, Math.min(2.2, system.star.radius / Math.max(0.3, planet.orbit))) },
      uDay: { value: 1 },
    }),
    [system.star.radius, planet.orbit],
  );
  // A tiny copy of the sky is rendered to an environment map every few seconds, so glass,
  // metal and water pick up real sky colour and everything gains soft ambient shading.
  const envRig = useMemo(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const s = new THREE.Scene();
    s.add(new THREE.Mesh(new THREE.SphereGeometry(50, 24, 12), new THREE.ShaderMaterial({ vertexShader: skyVertex.replace('gl_Position.z = gl_Position.w;', ''), fragmentShader: skyFragment, uniforms: skyUniforms, side: THREE.BackSide, depthWrite: false })));
    return { pmrem, scene: s };
  }, [gl, skyUniforms]);
  useEffect(
    () => () => {
      envRig.pmrem.dispose();
      envRT.current?.dispose();
      envRT.current = null;
      scene.environment = null;
    },
    [envRig, scene],
  );
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
    const h = localHour(w.time, planet.dayLengthHours);
    const ang = ((h - 6) / 24) * Math.PI * 2; // sunrise at 6
    const elev = Math.sin(ang);
    sunPos.current.set(Math.cos(ang) * 0.9, elev, tilt + 0.25).normalize();
    skyAt(palette, elev, skyCols);
    skyUniforms.uZenith.value.copy(skyCols.zenith);
    skyUniforms.uHorizon.value.copy(skyCols.horizon);
    skyUniforms.uGround.value.copy(skyCols.ground);
    skyUniforms.uSun.value.copy(skyCols.sun);
    skyUniforms.uSunDir.value.copy(sunPos.current);
    if (sky.current) sky.current.position.set(playerState.x, playerState.y, playerState.z);
    const day = THREE.MathUtils.smoothstep(elev, -0.12, 0.18);
    const night = 1 - day;
    nightUniform.value = night;
    if (quality === 'high') {
      envTimer.current -= dt;
      // refresh only when the light has actually changed (and never more than every 4 s)
      if (envTimer.current <= 0 && Math.abs(elev - envElev.current) > 0.03) {
        envTimer.current = 4;
        envElev.current = elev;
        const rt = envRig.pmrem.fromScene(envRig.scene, 0, 0.1, 200);
        envRT.current?.dispose();
        envRT.current = rt;
        scene.environment = rt.texture;
        scene.environmentIntensity = 0.42;
      }
    }
    envU.uTime.value += dt;
    envU.uDay.value = day;
    envU.uSky.value.copy(skyCols.horizon).lerp(skyCols.zenith, 0.45);
    envU.uSun.value.copy(skyCols.sun);
    const env = getWorld().planets[planet.id]?.environment ?? planet.environment;
    const wx = env.weather;
    const overcast = wx === 'storm' ? 0.65 : wx === 'rain' ? 0.45 : wx === 'cloudy' ? 0.3 : wx === 'fog' ? 0.35 : wx === 'dust' ? 0.4 : wx === 'snow' ? 0.35 : 0;
    envU.uCover.value += ((wx === 'storm' ? 0.95 : wx === 'rain' ? 0.82 : wx === 'snow' ? 0.78 : wx === 'fog' ? 0.7 : wx === 'cloudy' ? 0.66 : wx === 'dust' ? 0.25 : 0.38) - envU.uCover.value) * Math.min(1, dt * 0.5);
    envU.uWind.value = wx === 'storm' ? 3 : wx === 'rain' || wx === 'dust' || wx === 'snow' ? 1.8 : 1;
    if (clouds.current) clouds.current.position.set(playerState.x, 0, playerState.z);
    if (sun.current) {
      sun.current.position.set(playerState.x + sunPos.current.x * 300, playerState.y + Math.max(0.05, sunPos.current.y) * 300, playerState.z + sunPos.current.z * 300);
      sun.current.target.position.set(playerState.x, playerState.y, playerState.z);
      sun.current.target.updateMatrixWorld();
      const warm = 1 - THREE.MathUtils.smoothstep(elev, 0.05, 0.45);
      sun.current.color.copy(skyCols.sun).lerp(new THREE.Color('#ff9a5a'), warm * 0.4);
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
      hemi.current.intensity = (quality !== 'high' ? 0.42 + day * 0.4 : 0.26 + day * 0.24) + flash.current * 2;
      hemi.current.color.copy(skyCols.zenith).lerp(skyCols.horizon, 0.5).lerp(new THREE.Color('#34466e'), night * 0.6);
      hemi.current.groundColor.copy(skyCols.ground);
    }
    // fog colour follows the sky: day tint → dusk orange → night navy
    const dusk = Math.max(0, 1 - Math.abs(elev) / 0.25) * day;
    // fog takes the horizon colour of this world's sky
    fogColor.copy(skyCols.horizon);
    void dusk;
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
      <mesh ref={sky} frustumCulled={false} renderOrder={-1}>
        <sphereGeometry args={[3000, 32, 16]} />
        <shaderMaterial vertexShader={skyVertex} fragmentShader={skyFragment} uniforms={skyUniforms} side={THREE.BackSide} depthWrite={false} fog={false} />
      </mesh>
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
      {planet.atmosphere.pressure > 0.15 && (
        <mesh ref={clouds} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} material={cloudMat} renderOrder={-1} frustumCulled={false}>
          <planeGeometry args={[9000, 9000, 1, 1]} />
        </mesh>
      )}
      <Weather kind={weather} planetId={planet.id} quality={quality} />
    </>
  );
}

function SkyMoons({ planet }: { planet: Planet }) {
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!group.current) return;
    const h = localHour(getWorld().time, planet.dayLengthHours);
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

/**
 * A drifting cloud deck: fbm coverage driven by the weather, lit by the sun
 * colour, fading into the horizon. Drawn on a plane 420 m up that follows
 * the player.
 */
function cloudMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
    uniforms: { uTime: envU.uTime, uCover: envU.uCover, uSky: envU.uSky, uSun: envU.uSun, uDay: envU.uDay },
    vertexShader: /* glsl */ `
      varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        w.y += 420.0;
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uCover; uniform float uDay; uniform vec3 uSky; uniform vec3 uSun;
      varying vec3 vW;
      ${NOISE_GLSL}
      void main() {
        vec2 p = vW.xz * 0.0011 + vec2(uTime * 0.004, uTime * 0.0015);
        float n = efbm(p) * 0.65 + efbm(p * 2.7 + 5.0) * 0.35;
        float edge = 0.74 - uCover * 0.52;
        float a = smoothstep(edge, edge + 0.22, n);
        float thick = smoothstep(edge, edge + 0.5, n);
        float dist = length(vW.xz - cameraPosition.xz);
        a *= 1.0 - smoothstep(1800.0, 4200.0, dist);
        vec3 lit = mix(uSky, vec3(1.0), 0.75) * mix(vec3(1.0), uSun, 0.35);
        vec3 shade = mix(uSky * 0.55, vec3(0.42, 0.45, 0.5), uCover);
        vec3 col = mix(lit, shade, thick * (0.45 + 0.5 * uCover)) * (0.1 + 0.9 * uDay);
        gl_FragColor = vec4(col, a * 0.92);
      }`,
  });
}
