import { getResource } from '@void-frontier/content';
import type { EntityId, World } from '@void-frontier/simulation';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Euler,
  IcosahedronGeometry,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
  type Scene,
} from 'three';

const MAX_PICKUPS = 900;
const MAX_TRACTOR_LINES = 64;

/** Floating ore and salvage: small glowing chunks tinted by resource, plus the tractor's pull lines. */
export class PickupRenderer {
  private readonly mesh: InstancedMesh;
  private readonly tractor: LineSegments;
  private readonly tractorPositions: Float32Array;
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly euler = new Euler();
  private readonly scale = new Vector3();
  private readonly colors = new Map<string, Color>();

  constructor(scene: Scene) {
    const geometry = new IcosahedronGeometry(1, 0);
    this.mesh = new InstancedMesh(geometry, new MeshBasicMaterial({ color: 0xffffff }), MAX_PICKUPS);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.setColorAt(0, new Color(1, 1, 1));
    scene.add(this.mesh);

    this.tractorPositions = new Float32Array(MAX_TRACTOR_LINES * 6);
    const lineGeometry = new BufferGeometry();
    const attribute = new BufferAttribute(this.tractorPositions, 3);
    attribute.setUsage(DynamicDrawUsage);
    lineGeometry.setAttribute('position', attribute);
    this.tractor = new LineSegments(
      lineGeometry,
      new LineBasicMaterial({ color: new Color(0.35, 0.9, 1.4), transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false }),
    );
    this.tractor.frustumCulled = false;
    scene.add(this.tractor);
  }

  private color(resource: string): Color {
    let c = this.colors.get(resource);
    if (!c) {
      // Over-bright so bloom gives the chunks a glow.
      c = new Color(getResource(resource).color).multiplyScalar(1.8);
      this.colors.set(resource, c);
    }
    return c;
  }

  update(world: World, playerId: EntityId, time: number): void {
    let i = 0;
    for (const [id, pickup] of world.pickups) {
      if (i >= MAX_PICKUPS) break;
      this.position.set(pickup.position.x, 0.5 + Math.sin(time * 1.3 + id) * 0.4, -pickup.position.y);
      this.euler.set(time * 0.9 + id, time * 1.3 + id * 0.7, 0);
      this.rotation.setFromEuler(this.euler);
      this.scale.setScalar(0.7 + Math.sqrt(pickup.units) * 0.25);
      this.matrix.compose(this.position, this.rotation, this.scale);
      this.mesh.setMatrixAt(i, this.matrix);
      this.mesh.setColorAt(i, this.color(pickup.resource));
      i++;
    }
    this.mesh.count = i;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

    // Tractor lines from the player's ship to chunks it is pulling in.
    let lines = 0;
    const ship = world.ships.get(playerId);
    const body = world.bodies.get(playerId);
    if (ship && body && !ship.destroyed && ship.definition.tractor.range > 0) {
      const range = ship.definition.tractor.range;
      for (const pickup of world.pickups.values()) {
        if (lines >= MAX_TRACTOR_LINES) break;
        if (world.tick < pickup.freeAfterTick) continue;
        const dx = pickup.position.x - body.position.x;
        const dy = pickup.position.y - body.position.y;
        if (dx * dx + dy * dy > range * range) continue;
        this.tractorPositions.set([body.position.x, 0.5, -body.position.y, pickup.position.x, 0.5, -pickup.position.y], lines * 6);
        lines++;
      }
    }
    this.tractor.geometry.setDrawRange(0, lines * 2);
    (this.tractor.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    (this.tractor.material as LineBasicMaterial).opacity = 0.35 + Math.sin(time * 12) * 0.15;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
    this.tractor.geometry.dispose();
    (this.tractor.material as LineBasicMaterial).dispose();
  }
}
