import { useSyncExternalStore } from 'react';

/** Minimal hash router: #/section/part/part */
export interface Route {
  section: string;
  parts: string[];
}

function parse(): Route {
  const h = (typeof location !== 'undefined' ? location.hash : '').replace(/^#\/?/, '');
  const [section = 'universe', ...parts] = h.split('/').filter(Boolean).map(decodeURIComponent);
  return { section, parts };
}

let current = parse();
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    current = parse();
    listeners.forEach((l) => l());
  });
}

export function navigate(path: string, replace = false): void {
  const target = `#/${path.replace(/^\/+/, '')}`;
  if (location.hash === target) return;
  if (replace) history.replaceState(null, '', target);
  else location.hash = target;
  current = parse();
  listeners.forEach((l) => l());
}

export function useRoute(): Route {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}

export function currentRoute(): Route {
  return current;
}
