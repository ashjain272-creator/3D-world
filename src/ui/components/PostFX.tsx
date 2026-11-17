import { Bloom, DepthOfField, EffectComposer, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { BlendFunction, Effect, ToneMappingMode } from 'postprocessing';
import { useMemo } from 'react';
import * as THREE3 from 'three';
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
/**
 * Colour grade, applied after tone mapping:
 *  - an S-curve for contrast that protects shadows and highlights,
 *  - split toning (cool shadows, warm highlights) — the classic
 *    teal/amber complementary pairing that separates forms,
 *  - saturation weighted to leave skin-like mid tones alone,
 *  - a touch of lift so blacks never crush to pure black.
 */
class GradeEffect extends Effect {
  constructor(strength: number) {
    super(
      'GradeEffect',
      /* glsl */ `
      uniform float uStrength;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 c = inputColor.rgb;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        vec3 s = c * c * (3.0 - 2.0 * c);
        c = mix(c, s, 0.35 * uStrength);
        vec3 cool = vec3(0.86, 0.97, 1.08);
        vec3 warm = vec3(1.07, 1.01, 0.9);
        c *= mix(cool, vec3(1.0), smoothstep(0.0, 0.45, l));
        c *= mix(vec3(1.0), warm, smoothstep(0.5, 1.0, l));
        float l2 = dot(c, vec3(0.2126, 0.7152, 0.0722));
        float sat = 1.0 + 0.16 * uStrength * (1.0 - abs(l2 - 0.5) * 1.4);
        c = mix(vec3(l2), c, sat);
        c = c * 0.97 + 0.018;
        outputColor = vec4(clamp(c, 0.0, 1.0), inputColor.a);
      }`,
      { blendFunction: BlendFunction.NORMAL, uniforms: new Map([['uStrength', new THREE3.Uniform(strength)]]) },
    );
  }
}

function Grade({ strength }: { strength: number }) {
  const fx = useMemo(() => new GradeEffect(strength), [strength]);
  return <primitive object={fx} dispose={null} />;
}

export function PostFX({ quality, bloom = 0.9, threshold = 0.72, dofTarget, grade = 0 }: { quality: Quality; bloom?: number; threshold?: number; dofTarget?: THREE.Vector3 | null; grade?: number }) {
  if (quality === 'low') return null;
  if (quality === 'medium')
    return (
      <EffectComposer multisampling={0}>
        <Bloom intensity={bloom} luminanceThreshold={threshold} luminanceSmoothing={0.2} mipmapBlur />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        {grade ? <Grade strength={grade} /> : <></>}
      </EffectComposer>
    );
  return (
    <EffectComposer multisampling={0}>
      <Bloom intensity={bloom} luminanceThreshold={threshold} luminanceSmoothing={0.2} mipmapBlur />
      {dofTarget ? <DepthOfField target={dofTarget} focalLength={0.04} bokehScale={3} height={480} /> : <></>}
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      {grade ? <Grade strength={grade} /> : <></>}
      <Vignette eskil={false} offset={0.25} darkness={0.55} />
      <SMAA />
    </EffectComposer>
  );
}
