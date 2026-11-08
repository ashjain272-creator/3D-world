import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import './styles/global.css';
import { App } from './ui/App';
import { boot } from './state/boot';
import { useApp } from './state/store';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Small debugging/automation surface (used by the end-to-end script).
import('./state/store').then((store) =>
  import('./explorer/explorerStore').then((ex) => {
    (window as unknown as { __genesis: unknown }).__genesis = { store, player: ex.playerState, commands: ex.playerCommands };
  }),
);

boot().catch((e: Error) => {
  useApp.getState().setError(e.message);
  useApp.getState().setPhase('error');
});
