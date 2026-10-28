import { z } from 'zod';
import asteroidData from '../data/asteroids.json';
import contractData from '../data/contracts.json';
import factionData from '../data/factions.json';
import anomalyZoneData from '../data/anomaly-zone.json';
import industrialBeltData from '../data/industrial-belt.json';
import outpostAlphaData from '../data/outpost-alpha.json';
import pirateTerritoryData from '../data/pirate-territory.json';
import physicsData from '../data/physics.json';
import resourceData from '../data/resources.json';
import shipData from '../data/ships.json';
import stationData from '../data/stations.json';
import upgradeData from '../data/upgrades.json';
import weaponData from '../data/weapons.json';
import {
  asteroidTypeSchema,
  collisionRulesSchema,
  contractRulesSchema,
  factionSchema,
  resourceSchema,
  sectorDefinitionSchema,
  shipDefinitionSchema,
  stationDefinitionSchema,
  upgradeSchema,
  weaponDefinitionSchema,
  type AsteroidType,
  type CollisionRules,
  type ContractRules,
  type FactionDefinition,
  type ResourceDefinition,
  type SectorDefinition,
  type ShipDefinition,
  type StationDefinition,
  type UpgradeDefinition,
  type WeaponDefinition,
} from './schema.ts';

export * from './schema.ts';

const byId = <T extends { id: string }>(items: T[]): ReadonlyMap<string, T> => new Map(items.map((item) => [item.id, item]));

/** Every definition is validated when the module loads, so bad data fails fast in tests and at boot. */
export const SHIPS: ReadonlyMap<string, ShipDefinition> = byId(z.array(shipDefinitionSchema).parse(shipData));
export const ASTEROID_TYPES: ReadonlyMap<string, AsteroidType> = byId(z.array(asteroidTypeSchema).parse(asteroidData));
export const STATIONS: ReadonlyMap<string, StationDefinition> = byId(z.array(stationDefinitionSchema).parse(stationData));
export const RESOURCES: ReadonlyMap<string, ResourceDefinition> = byId(z.array(resourceSchema).parse(resourceData));
export const UPGRADES: ReadonlyMap<string, UpgradeDefinition> = byId(z.array(upgradeSchema).parse(upgradeData));
export const WEAPONS: ReadonlyMap<string, WeaponDefinition> = byId(z.array(weaponDefinitionSchema).parse(weaponData));
export const FACTIONS: ReadonlyMap<string, FactionDefinition> = byId(z.array(factionSchema).parse(factionData));
export const CONTRACT_RULES: ContractRules = contractRulesSchema.parse(contractData);
export const COLLISION_RULES: CollisionRules = collisionRulesSchema.parse(physicsData);
export const OUTPOST_ALPHA: SectorDefinition = sectorDefinitionSchema.parse(outpostAlphaData);

/** Every sector, keyed by id. Outpost Alpha is where a new game starts. */
export const SECTORS: ReadonlyMap<string, SectorDefinition> = byId(
  [outpostAlphaData, industrialBeltData, pirateTerritoryData, anomalyZoneData].map((data) => sectorDefinitionSchema.parse(data)),
);

export const getSector = (id: string): SectorDefinition => lookup(SECTORS, 'sector', id);

function lookup<T>(map: ReadonlyMap<string, T>, kind: string, id: string): T {
  const item = map.get(id);
  if (!item) throw new Error(`Unknown ${kind} definition: ${id}`);
  return item;
}

export const getShip = (id: string): ShipDefinition => lookup(SHIPS, 'ship', id);
export const getAsteroidType = (id: string): AsteroidType => lookup(ASTEROID_TYPES, 'asteroid type', id);
export const getStation = (id: string): StationDefinition => lookup(STATIONS, 'station', id);
export const getResource = (id: string): ResourceDefinition => lookup(RESOURCES, 'resource', id);
export const getFaction = (id: string): FactionDefinition => lookup(FACTIONS, 'faction', id);
export const getUpgrade = (id: string): UpgradeDefinition => lookup(UPGRADES, 'upgrade', id);
export const getWeapon = (id: string): WeaponDefinition => lookup(WEAPONS, 'weapon', id);

for (const ship of SHIPS.values()) for (const hardpoint of ship.hardpoints) getWeapon(hardpoint.weapon);
for (const type of ASTEROID_TYPES.values()) getResource(type.resource);
for (const upgrade of UPGRADES.values()) if (upgrade.requires) getFaction(upgrade.requires.faction);
for (const station of STATIONS.values()) {
  getFaction(station.faction);
  for (const item of station.market) getResource(item.resource);
  for (const upgrade of station.upgrades) getUpgrade(upgrade);
  if (!station.modules.some((m) => m.kind === 'dock')) throw new Error(`Station ${station.id} has no docking bay`);
}

/** Cross-references the schemas cannot check: every id a sector names must exist. */
export function validateSector(sector: SectorDefinition): void {
  getShip(sector.playerShip);
  for (const station of sector.stations) getStation(station.definition);
  for (const field of sector.asteroidFields) {
    if (field.minRadius > field.maxRadius) throw new Error(`Field ${field.id}: minRadius > maxRadius`);
    for (const type of Object.keys(field.types)) getAsteroidType(type);
  }
  for (const encounter of sector.encounters) getShip(encounter.ship);
  for (const poi of sector.pointsOfInterest) getResource(poi.reward.resource);
  if (sector.controllingFaction) getFaction(sector.controllingFaction);
  for (const drop of sector.dropPoints) {
    if (!sector.beacons.some((b) => b.id === drop.beacon)) throw new Error(`Drop point ${drop.id} names unknown beacon ${drop.beacon}`);
  }
}

for (const sector of SECTORS.values()) {
  validateSector(sector);
  // Gates come in pairs: the far end must exist and lead back here.
  for (const gate of sector.gates) {
    const far = getSector(gate.to).gates.find((g) => g.id === gate.toGate);
    if (!far || far.to !== sector.id || far.toGate !== gate.id) throw new Error(`Gate ${gate.id} has no matching gate ${gate.toGate} in ${gate.to}`);
  }
}
getResource(CONTRACT_RULES.delivery.cargo);
for (const resource of Object.keys(CONTRACT_RULES.mining.resources)) getResource(resource);
