import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { Rng } from '../sim/rng';
import type { Layout } from './layout';
import { mixHex, type TerrainData } from './terrain';
import { BUMP_GLSL, NOISE_GLSL, detail, env } from './env';

export function TerrainMesh({ t, layout, waterColor }: { t: TerrainData; layout: Layout; waterColor: string }) {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(t.size, t.size, t.res, t.res);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const low = new THREE.Color(t.look.low);
    const mid = new THREE.Color(t.look.mid);
    const high = new THREE.Color(t.look.high);
    const cliff = new THREE.Color(t.look.cliff);
    const sand = new THREE.Color(t.look.sand);
    const cityGround = new THREE.Color(
      layout.style === 'futuristic' ? '#5a6068' : layout.style === 'organic' ? mixHex(t.look.grassColor, '#6a8a4a', 0.4) : mixHex(t.look.sand, '#a08a68', 0.5),
    );
    const rng = new Rng(t.seed);
    const n2 = createNoise2D(() => rng.next());
    const dry = new THREE.Color(t.look.sand).lerp(new THREE.Color(t.look.mid), 0.4);
    const lush = new THREE.Color(t.look.grassColor).offsetHSL(0, 0.05, -0.06);
    const maxH = Math.max(...t.heights);
    const minH = Math.min(...t.heights);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      // PlaneGeometry rows run from +z to -z after rotation; sample the analytic height
      const h = t.height(x, z);
      pos.setY(i, h);
      const s = t.slope(x, z);
      const rel = (h - minH) / Math.max(1, maxH - minH);
      if (rel < 0.35) c.copy(low).lerp(mid, rel / 0.35);
      else c.copy(mid).lerp(high, Math.min(1, (rel - 0.35) / 0.5));
      // large soft patches of lusher and drier ground, plus fine speckle
      const patch = n2(x / 70, z / 70) * 0.6 + n2(x / 18, z / 18) * 0.25;
      if (patch > 0.15) c.lerp(lush, Math.min(0.5, (patch - 0.15) * 0.9));
      else if (patch < -0.2) c.lerp(dry, Math.min(0.45, (-0.2 - patch) * 0.8));
      if (t.waterLevel !== null && h < t.waterLevel + 1.6) c.lerp(sand, Math.min(1, (t.waterLevel + 1.6 - h) / 1.6));
      if (s > 0.55) c.lerp(cliff, Math.min(1, (s - 0.55) * 2));
      const d = Math.hypot(x, z);
      if (layout.radius > 0 && d < layout.radius + 8) c.lerp(cityGround, Math.min(1, (layout.radius + 8 - d) / 20) * 0.8);
      const j = (rng.next() - 0.5) * 0.04 + n2(x / 4, z / 4) * 0.015;
      colors[i * 3] = c.r + j;
      colors[i * 3 + 1] = c.g + j;
      colors[i * 3 + 2] = c.b + j;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, [t, layout]);
  useEffect(() => () => geo.dispose(), [geo]);
  const water = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (water.current) water.current.position.y = (t.waterLevel ?? 0) + Math.sin(clock.elapsedTime * 0.4) * 0.08;
  });
  const dunes = t.look.vegetation === 'cactus';
  const snowAmt = t.look.snow ?? 0;
  const glacier = snowAmt >= 0.95;
  // mountains carry snow caps above ~70% of their relief
  const snowLine = t.look.amplitude >= 40 ? t.flatHeight + t.look.amplitude * 0.75 : 1e4;
  // Ground: vertex colours broken up by procedural detail so it never reads as flat paint.
  const groundMat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.envTime = env.uTime;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vGN;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvGN = normal;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\nvarying vec3 vGN;\nuniform float envTime;\n${NOISE_GLSL}\n${BUMP_GLSL}\nfloat groundH(vec3 P, float steep) { return mix(evn(P.xz * 0.9) * 0.7 + evn(P.xz * 4.0) * 0.3, evn(P.xz * 1.1) + evn(P.xz * 2.7) * 0.5, steep); }`).replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float broad = efbm(vWPos.xz * 0.045);
          float fine = evn(vWPos.xz * 1.7) * 0.6 + evn(vWPos.xz * 7.0) * 0.4;
          diffuseColor.rgb *= 0.78 + 0.3 * broad + 0.16 * fine;
          // faint warm/cool drift so large fields are not one hue
          diffuseColor.rgb *= mix(vec3(1.05, 1.0, 0.92), vec3(0.94, 1.0, 1.04), efbm(vWPos.xz * 0.012 + 31.0));
          // relief: clumpy turf on flats, strata and cracks on steep ground
          float steep = 1.0 - smoothstep(0.55, 0.85, abs(normalize(vGN).y));
          float fw = max(length(fwidth(vWPos.xz)), 1e-4);
          float e = max(0.03, fw);
          float gf = efade(fw * 0.5);
          vec2 gg = vec2(0.0);
          if (${detail.level >= 2 ? 'gf > 0.02' : 'false'}) {
            float h0 = groundH(vWPos, steep);
            gg = vec2(groundH(vWPos + vec3(e, 0.0, 0.0), steep) - h0, groundH(vWPos + vec3(0.0, 0.0, e), steep) - h0) / e;
          }
          float strata = evn(vec2(vWPos.y * 1.6 + efbm(vWPos.xz * 0.15) * 3.0, 1.0));
          diffuseColor.rgb *= mix(1.0, 0.78 + 0.34 * strata, steep);
          normal = ebumpW(normal, gg, vec3(1.0, 0.0, 0.0), vec3(0.0, 0.0, 1.0), mix(0.05, 0.11, steep) * gf);
          ${dunes ? `// sand: pale sun-bleached crests, warmer troughs, wind ripples, red rock outcrops with strata, cracked clay flats
          float rel = clamp((vWPos.y - ${(t.flatHeight - 4).toFixed(1)}) / 16.0, 0.0, 1.0);
          vec3 sandLo = vec3(0.74, 0.5, 0.3);
          vec3 sandHi = vec3(0.95, 0.8, 0.58);
          vec3 sand = mix(sandLo, sandHi, rel) * (0.92 + 0.12 * efbm(vWPos.xz * 0.04));
          sand = mix(sand, sand * vec3(1.08, 0.88, 0.76), smoothstep(0.55, 0.8, efbm(vWPos.xz * 0.015 + 4.0)) * 0.6);
          float rip = sin((vWPos.x * 0.8 + vWPos.z * 0.35) * 2.6 + efbm(vWPos.xz * 0.08) * 9.0);
          sand *= 0.95 + 0.07 * rip * (1.0 - steep);
          float rockMask = smoothstep(0.42, 0.7, steep + max(0.0, vWPos.y - ${(t.flatHeight + 14).toFixed(1)}) * 0.04);
          float strataD = evn(vec2(vWPos.y * 1.4, vWPos.x * 0.02)) * 0.6 + evn(vec2(vWPos.y * 4.0, vWPos.z * 0.05)) * 0.4;
          vec3 rockC = mix(vec3(0.55, 0.28, 0.17), vec3(0.78, 0.5, 0.32), strataD) * (0.85 + 0.25 * efbm(vWPos.xz * 0.3));
          vec3 desertCol = mix(sand, rockC, rockMask);
          float playa = smoothstep(${(t.flatHeight - 6).toFixed(1)}, ${(t.flatHeight - 8).toFixed(1)}, vWPos.y) * (1.0 - smoothstep(0.05, 0.25, steep));
          // dried mud: proper Voronoi cell borders (second-nearest minus nearest), fading with distance
          vec2 cp = vWPos.xz * 0.9;
          vec2 ci = floor(cp); vec2 cf = fract(cp);
          float f1 = 8.0; float f2 = 8.0;
          for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) {
            vec2 o = vec2(float(i), float(j));
            vec2 pt = o + vec2(eh21(ci + o), eh21(ci + o + 17.0)) * 0.85;
            float dd = length(cf - pt);
            if (dd < f1) { f2 = f1; f1 = dd; } else if (dd < f2) { f2 = dd; }
          }
          float crackLine = (1.0 - smoothstep(0.02, 0.07, f2 - f1)) * (1.0 - smoothstep(25.0, 60.0, length(vViewPosition)));
          vec3 clay = vec3(0.84, 0.74, 0.6) * (0.94 + 0.1 * eh21(ci)) * (1.0 - 0.4 * crackLine);
          diffuseColor.rgb = mix(desertCol, clay, playa);` : ''}
          // snow: settles on flat ground everywhere on cold worlds, above the snowline elsewhere
          float ny = abs(normalize(vGN).y);
          float snowCover = max(${snowAmt.toFixed(2)} * smoothstep(0.62, 0.86, ny), smoothstep(${(snowLine - 6).toFixed(1)}, ${(snowLine + 6).toFixed(1)}, vWPos.y + efbm(vWPos.xz * 0.05) * 10.0) * smoothstep(0.5, 0.78, ny));
          snowCover *= 0.75 + 0.25 * smoothstep(0.35, 0.6, efbm(vWPos.xz * 0.12));
          // wind-carved snow (sastrugi): long ridges across the prevailing wind, blue in the hollows
          float sast = evn(vec2(vWPos.x * 0.12 + efbm(vWPos.xz * 0.05) * 4.0, vWPos.z * 0.9));
          vec3 snowCol = mix(vec3(0.66, 0.76, 0.9), vec3(0.9, 0.93, 0.97), smoothstep(0.2, 0.75, sast * 0.7 + efbm(vWPos.xz * 0.2) * 0.3));
          ${snowAmt > 0.4 ? `// exposed rock on steep ground goes dark and blue-grey, with snow caught on its ledges
          float ledge = smoothstep(0.45, 0.65, evn(vec2(vWPos.y * 1.8, vWPos.x * 0.03)));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.24, 0.27, 0.32) * (0.8 + 0.4 * efbm(vWPos.xz * 0.4)), steep * 0.85);
          snowCover = max(snowCover, steep * ledge * 0.7);` : ''}
          diffuseColor.rgb = mix(diffuseColor.rgb, snowCol, clamp(snowCover, 0.0, 1.0));
          roughnessFactor = mix(roughnessFactor, 0.55, snowCover);
          ${glacier ? `// glacier: patches of blue ice with dark crevasses
          float gl = smoothstep(0.52, 0.62, efbm(vWPos.xz * 0.012 + 3.0)) * (1.0 - steep);
          float crev = 1.0 - smoothstep(0.0, 0.035, abs(evn(vec2(vWPos.x * 0.05, vWPos.z * 0.2)) - 0.5));
          vec3 ice = mix(vec3(0.42, 0.7, 0.86), vec3(0.72, 0.88, 0.96), efbm(vWPos.xz * 0.3)) * (1.0 - 0.75 * crev);
          diffuseColor.rgb = mix(diffuseColor.rgb, ice, gl);
          roughnessFactor = mix(roughnessFactor, 0.15, gl);` : ''}
          ${t.waterLevel !== null && !t.look.frozen ? `// shoreline: damp, darker ground just above the water and a lapping foam line
          float wl = ${t.waterLevel.toFixed(2)};
          float wet = 1.0 - smoothstep(wl + 0.1, wl + 1.3, vWPos.y);
          diffuseColor.rgb *= 1.0 - 0.32 * wet;
          roughnessFactor = mix(roughnessFactor, 0.35, wet);
          float lap = wl + 0.12 + 0.1 * sin(envTime * 1.3 + vWPos.x * 0.15 + vWPos.z * 0.11);
          float foam = (1.0 - smoothstep(0.0, 0.18, abs(vWPos.y - lap))) * (0.55 + 0.45 * evn(vWPos.xz * 1.6 + envTime * 0.4));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.95, 0.96), foam * 0.8);` : ''}
          // glints: tiny ice facets catching the light near the camera
          float glint = step(0.996, eh21(floor(vWPos.xz * 9.0))) * snowCover * (1.0 - smoothstep(4.0, 30.0, length(vViewPosition)));
          totalEmissiveRadiance += vec3(0.9, 0.95, 1.0) * glint * 0.8;
        }`,
      );
    };
    return m;
  }, [dunes, snowAmt, snowLine, glacier, t.flatHeight]);
  // Water: moving ripples in the normal, sky reflection at grazing angles.
  const waterMat = useMemo(() => {
    if (t.look.frozen) return iceMaterial();
    const m = new THREE.MeshStandardMaterial({ color: waterColor, transparent: true, opacity: 0.86, roughness: 0.08, metalness: 0.1 });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = env.uTime;
      shader.uniforms.uSky = env.uSky;
      shader.uniforms.uDay = env.uDay;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\nuniform float uTime;\nuniform float uDay;\nuniform vec3 uSky;\n${NOISE_GLSL}`)
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          {
            vec2 p = vWPos.xz;
            vec2 gr = vec2(cos(p.x * 0.33 + uTime * 1.1), cos(p.y * 0.41 + uTime * 0.9)) * 0.05;
            gr += vec2(cos(p.x * 1.3 - p.y * 0.7 + uTime * 1.7), cos(p.y * 1.5 + p.x * 0.6 - uTime * 1.4)) * 0.04;
            gr += (vec2(evn(p * 2.2 + uTime * 0.6), evn(p * 2.2 - uTime * 0.5 + 40.0)) - 0.5) * 0.09;
            normal = normalize((viewMatrix * vec4(normalize(vec3(-gr.x, 1.0, -gr.y)), 0.0)).xyz);
          }`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          {
            float fr = pow(1.0 - max(dot(normalize(vViewPosition), normal), 0.0), 3.0);
            vec3 skyc = uSky * (0.12 + 0.88 * uDay);
            diffuseColor.rgb = mix(diffuseColor.rgb * (0.75 + 0.35 * efbm(vWPos.xz * 0.05 + uTime * 0.02)), skyc, 0.15 + 0.7 * fr);
            diffuseColor.a = mix(0.7, 0.97, fr);
          }`,
        );
    };
    return m;
  }, [waterColor, t.look.frozen]);
  // Hazy far ridgelines so the horizon has depth.
  const ridges = useMemo(() => {
    const make = (radius: number, baseH: number, amp: number, seedOff: number) => {
      const seg = 160;
      const pos: number[] = [];
      const idx: number[] = [];
      const bottom = t.flatHeight - 40;
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        const n = Math.sin(a * 5 + seedOff) * 0.35 + Math.sin(a * 11 + seedOff * 2.3) * 0.3 + Math.sin(a * 23 + seedOff * 0.7) * 0.2 + Math.sin(a * 47 + seedOff) * 0.12;
        const top = t.flatHeight + baseH + amp * (0.55 + 0.45 * n);
        pos.push(Math.cos(a) * radius, bottom, Math.sin(a) * radius, Math.cos(a) * radius * 0.96, top, Math.sin(a) * radius * 0.96);
        if (i < seg) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    };
    const k = 0.5 + t.look.amplitude / 30;
    return [make(t.size * 0.95, 20, 70 * k, (t.seed % 97) * 0.13), make(t.size * 1.2, 40, 130 * k, (t.seed % 89) * 0.21 + 2)];
  }, [t]);
  useEffect(() => () => ridges.forEach((g) => g.dispose()), [ridges]);
  useEffect(() => () => { groundMat.dispose(); waterMat.dispose(); }, [groundMat, waterMat]);
  return (
    <group>
      <mesh geometry={geo} receiveShadow material={groundMat} />
      {t.waterLevel !== null && (
        <mesh ref={water} rotation={[-Math.PI / 2, 0, 0]} position={[0, t.waterLevel, 0]} receiveShadow material={waterMat}>
          <planeGeometry args={[t.size * 1.6, t.size * 1.6, 1, 1]} />
        </mesh>
      )}
      {ridges.map((g, i) => (
        <mesh key={i} geometry={g}>
          <meshStandardMaterial color={i === 0 ? mixHex(t.look.high, t.look.cliff, 0.5) : mixHex(t.look.high, '#9fb0c4', 0.5)} roughness={1} side={THREE.DoubleSide} flatShading />
        </mesh>
      ))}
      {/* distant ground ring so the horizon never shows the void */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, Math.min(...[t.flatHeight - 30]), 0]}>
        <ringGeometry args={[t.size * 0.7, t.size * 4, 32, 1]} />
        <meshStandardMaterial color={t.look.high} roughness={1} />
      </mesh>
    </group>
  );
}

/** Instanced vegetation and rocks with tiled LOD (two detail levels plus distance culling). */

/** Frozen lake surface: pale blue ice with white crack lines and frosted patches. */
function iceMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: '#cfe6f4', roughness: 0.12, metalness: 0.05 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\n${NOISE_GLSL}`).replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      {
        vec2 p = vWPos.xz;
        float crack = smoothstep(0.03, 0.0, abs(evn(p * 0.35) - 0.5)) + smoothstep(0.02, 0.0, abs(evn(p * 1.1 + 7.0) - 0.5)) * 0.6;
        float frost = smoothstep(0.45, 0.75, efbm(p * 0.08));
        diffuseColor.rgb = mix(diffuseColor.rgb * (0.85 + 0.15 * efbm(p * 0.5)), vec3(0.95, 0.97, 1.0), clamp(crack * 0.7 + frost * 0.6, 0.0, 1.0));
        roughnessFactor = mix(roughnessFactor, 0.6, frost);
      }`,
    );
  };
  return m;
}
