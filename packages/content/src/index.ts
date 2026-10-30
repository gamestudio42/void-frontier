import { z } from 'zod';
import asteroidData from '../data/asteroids.json';
import campaignData from '../data/campaign.json';
import contractData from '../data/contracts.json';
import crewData from '../data/crew.json';
import eventData from '../data/events.json';
import factionData from '../data/factions.json';
import traderData from '../data/traders.json';
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
  campaignSchema,
  crewRulesSchema,
  eventRulesSchema,
  factionSchema,
  traderRouteSchema,
  resourceSchema,
  sectorDefinitionSchema,
  shipDefinitionSchema,
  stationDefinitionSchema,
  upgradeSchema,
  weaponDefinitionSchema,
  type AsteroidType,
  type CollisionRules,
  type ContractRules,
  type CampaignDefinition,
  type CrewRules,
  type EventRules,
  type FactionDefinition,
  type TraderRoute,
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
export const TRADER_ROUTES: readonly TraderRoute[] = z.array(traderRouteSchema).parse(traderData);
export const EVENT_RULES: EventRules = eventRulesSchema.parse(eventData);
export const CREW_RULES: CrewRules = crewRulesSchema.parse(crewData);
export const CAMPAIGN: CampaignDefinition = campaignSchema.parse(campaignData);
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
  for (const offer of station.shipyard) {
    if (getShip(offer.ship).price <= 0) throw new Error(`Station ${station.id} sells ${offer.ship}, which has no price`);
    if (offer.requires) getFaction(offer.requires.faction);
  }
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

/** Every station placement in every sector, by its key (the sector's station id). */
export const STATION_PLACEMENTS: ReadonlyMap<string, { sector: string; definition: string; x: number; y: number; angle: number }> = new Map(
  [...SECTORS.values()].flatMap((sector) => sector.stations.map((s) => [s.id, { sector: sector.id, definition: s.definition, x: s.x, y: s.y, angle: s.angle }] as const)),
);

for (const route of TRADER_ROUTES) {
  getShip(route.ship);
  getFaction(route.allegiance);
  getResource(route.cargo);
  for (const key of [route.from, route.to]) if (!STATION_PLACEMENTS.has(key)) throw new Error(`Trader route ${route.id} names unknown station ${key}`);
}
for (const event of EVENT_RULES.events) {
  if (event.station && !STATION_PLACEMENTS.has(event.station)) throw new Error(`Event ${event.id} names unknown station ${event.station}`);
  if (event.sector) getSector(event.sector);
  if (event.resource) getResource(event.resource);
}
for (const { id, objective, reward } of CAMPAIGN.steps) {
  getFaction(reward.faction);
  if (objective.kind === 'discover' && !getSector(objective.sector).pointsOfInterest.some((p) => p.id === objective.poi)) throw new Error(`Campaign step ${id} names unknown point ${objective.poi}`);
  if (objective.kind === 'deliver') {
    getResource(objective.resource);
    if (!STATION_PLACEMENTS.has(objective.station)) throw new Error(`Campaign step ${id} names unknown station ${objective.station}`);
  }
  if (objective.kind === 'boss') {
    getShip(objective.ship);
    getSector(objective.sector);
  }
}
for (const site of CREW_RULES.sites) {
  const field = getSector(site.sector).asteroidFields.find((f) => f.id === site.field);
  if (!field) throw new Error(`Mining site ${site.id} names unknown field ${site.field}`);
  const station = STATION_PLACEMENTS.get(site.station);
  if (!station) throw new Error(`Mining site ${site.id} names unknown station ${site.station}`);
  const buys = getStation(station.definition).market.filter((m) => m.buys).map((m) => m.resource);
  for (const type of Object.keys(field.types)) {
    if (!buys.includes(getAsteroidType(type).resource)) throw new Error(`Mining site ${site.id}: ${site.station} does not buy ${type} ore`);
  }
}
for (const station of STATIONS.values()) for (const r of [...Object.keys(station.economy.produces), ...Object.keys(station.economy.consumes)]) getResource(r);
