import { z } from 'zod';
import asteroidData from '../data/asteroids.json';
import campaignData from '../data/campaign.json';
import careerData from '../data/career.json';
import contractData from '../data/contracts.json';
import crewData from '../data/crew.json';
import cruiseData from '../data/cruise.json';
import directorData from '../data/director.json';
import eventData from '../data/events.json';
import factionData from '../data/factions.json';
import traderData from '../data/traders.json';
import tutorialData from '../data/tutorial.json';
import miningData from '../data/mining.json';
import pirateData from '../data/pirates.json';
import anomalyZoneData from '../data/anomaly-zone.json';
import emberReachData from '../data/ember-reach.json';
import graveyardData from '../data/graveyard.json';
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
  CARGO_MODIFIERS,
  careerRulesSchema,
  type CareerRules,
  directorRulesSchema,
  type DirectorRules,
  asteroidTypeSchema,
  collisionRulesSchema,
  contractRulesSchema,
  campaignSchema,
  crewRulesSchema,
  cruiseRulesSchema,
  tutorialRulesSchema,
  miningRulesSchema,
  pirateRulesSchema,
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
  type CruiseRules,
  type TutorialRules,
  type MiningRules,
  type PirateRules,
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
export const CAREER_RULES: CareerRules = careerRulesSchema.parse(careerData);
export const DIRECTOR_RULES: DirectorRules = directorRulesSchema.parse(directorData);
export const COLLISION_RULES: CollisionRules = collisionRulesSchema.parse(physicsData);
export const CRUISE_RULES: CruiseRules = cruiseRulesSchema.parse(cruiseData);
export const TUTORIAL_RULES: TutorialRules = tutorialRulesSchema.parse(tutorialData);
export const MINING_RULES: MiningRules = miningRulesSchema.parse(miningData);
export const PIRATE_RULES: PirateRules = pirateRulesSchema.parse(pirateData);
const ARCHETYPES = byId(PIRATE_RULES.archetypes);

/** A pirate archetype by id, or the hull's default, or the skirmisher. */
export function getArchetype(id: string | undefined, ship?: string): PirateRules['archetypes'][number] {
  return ARCHETYPES.get(id ?? '') ?? ARCHETYPES.get(PIRATE_RULES.shipArchetypes[ship ?? ''] ?? '') ?? ARCHETYPES.get('skirmisher')!;
}
export const OUTPOST_ALPHA: SectorDefinition = sectorDefinitionSchema.parse(outpostAlphaData);

/** Every sector, keyed by id. Outpost Alpha is where a new game starts. */
export const SECTORS: ReadonlyMap<string, SectorDefinition> = byId(
  [outpostAlphaData, industrialBeltData, pirateTerritoryData, anomalyZoneData, graveyardData, emberReachData].map((data) => sectorDefinitionSchema.parse(data)),
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
for (const client of CONTRACT_RULES.clients) {
  getFaction(client.faction);
  if (client.modifier && CARGO_MODIFIERS.includes(client.modifier) && client.kinds.some((k) => k !== 'delivery')) {
    throw new Error(`Client ${client.id}: a ${client.modifier} job must be a delivery`);
  }
}

/** The family a module belongs to and its rank in it (Mk I = 1). */
export const upgradeFamily = (id: string): string => getUpgrade(id).family ?? id;
export const upgradeTier = (id: string): number => getUpgrade(id).tier ?? 1;

/** The module one tier below `id` in its family, or null for a Mk I. */
export function previousTier(id: string): string | null {
  const family = upgradeFamily(id);
  const tier = upgradeTier(id);
  if (tier === 1) return null;
  for (const other of UPGRADES.values()) if (upgradeFamily(other.id) === family && upgradeTier(other.id) === tier - 1) return other.id;
  throw new Error(`Upgrade ${id} has no tier ${tier - 1} in family ${family}`);
}

// A family climbs one tier at a time, in one slot, with one kind of verb.
for (const upgrade of UPGRADES.values()) {
  const below = previousTier(upgrade.id);
  if (!below) continue;
  const lower = getUpgrade(below);
  if (lower.slot !== upgrade.slot) throw new Error(`Upgrade ${upgrade.id} changes slot from its lower tier`);
  if (lower.ability?.kind !== upgrade.ability?.kind) throw new Error(`Upgrade ${upgrade.id} changes verb from its lower tier`);
}
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
/** The trigger a weapon answers to: a mount only takes weapons of its own group. */
export const weaponGroup = (weapon: WeaponDefinition): 'primary' | 'secondary' | 'mining' => (weapon.kind === 'projectile' ? 'primary' : weapon.kind === 'mining' ? 'mining' : 'secondary');

for (const station of STATIONS.values()) for (const weapon of station.weapons) getWeapon(weapon);
for (const ship of SHIPS.values()) {
  for (const h of ship.hardpoints) {
    // Pirate frigates mix their guns freely; only player hulls are refittable.
    if (ship.price > 0 && weaponGroup(getWeapon(h.weapon)) !== h.group) throw new Error(`${ship.id}: ${h.weapon} does not fit the ${h.group} mount ${h.id}`);
  }
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
    if (objective.escort) getShip(objective.escort.ship);
    getSector(objective.sector);
  }
  if (objective.kind === 'choice') for (const option of objective.options) getFaction(option.faction);
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

{
  const { ranks, licences, investment } = CAREER_RULES;
  for (let i = 1; i < ranks.length; i++) {
    if (ranks[i].merit <= ranks[i - 1].merit) throw new Error(`Rank ${ranks[i].id} needs more merit than ${ranks[i - 1].id}`);
    if (ranks[i].activeBonus < ranks[i - 1].activeBonus || ranks[i].offerBonus < ranks[i - 1].offerBonus) throw new Error(`Rank ${ranks[i].id} takes a bonus away`);
  }
  if (ranks[0].merit !== 0) throw new Error('The first rank must need no merit');
  for (const licence of licences) if (licence.rank >= ranks.length) throw new Error(`Licence ${licence.id} needs an unknown rank`);
  for (const level of investment.levels) if (level.rank >= ranks.length) throw new Error('A stake level needs an unknown rank');
}

{
  const { pacing, sectors, distress, unstableWreck } = DIRECTOR_RULES;
  if (pacing.calmBelow >= pacing.peakAbove) throw new Error('Director: calm must sit below the peak');
  for (const id of Object.keys(sectors)) getSector(id);
  getResource(distress.resource);
  getResource(unstableWreck.resource);
  getShip(distress.ambush.ship);
}
