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
  /**
   * The share of maxDist kept when the camera is down at street level (default 0.45). Tall things
   * that make the skyline keep more; small props keep less. From high up every level draws in full.
   */
  groundScale?: number;
}

/**
 * How far things draw, following the camera's height above the ground: `t` is 0 walking in the
 * street and 1 high above the city (see DrawDistance). Shared by every tiled instance set, the
 * movers and the fog.
 */
export const drawDistance = { t: 1, groundY: 0 };

/** Updates `drawDistance.t` from the camera's height above the ground each frame. */
export function DrawDistance({ groundY }: { groundY: number }) {
  const { camera } = useThree();
  useFrame((_, dt) => {
    drawDistance.groundY = groundY;
    const h = camera.position.y - groundY;
    const target = Math.max(0, Math.min(1, (h - 25) / 135));
    // ease towards the target over about half a second (by time, not frames), so climbing a tower
    // or landing does not pop the far city in and out
    drawDistance.t += (target - drawDistance.t) * Math.min(1, dt * 4);
  });
  return null;
}

/** The distance scale for a level at the current camera height. */
export function distanceScale(groundScale = 0.45): number {
  const t = drawDistance.t;
  return groundScale + (1.15 - groundScale) * t;
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
        if (d < levels[i].maxDist * distanceScale(levels[i].groundScale)) {
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
