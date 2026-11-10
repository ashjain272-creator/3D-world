import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Html, OrbitControls, Stars } from '@react-three/drei';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { Rng } from '../sim/rng';
import { MINUTES_PER_DAY } from '../sim/time';
import type { Planet, StarSystem, World } from '../sim/types';
import { getWorld, useApp } from '../state/store';
import { glowSprite, planetTextures, regionDir } from './planetTexture';
import { PostFX } from '../ui/components/PostFX';

export type UniverseView = { kind: 'galaxy' } | { kind: 'system'; id: string } | { kind: 'planet'; id: string; settlementId?: string };

interface Props {
  view: UniverseView;
  version: number;
  selectedRegion: number | null;
  onSelectSystem: (id: string) => void;
  onSelectPlanet: (id: string) => void;
  onSelectRegion: (index: number) => void;
  onSelectSettlement: (id: string) => void;
}

export function UniverseScene(props: Props) {
  const quality = useApp((s) => s.settings.quality);
  // Selecting a star first flies the camera to it, then opens the system.
  const [fly, setFly] = useState<{ id: string; pos: THREE.Vector3 } | null>(null);
  useEffect(() => setFly(null), [props.view.kind]);
  const startFly = (id: string) => {
    const sys = getWorld().systems[id];
    if (!sys) return props.onSelectSystem(id);
    setFly({ id, pos: new THREE.Vector3(...sys.position) });
  };
  return (
    <Canvas
      camera={{ position: [0, 420, 640], fov: 50, near: 0.1, far: 8000 }}
      dpr={quality === 'low' ? 1 : quality === 'medium' ? [1, 1.5] : [1, 2]}
      gl={{ antialias: quality !== 'low', powerPreference: 'high-performance' }}
      data-testid="universe-canvas"
    >
      <color attach="background" args={['#020409']} />
      <Suspense fallback={null}>
        <Stars radius={2400} depth={600} count={quality === 'low' ? 2500 : 6000} factor={18} saturation={0.15} fade speed={0.3} />
        <Rig view={props.view} fly={fly} onArrive={(id) => props.onSelectSystem(id)} />
        {props.view.kind === 'galaxy' && <Galaxy onSelect={startFly} version={props.version} />}
        {props.view.kind === 'system' && <SystemView id={props.view.id} onSelect={props.onSelectPlanet} />}
        {props.view.kind === 'planet' && (
          <PlanetView
            id={props.view.id}
            version={props.version}
            selectedRegion={props.selectedRegion}
            selectedSettlement={props.view.settlementId}
            onRegion={props.onSelectRegion}
            onSettlement={props.onSelectSettlement}
          />
        )}
        <PostFX quality={quality} bloom={props.view.kind === 'galaxy' ? 1.1 : 0.8} threshold={props.view.kind === 'galaxy' ? 0.35 : 0.6} dofTarget={quality === 'high' && fly ? fly.pos : null} />
      </Suspense>
    </Canvas>
  );
}

/** Animated camera transitions between views; user orbit control otherwise. */
function Rig({ view, fly, onArrive }: { view: UniverseView; fly: { id: string; pos: THREE.Vector3 } | null; onArrive: (id: string) => void }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const anim = useRef<{ from: THREE.Vector3; to: THREE.Vector3; tFrom: THREE.Vector3; tTo: THREE.Vector3; t: number } | null>(null);
  const key = view.kind === 'galaxy' ? 'g' : `${view.kind}:${view.id}`;
  useEffect(() => {
    const to = view.kind === 'galaxy' ? new THREE.Vector3(0, 380, 560) : view.kind === 'system' ? new THREE.Vector3(0, 46, 78) : new THREE.Vector3(0, 6, 30);
    anim.current = {
      from: camera.position.clone(),
      to,
      tFrom: controls.current?.target.clone() ?? new THREE.Vector3(),
      tTo: new THREE.Vector3(0, 0, 0),
      t: 0,
    };
    if (view.kind !== 'galaxy') camera.position.multiplyScalar(view.kind === 'system' ? 0.15 : 0.4);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const flight = useRef<{ id: string; from: THREE.Vector3; to: THREE.Vector3; tFrom: THREE.Vector3; tTo: THREE.Vector3; t: number; done: boolean } | null>(null);
  useEffect(() => {
    if (!fly) {
      flight.current = null;
      return;
    }
    // approach along the current viewing direction, ending close to the star
    const dir = camera.position.clone().sub(fly.pos).normalize();
    flight.current = {
      id: fly.id,
      from: camera.position.clone(),
      to: fly.pos.clone().add(dir.multiplyScalar(26)).add(new THREE.Vector3(0, 6, 0)),
      tFrom: controls.current?.target.clone() ?? new THREE.Vector3(),
      tTo: fly.pos.clone(),
      t: 0,
      done: false,
    };
  }, [fly, camera]);
  useFrame((_, dt) => {
    const f = flight.current;
    if (f && controls.current) {
      f.t = Math.min(1, f.t + dt / 1.25);
      // ease in-out (smootherstep) for a cinematic approach
      const e = f.t * f.t * f.t * (f.t * (f.t * 6 - 15) + 10);
      camera.position.lerpVectors(f.from, f.to, e);
      controls.current.target.lerpVectors(f.tFrom, f.tTo, e);
      controls.current.update();
      if (f.t >= 1 && !f.done) {
        f.done = true;
        onArrive(f.id);
      }
      return;
    }
    const a = anim.current;
    if (!a || !controls.current) return;
    a.t = Math.min(1, a.t + dt / 1.4);
    const e = 1 - Math.pow(1 - a.t, 3);
    camera.position.lerpVectors(a.from, a.to, e);
    controls.current.target.lerpVectors(a.tFrom, a.tTo, e);
    controls.current.update();
    if (a.t >= 1) anim.current = null;
  });
  const limits = view.kind === 'galaxy' ? { min: 60, max: 1400 } : view.kind === 'system' ? { min: 12, max: 260 } : { min: 13, max: 90 };
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={limits.min}
      maxDistance={limits.max}
      maxPolarAngle={Math.PI * 0.95}
      rotateSpeed={0.6}
      zoomSpeed={0.8}
      autoRotate={view.kind !== 'planet'}
      autoRotateSpeed={view.kind === 'galaxy' ? 0.12 : 0.25}
    />
  );
}

// ───────────────────────────── Galaxy ─────────────────────────────

function useGalaxyGeometry(world: World) {
  const quality = useApp((s) => s.settings.quality);
  return useMemo(() => {
    const g = world.galaxy;
    const rng = new Rng(g.seed);
    const N = quality === 'low' ? 18000 : quality === 'medium' ? 42000 : 70000;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const core = new THREE.Color(g.coreColor);
    const arm = new THREE.Color(g.armColor);
    const pink = new THREE.Color('#ff9ec7');
    const c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const inCore = rng.chance(0.22);
      let x: number, y: number, z: number;
      if (inCore) {
        const r = Math.pow(rng.next(), 1.8) * 120;
        const th = rng.range(0, Math.PI * 2);
        x = Math.cos(th) * r;
        z = Math.sin(th) * r * 0.85;
        y = rng.normal(0, Math.min(12 * (1 - r / 140), r * 0.35 + 2.5));
        c.copy(core).lerp(arm, r / 260);
      } else {
        const armI = rng.int(0, g.arms - 1);
        const r = 40 + Math.pow(rng.next(), 0.85) * g.radius;
        const spread = rng.normal(0, 0.22 + (r / g.radius) * 0.18);
        const th = (armI / g.arms) * Math.PI * 2 + (r / g.radius) * g.twist + spread;
        x = Math.cos(th) * r + rng.normal(0, 8);
        z = Math.sin(th) * r + rng.normal(0, 8);
        y = rng.normal(0, 5 + (1 - r / g.radius) * 6);
        c.copy(core).lerp(arm, Math.min(1, r / 230));
        if (rng.chance(0.06)) c.lerp(pink, 0.6);
        if (rng.chance(0.1)) c.lerp(new THREE.Color('#ffffff'), 0.5);
      }
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
      const b = rng.range(0.45, 1);
      col[i * 3] = c.r * b;
      col[i * 3 + 1] = c.g * b;
      col[i * 3 + 2] = c.b * b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    // nebula clouds: few large faint sprites along the arms
    const M = 260;
    const npos = new Float32Array(M * 3);
    const ncol = new Float32Array(M * 3);
    for (let i = 0; i < M; i++) {
      const armI = rng.int(0, g.arms - 1);
      const r = 60 + rng.next() * g.radius * 0.9;
      const th = (armI / g.arms) * Math.PI * 2 + (r / g.radius) * g.twist + rng.normal(0, 0.18);
      npos[i * 3] = Math.cos(th) * r;
      npos[i * 3 + 1] = rng.normal(0, 4);
      npos[i * 3 + 2] = Math.sin(th) * r;
      c.copy(rng.chance(0.3) ? pink : arm).lerp(core, rng.range(0, 0.3));
      ncol[i * 3] = c.r;
      ncol[i * 3 + 1] = c.g;
      ncol[i * 3 + 2] = c.b;
    }
    const neb = new THREE.BufferGeometry();
    neb.setAttribute('position', new THREE.BufferAttribute(npos, 3));
    neb.setAttribute('color', new THREE.BufferAttribute(ncol, 3));
    // dust lanes: dark, softly blended clouds hugging the inner edge of each arm
    const D = quality === 'low' ? 900 : 2400;
    const dpos = new Float32Array(D * 3);
    const dcol = new Float32Array(D * 3);
    const dust = new THREE.Color('#1a0f0a');
    for (let i = 0; i < D; i++) {
      const armI = rng.int(0, g.arms - 1);
      const r = 70 + Math.pow(rng.next(), 0.9) * g.radius * 0.85;
      const th = (armI / g.arms) * Math.PI * 2 + (r / g.radius) * g.twist - 0.16 + rng.normal(0, 0.06);
      dpos[i * 3] = Math.cos(th) * r + rng.normal(0, 4);
      dpos[i * 3 + 1] = rng.normal(0, 2);
      dpos[i * 3 + 2] = Math.sin(th) * r + rng.normal(0, 4);
      dcol[i * 3] = dust.r;
      dcol[i * 3 + 1] = dust.g;
      dcol[i * 3 + 2] = dust.b;
    }
    const lanes = new THREE.BufferGeometry();
    lanes.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
    lanes.setAttribute('color', new THREE.BufferAttribute(dcol, 3));
    // a handful of bright emission nebulae (star-forming regions)
    const H = 26;
    const hpos = new Float32Array(H * 3);
    const hcol = new Float32Array(H * 3);
    const hii = [new THREE.Color('#ff6fa8'), new THREE.Color('#6fa8ff'), new THREE.Color('#ff9a6f'), new THREE.Color('#9d7bff')];
    for (let i = 0; i < H; i++) {
      const armI = rng.int(0, g.arms - 1);
      const r = 120 + rng.next() * g.radius * 0.75;
      const th = (armI / g.arms) * Math.PI * 2 + (r / g.radius) * g.twist + rng.normal(0, 0.08);
      hpos[i * 3] = Math.cos(th) * r;
      hpos[i * 3 + 1] = rng.normal(0, 3);
      hpos[i * 3 + 2] = Math.sin(th) * r;
      c.copy(hii[i % hii.length]);
      hcol[i * 3] = c.r;
      hcol[i * 3 + 1] = c.g;
      hcol[i * 3 + 2] = c.b;
    }
    const glow = new THREE.BufferGeometry();
    glow.setAttribute('position', new THREE.BufferAttribute(hpos, 3));
    glow.setAttribute('color', new THREE.BufferAttribute(hcol, 3));
    return { geo, neb, lanes, glow };
  }, [world.galaxy, quality]);
}

function Galaxy({ onSelect, version }: { onSelect: (id: string) => void; version: number }) {
  const world = getWorld();
  const { geo, neb, lanes, glow } = useGalaxyGeometry(world);
  const group = useRef<THREE.Group>(null);
  useEffect(() => () => {
    geo.dispose();
    neb.dispose();
    lanes.dispose();
    glow.dispose();
  }, [geo, neb, lanes, glow]);
  const systems = Object.values(world.systems);
  void version;
  return (
    <group ref={group}>
      <points geometry={geo}>
        <pointsMaterial size={3.2} sizeAttenuation vertexColors map={glowSprite()} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.95} />
      </points>
      <points geometry={neb}>
        <pointsMaterial size={80} sizeAttenuation vertexColors map={glowSprite()} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.075} />
      </points>
      <points geometry={glow}>
        <pointsMaterial size={150} sizeAttenuation vertexColors map={glowSprite()} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.16} />
      </points>
      <points geometry={lanes} renderOrder={2}>
        <pointsMaterial size={34} sizeAttenuation vertexColors map={glowSprite()} transparent depthWrite={false} blending={THREE.NormalBlending} opacity={0.32} />
      </points>
      <sprite scale={[230, 230, 1]}>
        <spriteMaterial map={glowSprite()} color={world.galaxy.coreColor} transparent opacity={0.32} blending={THREE.AdditiveBlending} depthWrite={false} />
      </sprite>
      <sprite scale={[520, 520, 1]}>
        <spriteMaterial map={glowSprite()} color={world.galaxy.armColor} transparent opacity={0.07} blending={THREE.AdditiveBlending} depthWrite={false} />
      </sprite>
      {systems.map((s) => (
        <SystemMarker key={s.id} sys={s} world={world} onSelect={onSelect} />
      ))}
    </group>
  );
}

function SystemMarker({ sys, world, onSelect }: { sys: StarSystem; world: World; onSelect: (id: string) => void }) {
  const [hover, setHover] = useState(false);
  const civColors = [...new Set(sys.planetIds.flatMap((pid) => world.planets[pid]?.civIds ?? []))].map((id) => world.civs[id]?.color).filter(Boolean) as string[];
  const ref = useRef<THREE.Sprite>(null);
  useFrame(({ clock }) => {
    if (ref.current) {
      const s = (hover ? 34 : 24) * (1 + Math.sin(clock.elapsedTime * 2 + sys.position[0]) * 0.06);
      ref.current.scale.set(s, s, 1);
    }
  });
  return (
    <group position={sys.position}>
      <sprite
        ref={ref}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(sys.id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = '';
        }}
      >
        <spriteMaterial map={glowSprite()} color={sys.star.color} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      {civColors.map((c, i) => (
        <mesh key={c} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[9 + i * 2.2, 9.7 + i * 2.2, 48]} />
          <meshBasicMaterial color={c} transparent opacity={0.8} side={THREE.DoubleSide} />
        </mesh>
      ))}
      <Html center position={[0, 16, 0]} style={{ pointerEvents: 'none' }} zIndexRange={[10, 0]}>
        <div className={`map-label ${hover ? 'on' : ''}`}>
          <span>{sys.name}</span>
          {hover && (
            <small>
              {sys.star.spectralClass}-class · {sys.planetIds.length} worlds
            </small>
          )}
        </div>
      </Html>
    </group>
  );
}

// ───────────────────────────── System ─────────────────────────────

function displayOrbit(index: number): number {
  return 12 + index * 7;
}

function SystemView({ id, onSelect }: { id: string; onSelect: (id: string) => void }) {
  const world = getWorld();
  const sys = world.systems[id];
  if (!sys) return null;
  const planets = sys.planetIds.map((p) => world.planets[p]).sort((a, b) => a.orbit - b.orbit);
  const starSize = 2.6 + Math.pow(sys.star.radius, 0.45) * 1.6;
  return (
    <group>
      <pointLight position={[0, 0, 0]} intensity={2.2} distance={0} decay={0} color={sys.star.color} />
      <ambientLight intensity={0.08} />
      <mesh>
        <sphereGeometry args={[starSize, 48, 48]} />
        <meshBasicMaterial color={sys.star.color} />
      </mesh>
      <sprite scale={[starSize * 9, starSize * 9, 1]}>
        <spriteMaterial map={glowSprite()} color={sys.star.color} transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} />
      </sprite>
      <sprite scale={[starSize * 22, starSize * 22, 1]}>
        <spriteMaterial map={glowSprite()} color={sys.star.color} transparent opacity={0.09} blending={THREE.AdditiveBlending} depthWrite={false} />
      </sprite>
      {planets.map((p, i) => (
        <OrbitingPlanet key={p.id} planet={p} radius={displayOrbit(i)} world={world} onSelect={onSelect} />
      ))}
    </group>
  );
}

function OrbitLine({ radius, color = '#6fd6ff', opacity = 0.14 }: { radius: number; color?: string; opacity?: number }) {
  const geo = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [radius]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <lineLoop geometry={geo}>
      <lineBasicMaterial color={color} transparent opacity={opacity} />
    </lineLoop>
  );
}

function OrbitingPlanet({ planet, radius, world, onSelect }: { planet: Planet; radius: number; world: World; onSelect: (id: string) => void }) {
  const ref = useRef<THREE.Group>(null);
  const spin = useRef<THREE.Mesh>(null);
  const [hover, setHover] = useState(false);
  const size = 0.55 + Math.pow(planet.radius, 0.55) * 0.75;
  const tex = useMemo(() => planetTextures(world, planet, { width: 256 }), [world, planet]);
  const civ = planet.civIds.map((c) => world.civs[c]).filter(Boolean);
  useFrame(({ clock }, dt) => {
    if (!ref.current) return;
    const simDays = getWorld().time / MINUTES_PER_DAY;
    // True orbital position plus a gentle cosmetic drift so motion is visible at any speed.
    const a = planet.orbitPhase + (simDays / Math.max(1, planet.orbitalPeriodDays)) * Math.PI * 2 + clock.elapsedTime * (0.05 / Math.sqrt(radius / 12));
    ref.current.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    if (spin.current) spin.current.rotation.y += dt * 0.3;
  });
  return (
    <>
      <OrbitLine radius={radius} color={civ[0]?.color ?? '#6fd6ff'} opacity={civ.length ? 0.35 : 0.12} />
      <group ref={ref}>
        <mesh
          ref={spin}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(planet.id);
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHover(true);
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={() => {
            setHover(false);
            document.body.style.cursor = '';
          }}
          scale={hover ? 1.15 : 1}
          rotation={[0, 0, (planet.axialTilt * Math.PI) / 180]}
        >
          <sphereGeometry args={[size, 48, 32]} />
          <meshStandardMaterial map={tex.color} roughness={0.9} metalness={0} />
        </mesh>
        {planet.hasRings && <Rings size={size} color={planet.palette.mid} />}
        <Html center position={[0, size + 1.6, 0]} style={{ pointerEvents: 'none' }} zIndexRange={[10, 0]}>
          <div className={`map-label ${hover ? 'on' : ''}`}>
            <span>{planet.name}</span>
            {hover && civ.length > 0 && <small style={{ color: civ[0].color }}>{civ.map((c) => c.adjective).join(' · ')}</small>}
          </div>
        </Html>
      </group>
    </>
  );
}

function Rings({ size, color }: { size: number; color: string }) {
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 4;
    const g = c.getContext('2d')!;
    const rng = new Rng(size * 1000);
    for (let x = 0; x < 256; x++) {
      const a = (0.25 + rng.next() * 0.55) * Math.sin((x / 256) * Math.PI);
      g.fillStyle = `rgba(255,255,255,${a})`;
      g.fillRect(x, 0, 1, 4);
    }
    const t = new THREE.CanvasTexture(c);
    return t;
  }, [size]);
  const geo = useMemo(() => {
    const g = new THREE.RingGeometry(size * 1.35, size * 2.3, 96, 1);
    const pos = g.attributes.position;
    const uv = g.attributes.uv;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      uv.setXY(i, (v.length() - size * 1.35) / (size * 0.95), 0.5);
    }
    return g;
  }, [size]);
  return (
    <mesh geometry={geo} rotation={[-Math.PI / 2 + 0.35, 0, 0]}>
      <meshBasicMaterial map={tex} color={color} transparent side={THREE.DoubleSide} depthWrite={false} opacity={0.85} />
    </mesh>
  );
}

// ───────────────────────────── Planet ─────────────────────────────

const atmosphereVertex = `
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
// Outer halo, rendered on the back faces of a slightly larger shell: brightest
// just outside the planet's limb, fading to nothing at the shell's edge.
const atmosphereFragment = `
uniform vec3 uColor;
uniform float uPower;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  float d = dot(normalize(vNormal), normalize(vView));
  float glow = pow(clamp(-d / 0.36, 0.0, 1.0), uPower);
  gl_FragColor = vec4(uColor, glow * 0.85);
}`;
// Inner limb haze on the planet itself.
const hazeFragment = `
uniform vec3 uColor;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  float f = pow(1.0 - max(dot(normalize(vNormal), normalize(vView)), 0.0), 3.0);
  gl_FragColor = vec4(uColor, f * 0.55);
}`;

function PlanetView({
  id,
  version,
  selectedRegion,
  selectedSettlement,
  onRegion,
  onSettlement,
}: {
  id: string;
  version: number;
  selectedRegion: number | null;
  selectedSettlement?: string;
  onRegion: (i: number) => void;
  onSettlement: (id: string) => void;
}) {
  const world = getWorld();
  const planet = world.planets[id];
  const globe = useRef<THREE.Group>(null);
  const clouds = useRef<THREE.Mesh>(null);
  const quality = useApp((s) => s.settings.quality);
  // Territory signature in deps so borders redraw when control changes.
  const sig = planet ? planet.regions.map((r) => r.ownerCivId ?? '-').join(',') + planet.environment.temperatureOffset : '';
  const tex = useMemo(() => (planet ? planetTextures(world, planet, { width: quality === 'low' ? 512 : 1024, showTerritory: true }) : null), [planet, sig, quality]); // eslint-disable-line react-hooks/exhaustive-deps
  const sys = planet ? world.systems[planet.systemId] : null;
  useFrame((_, dt) => {
    if (globe.current) globe.current.rotation.y += dt * 0.025;
    if (clouds.current) clouds.current.rotation.y += dt * 0.008;
  });
  if (!planet || !tex || !sys) return null;
  void version;
  const R = 10;
  const settlements = Object.values(world.settlements).filter((s) => s.planetId === planet.id);
  const giant = planet.type === 'gas_giant' || planet.type === 'ice_giant';
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (!globe.current || giant) return;
    e.stopPropagation();
    const local = globe.current.worldToLocal(e.point.clone()).normalize();
    let best = 0;
    let bd = -2;
    planet.regions.forEach((r, i) => {
      const d = regionDir(r.lat, r.lon);
      const dot = d[0] * local.x + d[1] * local.y + d[2] * local.z;
      if (dot > bd) {
        bd = dot;
        best = i;
      }
    });
    onRegion(best);
  };
  return (
    <group>
      <directionalLight position={[-40, 18, 30]} intensity={2.6} color={sys.star.color} />
      <ambientLight intensity={0.06} />
      <group ref={globe} rotation={[0, 0, (planet.axialTilt * Math.PI) / 180]}>
        <mesh onClick={onClick} onPointerOver={() => !giant && (document.body.style.cursor = 'crosshair')} onPointerOut={() => (document.body.style.cursor = '')}>
          <sphereGeometry args={[R, 128, 96]} />
          <meshStandardMaterial map={tex.color} roughness={0.85} metalness={0.02} />
        </mesh>
        {tex.clouds && (
          <mesh ref={clouds} scale={1.012}>
            <sphereGeometry args={[R, 96, 64]} />
            <meshStandardMaterial map={tex.clouds} transparent depthWrite={false} opacity={0.85} />
          </mesh>
        )}
        {selectedRegion !== null && planet.regions[selectedRegion] && <RegionMarker planet={planet} index={selectedRegion} R={R} />}
        {settlements.map((s) => {
          const r = planet.regions[s.regionIndex];
          const d = regionDir(r.lat, r.lon);
          const civ = world.civs[s.civId];
          const sel = s.id === selectedSettlement;
          const size = s.kind === 'capital' ? 0.32 : s.kind === 'city' ? 0.25 : 0.18;
          return (
            <group key={s.id} position={[d[0] * R, d[1] * R, d[2] * R]}>
              <mesh
                onClick={(e) => {
                  e.stopPropagation();
                  onSettlement(s.id);
                }}
                onPointerOver={(e) => {
                  e.stopPropagation();
                  document.body.style.cursor = 'pointer';
                }}
                onPointerOut={() => (document.body.style.cursor = '')}
              >
                <sphereGeometry args={[sel ? size * 1.6 : size, 16, 16]} />
                <meshBasicMaterial color={civ?.color ?? '#fff'} />
              </mesh>
              <sprite scale={[size * 9, size * 9, 1]}>
                <spriteMaterial map={glowSprite()} color={civ?.color ?? '#fff'} transparent opacity={sel ? 0.9 : 0.55} blending={THREE.AdditiveBlending} depthWrite={false} />
              </sprite>
              <Html center position={[d[0] * 1.2, d[1] * 1.2, d[2] * 1.2]} style={{ pointerEvents: 'none' }} occlude={false} zIndexRange={[10, 0]}>
                <div className={`map-label small ${sel ? 'on' : ''}`}>
                  <span>{s.name}</span>
                </div>
              </Html>
            </group>
          );
        })}
      </group>
      {planet.atmosphere.pressure > 0.05 && (
        <mesh scale={1.012}>
          <sphereGeometry args={[R, 64, 48]} />
          <shaderMaterial vertexShader={atmosphereVertex} fragmentShader={hazeFragment} uniforms={{ uColor: { value: new THREE.Color(planet.palette.atmosphere) } }} transparent blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      )}
      {planet.atmosphere.pressure > 0.05 && (
        <mesh scale={1.06}>
          <sphereGeometry args={[R, 64, 48]} />
          <shaderMaterial
            vertexShader={atmosphereVertex}
            fragmentShader={atmosphereFragment}
            uniforms={{ uColor: { value: new THREE.Color(planet.palette.atmosphere) }, uPower: { value: planet.atmosphere.pressure > 1.5 ? 1.4 : 2.2 } }}
            transparent
            blending={THREE.AdditiveBlending}
            side={THREE.BackSide}
            depthWrite={false}
          />
        </mesh>
      )}
      {planet.hasRings && <Rings size={R} color={planet.palette.mid} />}
      {planet.moons.map((m, i) => (
        <Moon key={m.name} index={i} radius={Math.max(0.5, m.radius * 6)} orbit={R + 7 + i * 4.5} color={m.color} name={m.name} />
      ))}
    </group>
  );
}

function RegionMarker({ planet, index, R }: { planet: Planet; index: number; R: number }) {
  const r = planet.regions[index];
  const d = regionDir(r.lat, r.lon);
  const q = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...d)), [d[0], d[1], d[2]]); // eslint-disable-line react-hooks/exhaustive-deps
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 3) * 0.08);
  });
  return (
    <mesh ref={ref} position={[d[0] * R * 1.003, d[1] * R * 1.003, d[2] * R * 1.003]} quaternion={q}>
      <ringGeometry args={[1.5, 1.7, 48]} />
      <meshBasicMaterial color="#6fd6ff" transparent opacity={0.9} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

function Moon({ index, radius, orbit, color, name }: { index: number; radius: number; orbit: number; color: string; name: string }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const a = clock.elapsedTime * (0.12 / (1 + index * 0.6)) + index * 2.1;
    ref.current.position.set(Math.cos(a) * orbit, Math.sin(a * 0.7) * index * 0.8, Math.sin(a) * orbit);
  });
  return (
    <>
      <group rotation={[0.08 * index, 0, 0]}>
        <OrbitLine radius={orbit} opacity={0.07} />
      </group>
      <group ref={ref}>
        <mesh>
          <sphereGeometry args={[radius, 32, 24]} />
          <meshStandardMaterial color={color} roughness={1} />
        </mesh>
        <Html center position={[0, radius + 0.9, 0]} style={{ pointerEvents: 'none' }} zIndexRange={[10, 0]}>
          <div className="map-label small faint">
            <span>{name}</span>
          </div>
        </Html>
      </group>
    </>
  );
}
