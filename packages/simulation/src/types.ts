import type { FleetNote } from './fleet.ts';
import type { AsteroidType, EncounterDefinition, ShipDefinition, StationDefinition, WeaponDefinition } from '@void-frontier/content';
import type { Vec2 } from '@void-frontier/kernel';

export type EntityId = number;

export type FlightMode = 'newtonian' | 'assisted';

export type Faction = 'player' | 'pirate' | 'trader';

/** Pirates fight everyone else; players and traders are on the same side. */
export const isHostile = (a: Faction, b: Faction): boolean => (a === 'pirate') !== (b === 'pirate');

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
  /** Mining laser group. */
  fireMining: boolean;
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
  /** 0..1; a mount at 0 cannot fire. */
  health: number;
  /** Current beam segment while a beam weapon fires, for hits and visuals. */
  beam: { from: { x: number; y: number }; to: { x: number; y: number }; hit: EntityId | null } | null;
}

export type SubsystemId = 'engines' | 'reactor' | 'sensors' | 'shieldGenerator' | 'cargoHold';
export const SUBSYSTEMS: SubsystemId[] = ['engines', 'reactor', 'sensors', 'shieldGenerator', 'cargoHold'];

export interface Ship {
  /** Health of each internal system, 0..1. */
  subsystems: Record<SubsystemId, number>;
  /** Effective stats: the base definition with installed upgrades applied. */
  definition: ShipDefinition;
  baseDefinition: ShipDefinition;
  upgrades: string[];
  /** Station the ship is docked at, or null in flight. */
  docked: EntityId | null;
  faction: Faction;
  /** Lawful faction a trader flies for (reputation reacts to who protects it). */
  allegiance: string | null;
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
  /** kg of ballast or unspecified cargo (tests, future missions) */
  cargoMass: number;
  /** Units of each resource in the hold. */
  cargo: Map<string, number>;
  /** Tick from which the scanner can pulse again. */
  scanReadyTick: number;
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
  fireMining: false,
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
  /** Current radius; rocks shrink as they are mined. */
  radius: number;
  /** Radius when the rock was generated. */
  baseRadius: number;
  /** Ore units left and at the start. */
  ore: number;
  oreMax: number;
  /** Extracted but not yet ejected as a chunk. */
  pendingOre: number;
  /** Stable per-rock value the renderer uses to pick a shape and tilt. */
  look: number;
}

export interface MarketItem {
  resource: string;
  /** Price multiplier from economy events (a mining boom), 1 when nothing is happening. */
  priceFactor?: number;
  /** Units in stock; fractional while it drifts back toward the base stock. */
  stock: number;
  baseStock: number;
  buys: boolean;
  sells: boolean;
}

export interface Station {
  definition: StationDefinition;
  name: string;
  market: MarketItem[];
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
  | { type: 'contract'; id: number; kind: 'delivery' | 'mining' | 'bounty' | 'escort'; outcome: 'completed' | 'failed' | 'abandoned'; reward: number }
  | { type: 'news'; item: NewsItem }
  | { type: 'fleet'; note: FleetNote }
  | { type: 'subsystemDamaged'; ship: EntityId; system: SubsystemId | 'weapon'; health: number }
  | { type: 'discovered'; id: string; kind: 'derelict' | 'deposit' | 'cache'; credits: number }
  | { type: 'docked'; ship: EntityId; station: EntityId }
  | { type: 'undocked'; ship: EntityId; station: EntityId }
  | { type: 'scan'; owner: EntityId; position: { x: number; y: number }; range: number; found: number }
  | { type: 'asteroidDepleted'; id: EntityId; position: { x: number; y: number }; radius: number; asteroidType: string }
  | { type: 'collected'; ship: EntityId; resource: string; units: number }
  | { type: 'cargoFull'; ship: EntityId }
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
  /** Haulers fly to a point instead of hunting; they never pick fights. */
  travel?: { to: { x: number; y: number }; speed: number };
  patrol: { x: number; y: number }[];
  waypoint: number;
  target: EntityId | null;
  /** Tick until which the current retreat lasts. */
  retreatUntil: number;
  /** +1 or -1: which way this pilot circles a target. */
  orbit: number;
  /** Owned-ship id when this is one of the player's fleet. */
  fleet?: number;
  /** A fleet miner at work: cut rocks near the site and let the tractor gather the ore. */
  mine?: { site: { x: number; y: number }; rock: EntityId | null };
  /** A wingman: hold formation on the leader, fight what threatens it. */
  escort?: { leader: EntityId; slot: number };
}

export interface EncounterState {
  definition: EncounterDefinition;
  members: EntityId[];
  /** Tick at which a destroyed group returns, or null while any member lives. */
  respawnAt: number | null;
}

/** Floating ore or salvage that a tractor can pull into a hold. */
export interface Pickup {
  resource: string;
  units: number;
  position: { x: number; y: number };
  velocity: { x: number; y: number };
  /** seconds left before it drifts away for good */
  life: number;
  /** Tick before which tractors ignore it (just jettisoned). */
  freeAfterTick: number;
}

export interface NewsItem {
  tick: number;
  kind: 'eventStarted' | 'eventEnded' | 'traderDeparted' | 'traderArrived' | 'traderLost' | 'traderDefended';
  /** Event id, or trader route id. */
  subject: string;
  station?: string;
  sector?: string;
  resource?: string;
}
