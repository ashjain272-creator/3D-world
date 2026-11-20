import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useApp } from '../state/store';
import { playerCommands, playerState, useExplorer } from './explorerStore';
import { resolveCollisionsGrid, type ColliderGrid, type Layout } from './layout';
import { humanoidGeometry, humanoidMaterial } from './humanoid';
import type { TerrainData } from './terrain';

const WALK = 7;
const RUN = 18;
const GRAVITY = 30;
const JUMP = 11;

/**
 * Third/first-person controller. WASD relative to camera yaw, Shift to run,
 * Space to jump. Mouse: pointer-lock look (click the view) or drag to orbit.
 * Ground following samples the heightfield; buildings push the player out.
 */
// the traveller: a pale explorer suit, darker trousers and boots
const suitFigure = humanoidMaterial({ shirt: new THREE.Color('#e4ecf6'), pants: new THREE.Color('#5a6a82'), skin: new THREE.Color('#d8a67e'), hair: new THREE.Color('#2a1c14'), longHair: false });

export function Player({ t, layout, colliders, onInteract, spawnKey, surface, blocked }: { t: TerrainData; layout: Layout; colliders: ColliderGrid; onInteract: () => void; spawnKey: string; surface?: (x: number, z: number, y: number) => number | null; blocked?: (x: number, z: number, y: number) => boolean }) {
  const { camera, gl } = useThree();
  const body = useRef<THREE.Group>(null);
  const keys = useRef<Record<string, boolean>>({});
  const st = useRef({ x: layout.spawn.x, z: layout.spawn.z, y: 0, vy: 0, yaw: Math.PI, pitch: 0.32, dist: 13, grounded: true });
  const sens = useApp((s) => s.settings.mouseSensitivity);
  const invert = useApp((s) => s.settings.invertY);
  const firstPerson = useExplorer((s) => s.firstPerson);
  const talking = useExplorer((s) => s.talkingId);
  const dragging = useRef(false);

  useEffect(() => {
    const s = st.current;
    s.x = layout.spawn.x;
    s.z = layout.spawn.z;
    s.y = t.height(s.x, s.z);
    s.vy = 0;
    s.yaw = Math.PI;
  }, [spawnKey, layout, t]);

  useEffect(() => {
    const el = gl.domElement;
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      keys.current[e.code] = true;
      if (e.code === 'KeyE') onInteract();
      if (e.code === 'KeyV') useExplorer.getState().toggleView();
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => (keys.current[e.code] = false);
    const blur = () => (keys.current = {});
    const look = (dx: number, dy: number) => {
      const s = st.current;
      s.yaw -= dx * 0.0025 * sens;
      s.pitch = THREE.MathUtils.clamp(s.pitch + dy * 0.0022 * sens * (invert ? -1 : 1), -0.6, 1.25);
    };
    const move = (e: MouseEvent) => {
      if (document.pointerLockElement === el) look(e.movementX, e.movementY);
      else if (dragging.current) look(e.movementX, e.movementY);
    };
    const mdown = (e: MouseEvent) => {
      if (e.button === 2 || e.button === 0) dragging.current = true;
    };
    const mup = () => (dragging.current = false);
    const click = () => {
      if (useExplorer.getState().talkingId) return;
      if (document.pointerLockElement !== el) el.requestPointerLock?.()?.catch?.(() => undefined);
    };
    const wheel = (e: WheelEvent) => {
      st.current.dist = THREE.MathUtils.clamp(st.current.dist + e.deltaY * 0.01, 4, 60);
    };
    const lockChange = () => useExplorer.getState().setLocked(document.pointerLockElement === el);
    const ctx = (e: MouseEvent) => e.preventDefault();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    window.addEventListener('mousemove', move);
    el.addEventListener('mousedown', mdown);
    window.addEventListener('mouseup', mup);
    el.addEventListener('dblclick', click);
    el.addEventListener('wheel', wheel, { passive: true });
    el.addEventListener('contextmenu', ctx);
    document.addEventListener('pointerlockchange', lockChange);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      window.removeEventListener('mousemove', move);
      el.removeEventListener('mousedown', mdown);
      window.removeEventListener('mouseup', mup);
      el.removeEventListener('dblclick', click);
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('contextmenu', ctx);
      document.removeEventListener('pointerlockchange', lockChange);
      if (document.pointerLockElement === el) document.exitPointerLock();
    };
  }, [gl, onInteract, sens, invert]);

  const tmp = useRef(new THREE.Vector3());
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.12);
    const s = st.current;
    const k = keys.current;
    const frozen = !!talking;
    if (playerCommands.teleport) {
      s.x = playerCommands.teleport.x;
      s.z = playerCommands.teleport.z;
      if (playerCommands.teleport.yaw !== undefined) s.yaw = playerCommands.teleport.yaw;
      const top = playerCommands.teleport.top && surface ? surface(s.x, s.z, 1e6) : null;
      s.y = top ?? t.height(s.x, s.z);
      s.vy = 0;
      playerCommands.teleport = null;
    }
    if (playerCommands.view) {
      if (playerCommands.view.pitch !== undefined) s.pitch = playerCommands.view.pitch;
      if (playerCommands.view.dist !== undefined) s.dist = playerCommands.view.dist;
      playerCommands.view = null;
    }
    let fx = 0,
      fz = 0;
    if (!frozen) {
      if (k.KeyW || k.ArrowUp) fz += 1;
      if (k.KeyS || k.ArrowDown) fz -= 1;
      if (k.KeyA || k.ArrowLeft) fx += 1;
      if (k.KeyD || k.ArrowRight) fx -= 1;
      if (k.KeyQ) s.yaw += dt * 1.8;
    }
    const len = Math.hypot(fx, fz);
    const speed = k.ShiftLeft || k.ShiftRight ? RUN : WALK;
    if (len > 0) {
      const sin = Math.sin(s.yaw);
      const cos = Math.cos(s.yaw);
      // forward is the camera's facing direction (+yaw)
      const vx = ((fz * sin + fx * cos) / len) * speed;
      const vz = ((fz * cos - fx * sin) / len) * speed;
      let nx = s.x + vx * dt;
      let nz = s.z + vz * dt;
      // steep slopes and deep water slow the player
      const slope = t.slope(nx, nz);
      if (slope > 1.2) {
        nx = s.x + vx * dt * 0.2;
        nz = s.z + vz * dt * 0.2;
      }
      [nx, nz] = resolveCollisionsGrid(colliders, nx, nz, 0.7, s.y);
      // highway decks: the barriers keep you from stepping off an elevated road
      if (surface) {
        const here = surface(s.x, s.z, s.y + 0.05);
        if (here !== null && s.y - here < 0.6) {
          const offDeck = (x: number, z: number) => (surface(x, z, s.y + 0.05) === null && s.y - t.height(x, z) > 1.2) || !!blocked?.(x, z, s.y);
          if (offDeck(nx, nz)) {
            if (!offDeck(nx, s.z)) nz = s.z;
            else if (!offDeck(s.x, nz)) nx = s.x;
            else {
              nx = s.x;
              nz = s.z;
            }
          }
        }
      }
      // floating platforms: refuse steps over the edge, sliding along it instead
      if (t.walkable && !t.walkable(nx, nz)) {
        if (t.walkable(nx, s.z)) nz = s.z;
        else if (t.walkable(s.x, nz)) nx = s.x;
        else {
          nx = s.x;
          nz = s.z;
        }
      }
      const lim = t.size * 0.48;
      s.x = THREE.MathUtils.clamp(nx, -lim, lim);
      s.z = THREE.MathUtils.clamp(nz, -lim, lim);
    }
    const deck = surface ? surface(s.x, s.z, s.y + 0.05) : null;
    const ground = Math.max(t.height(s.x, s.z), deck ?? -Infinity, t.waterLevel !== null ? (t.look.frozen ? t.waterLevel + 0.05 : t.waterLevel - 1.2) : -Infinity);
    if (s.grounded && k.Space && !frozen) {
      s.vy = JUMP;
      s.grounded = false;
    }
    s.vy -= GRAVITY * dt;
    s.y += s.vy * dt;
    if (s.y <= ground) {
      s.y = ground;
      s.vy = 0;
      s.grounded = true;
    }
    playerState.x = s.x;
    playerState.y = s.y;
    playerState.z = s.z;
    playerState.yaw = s.yaw;
    playerState.speed = len > 0 ? speed : 0;
    suitFigure.walk.y = len > 0 && s.grounded ? (speed > 10 ? 15 : 10) : 0;
    if (body.current) {
      body.current.position.set(s.x, s.y, s.z);
      body.current.rotation.y = s.yaw;
      body.current.visible = !firstPerson;
    }
    // camera
    const head = tmp.current.set(s.x, s.y + 1.8, s.z);
    if (firstPerson) {
      camera.position.copy(head);
      const tx = s.x + Math.sin(s.yaw) * Math.cos(s.pitch - 0.25);
      const tz = s.z + Math.cos(s.yaw) * Math.cos(s.pitch - 0.25);
      camera.lookAt(tx, s.y + 1.8 - Math.sin(s.pitch - 0.25), tz);
    } else {
      const d = s.dist;
      const cx = s.x - Math.sin(s.yaw) * Math.cos(s.pitch) * d;
      const cz = s.z - Math.cos(s.yaw) * Math.cos(s.pitch) * d;
      let cy = s.y + 1.8 + Math.sin(s.pitch) * d;
      const minY = Math.max(t.height(cx, cz), surface ? surface(cx, cz, s.y + 2) ?? -Infinity : -Infinity) + 1.2;
      if (cy < minY) cy = minY;
      // gentle smoothing
      camera.position.x += (cx - camera.position.x) * Math.min(1, dt * 12);
      camera.position.y += (cy - camera.position.y) * Math.min(1, dt * 12);
      camera.position.z += (cz - camera.position.z) * Math.min(1, dt * 12);
      camera.lookAt(head.x + Math.sin(s.yaw) * 3, head.y + 1.2, head.z + Math.cos(s.yaw) * 3);
    }
  });

  return (
    <group ref={body}>
      <mesh geometry={humanoidGeometry()} material={suitFigure.material} castShadow scale={1.08} />
      {/* glowing visor across the eyes and a small pack on the back */}
      <mesh position={[0, 1.905, 0.105]}>
        <boxGeometry args={[0.2, 0.045, 0.04]} />
        <meshStandardMaterial color="#000" emissive="#6fd6ff" emissiveIntensity={2.2} />
      </mesh>
      <mesh position={[0, 1.36, -0.16]} castShadow>
        <boxGeometry args={[0.3, 0.38, 0.14]} />
        <meshStandardMaterial color="#8a96a8" roughness={0.5} metalness={0.4} />
      </mesh>
      <mesh position={[0, 1.36, -0.235]}>
        <boxGeometry args={[0.18, 0.04, 0.01]} />
        <meshBasicMaterial color="#6fd6ff" toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
        <ringGeometry args={[0.8, 0.95, 32]} />
        <meshBasicMaterial color="#6fd6ff" transparent opacity={0.55} />
      </mesh>
    </group>
  );
}
