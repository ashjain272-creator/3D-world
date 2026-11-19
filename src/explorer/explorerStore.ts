import { create } from 'zustand';

/**
 * Transient Explorer state shared between the 3D scene and the DOM HUD.
 * High-frequency values (player position) live in a mutable object read by
 * the minimap; the store holds only low-frequency UI state.
 */
export const playerState = {
  x: 0,
  y: 0,
  z: 0,
  yaw: 0,
  speed: 0,
};

/** One-shot commands for the controller (used by automation and "travel to" actions). */
export const playerCommands: { teleport: { x: number; z: number; yaw?: number } | null; view: { pitch?: number; dist?: number } | null } = {
  teleport: null,
  view: null,
};

/** NPC positions for the minimap, updated by the scene. */
export const npcPositions = new Map<string, { x: number; z: number; color: string }>();

interface ExplorerUi {
  nearbyId: string | null;
  talkingId: string | null;
  locked: boolean;
  firstPerson: boolean;
  nearbyLandmark: string | null;
  setNearby: (id: string | null) => void;
  setTalking: (id: string | null) => void;
  setLocked: (v: boolean) => void;
  toggleView: () => void;
  setNearbyLandmark: (id: string | null) => void;
}

export const useExplorer = create<ExplorerUi>((set, get) => ({
  nearbyId: null,
  talkingId: null,
  locked: false,
  firstPerson: false,
  nearbyLandmark: null,
  setNearby: (id) => get().nearbyId !== id && set({ nearbyId: id }),
  setTalking: (id) => set({ talkingId: id }),
  setLocked: (v) => set({ locked: v }),
  toggleView: () => set({ firstPerson: !get().firstPerson }),
  setNearbyLandmark: (id) => get().nearbyLandmark !== id && set({ nearbyLandmark: id }),
}));

/** Diagnostics for automated checks: structure footprints in the current scene. */
export const sceneDebug: { footprints: { x: number; z: number; r: number }[]; roads: { kind: string; pts: number[][] }[]; shore: number[] | null } = { footprints: [], roads: [], shore: null };
