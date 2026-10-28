import { Rng } from '@void-frontier/kernel';
import type { SpatialIndex } from './spatial.ts';
import type { AiPilot, Asteroid, Body, Collider, EncounterState, EntityId, Pickup, Projectile, Ship, SimEvent, Station } from './types.ts';

/**
 * Minimal entity store: components live in maps keyed by entity id. Maps iterate in
 * insertion order, so systems visit entities in a stable, deterministic order.
 */
export class World {
  tick = 0;
  private nextId = 1;
  readonly bodies = new Map<EntityId, Body>();
  readonly ships = new Map<EntityId, Ship>();
  readonly colliders = new Map<EntityId, Collider>();
  readonly asteroids = new Map<EntityId, Asteroid>();
  readonly stations = new Map<EntityId, Station>();
  readonly projectiles = new Map<EntityId, Projectile>();
  readonly pilots = new Map<EntityId, AiPilot>();
  readonly pickups = new Map<EntityId, Pickup>();
  /** Asteroids revealed by a scanner pulse, with the tick the reading expires. */
  readonly scanned = new Map<EntityId, number>();
  readonly encounters: EncounterState[] = [];
  /** Broad-phase index of colliders, rebuilt by the collision system every step. */
  spatial: SpatialIndex | null = null;
  /** Gameplay randomness (weapon spread, AI choices); seeded so runs replay exactly. */
  rng = new Rng(1);
  /** Things that happened this step; the owner drains them (sparks, sounds, HUD). */
  readonly events: SimEvent[] = [];
  /** Fixed navigation markers: position only, no physics. */
  readonly beacons = new Map<EntityId, { name: string; position: { x: number; y: number } }>();

  createEntity(): EntityId {
    return this.nextId++;
  }

  destroyEntity(id: EntityId): void {
    this.bodies.delete(id);
    this.ships.delete(id);
    this.colliders.delete(id);
    this.asteroids.delete(id);
    this.stations.delete(id);
    this.projectiles.delete(id);
    this.pilots.delete(id);
    this.pickups.delete(id);
    this.scanned.delete(id);
    this.beacons.delete(id);
  }

  get entityCount(): number {
    const ids = new Set<EntityId>([...this.bodies.keys(), ...this.beacons.keys()]);
    return ids.size;
  }
}
