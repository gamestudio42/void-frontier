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
import atlasUrl from '../assets/kestrel/atlas.png';
import glowUrl from '../assets/kestrel/glow.png';
import ormUrl from '../assets/kestrel/orm.png';
import hull from '../assets/kestrel/hull.json';
import { PALETTE } from './palette.ts';
import type { Emitter, ShipModel, ThrusterGroup } from './shipModel.ts';

/**
 * The Kestrel's picture. Geometry is baked from the studio interceptor:
 * Blockbench's nose (−Z) is already turned to +X, and the mesh is centred.
 * `hull.length` is that mesh's length in its own units; the builder scales it
 * to the ship's hull length. Collision stays the circle in the ship data.
 */

interface Surface {
  positions: number[];
  normals: number[];
  uvs: number[];
}

interface Nozzle {
  name: string;
  groups: ThrusterGroup[];
  position: [number, number, number];
  direction: [number, number, number];
  radius: number;
  length: number;
}

const GROUPS: readonly ThrusterGroup[] = ['main', 'reverse', 'pushRight', 'pushLeft', 'ccw', 'cw'];

const surfaces = hull as { length: number; atlas: Surface; glow: Surface; nozzles: Nozzle[] };

let geometryCache: { atlas: BufferGeometry; glow: BufferGeometry } | null = null;
let textureCache: { atlas: Texture; orm: Texture; glow: Texture } | null = null;

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

function sharedGeometry(): { atlas: BufferGeometry; glow: BufferGeometry } {
  geometryCache ??= { atlas: surfaceGeometry(surfaces.atlas), glow: surfaceGeometry(surfaces.glow) };
  return geometryCache;
}

function sharedTextures(): { atlas: Texture; orm: Texture; glow: Texture } {
  textureCache ??= { atlas: loadMap(atlasUrl, true), orm: loadMap(ormUrl, false), glow: loadMap(glowUrl, true) };
  return textureCache;
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

/** Textured scout. `length` is the hull length in metres; the mesh scales to it. */
export function buildAuthoredKestrel(length: number): ShipModel {
  const scale = length / surfaces.length;
  const root = new Group();
  const geometry = sharedGeometry();
  const maps = sharedTextures();
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
  const addPlume = (nozzle: Nozzle, radius: number, plumeLength: number, color: number, core: boolean) => {
    const direction = new Vector3(...nozzle.direction).normalize();
    const mesh = plumeMesh(radius * scale, color, direction);
    mesh.position.set(nozzle.position[0] * scale, nozzle.position[1] * scale, nozzle.position[2] * scale);
    root.add(mesh);
    plumes.push({ mesh, length: plumeLength * scale, groups: nozzle.groups, core });
    if (!core) {
      for (const group of nozzle.groups) emitters.push({ group, position: mesh.position.clone(), direction });
    }
  };

  let mainAnchor: Vector3 | null = null;
  for (const nozzle of surfaces.nozzles) {
    nozzle.groups = nozzle.groups.filter((group): group is ThrusterGroup => GROUPS.includes(group));
    const main = nozzle.groups.includes('main') && nozzle.name.startsWith('exhaust');
    addPlume(nozzle, nozzle.radius, nozzle.length, PALETTE.enginePlume, false);
    if (main) {
      addPlume(nozzle, nozzle.radius * 0.45, nozzle.length * 0.45, PALETTE.engineCore, true);
      const at = new Vector3(nozzle.position[0], nozzle.position[1], nozzle.position[2]);
      mainAnchor = mainAnchor ? mainAnchor.add(at) : at;
    }
  }
  // Sit the light in the plume, aft of the bells, so the hull does not swallow it.
  const engineLight = new PointLight(PALETTE.enginePlume, 0, length * 8, 2);
  if (mainAnchor) {
    mainAnchor.multiplyScalar(0.5 * scale);
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
