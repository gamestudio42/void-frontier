import { atan2, length, toDegrees, worldToLocal } from '@void-frontier/kernel';
import { forwardOf } from './ship.ts';
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
  destroyed: boolean;
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
  const forwardBrake = (local.x > 0 ? movement.reverseThrust : movement.mainThrust) / body.mass;
  const lateralBrake = movement.lateralThrust / body.mass;
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
    destroyed: ship.destroyed,
    mass: body.mass,
    cargoMass: ship.cargoMass,
    mainAcceleration: movement.mainThrust / body.mass,
    stoppingDistance: Math.sqrt(dx * dx + dy * dy),
    mode: ship.mode,
    output: { ...ship.output },
    position: { x: body.position.x, y: body.position.y },
  };
}
