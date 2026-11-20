import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { TiledInstances, type LodLevel } from './lod';
import { env, foliageMaterial, texturedMaterial } from './env';
import { frondsGeo, palmTrunkGeo } from './flora';
import { nightUniform } from './City';
import type { DMat, DPiece, DShape, DistrictData } from './districts';

const archGeo = (() => {
  // semicircular head: half a cylinder lying along z, flat side down, radius 0.5, apex at y = 1
  const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 18, 1, false, Math.PI / 2, Math.PI);
  g.rotateX(Math.PI / 2);
  g.scale(1, 2, 1);
  return g;
})();

const SHAPES: Record<DShape, THREE.BufferGeometry> = {
  box: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 18).translate(0, 0.5, 0),
  oct: new THREE.CylinderGeometry(0.5, 0.5, 1, 8).translate(0, 0.5, 0),
  cone: new THREE.ConeGeometry(0.5, 1, 16).translate(0, 0.5, 0),
  hemi: new THREE.SphereGeometry(0.5, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2),
  sphere: new THREE.SphereGeometry(0.5, 14, 10),
  gable: (() => {
    const s = new THREE.Shape();
    s.moveTo(-0.55, 0);
    s.lineTo(0.55, 0);
    s.lineTo(0, 1);
    s.lineTo(-0.55, 0);
    return new THREE.ExtrudeGeometry(s, { depth: 1.1, bevelEnabled: false }).translate(0, 0, -0.55);
  })(),
  arch: archGeo,
  // pitch and court markings: thin rings lying flat, a full circle and two arcs centred on +x
  ring: new THREE.RingGeometry(0.494, 0.5, 72).rotateX(-Math.PI / 2),
  // the penalty-area D (106 degrees) and the NBA three-point arc (136 degrees)
  dArc: new THREE.RingGeometry(0.494, 0.5, 28, 1, -0.927, 1.854).rotateX(-Math.PI / 2),
  threeArc: new THREE.RingGeometry(0.4966, 0.5, 40, 1, -1.187, 2.374).rotateX(-Math.PI / 2),
  // hipped roof: a four-sided pyramid on a unit square base
  hip: new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0),
  palmTrunk: palmTrunkGeo(0),
  fronds: frondsGeo(0),
};

type Quality = 'low' | 'medium' | 'high';

const glassNight = { value: 0 };
const crowdLight = { value: 0.08 };

/**
 * Stadium seating: every row box is filled with fans. Top faces are split into 0.55 m seats;
 * each seat holds a fan (most of them), in a random shirt or the club colour, with a head, or is
 * an empty seat in the row colour. Risers show the seat backs.
 */
function crowdMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85 });
  m.customProgramCacheKey = () => 'district-crowd';
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uCrowdLight = crowdLight;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCW;')
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        {
          vec4 cw = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            cw = instanceMatrix * cw;
          #endif
          vCW = (modelMatrix * cw).xyz;
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uCrowdLight;\nvarying vec3 vCW;\nfloat chash(vec3 p){ vec3 q = fract(p * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec3 seatCol = diffuseColor.rgb;
          vec3 n = normalize(cross(dFdx(vCW), dFdy(vCW)));
          float top = step(0.6, abs(n.y));
          // seats along the row: whichever horizontal axis the row runs along
          float alongRow = abs(n.x) > abs(n.z) ? vCW.z : vCW.x;
          float seat = alongRow / 0.5;
          float row = floor(vCW.y / 0.3);
          float cellId = floor(seat);
          float fs = fract(seat) - 0.5;
          float h = chash(vec3(cellId, row, floor(top > 0.5 ? (abs(n.x) > abs(n.z) ? vCW.x : vCW.z) / 0.75 : 0.0)));
          float fan = step(h, 0.9);
          // muted, varied clothing, about a third of the crowd in club colours
          vec3 shirt = 0.32 + 0.26 * cos(6.2832 * (h * 5.7 + vec3(0.0, 0.33, 0.67)));
          shirt = mix(shirt, seatCol * 1.1, step(0.66, fract(h * 13.7)));
          shirt = mix(shirt, vec3(0.08), step(0.85, fract(h * 7.3)));
          vec3 skin = mix(vec3(0.36, 0.22, 0.15), vec3(0.86, 0.68, 0.55), fract(h * 31.3));
          // top faces: shoulders and a head seen from above
          vec2 g2 = vec2(fs, fract((abs(n.x) > abs(n.z) ? vCW.x : vCW.z) / 0.75) - 0.5);
          float body = 1.0 - smoothstep(0.32, 0.4, length(g2 * vec2(1.0, 1.4)));
          float head = 1.0 - smoothstep(0.1, 0.14, length(g2));
          vec3 onTop = mix(seatCol * 0.55, mix(shirt, skin, head), fan * body);
          // row fronts: torsos and heads above the seat backs
          float yf = fract(vCW.y / 0.3);
          float torso = step(abs(fs), 0.36) * fan;
          vec3 riser = mix(seatCol * 0.5, seatCol * 0.25, step(0.42, abs(fs)));
          riser = mix(riser, shirt, torso * step(yf, 0.75));
          riser = mix(riser, skin, torso * step(0.75, yf) * step(abs(fs), 0.16));
          diffuseColor.rgb = mix(riser, onTop, top);
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * uCrowdLight;
        {
        }`,
      );
  };
  return m;
}
/**
 * Window glass: dark and reflective by day. After dark each pane is lit or not by a hash of
 * its position, in warm or cool light, brightest near the ceiling, so a house reads as rooms
 * rather than one glowing slab.
 */
function windowGlass(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.08, metalness: 0.15 });
  m.customProgramCacheKey = () => 'district-window-glass';
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = glassNight;
    shader.uniforms.uSky = env.uSky;
    shader.uniforms.uDay = env.uDay;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPane;\nvarying float vUp;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vUp = position.y;
        #ifdef USE_INSTANCING
          vPane = instanceMatrix[3].xyz;
        #else
          vPane = vec3(0.0);
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;\nuniform vec3 uSky;\nuniform float uDay;\nvarying vec3 vPane;\nvarying float vUp;\nfloat paneHash(vec3 p){ vec3 q = fract(p * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float hsh = paneHash(floor(vPane * 2.0));
          float lit = step(0.38, hsh);
          vec3 lamp = hsh > 0.85 ? vec3(0.75, 0.85, 1.0) : mix(vec3(1.0, 0.68, 0.38), vec3(1.0, 0.82, 0.6), fract(hsh * 7.3));
          float ceiling = 0.45 + 0.55 * smoothstep(0.0, 1.0, vUp);
          totalEmissiveRadiance += lamp * lit * ceiling * uNight * (0.35 + 0.3 * fract(hsh * 13.1));
          // sky reflection: brighter at grazing angles and towards the top of the pane, so glass
          // reads as glass instead of a dark slab without an environment map
          float fres = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 2.0);
          totalEmissiveRadiance += uSky * uDay * (0.12 + 0.35 * fres) * (0.7 + 0.3 * vUp);
        }`,
      );
  };
  return m;
}

/** Mansions, souk, mall, mosque, temple and boulevard palms of a futuristic city. */
export function Districts({ data, quality }: { data: DistrictData; quality: Quality }) {
  const shadows = quality === 'high';
  const mats = useMemo<Record<DMat, THREE.Material>>(
    () => ({
      plaster: texturedMaterial('plaster', { color: '#ffffff', roughness: 0.85 }),
      stone: texturedMaterial('paving', { color: '#ffffff', roughness: 0.9 }),
      marble: texturedMaterial('tiles', { color: '#ffffff', roughness: 0.35 }),
      roof: texturedMaterial('tiles', { color: '#ffffff', roughness: 0.85 }),
      wood: texturedMaterial('wood', { color: '#ffffff', roughness: 0.8 }),
      cloth: texturedMaterial('cloth', { color: '#ffffff', roughness: 0.9, side: THREE.DoubleSide }),
      bark: texturedMaterial('bark', { color: '#ffffff', roughness: 1 }),
      metal: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35, metalness: 0.6 }),
      // gold leaf: without an environment map a fully metallic surface reads brown, so keep it
      // partly dielectric with a warm glow of its own
      gold: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3, metalness: 0.45, emissive: new THREE.Color('#6a4a10'), emissiveIntensity: 0.35 }),
      // window glass: dark and reflective by day, warm interior light after dark
      glass: windowGlass(),
      // pools and fountains glow turquoise from underwater lights at night
      water: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.04, metalness: 0.15, emissive: new THREE.Color('#2ab8e0'), emissiveIntensity: 0.12 }),
      leaf: foliageMaterial({ flat: true, double: true, sway: 0.06 }),
      lawn: texturedMaterial('cloth', { color: '#ffffff', roughness: 1 }),
      glow: new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }),
      dark: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }),
      crowd: crowdMaterial(),
      // the pitch and the court are floodlit after dark
      pitch: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, emissive: new THREE.Color('#3f8a36'), emissiveIntensity: 0 }),
      court: texturedMaterial('wood', { color: '#ffffff', roughness: 0.35, emissive: new THREE.Color('#8a6038'), emissiveIntensity: 0.2 }),
      net: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }),
      skylight: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.45, depthWrite: false }),
    }),
    [],
  );
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  useFrame(() => {
    const n = nightUniform.value;
    glassNight.value = n;
    (mats.water as THREE.MeshStandardMaterial).emissiveIntensity = 0.12 + n * 0.6;
    // floodlights: the pitch, the court and the crowd carry their own light after dark
    (mats.pitch as THREE.MeshStandardMaterial).emissiveIntensity = n * 0.55;
    (mats.court as THREE.MeshStandardMaterial).emissiveIntensity = 0.2 + n * 0.6;
    crowdLight.value = 0.08 + n * 0.45;
  });
  const groups = useMemo(() => {
    const g = new Map<string, DPiece[]>();
    for (const p of data.pieces) {
      const k = `${p.shape}|${p.mat}|${p.small ? 's' : 'b'}`;
      const list = g.get(k);
      if (list) list.push(p);
      else g.set(k, [p]);
    }
    const far = quality === 'low' ? 0.6 : 1;
    return [...g.entries()].map(([k, list]) => {
      const [shape, mat, size] = k.split('|') as [DShape, DMat, string];
      const small = size === 's';
      return {
        k,
        items: list,
        levels: [{ geometry: SHAPES[shape], material: mats[mat], maxDist: (small ? 240 : 1100) * far, castShadow: shadows && !small, receiveShadow: true }] as LodLevel[],
      };
    });
  }, [data, mats, shadows, quality]);
  return (
    <group>
      {groups.map((g) => (
        <TiledInstances key={g.k} items={g.items} levels={g.levels} tileSize={240} name={`district-${g.k}`} />
      ))}
    </group>
  );
}
