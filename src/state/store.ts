import { create } from 'zustand';
import type { World } from '../sim/types';
import { DEFAULT_SETTINGS, loadSettings, persistSettings, type Settings } from './settings';

/**
 * The World object lives outside React state (it is large and mutated in
 * place by the simulation). React subscribes to a `version` counter that the
 * runner bumps at a throttled rate, so screens re-render a few times per
 * second at most — never once per simulation tick.
 */
let worldRef: World | null = null;

export function getWorld(): World {
  if (!worldRef) throw new Error('World not initialised');
  return worldRef;
}

export function maybeWorld(): World | null {
  return worldRef;
}

export function setWorldRef(w: World | null): void {
  worldRef = w;
}

export type Phase = 'boot' | 'intro' | 'generating' | 'ready' | 'error' | 'catchup';

export interface Toast {
  id: number;
  title: string;
  body?: string;
  eventId?: string;
  kind: 'event' | 'info' | 'error' | 'success';
}

export interface CatchupInfo {
  totalMinutes: number;
  doneMinutes: number;
  eventsAdded: number;
  startTime: number;
}

interface AppState {
  phase: Phase;
  version: number;
  speed: number;
  settings: Settings;
  toasts: Toast[];
  error: string | null;
  catchup: CatchupInfo | null;
  onboardingDone: boolean;
  setPhase: (p: Phase) => void;
  bump: () => void;
  setSpeed: (s: number) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  toast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: number) => void;
  setError: (e: string | null) => void;
  setCatchup: (c: CatchupInfo | null) => void;
  setOnboardingDone: (v: boolean) => void;
}

let toastId = 0;

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

export const useApp = create<AppState>((set, get) => ({
  phase: 'boot',
  version: 0,
  speed: 1,
  settings: typeof localStorage !== 'undefined' ? loadSettings() : DEFAULT_SETTINGS,
  toasts: [],
  error: null,
  catchup: null,
  onboardingDone: typeof localStorage !== 'undefined' ? readFlag('genesis.onboarded') : false,
  setPhase: (phase) => set({ phase }),
  bump: () => set({ version: get().version + 1 }),
  setSpeed: (speed) => set({ speed }),
  updateSettings: (patch) => {
    const settings = { ...get().settings, ...patch };
    persistSettings(settings);
    set({ settings });
  },
  toast: (t) => {
    const id = ++toastId;
    // at most two toasts on screen so they never bury the page
    set({ toasts: [...get().toasts.slice(-1), { ...t, id }] });
    setTimeout(() => get().dismissToast(id), t.kind === 'error' ? 9000 : 6500);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  setError: (error) => set({ error }),
  setCatchup: (catchup) => set({ catchup }),
  setOnboardingDone: (v) => {
    try {
      localStorage.setItem('genesis.onboarded', v ? '1' : '0');
    } catch {
      /* ignore */
    }
    set({ onboardingDone: v });
  },
}));

/** Subscribe a component to world updates (throttled by the runner). */
export function useWorldVersion(): number {
  return useApp((s) => s.version);
}
