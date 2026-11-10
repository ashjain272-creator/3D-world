import { Bloom, DepthOfField, EffectComposer, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import type * as THREE from 'three';
import type { Quality } from '../../state/settings';

/**
 * Post-processing by quality tier:
 *  - low: none (plain renderer output);
 *  - medium: bloom;
 *  - high: bloom, SMAA anti-aliasing, a subtle vignette, and optional depth of field.
 * Tone mapping is applied at the end of the chain (the renderer's own tone
 * mapping does not reach the composer's render targets).
 */
export function PostFX({ quality, bloom = 0.9, threshold = 0.72, dofTarget }: { quality: Quality; bloom?: number; threshold?: number; dofTarget?: THREE.Vector3 | null }) {
  if (quality === 'low') return null;
  if (quality === 'medium')
    return (
      <EffectComposer multisampling={0}>
        <Bloom intensity={bloom} luminanceThreshold={threshold} luminanceSmoothing={0.2} mipmapBlur />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    );
  return (
    <EffectComposer multisampling={0}>
      <Bloom intensity={bloom} luminanceThreshold={threshold} luminanceSmoothing={0.2} mipmapBlur />
      {dofTarget ? <DepthOfField target={dofTarget} focalLength={0.04} bokehScale={3} height={480} /> : <></>}
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette eskil={false} offset={0.25} darkness={0.55} />
      <SMAA />
    </EffectComposer>
  );
}
