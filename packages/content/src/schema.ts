import { z } from 'zod';

const positive = z.number().positive();

export const shipDefinitionSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  /** Credits at a shipyard; 0 for ships that are never sold. */
  price: z.number().min(0),
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
    /** metres: how far a scanner pulse reads rock composition */
    scanRange: positive,
    /** seconds between pulses */
    scanCooldown: positive,
  }),
  tractor: z.object({
    /** metres: ore within this range is pulled in; 0 = no tractor */
    range: z.number().min(0),
    /** metres: ore this close goes into the hold */
    collectRadius: positive,
  }),
  /** Equipment slots by kind. */
  slots: z.object({ engine: z.number().int().min(0), utility: z.number().int().min(0), defense: z.number().int().min(0) }),
  hardpoints: z.array(
    z.object({
      id: z.string(),
      /** ship-local metres, x forward, y right */
      x: z.number(),
      y: z.number(),
      weapon: z.string(),
      group: z.enum(['primary', 'secondary', 'mining']),
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
    kind: z.literal('mining'),
    /** ore units per second at the optimal range */
    extractionRate: positive,
    range: positive,
    /** metres: full efficiency up to here, falling to 25% at max range */
    optimalRange: positive,
    /** light damage when pointed at a ship */
    damagePerSecond: z.number().min(0),
    gimbal: z.number().min(0).max(45),
    heatPerSecond: z.number().min(0),
    maxHeat: positive,
    coolingRate: positive,
    energyPerSecond: z.number().min(0),
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
  /** ore units per square metre of cross-section: a 10 m rock of 0.5 holds about 157 units */
  oreUnitsPerSquareMetre: positive,
  look: z.object({ base: hexColor, vein: hexColor, metalness: z.number().min(0).max(1), roughness: z.number().min(0).max(1) }),
});

export type AsteroidType = z.infer<typeof asteroidTypeSchema>;

export const resourceSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  /** kg per unit */
  unitMass: positive,
  /** m^3 per unit */
  unitVolume: positive,
  /** credits per unit at a neutral market (used from the economy milestone) */
  basePrice: positive,
  color: hexColor,
});

export type ResourceDefinition = z.infer<typeof resourceSchema>;

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
  /** Owning faction id; hostile factions refuse docking. */
  faction: z.string(),
  modules: z.array(stationModuleSchema).min(1),
  docking: z.object({
    /** metres from the bay centre */
    maxDistance: positive,
    /** m/s relative to the station */
    maxRelativeSpeed: positive,
    /** degrees between the nose and the bay axis */
    maxAngle: positive,
    /** metres: docking is refused while a hostile is this close */
    hostileClearance: z.number().min(0),
  }),
  services: z.object({
    /** credits per hull point */
    repairPerHull: positive,
    /** credits per kg of fuel */
    fuelPerKg: positive,
  }),
  market: z.array(
    z.object({
      resource: z.string(),
      stock: z.number().int().min(0),
      /** the stock the market drifts back to; prices rise when stock is below it */
      baseStock: z.number().int().positive(),
      /** the station buys this from pilots */
      buys: z.boolean(),
      /** the station sells this to pilots */
      sells: z.boolean(),
    }),
  ),
  upgrades: z.array(z.string()),
  /** Hulls this station sells, some only to pilots in good standing. */
  shipyard: z.array(z.object({ ship: z.string(), requires: z.object({ faction: z.string(), reputation: z.number() }).optional() })),
  /** Units per minute the station makes and uses, whether or not the player is there. */
  economy: z.object({ produces: z.record(z.string(), z.number().min(0)), consumes: z.record(z.string(), z.number().min(0)) }),
});

export const traderRouteSchema = z.object({
  id: z.string(),
  /** Lawful faction the hauler flies for. */
  allegiance: z.string(),
  ship: z.string(),
  /** Station keys (sector station ids). */
  from: z.string(),
  to: z.string(),
  cargo: z.string(),
  units: z.number().int().positive(),
  /** Seconds docked between runs. */
  interval: positive,
  /** m/s cruising speed (used off-screen and as the AI's target speed). */
  speed: positive,
});

export type TraderRoute = z.infer<typeof traderRouteSchema>;

export const economyEventSchema = z.object({
  id: z.string(),
  kind: z.enum(['shortage', 'surplus', 'raid', 'boom']),
  station: z.string().optional(),
  sector: z.string().optional(),
  resource: z.string().optional(),
  /** consumption (shortage), production (surplus), price (boom) or raid-risk multiplier */
  factor: positive,
  /** seconds */
  duration: positive,
});

export type EconomyEventDefinition = z.infer<typeof economyEventSchema>;

export const eventRulesSchema = z.object({
  minInterval: positive,
  maxInterval: positive,
  maxActive: z.number().int().min(1),
  /** Chance per sector crossed that an unescorted hauler off-screen is lost to pirates. */
  sectorRisk: z.record(z.string(), z.number().min(0).max(1)),
  events: z.array(economyEventSchema),
});

export type EventRules = z.infer<typeof eventRulesSchema>;

/** Pilots for hire and how the ships they fly for the player perform. */
export const crewRulesSchema = z.object({
  /** Seconds between wage payments. */
  cycleSeconds: positive,
  maxPilots: z.number().int().min(1),
  /** Hiring fee, in cycles of the pilot's wage. */
  hireCycles: z.number().min(0),
  /** Wage per cycle: base plus this much per skill point. */
  wage: z.object({ base: positive, perSkill: z.number().min(0) }),
  /** Share of every sale a pilot keeps on top of the wage. */
  commission: z.number().min(0).max(1),
  offersPerStation: z.number().int().min(1),
  /** Seconds before a station's pilots for hire change. */
  refreshSeconds: positive,
  /** m/s a fleet ship cruises at with an average pilot. */
  cruiseSpeed: positive,
  /** Cruise speed gained per piloting point above 3. */
  speedPerPiloting: z.number().min(0),
  /** Off-screen loss risk shed per piloting or combat point above 1 (as a share). */
  riskPerPiloting: z.number().min(0).max(0.2),
  /** Fleet ships are lost off-screen at this fraction of a hauler's risk (they travel light and armed). */
  fleetRisk: z.number().min(0).max(1),
  /** Seconds a fleet ship spends docked to load or unload. */
  turnaroundSeconds: positive,
  /** Share of the laser's rate a pilot achieves off-screen, plus this much per mining point. */
  miningShare: positive,
  miningPerSkill: z.number().min(0),
  maxWorkSeconds: positive,
  /** Credits a trading pilot leaves in the player's account. */
  tradeReserve: z.number().min(0),
  /** A trading pilot loads a unit only if it sells at the destination for this multiple of its cost. */
  tradeMargin: z.number().min(1),
  /** Completed trips per skill point gained. */
  tripsPerSkill: z.number().int().min(1),
  names: z.array(z.string()).min(4),
  /** Asteroid fields pilots can be sent to, each with the station that buys what it yields. */
  sites: z.array(z.object({ id: z.string(), sector: z.string(), field: z.string(), station: z.string() })),
});

export type CrewRules = z.infer<typeof crewRulesSchema>;

/** The story: steps taken in order, each one objective and one reward. */
export const campaignSchema = z.object({
  steps: z.array(
    z.object({
      id: z.string(),
      objective: z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('discover'), poi: z.string(), sector: z.string() }),
        z.object({ kind: z.literal('kill'), count: z.number().int().positive() }),
        z.object({ kind: z.literal('deliver'), resource: z.string(), units: z.number().int().positive(), station: z.string() }),
        z.object({ kind: z.literal('boss'), ship: z.string(), sector: z.string(), x: z.number(), y: z.number() }),
      ]),
      reward: z.object({ credits: z.number().min(0), faction: z.string(), reputation: z.number() }),
    }),
  ).min(1),
});

export type CampaignDefinition = z.infer<typeof campaignSchema>;
export type CampaignStep = CampaignDefinition['steps'][number];

export const upgradeSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  /** Which kind of slot the module occupies. */
  slot: z.enum(['engine', 'utility', 'defense']),
  cost: positive,
  /** Sold only to pilots in good standing with a faction. */
  requires: z.object({ faction: z.string(), reputation: z.number() }).optional(),
  /** kg the upgrade adds to the ship */
  equipmentMass: z.number().min(0),
  effects: z.object({
    thrustMultiplier: z.number().min(1).optional(),
    hullBonus: z.number().min(0).optional(),
    armorBonus: z.number().min(0).max(0.5).optional(),
    cargoMassBonus: z.number().min(0).optional(),
    cargoVolumeBonus: z.number().min(0).optional(),
    shieldBonus: z.number().min(0).optional(),
    shieldRechargeBonus: z.number().min(0).optional(),
    /** added to the boost multiplier */
    boostBonus: z.number().min(0).optional(),
    scanRangeBonus: z.number().min(0).optional(),
    sensorRangeBonus: z.number().min(0).optional(),
    tractorMultiplier: z.number().min(1).optional(),
    /** degrees added to every gun's gimbal */
    gimbalBonus: z.number().min(0).optional(),
    /** subsystem health restored per second in flight (0.012 = 1.2%/s) */
    repairRate: z.number().min(0).optional(),
  }),
});

export const factionSchema = z.object({
  id: z.string(),
  hostile: z.boolean(),
  color: hexColor,
  /** Stations of this faction refuse docking at or below this reputation. */
  dockingThreshold: z.number(),
  /** Reputation gained per pirate destroyed. */
  killReward: z.number().min(0),
});

export type FactionDefinition = z.infer<typeof factionSchema>;

export type UpgradeDefinition = z.infer<typeof upgradeSchema>;

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

export const gateSchema = z.object({
  id: z.string(),
  /** destination sector id and the gate you arrive at */
  to: z.string(),
  toGate: z.string(),
  x: z.number(),
  y: z.number(),
});

export const anomalySchema = z.object({
  id: z.string(),
  kind: z.literal('gravity'),
  x: z.number(),
  y: z.number(),
  /** metres: no pull beyond this */
  radius: positive,
  /** m^3/s^2: acceleration = strength / distance^2 */
  strength: positive,
  /** metres: the pull stops growing inside this radius */
  coreRadius: positive,
});

export const pointOfInterestSchema = z.object({
  id: z.string(),
  kind: z.enum(['derelict', 'deposit', 'cache']),
  x: z.number(),
  y: z.number(),
  /** paid once, when first discovered */
  reward: z.object({ credits: z.number().min(0), resource: z.string(), units: z.number().int().min(0) }),
});

export type GateDefinition = z.infer<typeof gateSchema>;
export type AnomalyDefinition = z.infer<typeof anomalySchema>;
export type PointOfInterest = z.infer<typeof pointOfInterestSchema>;

export const sectorDefinitionSchema = z.object({
  id: z.string(),
  /** i18n key suffix for the sector name */
  name: z.string(),
  /** position on the sector map, in map units */
  mapPosition: z.object({ x: z.number(), y: z.number() }),
  environment: z.object({
    nebulaSeed: z.number().int(),
    planet: z.object({ hue: z.number().min(0).max(1), x: z.number(), y: z.number(), z: z.number(), radius: positive }),
  }),
  gates: z.array(gateSchema),
  anomalies: z.array(anomalySchema),
  pointsOfInterest: z.array(pointOfInterestSchema),
  seed: z.number().int(),
  playerShip: z.string(),
  playerStart: z.object({ x: z.number(), y: z.number(), heading: z.number() }),
  stations: z.array(z.object({ id: z.string(), definition: z.string(), x: z.number(), y: z.number(), angle: z.number() })),
  asteroidFields: z.array(asteroidFieldSchema),
  /** circles kept free of asteroids (station approaches, spawn point) */
  clearZones: z.array(z.object({ x: z.number(), y: z.number(), radius: positive })),
  beacons: z.array(z.object({ id: z.string(), x: z.number(), y: z.number() })),
  encounters: z.array(encounterSchema),
  /** Faction that holds the sector, or null for open space. */
  controllingFaction: z.string().nullable(),
  /** Delivery destinations: a beacon plus a risk multiplier on the reward. */
  dropPoints: z.array(z.object({ id: z.string(), beacon: z.string(), risk: z.number().min(1) })),
  /** The player begins docked at the first station. */
  startDocked: z.boolean(),
  startingCredits: z.number().int().min(0),
});

export type SectorDefinition = z.infer<typeof sectorDefinitionSchema>;

export const contractRulesSchema = z.object({
  maxActive: z.number().int().min(1),
  offerSlots: z.number().int().min(1),
  /** seconds between board refreshes */
  refreshSeconds: positive,
  reputation: z.object({
    min: z.number(),
    max: z.number(),
    /** reward bonus per reputation point (0.005 = +0.5%) */
    rewardPerPoint: z.number().min(0),
    /** reputation that unlocks larger, better-paid contracts */
    eliteThreshold: z.number(),
  }),
  delivery: z.object({
    cargo: z.string(),
    minUnits: z.number().int().min(1),
    maxUnits: z.number().int().min(1),
    baseReward: positive,
    rewardPerMetre: positive,
    rewardPerUnit: positive,
    /** metres from the drop point */
    dropRadius: positive,
    /** m/s: the drop needs a near stop */
    maxDropSpeed: positive,
    secondsPerKm: positive,
    minSeconds: positive,
    repGain: positive,
  }),
  mining: z.object({
    minUnits: z.number().int().min(1),
    maxUnits: z.number().int().min(1),
    /** reward = units x resource base price x this */
    priceMultiplier: positive,
    seconds: positive,
    repGain: positive,
    resources: z.record(z.string(), z.number().min(0)),
  }),
  bounty: z.object({
    minCount: z.number().int().min(1),
    maxCount: z.number().int().min(1),
    rewardPerKill: positive,
    seconds: positive,
    repGain: positive,
  }),
  elite: z.object({ unitsMultiplier: z.number().min(1), rewardMultiplier: z.number().min(1) }),
  penalty: z.object({ failed: z.number().min(0), abandoned: z.number().min(0) }),
  escort: z.object({
    baseReward: positive,
    rewardPerHop: positive,
    repGain: positive,
    /** metres: stay this close to the hauler when it arrives */
    range: positive,
  }),
});

export type ContractRules = z.infer<typeof contractRulesSchema>;
