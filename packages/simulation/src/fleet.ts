import { getShip, getUpgrade } from '@void-frontier/content';
import { dockedStationKey } from './missions.ts';
import { capturePlayer, applyPlayer, type PlayerState } from './sector.ts';
import { spawnShip } from './ship.ts';
import type { Simulation } from './simulation.ts';
import { dockShip } from './station.ts';
import type { World } from './world.ts';

/** A ship the player owns but is not flying, parked at a station. */
export interface OwnedShip {
  id: number;
  /** Station key it is stored at. */
  station: string;
  state: PlayerState;
}

export interface Fleet {
  ships: OwnedShip[];
  nextId: number;
  /** Id of the ship being flown. */
  activeId: number;
}

export const createFleet = (): Fleet => ({ ships: [], nextId: 2, activeId: 1 });

/** Share of a hull's price paid back when it is sold. */
export const SHIP_RESALE = 0.6;

/** A brand-new hull: full tanks, full hull, nothing fitted. */
export function freshShip(shipId: string): PlayerState {
  const def = getShip(shipId);
  return {
    ship: shipId,
    upgrades: [],
    hull: def.hull.integrity,
    shield: def.shield.capacity,
    energy: def.reactor.capacity,
    fuel: def.fuel.capacity,
    cargo: [],
    kills: 0,
    mode: 'newtonian',
    dockedAt: null,
    position: [0, 0],
    velocity: [0, 0],
    angle: 0,
    angularVelocity: 0,
    scanReadyTick: 0,
    subsystems: { engines: 1, reactor: 1, sensors: 1, shieldGenerator: 1, cargoHold: 1 },
    mounts: def.hardpoints.map(() => 1),
  };
}

export interface ShipyardOffer {
  ship: string;
  price: number;
  locked: { faction: string; reputation: number } | null;
}

/** Hulls on sale at the station the player is docked at. */
export function shipyardOffers(world: World, playerId: number): ShipyardOffer[] {
  const key = dockedStationKey(world, playerId);
  const ship = world.ships.get(playerId);
  if (!key || !ship || ship.docked === null) return [];
  const station = world.stations.get(ship.docked)!;
  return station.definition.shipyard.map((offer) => ({
    ship: offer.ship,
    price: getShip(offer.ship).price,
    locked: offer.requires && (world.standing[offer.requires.faction] ?? 0) < offer.requires.reputation ? offer.requires : null,
  }));
}

export type ShipyardResult = { ok: true; id: number } | { ok: false; reason: 'notDocked' | 'notSold' | 'reputation' | 'noCredits' | 'unknown' | 'elsewhere' };

/** Buys a hull; it waits in this station's hangar. */
export function buyShip(sim: Simulation, shipId: string): ShipyardResult {
  const world = sim.world;
  const key = dockedStationKey(world, sim.playerId);
  if (!key) return { ok: false, reason: 'notDocked' };
  const offer = shipyardOffers(world, sim.playerId).find((o) => o.ship === shipId);
  if (!offer) return { ok: false, reason: 'notSold' };
  if (offer.locked) return { ok: false, reason: 'reputation' };
  if (world.credits < offer.price) return { ok: false, reason: 'noCredits' };
  world.credits -= offer.price;
  const id = sim.fleet.nextId++;
  sim.fleet.ships.push({ id, station: key, state: freshShip(shipId) });
  return { ok: true, id };
}

/** What a stored ship fetches: part of the hull price plus half of its modules. */
export function shipValue(state: PlayerState): number {
  const modules = state.upgrades.reduce((sum, id) => sum + getUpgrade(id).cost * 0.5, 0);
  return Math.round(getShip(state.ship).price * SHIP_RESALE + modules);
}

/** Sells a ship parked at this station (never the one being flown). Its hold goes with it. */
export function sellShip(sim: Simulation, ownedId: number): ShipyardResult {
  const key = dockedStationKey(sim.world, sim.playerId);
  if (!key) return { ok: false, reason: 'notDocked' };
  const owned = sim.fleet.ships.find((s) => s.id === ownedId);
  if (!owned) return { ok: false, reason: 'unknown' };
  if (owned.station !== key) return { ok: false, reason: 'elsewhere' };
  sim.fleet.ships = sim.fleet.ships.filter((s) => s !== owned);
  sim.world.credits += shipValue(owned.state);
  return { ok: true, id: ownedId };
}

/**
 * Switch ships in the hangar: the current ship is parked here with everything aboard,
 * and the chosen one is brought out, docked and ready.
 */
export function boardShip(sim: Simulation, ownedId: number): ShipyardResult {
  const world = sim.world;
  const key = dockedStationKey(world, sim.playerId);
  const current = world.ships.get(sim.playerId);
  if (!key || !current || current.docked === null) return { ok: false, reason: 'notDocked' };
  const target = sim.fleet.ships.find((s) => s.id === ownedId);
  if (!target) return { ok: false, reason: 'unknown' };
  if (target.station !== key) return { ok: false, reason: 'elsewhere' };
  const stationId = current.docked;
  const parked = capturePlayer(sim);
  sim.fleet.ships = sim.fleet.ships.filter((s) => s !== target);
  sim.fleet.ships.push({ id: sim.fleet.activeId, station: key, state: parked });
  world.destroyEntity(sim.playerId);
  const id = spawnShip(world, getShip(target.state.ship));
  sim.playerId = id;
  dockShip(world, id, stationId);
  const dockedAt = [...world.stations.keys()].indexOf(stationId);
  applyPlayer(sim, { ...target.state, dockedAt });
  sim.fleet.activeId = target.id;
  world.events.length = 0;
  return { ok: true, id: target.id };
}
