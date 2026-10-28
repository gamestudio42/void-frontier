import type { Body, EntityId, Ship } from './types.ts';

/**
 * Minimal entity store: components live in maps keyed by entity id. Maps iterate in
 * insertion order, so systems visit entities in a stable, deterministic order.
 */
export class World {
  tick = 0;
  private nextId = 1;
  readonly bodies = new Map<EntityId, Body>();
  readonly ships = new Map<EntityId, Ship>();
  /** Fixed navigation markers: position only, no physics. */
  readonly beacons = new Map<EntityId, { name: string; position: { x: number; y: number } }>();

  createEntity(): EntityId {
    return this.nextId++;
  }

  destroyEntity(id: EntityId): void {
    this.bodies.delete(id);
    this.ships.delete(id);
    this.beacons.delete(id);
  }

  get entityCount(): number {
    const ids = new Set<EntityId>([...this.bodies.keys(), ...this.ships.keys(), ...this.beacons.keys()]);
    return ids.size;
  }
}
