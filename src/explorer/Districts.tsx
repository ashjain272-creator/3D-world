import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { TiledInstances, type LodLevel } from './lod';
import { env, foliageMaterial, texturedMaterial } from './env';
import { frondsGeo, palmTrunkGeo } from './flora';
import { nightUniform } from './City';
import type { DMat, DPiece, DShape, DistrictData } from './districts';
import { flightPose } from './airport';
import type { Mover } from './movers';
import { sceneDebug } from './explorerStore';

const archGeo = (() => {
  // semicircular head: half a cylinder lying along z, flat side down, radius 0.5, apex at y = 1
  const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 18, 1, false, Math.PI / 2, Math.PI);
  g.rotateX(Math.PI / 2);
  g.scale(1, 2, 1);
  return g;
})();

/** A wing planform on the right (+x) or, mirrored, the left side. */
function planform(side: number): THREE.BufferGeometry {
  const sh = new THREE.Shape();
  const pts: [number, number][] = [
    [0, 0],
    [1, -1.6],
    [1, -1.85],
    [0, -1],
  ];
  const ordered = side > 0 ? pts : pts.map(([x, y]) => [-x, y] as [number, number]).reverse();
  sh.moveTo(...ordered[0]);
  for (const p of ordered.slice(1)) sh.lineTo(...p);
  sh.lineTo(...ordered[0]);
  return new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false }).rotateX(Math.PI / 2).translate(0, 0.5, 0);
}

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
  // light shafts: an open cone (no cap) with its apex at the top
  beamCone: new THREE.ConeGeometry(0.5, 1, 32, 1, true).translate(0, 0.5, 0),
  // pitch and court markings: thin rings lying flat, a full circle and two arcs centred on +x
  ring: new THREE.RingGeometry(0.494, 0.5, 72).rotateX(-Math.PI / 2),
  // the penalty-area D (106 degrees) and the NBA three-point arc (136 degrees)
  dArc: new THREE.RingGeometry(0.494, 0.5, 28, 1, -0.927, 1.854).rotateX(-Math.PI / 2),
  threeArc: new THREE.RingGeometry(0.4966, 0.5, 40, 1, -1.187, 2.374).rotateX(-Math.PI / 2),
  // hipped roof: a four-sided pyramid on a unit square base
  hip: new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0),
  // mouldings: a ring lying flat (column astragals and bases), a half ring standing up (arch
  // mouldings, springing at y = 0) and a rod centred on its own axis (cornice rolls)
  torus: new THREE.TorusGeometry(0.42, 0.08, 8, 24).rotateX(-Math.PI / 2),
  halfTorus: new THREE.TorusGeometry(0.45, 0.05, 6, 20, Math.PI),
  rod: new THREE.CylinderGeometry(0.5, 0.5, 1, 12),
  // aircraft surfaces: a swept, tapered wing panel (root chord 1 along -z from its leading edge at
  // the origin, semi-span 1 along +x or -x, thickness 1 centred on y) and the fin (root chord 1,
  // height 1, swept back, thickness 1 centred on x)
  wingR: planform(1),
  wingL: planform(-1),
  fin: (() => {
    const sh = new THREE.Shape();
    sh.moveTo(0, 0);
    sh.lineTo(-1.1, 1);
    sh.lineTo(-1.45, 1);
    sh.lineTo(-1, 0);
    sh.lineTo(0, 0);
    return new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false }).rotateY(-Math.PI / 2).translate(0.5, 0, 0);
  })(),
  palmTrunk: palmTrunkGeo(0),
  fronds: frondsGeo(0),
};

type Quality = 'low' | 'medium' | 'high';

const glassNight = { value: 0 };

/**
 * Soft light shafts: additive, brightest along the axis and near the lamp, fading to nothing at
 * the cone's silhouette and towards the floor, so they read as light in haze, not as solid cones.
 */
function beamMaterial(opacity: number): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  m.customProgramCacheKey = () => 'district-light-beam';
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vEdge;\nvarying float vH;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          vec3 bn = normal;
          #ifdef USE_INSTANCING
            bn = mat3(instanceMatrix) * bn;
          #endif
          vec3 vn = normalize(normalMatrix * bn);
          vEdge = abs(dot(vn, normalize(-mvPosition.xyz)));
          vH = position.y;
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vEdge;\nvarying float vH;')
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        gl_FragColor.a *= pow(vEdge, 3.0) * mix(0.15, 1.0, vH * vH);`,
      );
  };
  return m;
}
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
          float h = chash(vec3(cellId, row, floor(top > 0.5 ? (abs(n.x) > abs(n.z) ? vCW.x : vCW.z) / 0.8 : 0.0)));
          float fan = step(h, 0.93);
          // clothing like a real crowd: mostly black, navy, grey and white, about a third in team
          // jerseys (the seat colour, brightened), the rest in muted colours
          float pick = fract(h * 13.7);
          vec3 muted = mix(vec3(0.3), 0.32 + 0.22 * cos(6.2832 * (h * 5.7 + vec3(0.0, 0.33, 0.67))), 0.55);
          vec3 shirt = pick < 0.22 ? vec3(0.06 + 0.06 * fract(h * 3.1), 0.07, 0.1)
            : pick < 0.36 ? vec3(0.32 + 0.2 * fract(h * 5.3))
            : pick < 0.48 ? vec3(0.82)
            : pick < 0.8 ? clamp(seatCol * 1.9 + 0.04, 0.0, 1.0)
            : muted;
          vec3 skin = mix(vec3(0.36, 0.22, 0.15), vec3(0.86, 0.68, 0.55), fract(h * 31.3));
          vec3 hair = mix(vec3(0.05, 0.04, 0.03), vec3(0.45, 0.32, 0.2), step(0.8, fract(h * 17.1)));
          // top faces: each seat holds a person seen from above, shoulders and a head, or shows the
          // empty seat pan with its seat back
          vec2 g2 = vec2(fs, fract((abs(n.x) > abs(n.z) ? vCW.x : vCW.z) / 0.8) - 0.5);
          float body = 1.0 - smoothstep(0.28, 0.34, length(g2 * vec2(1.0, 1.25)));
          float head = 1.0 - smoothstep(0.1, 0.13, length(g2 - vec2(0.0, -0.05)));
          vec3 person = mix(shirt, mix(hair, skin, step(0.5, fract(h * 23.0))), head);
          vec3 seatTop = mix(seatCol, seatCol * 0.6, step(0.38, abs(fs)));
          vec3 onTop = mix(seatTop, person, fan * body);
          // row fronts: seat backs with armrest gaps, and above them torsos and heads of the seated
          float yf = fract(vCW.y / 0.3);
          float torso = step(abs(fs), 0.32) * fan;
          vec3 riser = mix(seatCol, seatCol * 0.35, step(0.43, abs(fs)));
          riser = mix(riser, seatCol * 1.25, step(0.9, yf) * step(abs(fs), 0.43));
          riser = mix(riser, shirt * 0.9, torso * step(0.25, yf) * step(yf, 0.78));
          riser = mix(riser, skin, torso * step(0.78, yf) * step(abs(fs), 0.14));
          // far away, single seats are smaller than a pixel: fade to the crowd's average tone so
          // distant stands read as a dense crowd instead of shimmering noise
          float fw = length(fwidth(vCW));
          vec3 avg = mix(seatCol * 0.6, mix(vec3(0.3), clamp(seatCol * 1.9 + 0.04, 0.0, 1.0), 0.35), 0.8);
          diffuseColor.rgb = mix(mix(riser, onTop, top), avg, smoothstep(0.12, 0.35, fw));
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
export function Districts({ data, quality, y0 = 0 }: { data: DistrictData; quality: Quality; y0?: number }) {
  const seaY = y0 - 0.85;
  const shadows = quality === 'high';
  // the open sea: deep Gulf teal, glossy so it catches the sky
  const seaMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#1d6f8c", roughness: 0.12, metalness: 0.35 }), []);
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
      // light beams: faint, additive, so they read as haze lit by the floodlights
      // the open-air stadium's floodlight beams only show after dark
      nightBeam: beamMaterial(0),
      beam: beamMaterial(0.16),
      // pitch and court markings: unshaded so they stay crisp white in shade and at night, drawn
      // in front of the surface they lie on
      paint: new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      // the pitch and the court are floodlit after dark
      pitch: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, emissive: new THREE.Color('#3f8a36'), emissiveIntensity: 0 }),
      court: texturedMaterial('wood', { color: '#ffffff', roughness: 0.35, emissive: new THREE.Color('#8a6038'), emissiveIntensity: 0.2 }),
      net: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }),
      // mall atrium glass: pale, clear-looking glass lit warm from inside after dark; double-sided
      // so the vault and dome read as glass from inside the rotunda too
      atrium: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.12, metalness: 0.25, emissive: new THREE.Color('#ffd7a0'), emissiveIntensity: 0.05, transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false }),
      skylight: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.45, depthWrite: false }),
    }),
    [],
  );
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  useFrame(() => {
    const n = nightUniform.value;
    glassNight.value = n;
    (mats.water as THREE.MeshStandardMaterial).emissiveIntensity = 0.12 + n * 0.6;
    (mats.atrium as THREE.MeshStandardMaterial).emissiveIntensity = 0.05 + n * 0.75;
    // floodlights: the pitch, the court and the crowd carry their own light after dark
    (mats.pitch as THREE.MeshStandardMaterial).emissiveIntensity = n * 0.55;
    (mats.court as THREE.MeshStandardMaterial).emissiveIntensity = 0.2 + n * 0.6;
    crowdLight.value = 0.06 + n * 0.22;
    (mats.nightBeam as THREE.MeshBasicMaterial).opacity = n * 0.16;
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
      {data.sea !== undefined && (
        // the sea: one large plane from the shoreline out past the horizon
        <mesh material={seaMat} position={[0, seaY, data.sea - 1500]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[6000, 3000]} />
        </mesh>
      )}
      {groups.map((g) => (
        <TiledInstances key={g.k} items={g.items} levels={g.levels} tileSize={240} name={`district-${g.k}`} />
      ))}
      {data.flights?.map((f, i) => <Flight key={i} f={f} mats={mats} y0={y0} />)}
      {data.movers?.map((m, i) => <MoverView key={i} m={m} mats={mats} y0={y0} />)}
    </group>
  );
}

/** An aircraft flying its circuit: its pieces as instanced meshes inside a moving group. */
function instancesOf(pieces: DPiece[], mats: Record<DMat, THREE.Material>): THREE.InstancedMesh[] {
  const g = new Map<string, DPiece[]>();
  for (const p of pieces) {
    const k = `${p.shape}|${p.mat}`;
    const list = g.get(k);
    if (list) list.push(p);
    else g.set(k, [p]);
  }
  return [...g.entries()].map(([k, list]) => {
    const [shape, mat] = k.split('|') as [DShape, DMat];
    const m = new THREE.InstancedMesh(SHAPES[shape], mats[mat], list.length);
    list.forEach((p, i) => {
      m.setMatrixAt(i, p.m);
      m.setColorAt(i, p.c);
    });
    m.frustumCulled = false;
    m.castShadow = true;
    return m;
  });
}

function Flight({ f, mats, y0 }: { f: NonNullable<DistrictData['flights']>[number]; mats: Record<DMat, THREE.Material>; y0: number }) {
  const ref = useRef<THREE.Group>(null);
  const down = useRef<THREE.Group>(null);
  const up = useRef<THREE.Group>(null);
  const meshesDown = useMemo(() => instancesOf(f.pieces, mats), [f, mats]);
  const meshesUp = useMemo(() => instancesOf(f.piecesUp, mats), [f, mats]);
  const meshes = useMemo(() => [...meshesDown, ...meshesUp], [meshesDown, meshesUp]);
  useEffect(() => () => meshes.forEach((m) => m.dispose()), [meshes]);
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    // a fixed time can be set for screenshots (sceneDebug.flightTime); otherwise the scene clock
    const pose = flightPose(f.mode, f.runX0, f.runX1, (sceneDebug as { flightTime?: number }).flightTime ?? clock.elapsedTime);
    g.visible = !!pose;
    if (!pose) return;
    if (down.current) down.current.visible = pose.gear;
    if (up.current) up.current.visible = !pose.gear;
    g.position.set(pose.x, y0 + pose.y, f.runZ);
    // nose towards -x, pitched up by `pitch`
    g.rotation.set(-pose.pitch, -Math.PI / 2, 0, 'YXZ');
  });
  return (
    <group ref={ref}>
      <group ref={down}>
        {meshesDown.map((m, i) => (
          <primitive key={i} object={m} />
        ))}
      </group>
      <group ref={up} visible={false}>
        {meshesUp.map((m, i) => (
          <primitive key={i} object={m} />
        ))}
      </group>
    </group>
  );
}

/** A train or a boat on its route: instanced pieces in a group moved by the mover's pose. */
function MoverView({ m, mats, y0 }: { m: Mover; mats: Record<DMat, THREE.Material>; y0: number }) {
  const ref = useRef<THREE.Group>(null);
  const meshes = useMemo(() => instancesOf(m.pieces, mats), [m, mats]);
  useEffect(() => () => meshes.forEach((x) => x.dispose()), [meshes]);
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    const p = m.pose((sceneDebug as { flightTime?: number }).flightTime ?? clock.elapsedTime);
    g.visible = !!p;
    if (!p) return;
    g.position.set(p.x, y0 + p.y, p.z);
    g.rotation.set(0, p.yaw, p.roll ?? 0, 'YXZ');
  });
  return (
    <group ref={ref}>
      {meshes.map((x, i) => (
        <primitive key={i} object={x} />
      ))}
    </group>
  );
}
