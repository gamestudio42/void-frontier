import { getResource, getWeapon, type ShipDefinition } from '@void-frontier/content';
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

/** kg of resources in the hold. */
export function holdMass(ship: Ship): number {
  let kg = 0;
  for (const [resource, units] of ship.cargo) kg += units * getResource(resource).unitMass;
  return kg;
}

/** m^3 of resources in the hold. */
export function holdVolume(ship: Ship): number {
  let m3 = 0;
  for (const [resource, units] of ship.cargo) m3 += units * getResource(resource).unitVolume;
  return m3;
}

/** Whole units of `resource` the hold can still take, limited by mass and by volume. */
export function holdSpaceFor(ship: Ship, resource: string): number {
  const def = getResource(resource);
  const massLeft = ship.definition.cargo.maxMass - ship.cargoMass - holdMass(ship);
  const volumeLeft = ship.definition.cargo.maxVolume - holdVolume(ship);
  return Math.max(0, Math.floor(Math.min(massLeft / def.unitMass, volumeLeft / def.unitVolume) + 1e-9));
}

export function shipMass(ship: Ship): number {
  return ship.definition.hull.dryMass + ship.equipmentMass + ship.cargoMass + holdMass(ship) + ship.fuel;
}

export function shipInertia(ship: Ship, mass = shipMass(ship)): number {
  const r = ship.definition.movement.gyrationRadius;
  return mass * r * r;
}

export function spawnShip(world: World, definition: ShipDefinition, options: SpawnShipOptions = {}): EntityId {
  const id = world.createEntity();
  const ship: Ship = {
    definition,
    baseDefinition: definition,
    upgrades: [],
    docked: null,
    faction: options.faction ?? 'player',
    subsystems: { engines: 1, reactor: 1, sensors: 1, shieldGenerator: 1, cargoHold: 1 },
    mode: options.mode ?? 'newtonian',
    shield: definition.shield.capacity,
    energy: definition.reactor.capacity,
    lastDamageTick: -1e9,
    weapons: definition.hardpoints.map((hardpoint) => ({
      hardpoint,
      definition: getWeapon(hardpoint.weapon),
      cooldown: 0,
      health: 1,
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
    cargo: new Map(),
    scanReadyTick: 0,
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

/** Thrust left with damaged engines: never below 35%, so a crippled ship can still limp home. */
export const engineFactor = (ship: Ship): number => 0.35 + 0.65 * ship.subsystems.engines;

/** Sensor reach with damaged sensors. */
export const sensorRange = (ship: Ship): number => ship.definition.sensors.range * (0.3 + 0.7 * ship.subsystems.sensors);

/** Shield capacity the generator can hold. */
export const shieldCapacity = (ship: Ship): number => ship.definition.shield.capacity * ship.subsystems.shieldGenerator;
