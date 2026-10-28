import { z } from 'zod';
import asteroidData from '../data/asteroids.json';
import outpostAlphaData from '../data/outpost-alpha.json';
import physicsData from '../data/physics.json';
import resourceData from '../data/resources.json';
import shipData from '../data/ships.json';
import stationData from '../data/stations.json';
import weaponData from '../data/weapons.json';
import {
  asteroidTypeSchema,
  collisionRulesSchema,
  resourceSchema,
  sectorDefinitionSchema,
  shipDefinitionSchema,
  stationDefinitionSchema,
  weaponDefinitionSchema,
  type AsteroidType,
  type CollisionRules,
  type ResourceDefinition,
  type SectorDefinition,
  type ShipDefinition,
  type StationDefinition,
  type WeaponDefinition,
} from './schema.ts';

export * from './schema.ts';

const byId = <T extends { id: string }>(items: T[]): ReadonlyMap<string, T> => new Map(items.map((item) => [item.id, item]));

/** Every definition is validated when the module loads, so bad data fails fast in tests and at boot. */
export const SHIPS: ReadonlyMap<string, ShipDefinition> = byId(z.array(shipDefinitionSchema).parse(shipData));
export const ASTEROID_TYPES: ReadonlyMap<string, AsteroidType> = byId(z.array(asteroidTypeSchema).parse(asteroidData));
export const STATIONS: ReadonlyMap<string, StationDefinition> = byId(z.array(stationDefinitionSchema).parse(stationData));
export const RESOURCES: ReadonlyMap<string, ResourceDefinition> = byId(z.array(resourceSchema).parse(resourceData));
export const WEAPONS: ReadonlyMap<string, WeaponDefinition> = byId(z.array(weaponDefinitionSchema).parse(weaponData));
export const COLLISION_RULES: CollisionRules = collisionRulesSchema.parse(physicsData);
export const OUTPOST_ALPHA: SectorDefinition = sectorDefinitionSchema.parse(outpostAlphaData);

function lookup<T>(map: ReadonlyMap<string, T>, kind: string, id: string): T {
  const item = map.get(id);
  if (!item) throw new Error(`Unknown ${kind} definition: ${id}`);
  return item;
}

export const getShip = (id: string): ShipDefinition => lookup(SHIPS, 'ship', id);
export const getAsteroidType = (id: string): AsteroidType => lookup(ASTEROID_TYPES, 'asteroid type', id);
export const getStation = (id: string): StationDefinition => lookup(STATIONS, 'station', id);
export const getResource = (id: string): ResourceDefinition => lookup(RESOURCES, 'resource', id);
export const getWeapon = (id: string): WeaponDefinition => lookup(WEAPONS, 'weapon', id);

for (const ship of SHIPS.values()) for (const hardpoint of ship.hardpoints) getWeapon(hardpoint.weapon);
for (const type of ASTEROID_TYPES.values()) getResource(type.resource);

/** Cross-references the schemas cannot check: every id a sector names must exist. */
export function validateSector(sector: SectorDefinition): void {
  getShip(sector.playerShip);
  for (const station of sector.stations) getStation(station.definition);
  for (const field of sector.asteroidFields) {
    if (field.minRadius > field.maxRadius) throw new Error(`Field ${field.id}: minRadius > maxRadius`);
    for (const type of Object.keys(field.types)) getAsteroidType(type);
  }
  for (const encounter of sector.encounters) getShip(encounter.ship);
}

validateSector(OUTPOST_ALPHA);
