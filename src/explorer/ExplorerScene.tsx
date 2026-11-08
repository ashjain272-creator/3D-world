import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import * as THREE from 'three';
import type { Planet, Settlement, StarSystem } from '../sim/types';
import { useApp } from '../state/store';
import { City } from './City';
import { TerrainMesh, Vegetation } from './Landscape';
import type { Layout } from './layout';
import { Crowd, Inhabitants } from './People';
import { Player } from './Player';
import { SkyWeather } from './SkyWeather';
import type { TerrainData } from './terrain';

interface Props {
  planet: Planet;
  system: StarSystem;
  settlement?: Settlement;
  terrain: TerrainData;
  layout: Layout;
  civColor: string;
  locationKey: string;
  onInteract: () => void;
  onPick: (id: string) => void;
}

export function ExplorerScene(p: Props) {
  const quality = useApp((s) => s.settings.quality);
  return (
    <Canvas
      shadows={quality !== 'low' ? { type: THREE.PCFSoftShadowMap } : false}
      camera={{ fov: 62, near: 0.3, far: 6000, position: [0, 40, 260] }}
      dpr={quality === 'low' ? 1 : quality === 'medium' ? [1, 1.5] : [1, 2]}
      gl={{ antialias: quality !== 'low', powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.9 }}
      data-testid="explorer-canvas"
    >
      <Suspense fallback={null}>
        <SkyWeather planet={p.planet} system={p.system} quality={quality} />
        <TerrainMesh t={p.terrain} layout={p.layout} waterColor={p.planet.palette.shallow} />
        <Vegetation t={p.terrain} layout={p.layout} quality={quality} />
        <City layout={p.layout} t={p.terrain} quality={quality} civColor={p.civColor} />
        {p.settlement && <Inhabitants settlementId={p.settlement.id} layout={p.layout} t={p.terrain} onPick={p.onPick} />}
        {p.settlement && <Crowd layout={p.layout} t={p.terrain} population={p.settlement.population} quality={quality} />}
        <Player t={p.terrain} layout={p.layout} onInteract={p.onInteract} spawnKey={p.locationKey} />
      </Suspense>
    </Canvas>
  );
}
