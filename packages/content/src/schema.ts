import { z } from 'zod';

const positive = z.number().positive();

export const shipDefinitionSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  class: z.enum(['scout', 'interceptor', 'fighter', 'miner', 'hauler', 'frigate', 'salvager']),
  hull: z.object({
    integrity: positive,
    /** kg */
    dryMass: positive,
    /** metres, nose to tail; the renderer scales the model to it */
    length: positive,
    /** metres */
    collisionRadius: positive,
    /** fraction of weapon damage that armour stops after shields are down, 0..0.9 */
    armor: z.number().min(0).max(0.9),
  }),
  movement: z.object({
    /** newtons */
    mainThrust: positive,
    reverseThrust: positive,
    /** newtons per side */
    lateralThrust: positive,
    /** newton-metres */
    rotationalTorque: positive,
    /** metres; moment of inertia = total mass * gyrationRadius^2, so cargo slows turning too */
    gyrationRadius: positive,
    /** rad/s; the rotation thrusters stop pushing past it, it is not a hard clamp */
    maxAngularVelocity: positive,
    boostMultiplier: z.number().min(1),
    boostFuelMultiplier: z.number().min(1),
  }),
  fuel: z.object({
    /** kg; fuel mass counts toward the ship's mass */
    capacity: positive,
    /** kg of fuel burned per mega-newton-second of thrust */
    consumptionPerMegaNewtonSecond: positive,
  }),
  cargo: z.object({
    /** kg */
    maxMass: positive,
    /** m^3 */
    maxVolume: positive,
  }),
  shield: z.object({
    capacity: z.number().min(0),
    /** points per second once recharging */
    rechargeRate: z.number().min(0),
    /** seconds without taking damage before the shield recharges */
    rechargeDelay: z.number().min(0),
  }),
  reactor: z.object({
    /** stored energy units */
    capacity: z.number().min(0),
    /** units per second */
    rechargeRate: z.number().min(0),
  }),
  sensors: z.object({
    /** metres: how far this ship notices others */
    range: positive,
  }),
  hardpoints: z.array(
    z.object({
      id: z.string(),
      /** ship-local metres, x forward, y right */
      x: z.number(),
      y: z.number(),
      weapon: z.string(),
      group: z.enum(['primary', 'secondary']),
    }),
  ),
});

export type ShipDefinition = z.infer<typeof shipDefinitionSchema>;
export type ShipClass = ShipDefinition['class'];

const damageMultipliers = z.object({ shield: positive, hull: positive });

export const weaponDefinitionSchema = z.discriminatedUnion('kind', [
  z.object({
    id: z.string(),
    kind: z.literal('projectile'),
    damage: positive,
    /** shots per second */
    fireRate: positive,
    /** m/s relative to the gun */
    projectileSpeed: positive,
    /** seconds */
    projectileLifetime: positive,
    /** 0..1: how much of the ship's velocity the round keeps */
    velocityInheritance: z.number().min(0).max(1),
    /** radians of random spread per shot */
    spread: z.number().min(0),
    /** degrees the gun can swivel off the nose */
    gimbal: z.number().min(0).max(45),
    heatPerShot: z.number().min(0),
    maxHeat: positive,
    /** heat per second */
    coolingRate: positive,
    energyPerShot: z.number().min(0),
    multipliers: damageMultipliers,
  }),
  z.object({
    id: z.string(),
    kind: z.literal('beam'),
    damagePerSecond: positive,
    /** metres */
    range: positive,
    gimbal: z.number().min(0).max(45),
    heatPerSecond: z.number().min(0),
    maxHeat: positive,
    coolingRate: positive,
    energyPerSecond: z.number().min(0),
    multipliers: damageMultipliers,
  }),
]);

export type WeaponDefinition = z.infer<typeof weaponDefinitionSchema>;

export const encounterSchema = z.object({
  id: z.string(),
  ship: z.string(),
  faction: z.enum(['pirate']),
  count: z.number().int().min(1),
  spawn: z.object({ x: z.number(), y: z.number() }),
  /** waypoints the group cycles through while no target is in sensor range */
  patrol: z.array(z.tuple([z.number(), z.number()])).min(1),
  /** seconds after the whole group is destroyed before it returns */
  respawnDelay: positive,
});

export type EncounterDefinition = z.infer<typeof encounterSchema>;

const point = z.object({ x: z.number(), y: z.number() });
const pair = z.tuple([z.number(), z.number()]);
const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i);

export const asteroidTypeSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  /** resource id mined from this rock (mining arrives in a later milestone) */
  resource: z.string(),
  /** kg/m^3 */
  density: positive,
  durabilityPerSquareMetre: positive,
  look: z.object({ base: hexColor, vein: hexColor, metalness: z.number().min(0).max(1), roughness: z.number().min(0).max(1) }),
});

export type AsteroidType = z.infer<typeof asteroidTypeSchema>;

/** Station layout in metres, station-local (x forward, y left). The renderer and the colliders both read it. */
export const stationModuleSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('core'), x: z.number(), y: z.number(), r: positive }),
  z.object({ kind: z.literal('ring'), r: positive, thickness: positive }),
  z.object({ kind: z.literal('truss'), from: pair, to: pair, width: positive }),
  z.object({ kind: z.literal('panel'), from: pair, to: pair, width: positive }),
  z.object({ kind: z.literal('tank'), x: z.number(), y: z.number(), r: positive }),
  z.object({ kind: z.literal('dock'), x: z.number(), y: z.number(), angle: z.number(), width: positive, depth: positive }),
]);

export type StationModule = z.infer<typeof stationModuleSchema>;

export const stationDefinitionSchema = z.object({
  id: z.string(),
  modules: z.array(stationModuleSchema).min(1),
});

export type StationDefinition = z.infer<typeof stationDefinitionSchema>;

export const collisionRulesSchema = z.object({
  /** 0 = no bounce, 1 = perfectly elastic */
  restitution: z.number().min(0).max(1),
  /** Coulomb friction coefficient for glancing hits */
  friction: z.number().min(0),
  /** m/s of closing speed absorbed without hull damage */
  safeImpactSpeed: z.number().min(0),
  /** hull points per kJ of impact energy above the safe speed */
  hullDamagePerKilojoule: z.number().min(0),
});

export type CollisionRules = z.infer<typeof collisionRulesSchema>;

export const asteroidFieldSchema = z.object({
  id: z.string(),
  center: point,
  radius: positive,
  count: z.number().int().min(0),
  minRadius: positive,
  maxRadius: positive,
  /** m/s */
  maxDrift: z.number().min(0),
  /** relative weights per asteroid type id */
  types: z.record(z.string(), z.number().min(0)),
});

export type AsteroidFieldDefinition = z.infer<typeof asteroidFieldSchema>;

export const sectorDefinitionSchema = z.object({
  id: z.string(),
  seed: z.number().int(),
  playerShip: z.string(),
  playerStart: z.object({ x: z.number(), y: z.number(), heading: z.number() }),
  stations: z.array(z.object({ id: z.string(), definition: z.string(), x: z.number(), y: z.number(), angle: z.number() })),
  asteroidFields: z.array(asteroidFieldSchema),
  /** circles kept free of asteroids (station approaches, spawn point) */
  clearZones: z.array(z.object({ x: z.number(), y: z.number(), radius: positive })),
  beacons: z.array(z.object({ id: z.string(), x: z.number(), y: z.number() })),
  encounters: z.array(encounterSchema),
});

export type SectorDefinition = z.infer<typeof sectorDefinitionSchema>;
