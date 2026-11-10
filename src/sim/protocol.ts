/** Typed message protocol between the main thread and the simulation worker. */
import type { Command } from './host';
import type { FeedEntry, Patch } from './host';
import type { World } from './types';

export type ToWorker =
  | { type: 'init'; world: World; speed: number; refreshHz: number; autosaveSeconds: number; strict: boolean }
  | { type: 'speed'; speed: number }
  | { type: 'settings'; refreshHz: number; autosaveSeconds: number }
  | { type: 'cmd'; id: number; cmd: Command }
  | { type: 'save'; id: number }
  | { type: 'export'; id: number }
  | { type: 'chunk'; id: number; key: string }
  | { type: 'snapshot'; id: number }
  | { type: 'feed'; settlementId: string | null };

export type FromWorker =
  | { type: 'ready' }
  | { type: 'patch'; patch: Patch }
  | { type: 'feed'; settlementId: string; entries: FeedEntry[] }
  | { type: 'result'; id: number; result?: unknown; error?: string }
  | { type: 'error'; message: string };
