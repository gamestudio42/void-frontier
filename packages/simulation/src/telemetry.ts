import { atan2, length, toDegrees, worldToLocal } from '@void-frontier/kernel';
import { forwardOf, holdMass, holdVolume, shipMass } from './ship.ts';
import { leadPoint, muzzlePosition } from './combat.ts';
import type { EntityId, FlightMode, ThrusterOutput } from './types.ts';
import type { World } from './world.ts';

export interface FlightTelemetry {
  /** m/s */
  speed: number;
  /** Compass degrees, 0 = up (+Y), clockwise, in [0, 360). */
  heading: number;
  /** Compass direction of travel, or null when stopped. */
  course: number | null;
  /** Signed angle from heading to course in degrees, + when sliding to the right. */
  drift: number | null;
  /** deg/s, + clockwise on the compass */
  turnRate: number;
  fuel: number;
  fuelCapacity: number;
  hull: number;
  hullMax: number;
  shield: number;
  shieldMax: number;
  energy: number;
  energyMax: number;
  weapons: { id: string; group: 'primary' | 'secondary' | 'mining'; kind: 'projectile' | 'beam' | 'mining'; heat: number; overheated: boolean }[];
  kills: number;
  /** Hold contents and capacity. */
  hold: { resource: string; units: number }[];
  holdMass: number;
  holdVolume: number;
  holdMaxMass: number;
  holdMaxVolume: number;
  /** Seconds until the scanner can pulse again. */
  scanCooldown: number;
  /** The rock under the mining laser, if any. */
  miningTarget: { asteroidType: string; resource: string; ore: number; oreMax: number } | null;
  destroyed: boolean;
  docked: boolean;
  credits: number;
  upgrades: string[];
  /** kg */
  mass: number;
  cargoMass: number;
  /** m/s^2 the main engine gives at the current mass, without boost */
  mainAcceleration: number;
  /** Metres needed to stop with the brake at the current orientation. */
  stoppingDistance: number;
  mode: FlightMode;
  output: ThrusterOutput;
  position: { x: number; y: number };
}

/** Compass bearing in degrees for a sim angle (counter-clockwise from +X). */
export function compassFromAngle(angle: number): number {
  const degrees = 90 - toDegrees(angle);
  return ((degrees % 360) + 360) % 360;
}

export function readTelemetry(world: World, id: EntityId): FlightTelemetry | null {
  const ship = world.ships.get(id);
  const body = world.bodies.get(id);
  if (!ship || !body) return null;
  const movement = ship.definition.movement;
  // Current mass, even between steps (after a trade or an upgrade while docked).
  const mass = shipMass(ship);
  const speed = length(body.velocity);
  const heading = compassFromAngle(body.angle);
  const moving = speed > 0.05;
  const course = moving ? compassFromAngle(atan2(body.velocity.y, body.velocity.x)) : null;
  let drift: number | null = null;
  if (course !== null) {
    drift = ((course - heading + 540) % 360) - 180;
  }

  // Each local axis brakes independently with its own thrusters: d = v^2 / (2a) per axis.
  const local = worldToLocal(forwardOf(body.angle), body.velocity);
  const forwardBrake = (local.x > 0 ? movement.reverseThrust : movement.mainThrust) / mass;
  const lateralBrake = movement.lateralThrust / mass;
  const dx = (local.x * local.x) / (2 * forwardBrake);
  const dy = (local.y * local.y) / (2 * lateralBrake);

  return {
    speed,
    heading,
    course,
    drift,
    turnRate: -toDegrees(body.angularVelocity),
    fuel: ship.fuel,
    fuelCapacity: ship.definition.fuel.capacity,
    hull: ship.hull,
    hullMax: ship.definition.hull.integrity,
    shield: ship.shield,
    shieldMax: ship.definition.shield.capacity,
    energy: ship.energy,
    energyMax: ship.definition.reactor.capacity,
    weapons: ship.weapons.map((w) => ({
      id: w.definition.id,
      group: w.hardpoint.group,
      kind: w.definition.kind,
      heat: w.heat / w.definition.maxHeat,
      overheated: w.overheated,
    })),
    kills: ship.kills,
    hold: [...ship.cargo.entries()].filter(([, units]) => units > 0).map(([resource, units]) => ({ resource, units })),
    holdMass: ship.cargoMass + holdMass(ship),
    holdVolume: holdVolume(ship),
    holdMaxMass: ship.definition.cargo.maxMass,
    holdMaxVolume: ship.definition.cargo.maxVolume,
    scanCooldown: Math.max(0, (ship.scanReadyTick - world.tick) / 60),
    miningTarget: (() => {
      const beam = ship.weapons.find((w) => w.definition.kind === 'mining')?.beam;
      const rock = beam?.hit !== null && beam?.hit !== undefined ? world.asteroids.get(beam.hit) : undefined;
      return rock ? { asteroidType: rock.type.id, resource: rock.type.resource, ore: rock.ore, oreMax: rock.oreMax } : null;
    })(),
    destroyed: ship.destroyed,
    docked: ship.docked !== null,
    credits: world.credits,
    upgrades: [...ship.upgrades],
    mass,
    cargoMass: ship.cargoMass,
    mainAcceleration: movement.mainThrust / mass,
    stoppingDistance: Math.sqrt(dx * dx + dy * dy),
    mode: ship.mode,
    output: { ...ship.output },
    position: { x: body.position.x, y: body.position.y },
  };
}

export interface TargetInfo {
  id: EntityId;
  shipId: string;
  faction: string;
  position: { x: number; y: number };
  distance: number;
  /** m/s, positive when closing */
  closingSpeed: number;
  shield: number;
  shieldMax: number;
  hull: number;
  hullMax: number;
  /** Where to aim the primary guns, if they can reach it. */
  lead: { x: number; y: number } | null;
}

export function readTarget(world: World, viewer: EntityId, target: EntityId | null): TargetInfo | null {
  if (target === null) return null;
  const ship = world.ships.get(target);
  const body = world.bodies.get(target);
  const me = world.bodies.get(viewer);
  const myShip = world.ships.get(viewer);
  if (!ship || !body || !me || !myShip || ship.destroyed) return null;
  const dx = body.position.x - me.position.x;
  const dy = body.position.y - me.position.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const rvx = me.velocity.x - body.velocity.x;
  const rvy = me.velocity.y - body.velocity.y;
  const gun = myShip.weapons.find((w) => w.definition.kind === 'projectile');
  let lead: { x: number; y: number } | null = null;
  if (gun && gun.definition.kind === 'projectile') {
    const solution = leadPoint(muzzlePosition(me, gun), me.velocity, body.position, body.velocity, gun.definition.projectileSpeed, gun.definition.velocityInheritance);
    if (solution && solution.time <= gun.definition.projectileLifetime) lead = solution.point;
  }
  return {
    id: target,
    shipId: ship.definition.id,
    faction: ship.faction,
    position: { ...body.position },
    distance,
    closingSpeed: distance > 1e-6 ? (rvx * dx + rvy * dy) / distance : 0,
    shield: ship.shield,
    shieldMax: ship.definition.shield.capacity,
    hull: ship.hull,
    hullMax: ship.definition.hull.integrity,
    lead,
  };
}
