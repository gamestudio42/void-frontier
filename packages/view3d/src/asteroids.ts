import type { AsteroidType } from '@void-frontier/content';
import type { EntityId, World } from '@void-frontier/simulation';
import {
  BufferAttribute,
  Color,
  DynamicDrawUsage,
  Euler,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Scene,
} from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Noise3, visualRng } from './noise.ts';

const VARIANTS = 6;
/** Rocks smaller than this (metres) use the low-detail mesh; most of a field is small rocks. */
const DETAIL_RADIUS = 9;

/**
 * A unit-radius rock: noise-displaced icosphere with craters, coloured with mineral veins.
 * Smooth normals over merged vertices keep it rocky but not faceted.
 */
export function buildRockGeometry(type: AsteroidType, variant: number, detail = 4): BufferGeometry {
  const seed = hashString(type.id) * 31 + variant * 7919;
  const noise = new Noise3(seed);
  const veinNoise = new Noise3(seed + 1);
  const rand = visualRng(seed);
  const craters = Array.from({ length: 5 + Math.floor(rand() * 5) }, () => {
    const dir = new Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize();
    return { dir, size: 0.18 + rand() * 0.32, depth: 0.05 + rand() * 0.09 };
  });
  // Mild squash only: the collider is a circle, so silhouettes must stay close to round.
  const squash = new Vector3(0.88 + rand() * 0.24, 0.75 + rand() * 0.3, 0.88 + rand() * 0.24);

  const geometry = mergeVertices(new IcosahedronGeometry(1, detail));
  const position = geometry.getAttribute('position') as BufferAttribute;
  const colors = new Float32Array(position.count * 3);
  const base = new Color(type.look.base);
  const vein = new Color(type.look.vein);
  const dark = base.clone().multiplyScalar(0.45);
  const v = new Vector3();
  const tmp = new Color();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i).normalize();
    let radius = 1 + noise.fbm(v.x * 1.6, v.y * 1.6, v.z * 1.6, 5) * 0.24;
    // Ridged high-frequency detail: sharp edges and chipped facets at close range.
    radius -= Math.abs(noise.sample(v.x * 6.5 + 11, v.y * 6.5, v.z * 6.5)) * 0.07;
    let craterShade = 0;
    for (const crater of craters) {
      const d = 1 - v.dot(crater.dir);
      const t = d / crater.size;
      if (t < 1) {
        // Bowl with a raised rim.
        radius -= crater.depth * (1 - t * t) * 1.2;
        craterShade = Math.max(craterShade, 1 - t);
      } else if (t < 1.35) {
        radius += crater.depth * 0.35 * (1 - (t - 1) / 0.35);
      }
    }
    v.multiplyScalar(radius).multiply(squash);
    position.setXYZ(i, v.x, v.y, v.z);

    const grain = 0.78 + noise.sample(v.x * 7, v.y * 7, v.z * 7) * 0.22;
    tmp.copy(base).multiplyScalar(grain).lerp(dark, craterShade * 0.6);
    // Thin mineral veins, strongest where the rock is exposed (outside craters).
    const band = Math.abs(veinNoise.fbm(v.x * 3.1, v.y * 3.1, v.z * 3.1, 4));
    if (band < 0.035) tmp.lerp(vein, (1 - band / 0.035) * 0.75 * (1 - craterShade * 0.6));
    colors.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

interface Slot {
  mesh: InstancedMesh;
  index: number;
  tilt: Quaternion;
  lift: number;
}

/** All rocks of a type and shape share one instanced mesh: a few draw calls for the whole field. */
export class AsteroidRenderer {
  private readonly slots = new Map<EntityId, Slot>();
  private readonly meshes: InstancedMesh[] = [];
  private readonly matrix = new Matrix4();
  private readonly spin = new Quaternion();
  private readonly rotation = new Quaternion();
  private readonly position = new Vector3();
  private readonly scaleVector = new Vector3();
  private readonly up = new Vector3(0, 1, 0);

  constructor(scene: Scene, world: World) {
    const groups = new Map<string, EntityId[]>();
    for (const [id, asteroid] of world.asteroids) {
      const key = `${asteroid.type.id}:${asteroid.look % VARIANTS}:${asteroid.radius >= DETAIL_RADIUS ? 4 : 3}`;
      const list = groups.get(key);
      if (list) list.push(id);
      else groups.set(key, [id]);
    }
    const materials = new Map<string, MeshStandardMaterial>();
    for (const [key, ids] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const asteroid = world.asteroids.get(ids[0])!;
      const type = asteroid.type;
      let material = materials.get(type.id);
      if (!material) {
        material = new MeshStandardMaterial({ vertexColors: true, roughness: type.look.roughness, metalness: type.look.metalness });
        materials.set(type.id, material);
      }
      const [, variant, detail] = key.split(':').map(Number);
      const mesh = new InstancedMesh(buildRockGeometry(type, variant, detail), material, ids.length);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // Instances move across the sector; skip per-mesh culling against a stale bound.
      mesh.frustumCulled = false;
      ids.forEach((id, index) => {
        const rock = world.asteroids.get(id)!;
        const rand = visualRng(rock.look);
        const tilt = new Quaternion().setFromEuler(new Euler(rand() * Math.PI * 2, rand() * Math.PI * 2, rand() * Math.PI * 2));
        const shade = 0.85 + rand() * 0.3;
        mesh.setColorAt(index, new Color(shade, shade, shade));
        this.slots.set(id, { mesh, index, tilt, lift: (rand() - 0.5) * Math.min(14, rock.radius) });
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      scene.add(mesh);
      this.meshes.push(mesh);
    }
  }

  update(world: World, alpha: number): void {
    for (const [id, slot] of this.slots) {
      const body = world.bodies.get(id);
      const rock = world.asteroids.get(id);
      if (!body || !rock) {
        // Mined out: collapse the instance and forget it.
        this.matrix.makeScale(0, 0, 0);
        slot.mesh.setMatrixAt(slot.index, this.matrix);
        this.slots.delete(id);
        continue;
      }
      const x = body.previousPosition.x + (body.position.x - body.previousPosition.x) * alpha;
      const y = body.previousPosition.y + (body.position.y - body.previousPosition.y) * alpha;
      // The sim spins rocks in the plane; around a tilted axis it reads as a tumble.
      let delta = body.angle - body.previousAngle;
      if (delta > Math.PI) delta -= Math.PI * 2;
      else if (delta < -Math.PI) delta += Math.PI * 2;
      this.spin.setFromAxisAngle(this.up, body.previousAngle + delta * alpha);
      this.rotation.copy(this.spin).multiply(slot.tilt);
      this.position.set(x, slot.lift, -y);
      this.scaleVector.setScalar(rock.radius);
      this.matrix.compose(this.position, this.rotation, this.scaleVector);
      slot.mesh.setMatrixAt(slot.index, this.matrix);
    }
    for (const mesh of this.meshes) mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    for (const mesh of this.meshes) {
      mesh.geometry.dispose();
      (mesh.material as MeshStandardMaterial).dispose();
    }
  }
}
