import * as THREE from 'three';
import type { Mat } from './kit';

/** The scale-model look's materials, used by the demo page and by the model estates in the game. */
/** Instance colour drives only the glow, so unlit windows read as dark glass. */
function windowMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: '#2b3540', roughness: 0.45, metalness: 0.2, emissive: '#ffffff', emissiveIntensity: 2 });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <color_fragment>', '')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_COLOR\n  totalEmissiveRadiance *= vColor.rgb;\n#endif');
  };
  m.customProgramCacheKey = () => 'model-window';
  return m;
}
export function makeModelMats(): Record<Mat, THREE.MeshStandardMaterial | THREE.MeshBasicMaterial> {
  return {
  white: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.62 }),
  wall: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7 }),
  charcoal: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.55 }),
  window: windowMaterial(),
  railing: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.32, depthWrite: false }),
  glow: new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }),
  leaf: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true }),
  trunk: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }),
  lawn: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95 }),
  paving: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 }),
  asphalt: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85 }),
  paint: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
  water: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.05, metalness: 0.1, emissive: '#2bb8e0', emissiveIntensity: 0.4 }),
  car: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.25, metalness: 0.5 }),
  carGlass: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.1, metalness: 0.6 }),
  metal: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35, metalness: 0.7 }),
  plinth: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.18, metalness: 0.2 }),
  figure: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7 }),
  court: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 }),
  // curtain-wall glass: tinted and reflective
  glass: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.34, metalness: 0.55 }),
  sand: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85 }),
  gold: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3, metalness: 0.8, emissive: '#6a4a10', emissiveIntensity: 0.4 }),
  stone: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.75 }),
  };
}

/** Which pieces cast and receive shadows. */
export const modelShadows = (m: Mat) => ({ cast: !['glow', 'railing', 'paint', 'water', 'lawn', 'paving', 'asphalt'].includes(m), receive: !['glow', 'paint'].includes(m) });
