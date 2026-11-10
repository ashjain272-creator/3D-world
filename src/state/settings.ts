export type Quality = 'low' | 'medium' | 'high';

export interface Settings {
  quality: Quality;
  autosaveSeconds: number;
  notifyImportance: 3 | 4 | 5;
  offlineProgress: boolean;
  offlineCapDays: number;
  showIntro: boolean;
  mouseSensitivity: number;
  invertY: boolean;
  uiRefreshHz: number;
  /** Procedural ambient sound (WebAudio). Off by default. */
  audioEnabled: boolean;
  audioVolume: number;
}

export const DEFAULT_SETTINGS: Settings = {
  quality: 'high',
  autosaveSeconds: 30,
  notifyImportance: 4,
  offlineProgress: true,
  offlineCapDays: 30,
  showIntro: true,
  mouseSensitivity: 1,
  invertY: false,
  uiRefreshHz: 4,
  audioEnabled: false,
  audioVolume: 0.6,
};

const KEY = 'genesis.settings.v1';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function persistSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: settings stay in memory */
  }
}
