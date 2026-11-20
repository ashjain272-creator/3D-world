import * as THREE from 'three';

/**
 * Uniforms shared by environment shaders (foliage wind, water, clouds,
 * facades). SkyWeather writes them once per frame.
 */
export const env = {
  uTime: { value: 0 },
  uSky: { value: new THREE.Color('#8fb4e0') },
  uSun: { value: new THREE.Color('#fff4e0') },
  uCover: { value: 0.35 },
  uDay: { value: 1 },
  uWind: { value: 1 },
};

/** Shader detail tier: 2 = relief near the camera (high), 1 = texture only (medium), 0 = texture only (low). */
export const detail = { level: 2 };
export function setDetail(quality: 'low' | 'medium' | 'high'): void {
  detail.level = quality === 'high' ? 2 : quality === 'medium' ? 1 : 0;
}

const NOISE_GLSL = /* glsl */ `
// sin-free hash: stays well distributed at large world coordinates, where sin() hashes
// lose precision and smear into diagonal streaks
float eh21(vec2 p){ vec3 q3 = fract(vec3(p.xyx) * 0.1031); q3 += dot(q3, q3.yzx + 33.33); return fract((q3.x + q3.y) * q3.z); }
float evn(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(eh21(i), eh21(i+vec2(1,0)), u.x), mix(eh21(i+vec2(0,1)), eh21(i+vec2(1,1)), u.x), u.y); }
float efbm(vec2 p){ float v = 0.0; float a = 0.5; for(int i=0;i<4;i++){ v += a*evn(p); p = p*2.03 + 17.0; a *= 0.5; } return v; }
`;
export { NOISE_GLSL };

/**
 * Leaf / grass material: instances sway in the wind and are shaded darker
 * underneath, which gives canopies volume without textures.
 * `tip`: geometry spans y 0..1 and bends from the root (grass); otherwise it
 * is a blob centred on the origin (canopy).
 */
export function foliageMaterial(opts: { tip?: boolean; sway?: number; roughness?: number; flat?: boolean; snow?: number; double?: boolean } = {}): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ roughness: opts.roughness ?? 0.9, flatShading: opts.flat ?? true, side: opts.tip || opts.double ? THREE.DoubleSide : THREE.FrontSide });
  const snowAmt = (opts.snow ?? 0).toFixed(2);
  const sway = (opts.sway ?? (opts.tip ? 0.28 : 0.05)).toFixed(3);
  // three.js keys its program cache on onBeforeCompile's source text, which is identical for
  // every call of this factory; key on the options that change the generated code instead
  m.customProgramCacheKey = () => `foliage|${opts.tip ?? false}|${sway}|${snowAmt}|${opts.flat ?? true}`;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = env.uTime;
    shader.uniforms.uWind = env.uWind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;')
      .replace(
        '#include <color_vertex>',
        `#include <color_vertex>
        #if defined( USE_COLOR_ALPHA ) || defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
          vColor.rgb *= ${opts.tip ? '0.55 + 0.6 * position.y' : '0.66 + 0.46 * smoothstep(-0.9, 0.9, position.y)'};
          // snow settles on the upper surfaces
          vColor.rgb = mix(vColor.rgb, vec3(0.9, 0.94, 0.98), ${snowAmt} * smoothstep(${opts.tip ? '0.5, 1.0' : '-0.15, 0.75'}, position.y) * 0.85);
        #endif`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.23;
          float sw = sin(uTime * 1.4 + ph) + 0.5 * sin(uTime * 2.7 + ph * 1.7);
          float k = ${opts.tip ? 'position.y * position.y' : '(position.y + 1.0) * 0.5'};
          transformed.x += sw * ${sway} * k * uWind;
          transformed.z += cos(uTime * 1.1 + ph) * ${sway} * 0.6 * k * uWind;
        #endif`,
      );
    // mottled leaves: light and dark patches so crowns are not flat colour
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvFP = position * 3.0;\n#ifdef USE_INSTANCING\nvFP += instanceMatrix[3].xyz;\n#endif');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vFP;\n${NOISE_GLSL}`).replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      diffuseColor.rgb *= 0.78 + 0.42 * evn(vFP.xz * 1.3 + vFP.y * 0.7) * (0.6 + 0.4 * evn(vFP.xy * 4.0));`,
    );
  };
  return m;
}

/**
 * Relief helper: tilt a view-space normal by a height gradient `g` measured
 * along world axes T and B. Gradients come from finite differences whose step
 * grows with the pixel footprint, so relief is filtered instead of aliasing.
 */
export const BUMP_GLSL = /* glsl */ `
vec3 ebumpW(vec3 n, vec2 g, vec3 T, vec3 B, float s) {
  return normalize(n - s * (viewMatrix * vec4(g.x * T + g.y * B, 0.0)).xyz);
}
float efade(float fw) { return 1.0 - smoothstep(0.02, 0.22, fw); }
`;

export type Surface = 'sandstone' | 'bark' | 'rock' | 'plaster' | 'metal' | 'tiles' | 'paving' | 'deck' | 'cloth' | 'wood' | 'skin';

/** Each snippet reads vec2 p (metres) and writes float h (relief 0..1), float a (albedo multiplier), float ro (roughness offset). */
const SURFACES: Record<Surface, { code: string; bump: number }> = {
  bark: { bump: 0.5, code: `float r1 = evn(vec2(p.x * 9.0, p.y * 1.1)); float r2 = evn(vec2(p.x * 24.0, p.y * 3.0)); h = r1 * 0.7 + r2 * 0.3; a = 0.62 + 0.62 * h; a *= 0.9 + 0.2 * evn(p * 0.8);` },
  rock: { bump: 0.7, code: `float f1 = efbm(p * 1.4); float f2 = evn(p * 9.0); float cr = smoothstep(0.035, 0.0, abs(evn(p * 0.9 + 3.0) - 0.5)); h = f1 * 0.8 + f2 * 0.2 - cr * 0.6; a = (0.72 + 0.5 * f1) * (1.0 - 0.4 * cr); a *= mix(1.0, 0.82, smoothstep(0.55, 0.75, efbm(p * 0.5 + 11.0)));` },
  plaster: { bump: 0.22, code: `float f1 = efbm(p * 2.6); h = f1 * 0.7 + evn(p * 21.0) * 0.3; a = 0.86 + 0.22 * efbm(p * 0.7 + 5.0); a *= 1.0 - 0.14 * (1.0 - eUp) * smoothstep(0.45, 0.8, evn(vec2(p.x * 2.2, p.y * 0.22)));` },
  metal: { bump: 0.35, code: `vec2 g = fract(p / 1.6); float j = 1.0 - smoothstep(0.0, 0.035, min(min(g.x, 1.0 - g.x), min(g.y, 1.0 - g.y))); h = 1.0 - j; a = (0.9 + 0.16 * eh21(floor(p / 1.6))) * (1.0 - 0.3 * j) * (0.93 + 0.12 * evn(vec2(p.x * 1.5, p.y * 30.0))); ro = -0.08 + 0.2 * evn(p * 0.6);` },
  tiles: { bump: 0.8, code: `vec2 c = vec2(p.x / 0.42, p.y / 0.3); c.x += 0.5 * mod(floor(c.y), 2.0); vec2 f = fract(c); h = f.y * 0.75 + 0.25 * smoothstep(0.0, 0.1, min(f.x, 1.0 - f.x)); a = (0.78 + 0.34 * eh21(floor(c))) * (0.72 + 0.4 * f.y); a *= 0.9 + 0.2 * efbm(p * 0.4);` },
  paving: { bump: 0.4, code: `vec2 c = p / vec2(1.2, 0.6); c.x += 0.5 * mod(floor(c.y), 2.0); vec2 f = fract(c); float j = 1.0 - smoothstep(0.0, 0.03, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y) * 0.5)); h = (1.0 - j) * (0.85 + 0.15 * evn(p * 12.0)); a = (0.86 + 0.2 * eh21(floor(c))) * (1.0 - 0.32 * j) * (0.9 + 0.18 * efbm(p * 0.5));` },
  deck: { bump: 0.5, code: `vec2 g = fract(p / 3.0); float e = min(min(g.x, 1.0 - g.x), min(g.y, 1.0 - g.y)); float j = 1.0 - smoothstep(0.0, 0.012, e); vec2 rv = abs(fract(p / 0.75) - 0.5); float riv = (1.0 - smoothstep(0.03, 0.05, length(rv))) * step(e, 0.06); float tread = step(0.5, fract((p.x + p.y) * 2.2)) * step(0.5, fract((p.x - p.y) * 2.2)); h = 1.0 - j + riv * 0.8 + tread * 0.12; a = (0.88 + 0.16 * eh21(floor(p / 3.0))) * (1.0 - 0.4 * j) * (0.92 + 0.14 * efbm(p * 0.8)); ro = -0.1 + 0.25 * efbm(p * 0.3);` },
  cloth: { bump: 0.18, code: `float w1 = sin(p.x * 70.0) * sin(p.y * 70.0); float fold = evn(vec2(p.x * 5.0, p.y * 1.6)); h = w1 * 0.25 + fold; a = 0.86 + 0.2 * fold + 0.05 * w1;` },
  wood: { bump: 0.35, code: `float gr = evn(vec2(p.x * 1.6, p.y * 26.0)); float pl = 1.0 - smoothstep(0.0, 0.04, abs(fract(p.y / 0.32) - 0.5) * 2.0 - 0.92 + 0.92); h = gr * 0.6; a = 0.78 + 0.34 * gr; a *= 0.92 + 0.14 * eh21(vec2(floor(p.y / 0.32), 1.0)); pl = 0.0;` },
  sandstone: { bump: 0.45, code: `vec2 c = p / vec2(1.6, 0.8); c.x += 0.5 * mod(floor(c.y), 2.0); vec2 f = fract(c); float j = 1.0 - smoothstep(0.0, 0.04, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y) * 0.6)); float strata = evn(vec2(p.y * 6.0, p.x * 0.3)); h = (1.0 - j) * (0.8 + 0.2 * evn(p * 7.0)); a = (0.86 + 0.18 * eh21(floor(c))) * (1.0 - 0.3 * j) * (0.9 + 0.14 * strata) * (0.92 + 0.12 * efbm(p * 0.35));` },
  skin: { bump: 0.06, code: `h = evn(p * 30.0); a = 0.94 + 0.1 * evn(p * 6.0);` },
};

/**
 * MeshStandardMaterial with procedural relief and albedo variation.
 * `space: 'object'` anchors the pattern to the mesh (moving figures);
 * 'world' keeps scale consistent across differently sized instances.
 */
export function texturedMaterial(surface: Surface, params: THREE.MeshStandardMaterialParameters = {}, space: 'world' | 'object' = 'world'): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial(params);
  const def = SURFACES[surface];
  const relief = detail.level >= 2 || space === 'object';
  const k = (def.bump * (space === 'object' ? 0.012 : 0.05)).toFixed(4);
  // see foliageMaterial: without this every surface would share the first one's shader
  m.customProgramCacheKey = () => `textured|${surface}|${space}|${relief}`;
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTP;\nvarying vec3 vTN;\nvarying vec3 vNX;\nvarying vec3 vNY;\nvarying vec3 vNZ;')
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        ${
          space === 'object'
            ? 'vTP = position; vTN = normal; vNX = normalMatrix * vec3(1.0, 0.0, 0.0); vNY = normalMatrix * vec3(0.0, 1.0, 0.0); vNZ = normalMatrix * vec3(0.0, 0.0, 1.0);'
            : `vec4 twp = vec4(transformed, 1.0);
        vec3 tn = objectNormal;
        #ifdef USE_INSTANCING
          twp = instanceMatrix * twp;
          tn = mat3(instanceMatrix) * tn;
        #endif
        vTP = (modelMatrix * twp).xyz;
        vTN = normalize(mat3(modelMatrix) * tn);`
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vTP;\nvarying vec3 vTN;\nvarying vec3 vNX;\nvarying vec3 vNY;\nvarying vec3 vNZ;\n${NOISE_GLSL}\n${BUMP_GLSL}\n// 1.0 on upward faces: lets wall-only effects (rain streaks) skip roofs and floors\nfloat eUp = 0.0;\nvec3 esurf(vec2 p) { float h = 0.0; float a = 1.0; float ro = 0.0; ${def.code} return vec3(h, a, ro); }`)
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          vec3 an = abs(normalize(vTN));
          vec2 p; vec3 T; vec3 B;
          if (an.y > 0.6) { eUp = 1.0; p = vTP.xz; T = vec3(1.0, 0.0, 0.0); B = vec3(0.0, 0.0, 1.0); }
          else if (an.x > an.z) { p = vTP.zy; T = vec3(0.0, 0.0, 1.0); B = vec3(0.0, 1.0, 0.0); }
          else { p = vTP.xy; T = vec3(1.0, 0.0, 0.0); B = vec3(0.0, 1.0, 0.0); }
          float fw = max(length(fwidth(p)), 1e-4);
          float fade = efade(fw * ${space === 'object' ? '6.0' : '1.0'});
          float e = max(${space === 'object' ? '0.004' : '0.012'}, fw);
          vec3 s0 = esurf(p);
          diffuseColor.rgb *= mix(1.0, s0.y, 0.35 + 0.65 * fade);
          roughnessFactor = clamp(roughnessFactor + s0.z * fade, 0.04, 1.0);
          ${relief ? 'if (fade > 0.02) {' : 'if (false) {'}
          vec2 g = vec2(esurf(p + vec2(e, 0.0)).x - s0.x, esurf(p + vec2(0.0, e)).x - s0.x) / e;
          ${space === 'object' ? `normal = normalize(normal - ${k} * fade * (mat3(vNX, vNY, vNZ) * (g.x * T + g.y * B)));` : `normal = ebumpW(normal, g, T, B, ${k} * fade);`}
          }
        }`,
      );
  };
  return m;
}
