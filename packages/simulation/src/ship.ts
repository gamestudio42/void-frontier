import { getWeapon, type ShipDefinition } from '@void-frontier/content';
import { cos, sin, type Vec2 } from '@void-frontier/kernel';
import { idleCommand, idleOutput, type Body, type Collider, type EntityId, type Faction, type FlightMode, type Ship } from './types.ts';
import type { World } from './world.ts';

export interface SpawnShipOptions {
  position?: Vec2;
  /** radians, counter-clockwise from +X */
  angle?: number;
  velocity?: Vec2;
  mode?: FlightMode;
  fuel?: number;
  cargoMass?: number;
  faction?: Faction;
}

export function shipMass(ship: Ship): number {
  return ship.definition.hull.dryMass + ship.equipmentMass + ship.cargoMass + ship.fuel;
}

export function shipInertia(ship: Ship, mass = shipMass(ship)): number {
  const r = ship.definition.movement.gyrationRadius;
  return mass * r * r;
}

export function spawnShip(world: World, definition: ShipDefinition, options: SpawnShipOptions = {}): EntityId {
  const id = world.createEntity();
  const ship: Ship = {
    definition,
    faction: options.faction ?? 'player',
    mode: options.mode ?? 'newtonian',
    shield: definition.shield.capacity,
    energy: definition.reactor.capacity,
    lastDamageTick: -1e9,
    weapons: definition.hardpoints.map((hardpoint) => ({
      hardpoint,
      definition: getWeapon(hardpoint.weapon),
      cooldown: 0,
      heat: 0,
      overheated: false,
      beam: null,
    })),
    kills: 0,
    hull: definition.hull.integrity,
    destroyed: false,
    fuel: options.fuel ?? definition.fuel.capacity,
    cargoMass: options.cargoMass ?? 0,
    equipmentMass: 0,
    command: idleCommand(),
    output: idleOutput(),
  };
  const position = options.position ?? { x: 0, y: 0 };
  const angle = options.angle ?? 0;
  const mass = shipMass(ship);
  const body: Body = {
    position: { ...position },
    velocity: { ...(options.velocity ?? { x: 0, y: 0 }) },
    angle,
    angularVelocity: 0,
    mass,
    inertia: shipInertia(ship, mass),
    force: { x: 0, y: 0 },
    torque: 0,
    previousPosition: { ...position },
    previousAngle: angle,
  };
  world.ships.set(id, ship);
  world.bodies.set(id, body);
  world.colliders.set(id, shipCollider(definition));
  return id;
}

/** Three circles along the hull: close to the silhouette without a polygon solver. */
export function shipCollider(definition: ShipDefinition): Collider {
  const r = definition.hull.collisionRadius * 0.5;
  const offset = definition.hull.length * 0.3;
  return { circles: [-offset, 0, offset].map((x) => ({ x, y: 0, r })), bound: offset + r };
}

export const forwardOf = (angle: number): Vec2 => ({ x: cos(angle), y: sin(angle) });
