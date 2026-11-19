import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import './styles/global.css';
import { App } from './ui/App';
import { boot } from './state/boot';
import { useApp } from './state/store';
import * as audio from './audio/ambient';
import { causality } from './sim/world';

// Fail loudly in development when an important event is recorded without a cause.
if (import.meta.env.DEV) causality.strict = true;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Small debugging/automation surface (used by the end-to-end script).
Promise.all([import('./state/store'), import('./explorer/explorerStore'), import('./state/runner'), import('./explorer/Crowd')]).then(([store, ex, runner, crowd]) => {
  (window as unknown as { __genesis: unknown }).__genesis = { store, sim: runner.sim, crowd: crowd.crowdStats, player: ex.playerState, commands: ex.playerCommands, npcs: ex.npcPositions, explorer: ex.useExplorer, scene: ex.sceneDebug, ambient: audio.ambient };
});

boot().catch((e: Error) => {
  useApp.getState().setError(e.message);
  useApp.getState().setPhase('error');
});
