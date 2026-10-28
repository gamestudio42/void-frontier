import type { AsteroidType, ShipDefinition, StationDefinition } from '@void-frontier/content';
import type { Vec2 } from '@void-frontier/kernel';

export type EntityId = number;

export type FlightMode = 'newtonian' | 'assisted';

/** Rigid body on the movement plane. Angle is counter-clockwise from +X, in radians. */
export interface Body {
  position: Vec2;
  velocity: Vec2;
  angle: number;
  angularVelocity: number;
  /** kg, refreshed every step from the ship's dry, equipment, cargo and fuel mass */
  mass: number;
  /** kg*m^2 */
  inertia: number;
  /** Accumulated this step, in world axes; cleared by integration. */
  force: Vec2;
  torque: number;
  /** State before the last step, for render interpolation. */
  previousPosition: Vec2;
  previousAngle: number;
}

/** What the pilot (player or AI) asks for this step. Values are normalised to [-1, 1]. */
export interface ShipCommand {
  /** +1 main engine, -1 reverse thrusters */
  thrust: number;
  /** +1 pushes to the ship's right */
  strafe: number;
  /** +1 turns counter-clockwise (left) */
  turn: number;
  /** World point the nose should face, or null for no steering target. */
  aim: Vec2 | null;
  /** Use every thruster to stop moving and turning. */
  brake: boolean;
  boost: boolean;
}

/** Throttle actually applied to each thruster group after fuel limits, for physics and visuals. */
export interface ThrusterOutput {
  /** 0..1, already including boost */
  main: number;
  /** 0..1 */
  reverse: number;
  /** -1..1, + pushes right */
  lateral: number;
  /** -1..1, + counter-clockwise */
  rotation: number;
  boosting: boolean;
}

export interface Ship {
  definition: ShipDefinition;
  mode: FlightMode;
  /** Hull integrity points; the ship is destroyed at 0. */
  hull: number;
  destroyed: boolean;
  /** kg remaining */
  fuel: number;
  /** kg */
  cargoMass: number;
  /** kg */
  equipmentMass: number;
  command: ShipCommand;
  output: ThrusterOutput;
}

export const idleCommand = (): ShipCommand => ({ thrust: 0, strafe: 0, turn: 0, aim: null, brake: false, boost: false });
export const idleOutput = (): ThrusterOutput => ({ main: 0, reverse: 0, lateral: 0, rotation: 0, boosting: false });

/** Collision shape: circles in body-local axes (x along the body's angle). */
export interface Collider {
  circles: { x: number; y: number; r: number }[];
  /** Radius of a circle around the body centre that contains every shape. */
  bound: number;
}

export interface Asteroid {
  type: AsteroidType;
  radius: number;
  /** Stable per-rock value the renderer uses to pick a shape and tilt. */
  look: number;
}

export interface Station {
  definition: StationDefinition;
  name: string;
}

export type SimEvent =
  | {
      type: 'collision';
      a: EntityId;
      b: EntityId;
      point: { x: number; y: number };
      normal: { x: number; y: number };
      /** closing speed along the contact normal, m/s */
      speed: number;
      /** hull points removed from ships in the pair */
      damage: number;
    }
  | { type: 'shipDestroyed'; id: EntityId; position: { x: number; y: number } };
