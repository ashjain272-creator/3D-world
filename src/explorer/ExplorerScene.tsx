import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import * as THREE from 'three';
import type { Planet, Settlement, StarSystem } from '../sim/types';
import { useApp } from '../state/store';
import { City } from './City';
import { TerrainMesh } from './Landscape';
import { Vegetation } from './FloraScene';
import { Fauna } from './Fauna';
import { Highways } from './Highways';
import type { HighwayData } from './roadNetwork';
import type { ColliderGrid, Layout } from './layout';
import type { VegetationData } from './vegetation';
import { Inhabitants } from './People';
import { Crowd } from './Crowd';
import { CloudPlatforms } from './CloudPlatforms';
import type { CloudCity } from './cloudCity';
import { Player } from './Player';
import { SkyWeather } from './SkyWeather';
import { PostFX } from '../ui/components/PostFX';
import { setDetail } from './env';
import type { TerrainData } from './terrain';

interface Props {
  planet: Planet;
  system: StarSystem;
  settlement?: Settlement;
  terrain: TerrainData;
  layout: Layout;
  vegetation: VegetationData;
  colliders: ColliderGrid;
  civColor: string;
  /** Gas/ice giant visit: floating platforms instead of terrain. */
  cloud?: CloudCity;
  /** Elevated multi-level road network (futuristic cities). */
  highways?: HighwayData | null;
  locationKey: string;
  onInteract: () => void;
  onPick: (id: string) => void;
  onReady?: () => void;
}

export function ExplorerScene(p: Props) {
  const quality = useApp((s) => s.settings.quality);
  // shader detail is baked into materials when they are built; remount the scene when quality changes
  setDetail(quality);
  return (
    <Canvas
      key={quality}
      shadows={quality !== 'low' ? { type: THREE.PCFSoftShadowMap } : false}
      camera={{ fov: 62, near: 0.3, far: 6000, position: [0, 40, 260] }}
      dpr={quality === 'low' ? 1 : quality === 'medium' ? [1, 1.5] : [1, 2]}
      gl={{ antialias: quality !== 'low', powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.9 }}
      data-testid="explorer-canvas"
      onCreated={() => requestAnimationFrame(() => requestAnimationFrame(() => p.onReady?.()))}
    >
      <Suspense fallback={null}>
        <SkyWeather planet={p.planet} system={p.system} quality={quality} warm={p.terrain.look.vegetation === 'cactus'} cold={(p.terrain.look.snow ?? 0) >= 0.45} bounce={(p.terrain.look.snow ?? 0) >= 0.45 ? '#dfe8f2' : p.terrain.look.mid} />
        {p.cloud ? (
          <CloudPlatforms city={p.cloud} planet={p.planet} />
        ) : (
          <>
            <TerrainMesh t={p.terrain} layout={p.layout} waterColor={p.planet.palette.shallow} />
            <Vegetation data={p.vegetation} t={p.terrain} layout={p.layout} quality={quality} />
            <Fauna t={p.terrain} quality={quality} city={!!p.settlement} />
          </>
        )}
        {p.highways && <Highways data={p.highways} quality={quality} civColor={p.civColor} />}
        <City layout={p.layout} t={p.terrain} quality={quality} civColor={p.civColor} />
        {p.settlement && <Inhabitants settlementId={p.settlement.id} layout={p.layout} t={p.terrain} onPick={p.onPick} />}
        {(p.settlement || p.cloud) && <Crowd layout={p.layout} t={p.terrain} population={p.settlement?.population ?? 3000} quality={quality} planetId={p.planet.id} />}
        <PostFX quality={quality} bloom={0.6} threshold={0.82} grade={1} />
        <Player t={p.terrain} layout={p.layout} colliders={p.colliders} onInteract={p.onInteract} spawnKey={p.locationKey} />
      </Suspense>
    </Canvas>
  );
}
