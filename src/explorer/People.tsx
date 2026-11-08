import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Rng, hashString } from '../sim/rng';
import type { Character, Occupation, World } from '../sim/types';
import { getWorld } from '../state/store';
import { npcPositions, playerState, useExplorer } from './explorerStore';
import { routeBetween, type Layout } from './layout';
import type { TerrainData } from './terrain';
import { nightUniform } from './City';

export const OCC_COLORS: Record<Occupation, string> = {
  farmer: '#8fbf5a',
  engineer: '#e0a040',
  scientist: '#6fd6ff',
  merchant: '#d8b04a',
  artisan: '#c88a5a',
  official: '#b48aff',
  explorer: '#5fe0b0',
  medic: '#ff8a8a',
  teacher: '#8aa8ff',
  guard: '#a0a8b8',
  miner: '#a8805a',
  artist: '#ff8ac8',
  pilot: '#7ac8ff',
  student: '#e8e8a0',
  retired: '#c8c0b0',
};

interface Npc {
  id: string;
  pos: THREE.Vector3;
  path: [number, number][];
  activityKey: string;
  hidden: boolean;
  wander: [number, number] | null;
  wanderAt: number;
  facing: number;
  moving: boolean;
  hideOnArrive: boolean;
}

function pointFor(_world: World, c: Character, layout: Layout, rng: Rng): { target: [number, number]; hidden: boolean; wander: boolean } {
  const b = (slot: number, list: number[]) => layout.buildings[list[slot % list.length]];
  const home = layout.homes.length ? b(c.homeSlot, layout.homes) : undefined;
  const work = layout.works.length ? b(c.workSlot, layout.works) : undefined;
  const plaza: [number, number] = layout.plazas[0] ? [layout.plazas[0].x + rng.range(-12, 12), layout.plazas[0].z + rng.range(-12, 12)] : [0, 0];
  const park = (): [number, number] => (layout.parks.length ? layout.parks[Math.floor(rng.next() * layout.parks.length)] : plaza);
  const market = layout.landmarks.find((l) => l.kind === 'market');
  const archive = layout.landmarks.find((l) => l.kind === 'archive' || l.kind === 'observatory');
  switch (c.activity.type) {
    case 'sleep':
      return { target: home?.door ?? plaza, hidden: true, wander: false };
    case 'work':
    case 'govern': {
      const seat = c.activity.type === 'govern' ? layout.landmarks[0] : undefined;
      return { target: seat ? [seat.x + seat.radius + 3, seat.z] : work?.door ?? plaza, hidden: false, wander: true };
    }
    case 'study':
      return { target: archive ? [archive.x + archive.radius + 2, archive.z] : work?.door ?? plaza, hidden: false, wander: true };
    case 'eat':
      return { target: market ? [market.x + rng.range(-8, 8), market.z + rng.range(-8, 8)] : plaza, hidden: false, wander: true };
    case 'socialize': {
      // both parties converge on the same spot derived from the pair
      const other = c.activity.targetId ?? '';
      const key = [c.id, other].sort().join('|');
      const r = new Rng(hashString(key));
      const spots = [...layout.parks, ...(layout.plazas.length ? [[layout.plazas[0].x, layout.plazas[0].z] as [number, number]] : [])];
      const spot = spots.length ? spots[Math.floor(r.next() * spots.length)] : plaza;
      const side = c.id < other ? 1 : -1;
      return { target: [spot[0] + side * 1.1, spot[1]], hidden: false, wander: false };
    }
    case 'leisure':
    case 'create':
      return { target: park(), hidden: false, wander: true };
    case 'mourn': {
      const mon = layout.landmarks.find((l) => l.kind === 'monument' || l.kind === 'temple' || l.kind === 'garden');
      return { target: mon ? [mon.x + mon.radius + 2, mon.z] : park(), hidden: false, wander: false };
    }
    case 'explore':
    case 'travel': {
      const a = rng.range(0, Math.PI * 2);
      return { target: [Math.cos(a) * (layout.radius + 30), Math.sin(a) * (layout.radius + 30)], hidden: false, wander: true };
    }
    default:
      return { target: plaza, hidden: false, wander: true };
  }
}

const bodyGeo = new THREE.CapsuleGeometry(0.42, 1.0, 4, 10);
const headGeo = new THREE.SphereGeometry(0.34, 14, 12);

export function Inhabitants({ settlementId, layout, t, onPick }: { settlementId: string; layout: Layout; t: TerrainData; onPick: (id: string) => void }) {
  const world = getWorld();
  const [ids, setIds] = useState<string[]>([]);
  const npcs = useRef(new Map<string, Npc>());
  const refs = useRef(new Map<string, THREE.Group>());
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const talking = useExplorer((s) => s.talkingId);
  const setNearby = useExplorer((s) => s.setNearby);
  const lastScan = useRef(0);

  // Refresh who is present (people travel in and out).
  useEffect(() => {
    const scan = () => {
      const present = Object.values(getWorld().characters)
        .filter((c) => c.alive && c.settlementId === settlementId)
        .map((c) => c.id);
      setIds((prev) => (prev.length === present.length && prev.every((x, i) => x === present[i]) ? prev : present));
    };
    scan();
    const iv = window.setInterval(scan, 2000);
    return () => window.clearInterval(iv);
  }, [settlementId]);

  useEffect(() => {
    const rng = new Rng(7);
    for (const id of ids) {
      if (npcs.current.has(id)) continue;
      const c = world.characters[id];
      const p = pointFor(world, c, layout, rng);
      npcs.current.set(id, { id, pos: new THREE.Vector3(p.target[0], t.flatHeight, p.target[1]), path: [], activityKey: '', hidden: p.hidden, wander: null, wanderAt: 0, facing: 0, moving: false, hideOnArrive: p.hidden });
    }
    for (const id of [...npcs.current.keys()]) if (!ids.includes(id)) {
      npcs.current.delete(id);
      npcPositions.delete(id);
    }
  }, [ids, world, layout, t]);

  useEffect(() => () => npcPositions.clear(), []);

  useFrame(({ clock }, dt) => {
    const w = getWorld();
    const rng = new Rng(Math.floor(clock.elapsedTime * 10));
    const now = clock.elapsedTime;
    let nearest: string | null = null;
    let nd = 5.5;
    const dists: { id: string; d: number }[] = [];
    for (const npc of npcs.current.values()) {
      const c = w.characters[npc.id];
      const g = refs.current.get(npc.id);
      if (!c || !g) continue;
      const key = `${c.activity.type}:${c.activity.startedAt}`;
      if (key !== npc.activityKey) {
        npc.activityKey = key;
        const p = pointFor(w, c, layout, rng);
        npc.path = routeBetween(layout.graph, [npc.pos.x, npc.pos.z], p.target);
        npc.hidden = false;
        npc.hideOnArrive = p.hidden;
        npc.wander = p.wander ? p.target : null;
      }
      const isTalking = talking === npc.id;
      npc.moving = false;
      if (!isTalking && npc.path.length) {
        const [tx, tz] = npc.path[0];
        const dx = tx - npc.pos.x;
        const dz = tz - npc.pos.z;
        const d = Math.hypot(dx, dz);
        const speed = c.activity.type === 'travel' ? 3.2 : 2.2;
        if (d < 0.4) npc.path.shift();
        else {
          const step = Math.min(d, speed * dt);
          npc.pos.x += (dx / d) * step;
          npc.pos.z += (dz / d) * step;
          npc.facing = Math.atan2(dx, dz);
          npc.moving = true;
        }
        if (!npc.path.length && npc.hideOnArrive) npc.hidden = true;
      } else if (!isTalking && npc.wander && now > npc.wanderAt) {
        npc.wanderAt = now + rng.range(3, 9);
        npc.path = [[npc.wander[0] + rng.range(-5, 5), npc.wander[1] + rng.range(-5, 5)]];
      }
      if (isTalking) npc.facing = Math.atan2(playerState.x - npc.pos.x, playerState.z - npc.pos.z);
      npc.pos.y = t.height(npc.pos.x, npc.pos.z);
      g.visible = !npc.hidden;
      g.position.copy(npc.pos);
      g.position.y += npc.moving ? Math.abs(Math.sin(now * 9 + npc.pos.x)) * 0.08 : 0;
      g.rotation.y = npc.facing;
      if (!npc.hidden) {
        npcPositions.set(npc.id, { x: npc.pos.x, z: npc.pos.z, color: OCC_COLORS[c.occupation] });
        const d = Math.hypot(playerState.x - npc.pos.x, playerState.z - npc.pos.z);
        dists.push({ id: npc.id, d });
        if (d < nd) {
          nd = d;
          nearest = npc.id;
        }
      } else npcPositions.delete(npc.id);
    }
    setNearby(nearest);
    if (now - lastScan.current > 0.5) {
      lastScan.current = now;
      const next = dists
        .filter((x) => x.d < 30)
        .sort((a, b) => a.d - b.d)
        .slice(0, 4)
        .map((x) => x.id);
      setLabelIds((prev) => (prev.join() === next.join() ? prev : next));
    }
  });

  return (
    <group>
      {ids.map((id) => {
        const c = world.characters[id];
        if (!c) return null;
        const color = OCC_COLORS[c.occupation];
        return (
          <group
            key={id}
            ref={(g) => {
              if (g) refs.current.set(id, g);
              else refs.current.delete(id);
            }}
            onClick={(e) => {
              e.stopPropagation();
              onPick(id);
            }}
          >
            <mesh geometry={bodyGeo} position={[0, 0.95, 0]} castShadow>
              <meshStandardMaterial color={color} roughness={0.7} />
            </mesh>
            <mesh geometry={headGeo} position={[0, 2.0, 0]} castShadow>
              <meshStandardMaterial color="#e8d4bc" roughness={0.8} />
            </mesh>
            {world.player.followedCharacterId === id && (
              <mesh position={[0, 3.4, 0]} rotation={[0, 0, Math.PI / 4]}>
                <boxGeometry args={[0.45, 0.45, 0.45]} />
                <meshBasicMaterial color="#6fd6ff" />
              </mesh>
            )}
            {(labelIds.includes(id) || world.player.followedCharacterId === id) && (
              <Html center position={[0, 2.9, 0]} distanceFactor={14} style={{ pointerEvents: 'none' }} zIndexRange={[6, 0]}>
                <div className="npc-label">
                  <b>{c.givenName}</b>
                  <span>{c.activity.description}</span>
                </div>
              </Html>
            )}
          </group>
        );
      })}
    </group>
  );
}

/** Anonymous residents representing the wider population (non-interactive). */
export function Crowd({ layout, t, population, quality }: { layout: Layout; t: TerrainData; population: number; quality: 'low' | 'medium' | 'high' }) {
  const count = Math.min(quality === 'low' ? 40 : 110, Math.round(12 + Math.log10(Math.max(10, population)) * 14));
  const ref = useRef<THREE.InstancedMesh>(null);
  const agents = useMemo(() => {
    const rng = new Rng(layout.radius * 13 + count);
    return Array.from({ length: count }, () => {
      const n = layout.graph.nodes[Math.floor(rng.next() * layout.graph.nodes.length)] ?? [0, 0];
      return { x: n[0], z: n[1], path: [] as [number, number][], speed: rng.range(1.6, 2.6), color: new THREE.Color().setHSL(rng.range(0, 1), rng.range(0.15, 0.4), rng.range(0.35, 0.6)), night: rng.chance(0.3) };
    });
  }, [layout, count]);
  useEffect(() => {
    agents.forEach((a, i) => ref.current?.setColorAt(i, a.color));
    if (ref.current?.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [agents]);
  const m = useMemo(() => new THREE.Matrix4(), []);
  const rng = useMemo(() => new Rng(99), []);
  useFrame((_, dt) => {
    const mesh = ref.current;
    if (!mesh || !layout.graph.nodes.length) return;
    const night = nightUniform.value > 0.6;
    agents.forEach((a, i) => {
      if (!a.path.length) {
        const target = layout.graph.nodes[Math.floor(rng.next() * layout.graph.nodes.length)];
        a.path = routeBetween(layout.graph, [a.x, a.z], target).slice(0, 8);
      }
      const [tx, tz] = a.path[0];
      const dx = tx - a.x;
      const dz = tz - a.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.5) a.path.shift();
      else {
        a.x += (dx / d) * Math.min(d, a.speed * dt);
        a.z += (dz / d) * Math.min(d, a.speed * dt);
      }
      const visible = !night || a.night;
      // offset to the side of the street so crowds don't walk on the centre line
      const off = 2.4;
      const px = a.x + (d > 0 ? (-dz / d) * off : 0);
      const pz = a.z + (d > 0 ? (dx / d) * off : 0);
      m.makeScale(visible ? 1 : 0.0001, visible ? 1 : 0.0001, visible ? 1 : 0.0001);
      m.setPosition(px, t.height(px, pz) + 0.85, pz);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  if (!layout.graph.nodes.length) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} frustumCulled={false}>
      <capsuleGeometry args={[0.36, 0.95, 3, 8]} />
      <meshStandardMaterial roughness={0.8} />
    </instancedMesh>
  );
}
