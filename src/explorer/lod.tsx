import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

export interface LodLevel {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** Use this level while the tile is closer than this (metres); beyond the last level the tile is culled. */
  maxDist: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

export interface LodItem {
  m: THREE.Matrix4;
  c?: THREE.Color;
  x: number;
  z: number;
}

/** Live counters for diagnostics. */
export const lodStats: Record<string, { tiles: number; visibleTiles: number; instancesDrawn: number }> = {};

/**
 * Instances bucketed into square tiles. Each tile holds one InstancedMesh per
 * detail level; every frame the tile shows the level matching its distance to
 * the camera, or nothing when beyond the farthest level (distance culling).
 * Tiles are also frustum-culled by three.js via their bounding spheres.
 */
export function TiledInstances({ items, levels, tileSize = 120, name = 'instances' }: { items: LodItem[]; levels: LodLevel[]; tileSize?: number; name?: string }) {
  const { camera } = useThree();
  const tiles = useMemo(() => {
    const groups = new Map<string, LodItem[]>();
    for (const it of items) {
      const key = `${Math.floor(it.x / tileSize)},${Math.floor(it.z / tileSize)}`;
      const g = groups.get(key);
      if (g) g.push(it);
      else groups.set(key, [it]);
    }
    const out: { cx: number; cz: number; radius: number; meshes: THREE.InstancedMesh[] }[] = [];
    for (const list of groups.values()) {
      let cx = 0,
        cz = 0;
      for (const it of list) {
        cx += it.x;
        cz += it.z;
      }
      cx /= list.length;
      cz /= list.length;
      let radius = 0;
      for (const it of list) radius = Math.max(radius, Math.hypot(it.x - cx, it.z - cz));
      const meshes = levels.map((lv) => {
        const mesh = new THREE.InstancedMesh(lv.geometry, lv.material, list.length);
        list.forEach((it, i) => {
          mesh.setMatrixAt(i, it.m);
          if (it.c) mesh.setColorAt(i, it.c);
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.castShadow = !!lv.castShadow;
        mesh.receiveShadow = !!lv.receiveShadow;
        mesh.visible = false;
        return mesh;
      });
      out.push({ cx, cz, radius, meshes });
    }
    return out;
  }, [items, levels, tileSize]);
  const group = useMemo(() => new THREE.Group(), []);
  useEffect(() => {
    for (const t of tiles) for (const m of t.meshes) group.add(m);
    return () => {
      for (const t of tiles) for (const m of t.meshes) {
        group.remove(m);
        m.dispose();
      }
    };
  }, [tiles, group]);
  useFrame(() => {
    let visible = 0;
    let drawn = 0;
    for (const t of tiles) {
      const d = Math.max(0, Math.hypot(camera.position.x - t.cx, camera.position.z - t.cz) - t.radius);
      let shown = -1;
      for (let i = 0; i < levels.length; i++) {
        if (d < levels[i].maxDist) {
          shown = i;
          break;
        }
      }
      t.meshes.forEach((m, i) => (m.visible = i === shown));
      if (shown >= 0) {
        visible++;
        drawn += t.meshes[shown].count;
      }
    }
    lodStats[name] = { tiles: tiles.length, visibleTiles: visible, instancesDrawn: drawn };
  });
  return <primitive object={group} />;
}
