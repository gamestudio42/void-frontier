import {
  AdditiveBlending,
  BufferGeometry,
  ClampToEdgeWrapping,
  ConeGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NoColorSpace,
  PointLight,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  type Texture,
} from 'three';
import type { ThrusterOutput } from '@void-frontier/simulation';
import kestrelAtlas from '../assets/kestrel/atlas.png';
import kestrelGlow from '../assets/kestrel/glow.png';
import kestrelOrm from '../assets/kestrel/orm.png';
import kestrelHull from '../assets/kestrel/hull.json';
import marauderAtlas from '../assets/marauder/atlas.png';
import marauderGlow from '../assets/marauder/glow.png';
import marauderOrm from '../assets/marauder/orm.png';
import marauderHull from '../assets/marauder/hull.json';
import bulwarkAtlas from '../assets/bulwark/atlas.png';
import bulwarkGlow from '../assets/bulwark/glow.png';
import bulwarkOrm from '../assets/bulwark/orm.png';
import bulwarkHull from '../assets/bulwark/hull.json';
import dreadmawAtlas from '../assets/dreadmaw/atlas.png';
import dreadmawGlow from '../assets/dreadmaw/glow.png';
import dreadmawOrm from '../assets/dreadmaw/orm.png';
import dreadmawHull from '../assets/dreadmaw/hull.json';
import { PALETTE } from './palette.ts';
import type { Emitter, ShipModel, ThrusterGroup } from './shipModel.ts';

/**
 * Authored hulls baked from the studio ship kit. Blockbench's nose (−Z) is
 * already turned to +X and the mesh is centred. `file.length` is that mesh's
 * length in its own units; the builder scales it to the ship's hull length.
 * Collision stays the circle in the ship data. Turrets stay facing forward.
 */

interface Surface {
  positions: number[];
  normals: number[];
  uvs: number[];
}

interface Nozzle {
  name: string;
  groups: string[];
  position: [number, number, number];
  direction: [number, number, number];
  radius: number;
  length: number;
}

interface HullFile {
  length: number;
  atlas: Surface;
  glow: Surface;
  nozzles: Nozzle[];
}

interface HullSource {
  file: HullFile;
  atlas: string;
  orm: string;
  glow: string;
}

const GROUPS: readonly ThrusterGroup[] = ['main', 'reverse', 'pushRight', 'pushLeft', 'ccw', 'cw'];

const HULLS: Record<string, HullSource> = {
  kestrel: { file: kestrelHull as HullFile, atlas: kestrelAtlas, orm: kestrelOrm, glow: kestrelGlow },
  marauder: { file: marauderHull as HullFile, atlas: marauderAtlas, orm: marauderOrm, glow: marauderGlow },
  bulwark: { file: bulwarkHull as HullFile, atlas: bulwarkAtlas, orm: bulwarkOrm, glow: bulwarkGlow },
  dreadmaw: { file: dreadmawHull as HullFile, atlas: dreadmawAtlas, orm: dreadmawOrm, glow: dreadmawGlow },
};

const geometryCache = new Map<string, { atlas: BufferGeometry; glow: BufferGeometry }>();
const textureCache = new Map<string, { atlas: Texture; orm: Texture; glow: Texture }>();

function surfaceGeometry(surface: Surface): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(surface.positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(surface.normals, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(surface.uvs, 2));
  return geometry;
}

function loadMap(url: string, color: boolean): Texture {
  const texture = new TextureLoader().load(url);
  texture.colorSpace = color ? SRGBColorSpace : NoColorSpace;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.anisotropy = 4;
  return texture;
}

function geometryFor(id: string, file: HullFile): { atlas: BufferGeometry; glow: BufferGeometry } {
  let cached = geometryCache.get(id);
  if (!cached) {
    cached = { atlas: surfaceGeometry(file.atlas), glow: surfaceGeometry(file.glow) };
    geometryCache.set(id, cached);
  }
  return cached;
}

function texturesFor(id: string, source: HullSource): { atlas: Texture; orm: Texture; glow: Texture } {
  let cached = textureCache.get(id);
  if (!cached) {
    cached = { atlas: loadMap(source.atlas, true), orm: loadMap(source.orm, false), glow: loadMap(source.glow, true) };
    textureCache.set(id, cached);
  }
  return cached;
}

interface Plume {
  mesh: Mesh;
  /** Cone length, in metres, at full throttle. */
  length: number;
  groups: ThrusterGroup[];
  core: boolean;
}

function plumeMesh(radius: number, color: number, direction: Vector3): Mesh {
  const geometry = new ConeGeometry(radius, 1, 12, 1, true);
  geometry.translate(0, 0.5, 0);
  const material = new MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.85,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  });
  const mesh = new Mesh(geometry, material);
  mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), direction);
  mesh.visible = false;
  return mesh;
}

function isGroup(value: string): value is ThrusterGroup {
  return (GROUPS as readonly string[]).includes(value);
}

/**
 * The authored picture for this hull, or null when the ship is still procedural.
 * `length` is the hull length in metres.
 */
export function buildAuthoredShip(id: string, length: number): ShipModel | null {
  const source = HULLS[id];
  if (!source) return null;
  const file = source.file;
  const scale = length / file.length;
  const root = new Group();
  const geometry = geometryFor(id, file);
  const maps = texturesFor(id, source);
  const hullMaterial = new MeshStandardMaterial({
    map: maps.atlas,
    roughnessMap: maps.orm,
    metalnessMap: maps.orm,
    roughness: 1,
    metalness: 1,
  });
  const glowMaterial = new MeshStandardMaterial({
    color: 0x000000,
    emissive: 0xffffff,
    emissiveMap: maps.glow,
    emissiveIntensity: 2.4,
    roughness: 1,
    metalness: 0,
  });
  const picture = new Group();
  picture.scale.setScalar(scale);
  const hullMesh = new Mesh(geometry.atlas.clone(), hullMaterial);
  hullMesh.castShadow = true;
  hullMesh.receiveShadow = true;
  const glowMesh = new Mesh(geometry.glow.clone(), glowMaterial);
  picture.add(hullMesh, glowMesh);
  root.add(picture);

  const plumes: Plume[] = [];
  const emitters: Emitter[] = [];
  const addPlume = (nozzle: Nozzle, groups: ThrusterGroup[], radius: number, plumeLength: number, color: number, core: boolean) => {
    const direction = new Vector3(...nozzle.direction).normalize();
    const mesh = plumeMesh(radius * scale, color, direction);
    mesh.position.set(nozzle.position[0] * scale, nozzle.position[1] * scale, nozzle.position[2] * scale);
    root.add(mesh);
    plumes.push({ mesh, length: plumeLength * scale, groups, core });
    if (!core) {
      for (const group of groups) emitters.push({ group, position: mesh.position.clone(), direction });
    }
  };

  const mainAnchor = new Vector3();
  let mains = 0;
  for (const nozzle of file.nozzles) {
    const groups = nozzle.groups.filter(isGroup);
    const main = groups.includes('main') && nozzle.name.startsWith('exhaust');
    addPlume(nozzle, groups, nozzle.radius, nozzle.length, PALETTE.enginePlume, false);
    if (main) {
      addPlume(nozzle, groups, nozzle.radius * 0.45, nozzle.length * 0.45, PALETTE.engineCore, true);
      mainAnchor.add(new Vector3(...nozzle.position));
      mains += 1;
    }
  }
  // Sit the light in the plume, aft of the bells, so the hull does not swallow it.
  const engineLight = new PointLight(PALETTE.enginePlume, 0, length * 8, 2);
  if (mains > 0) {
    mainAnchor.multiplyScalar(scale / mains);
    engineLight.position.copy(mainAnchor).addScaledVector(new Vector3(-1, 0, 0), length * 0.18);
  }
  root.add(engineLight);

  const throttleOf = (groups: ThrusterGroup[], output: ThrusterOutput): number => {
    let level = 0;
    for (const group of groups) {
      const value = group === 'main' ? output.main * (output.boosting ? 1.5 : 1)
        : group === 'reverse' ? output.reverse
          : group === 'pushRight' ? Math.max(0, output.lateral)
            : group === 'pushLeft' ? Math.max(0, -output.lateral)
              : group === 'ccw' ? Math.max(0, output.rotation)
                : Math.max(0, -output.rotation);
      if (value > level) level = value;
    }
    return level;
  };

  return {
    root,
    length,
    emitters,
    update(output, time) {
      const flicker = 0.9 + 0.1 * Math.sin(time * 61) * Math.sin(time * 23);
      const boosting = output.boosting && output.main > 0.02;
      for (const plume of plumes) {
        const level = throttleOf(plume.groups, output);
        const on = level > 0.02;
        plume.mesh.visible = on;
        if (!on) continue;
        plume.mesh.scale.set(1, plume.length * level * flicker, 1);
        if (!plume.core && plume.groups.includes('main')) {
          (plume.mesh.material as MeshBasicMaterial).color.setHex(boosting ? PALETTE.boostPlume : PALETTE.enginePlume);
        }
      }
      engineLight.intensity = output.main * (boosting ? 170 : 110) * flicker;
      engineLight.color.setHex(boosting ? PALETTE.boostPlume : PALETTE.enginePlume);
    },
    dispose() {
      root.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
      });
    },
  };
}
