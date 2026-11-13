import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Rng, hashString } from '../sim/rng';
import type { Character, Occupation, World } from '../sim/types';
import { getWorld } from '../state/store';
import { explorerFeed } from '../state/runner';
import type { ActivityType } from '../sim/types';
import { npcPositions, playerState, useExplorer } from './explorerStore';
import { routeBetween, type Layout } from './layout';
import { texturedMaterial } from './env';

const headMat = texturedMaterial('skin', { color: '#e8d4bc', roughness: 0.75 }, 'object');
const clothCache = new Map<string, THREE.MeshStandardMaterial>();
/** One textured cloth material per occupation colour, shared by everyone wearing it. */
function clothFor(color: string): THREE.MeshStandardMaterial {
  let m = clothCache.get(color);
  if (!m) {
    m = texturedMaterial('cloth', { color, roughness: 0.8 }, 'object');
    clothCache.set(color, m);
  }
  return m;
}
import type { TerrainData } from './terrain';

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
const ringGeo = new THREE.RingGeometry(0.62, 0.78, 28);
const ringMat = new THREE.MeshBasicMaterial({ color: '#6fd6ff', transparent: true, opacity: 0.55, depthWrite: false });

export function Inhabitants({ settlementId, layout, t, onPick }: { settlementId: string; layout: Layout; t: TerrainData; onPick: (id: string) => void }) {
  const world = getWorld();
  const [ids, setIds] = useState<string[]>([]);
  const npcs = useRef(new Map<string, Npc>());
  const refs = useRef(new Map<string, THREE.Group>());
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const talking = useExplorer((s) => s.talkingId);
  const setNearby = useExplorer((s) => s.setNearby);
  const lastScan = useRef(0);
  const { camera } = useThree();

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
      // the simulation's per-settlement feed is fresher than the snapshot
      const fe = explorerFeed.get(npc.id);
      const key = fe ? `${fe.type}:${fe.startedAt}` : `${c.activity.type}:${c.activity.startedAt}`;
      if (key !== npc.activityKey) {
        npc.activityKey = key;
        const live = fe ? { ...c, activity: { ...c.activity, type: fe.type as ActivityType, startedAt: fe.startedAt, endsAt: fe.endsAt, targetId: fe.targetId, description: fe.description } } : c;
        const p = pointFor(w, live, layout, rng);
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
      // named figures beyond 150 m are culled (their labels already are)
      g.visible = !npc.hidden && (npc.pos.x - camera.position.x) ** 2 + (npc.pos.z - camera.position.z) ** 2 < 150 * 150;
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
      const close = dists.filter((x) => x.d < 30).sort((a, b) => a.d - b.d);
      const next = close.slice(0, 1).map((x) => x.id);
      // a second label only when it cannot overlap the first on screen
      const first = close[0] && npcs.current.get(close[0].id);
      const second = close.slice(1).find((x) => {
        const o = npcs.current.get(x.id);
        return first && o && Math.hypot(o.pos.x - first.pos.x, o.pos.z - first.pos.z) > 3.5 && Math.abs(x.d - close[0].d) < 12;
      });
      if (second) next.push(second.id);
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
            <mesh geometry={bodyGeo} position={[0, 0.95, 0]} castShadow material={clothFor(color)} />
            {/* simulated individuals are marked so they read apart from the ambient crowd */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]} geometry={ringGeo} material={ringMat} />
            <mesh geometry={headGeo} position={[0, 2.0, 0]} castShadow material={headMat} />
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
                  <span>{explorerFeed.get(id)?.description ?? c.activity.description}</span>
                </div>
              </Html>
            )}
          </group>
        );
      })}
    </group>
  );
}
