import type { AsteroidType, EncounterDefinition, ShipDefinition, StationDefinition, WeaponDefinition } from '@void-frontier/content';
import type { Vec2 } from '@void-frontier/kernel';

export type EntityId = number;

export type FlightMode = 'newtonian' | 'assisted';

export type Faction = 'player' | 'pirate';

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
  /** Primary weapon group (guns) and secondary group (laser). */
  firePrimary: boolean;
  fireSecondary: boolean;
  /** Selected target: guns swivel toward its lead point when it is inside their gimbal. */
  target: EntityId | null;
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

export interface WeaponMount {
  hardpoint: ShipDefinition['hardpoints'][number];
  definition: WeaponDefinition;
  /** seconds until the next shot */
  cooldown: number;
  heat: number;
  /** Locked out after reaching max heat until it cools to 30%. */
  overheated: boolean;
  /** Current beam segment while a beam weapon fires, for hits and visuals. */
  beam: { from: { x: number; y: number }; to: { x: number; y: number }; hit: EntityId | null } | null;
}

export interface Ship {
  definition: ShipDefinition;
  faction: Faction;
  mode: FlightMode;
  shield: number;
  energy: number;
  /** Tick of the last weapon damage; shields recharge after the definition's delay. */
  lastDamageTick: number;
  weapons: WeaponMount[];
  kills: number;
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

export const idleCommand = (): ShipCommand => ({
  thrust: 0,
  strafe: 0,
  turn: 0,
  aim: null,
  brake: false,
  boost: false,
  firePrimary: false,
  fireSecondary: false,
  target: null,
});
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
  | { type: 'shipDestroyed'; id: EntityId; position: { x: number; y: number }; by: EntityId | null }
  | { type: 'shot'; owner: EntityId; position: { x: number; y: number }; direction: { x: number; y: number } }
  | {
      type: 'hit';
      target: EntityId;
      attacker: EntityId;
      point: { x: number; y: number };
      /** damage after multipliers, split by layer */
      shieldDamage: number;
      hullDamage: number;
      beam: boolean;
    };

export interface Projectile {
  owner: EntityId;
  position: { x: number; y: number };
  velocity: { x: number; y: number };
  /** seconds left */
  life: number;
  damage: number;
  multipliers: { shield: number; hull: number };
}

export type AiMode = 'patrol' | 'engage' | 'retreat';

export interface AiPilot {
  mode: AiMode;
  patrol: { x: number; y: number }[];
  waypoint: number;
  target: EntityId | null;
  /** Tick until which the current retreat lasts. */
  retreatUntil: number;
  /** +1 or -1: which way this pilot circles a target. */
  orbit: number;
}

export interface EncounterState {
  definition: EncounterDefinition;
  members: EntityId[];
  /** Tick at which a destroyed group returns, or null while any member lives. */
  respawnAt: number | null;
}
