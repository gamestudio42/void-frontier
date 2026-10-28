import type { ShipDefinition } from '@void-frontier/content';
import { cos, sin, type Vec2 } from '@void-frontier/kernel';
import { idleCommand, idleOutput, type Body, type EntityId, type FlightMode, type Ship } from './types.ts';
import type { World } from './world.ts';

export interface SpawnShipOptions {
  position?: Vec2;
  /** radians, counter-clockwise from +X */
  angle?: number;
  velocity?: Vec2;
  mode?: FlightMode;
  fuel?: number;
  cargoMass?: number;
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
    mode: options.mode ?? 'newtonian',
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
  return id;
}

export const forwardOf = (angle: number): Vec2 => ({ x: cos(angle), y: sin(angle) });
