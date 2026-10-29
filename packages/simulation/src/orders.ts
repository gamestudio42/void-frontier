import { CREW_RULES, EVENT_RULES, getAsteroidType, getResource, getSector, getShip, getStation, getWeapon, STATION_PLACEMENTS, type ShipDefinition } from '@void-frontier/content';
import type { Vec2 } from '@void-frontier/kernel';
import { formationPoint } from './ai.ts';
import { note } from './crew.ts';
import { raidFactor, type Economy } from './economy.ts';
import { isParkedAt, type FleetOrder, type FleetRun, type OwnedShip, type Pilot } from './fleet.ts';
import { spawnPickup } from './mining.ts';
import { dockedStationKey } from './missions.ts';
import { distance, planFromPoint, planRoute, planToPoint, spawnOnLeg, startLeg, type Place } from './routes.ts';
import type { PlayerState } from './sector.ts';
import { spawnShip } from './ship.ts';
import type { Simulation } from './simulation.ts';
import { applyUpgrades, installUpgrades, quote, unitPrice } from './station.ts';
import type { EntityId, Ship } from './types.ts';
import type { World } from './world.ts';

export const siteOf = (id: string) => CREW_RULES.sites.find((s) => s.id === id);

/** Centre of a mining site's field. */
export function sitePlace(id: string): Place {
  const site = siteOf(id)!;
  const field = getSector(site.sector).asteroidFields.find((f) => f.id === site.field)!;
  return { sector: site.sector, point: { x: field.center.x, y: field.center.y } };
}

const defOf = (state: PlayerState): ShipDefinition => applyUpgrades(getShip(state.ship), state.upgrades);
const held = (state: PlayerState, resource: string): number => state.cargo.find(([r]) => r === resource)?.[1] ?? 0;

/** Units of a resource that still fit in a stored ship's hold. */
export function roomFor(state: PlayerState, resource: string): number {
  const def = defOf(state);
  let mass = 0;
  let volume = 0;
  for (const [r, units] of state.cargo) {
    mass += getResource(r).unitMass * units;
    volume += getResource(r).unitVolume * units;
  }
  const res = getResource(resource);
  return Math.max(0, Math.floor(Math.min((def.cargo.maxMass - mass) / res.unitMass, (def.cargo.maxVolume - volume) / res.unitVolume) + 1e-9));
}

function addCargo(state: PlayerState, resource: string, units: number): void {
  const row = state.cargo.find(([r]) => r === resource);
  if (row) row[1] += units;
  else state.cargo.push([resource, units]);
  state.cargo = state.cargo.filter(([, u]) => u > 0);
}

const cruiseSpeed = (pilot: Pilot): number => CREW_RULES.cruiseSpeed * (1 + CREW_RULES.speedPerPiloting * (pilot.skills.piloting - 3));
const miningLaser = (def: ShipDefinition) => def.hardpoints.map((h) => getWeapon(h.weapon)).find((w) => w.kind === 'mining');
const hasGuns = (def: ShipDefinition) => def.hardpoints.some((h) => getWeapon(h.weapon).kind !== 'mining');

export type OrderResult = { ok: true } | { ok: false; reason: 'notDocked' | 'unknown' | 'elsewhere' | 'noPilot' | 'invalid' | 'unfit' };

/** Checks an order against a ship: the right gear, and markets that trade what it names. */
export function orderProblem(owned: OwnedShip, order: FleetOrder): 'invalid' | 'unfit' | null {
  const def = defOf(owned.state);
  if (order.kind === 'mine') {
    if (!siteOf(order.site)) return 'invalid';
    return miningLaser(def) ? null : 'unfit';
  }
  if (order.kind === 'wingman') return hasGuns(def) ? null : 'unfit';
  if (order.from === order.to) return 'invalid';
  const from = STATION_PLACEMENTS.get(order.from);
  const to = STATION_PLACEMENTS.get(order.to);
  if (!from || !to) return 'invalid';
  const sells = getStation(from.definition).market.some((m) => m.resource === order.resource && m.sells);
  const buys = getStation(to.definition).market.some((m) => m.resource === order.resource && m.buys);
  return sells && buys ? null : 'invalid';
}

/** Gives (or with null, withdraws) a ship's standing order. New orders start in this station's hangar. */
export function setOrder(sim: Simulation, ownedId: number, order: FleetOrder | null): OrderResult {
  const owned = sim.fleet.ships.find((s) => s.id === ownedId);
  if (!owned) return { ok: false, reason: 'unknown' };
  if (order === null) {
    // Recalled ships finish the leg they are on and stay at the next station.
    owned.order = null;
    if (owned.run?.phase === 'escort') parkEscort(sim.world, owned, owned.station);
    return { ok: true };
  }
  const key = dockedStationKey(sim.world, sim.playerId);
  if (!key) return { ok: false, reason: 'notDocked' };
  if (!isParkedAt(owned, key)) return { ok: false, reason: 'elsewhere' };
  if (!owned.pilot) return { ok: false, reason: 'noPilot' };
  const problem = orderProblem(owned, order);
  if (problem) return { ok: false, reason: problem };
  owned.order = order;
  // Wingmen wait for the player to launch; everyone else gets to work.
  owned.run = order.kind === 'wingman' ? null : newRun('docked', key, sim.world.tick);
  return { ok: true };
}

const newRun = (phase: FleetRun['phase'], target: string | null, untilTick: number): FleetRun => ({ phase, target, untilTick, shipId: null, legs: [], leg: 0, legStartTick: 0, legTicks: 0 });

// --- Business at stations and sites ------------------------------------------------

function sellAll(world: World, sim: Simulation, owned: OwnedShip, key: string, only?: string): void {
  const market = sim.economy!.markets[key] ?? [];
  for (const [resource, units] of [...owned.state.cargo]) {
    if (only && resource !== only) continue;
    const item = market.find((m) => m.resource === resource && m.buys);
    if (!item || units <= 0) continue;
    // The pilot keeps a commission on every sale.
    const credits = Math.round(quote(item, 'sell', units) * (1 - CREW_RULES.commission));
    item.stock += units;
    world.credits += credits;
    owned.earned += credits;
    addCargo(owned.state, resource, -units);
    note(world, sim.fleet, { kind: 'sold', ship: owned.state.ship, pilot: owned.pilot?.name ?? null, station: key, resource, units, credits });
  }
}

/**
 * Loads for a run to `dest`: unit by unit while the next unit still sells there (after the
 * pilot's commission) for more than it costs here, as both prices move with stock, within
 * the hold and the budget.
 */
function buyCargo(world: World, sim: Simulation, owned: OwnedShip, key: string, resource: string, dest: string): number {
  const item = (sim.economy!.markets[key] ?? []).find((m) => m.resource === resource && m.sells);
  const there = (sim.economy!.markets[dest] ?? []).find((m) => m.resource === resource && m.buys);
  if (!item || !there) return 0;
  const cap = Math.min(roomFor(owned.state, resource), Math.floor(item.stock));
  const budget = world.credits - CREW_RULES.tradeReserve;
  let units = 0;
  let credits = 0;
  while (units < cap) {
    const cost = unitPrice(item, 'buy', item.stock - units);
    const income = unitPrice(there, 'sell', there.stock + units) * (1 - CREW_RULES.commission);
    if (income < cost * CREW_RULES.tradeMargin || credits + cost > budget) break;
    credits += cost;
    units++;
  }
  if (units <= 0) return 0;
  item.stock -= units;
  world.credits -= credits;
  owned.earned -= credits;
  addCargo(owned.state, resource, units);
  note(world, sim.fleet, { kind: 'bought', ship: owned.state.ship, pilot: owned.pilot?.name ?? null, station: key, resource, units, credits });
  return units;
}

/** Off-screen yield of one stint at a site: the field's ore mix, as much as the hold and the clock allow. */
export function miningYield(owned: OwnedShip, siteId: string, seconds: number): [string, number][] {
  const site = siteOf(siteId)!;
  const field = getSector(site.sector).asteroidFields.find((f) => f.id === site.field)!;
  const laser = miningLaser(defOf(owned.state));
  if (!laser || laser.kind !== 'mining') return [];
  const rate = laser.extractionRate * (CREW_RULES.miningShare + CREW_RULES.miningPerSkill * ((owned.pilot?.skills.mining ?? 1) - 1));
  const total = Object.values(field.types).reduce((a, b) => a + b, 0);
  // Share the hold's mass out by the field's mix so one ore cannot crowd out the rest.
  const mass = defOf(owned.state).cargo.maxMass - owned.state.cargo.reduce((sum, [r, u]) => sum + u * getResource(r).unitMass, 0);
  const out: [string, number][] = [];
  for (const [type, weight] of Object.entries(field.types)) {
    const resource = getAsteroidType(type).resource;
    const byClock = rate * seconds * (weight / total);
    const byHold = (mass * (weight / total)) / getResource(resource).unitMass;
    const units = Math.floor(Math.min(byClock, byHold, roomFor(owned.state, resource)) + 1e-9);
    if (units > 0) out.push([resource, units]);
  }
  return out;
}

/** Seconds a stint at a site lasts: until the hold would be full, within the cap. */
function stintSeconds(owned: OwnedShip, siteId: string): number {
  const probe = miningYield(owned, siteId, 60);
  const perMinute = probe.reduce((sum, [r, u]) => sum + u * getResource(r).unitMass, 0);
  const mass = defOf(owned.state).cargo.maxMass - owned.state.cargo.reduce((sum, [r, u]) => sum + u * getResource(r).unitMass, 0);
  if (perMinute <= 0) return CREW_RULES.maxWorkSeconds;
  return Math.max(30, Math.min(CREW_RULES.maxWorkSeconds, (mass / perMinute) * 60));
}

// --- Real ships in the simulated sector --------------------------------------------

/** Puts a stored ship into the world with its hull, hold and fittings. */
function spawnOwned(world: World, owned: OwnedShip, id: EntityId): void {
  installUpgrades(world, id, owned.state.upgrades);
  const ship = world.ships.get(id)!;
  Object.assign(ship, {
    hull: owned.state.hull,
    shield: owned.state.shield,
    energy: owned.state.energy,
    fuel: owned.state.fuel,
    cargo: new Map(owned.state.cargo),
    kills: owned.state.kills,
    subsystems: { ...owned.state.subsystems },
  });
  ship.weapons.forEach((mount, i) => (mount.health = owned.state.mounts[i] ?? 1));
  const pilot = world.pilots.get(id);
  if (pilot) pilot.fleet = owned.id;
}

/** Copies a real fleet ship's condition back into its stored state. */
export function captureOwned(world: World, owned: OwnedShip): void {
  const id = owned.run?.shipId;
  const ship = id !== null && id !== undefined ? world.ships.get(id) : undefined;
  if (!ship) return;
  Object.assign(owned.state, {
    hull: ship.hull,
    shield: ship.shield,
    energy: ship.energy,
    fuel: ship.fuel,
    cargo: [...ship.cargo.entries()],
    kills: ship.kills,
    subsystems: { ...ship.subsystems },
    mounts: ship.weapons.map((w) => w.health),
  });
}

function despawn(world: World, owned: OwnedShip): void {
  if (!owned.run || owned.run.shipId === null) return;
  captureOwned(world, owned);
  world.destroyEntity(owned.run.shipId);
  owned.run.shipId = null;
}

/** Before a jump or a save: fold every real fleet ship back into its stored state. */
export function stowFleet(sim: Simulation): void {
  for (const owned of sim.fleet.ships) {
    captureOwned(sim.world, owned);
    if (owned.run) owned.run.shipId = null;
  }
}

/** A working pilot loses the ship: half the hold spills, the pilot ejects and waits at the nearest station. */
function lose(world: World, sim: Simulation, owned: OwnedShip, at: Vec2 | null): void {
  const fleet = sim.fleet;
  if (at) {
    for (const [resource, units] of owned.state.cargo) {
      let left = Math.floor(units / 2);
      while (left > 0) {
        const chunk = Math.min(8, left);
        left -= chunk;
        spawnPickup(world, resource, chunk, at, { x: world.rng.range(-6, 6), y: world.rng.range(-6, 6) });
      }
    }
  }
  if (owned.run?.shipId !== null && owned.run?.shipId !== undefined) world.destroyEntity(owned.run.shipId);
  const sector = owned.run?.legs[owned.run.leg]?.sector ?? world.sectorId;
  const refuge = owned.run?.target ?? (owned.order?.kind === 'mine' ? siteOf(owned.order.site)!.station : owned.station);
  fleet.ships = fleet.ships.filter((s) => s !== owned);
  if (owned.pilot) fleet.crew.push({ pilot: owned.pilot, station: refuge });
  note(world, fleet, { kind: 'lost', ship: owned.state.ship, pilot: owned.pilot?.name ?? null, sector, station: refuge });
}

// --- The routine -------------------------------------------------------------------

/** Where to go after a stop, by order: null when the order is done or gone. */
function nextStop(owned: OwnedShip): string | 'site' | null {
  const order = owned.order;
  if (!order || order.kind === 'wingman') return null;
  if (order.kind === 'trade') return held(owned.state, order.resource) > 0 ? order.to : order.from;
  return owned.state.cargo.length > 0 ? siteOf(order.site)!.station : 'site';
}

/** Arrived at a station: unload, load, and start the turnaround. */
function arrive(world: World, sim: Simulation, owned: OwnedShip, key: string): void {
  owned.station = key;
  owned.run = newRun('docked', key, world.tick + CREW_RULES.turnaroundSeconds * 60);
  business(world, sim, owned, key);
}

function business(world: World, sim: Simulation, owned: OwnedShip, key: string): void {
  const order = owned.order;
  if (!order || !sim.economy || !owned.pilot) return;
  if (order.kind === 'trade') {
    const had = held(owned.state, order.resource);
    if (key === order.to && had > 0) {
      sellAll(world, sim, owned, key, order.resource);
      tripDone(world, sim, owned, 'piloting');
    }
    if (key === order.from && held(owned.state, order.resource) === 0 && buyCargo(world, sim, owned, key, order.resource, order.to) === 0) {
      note(world, sim.fleet, { kind: 'idle', ship: owned.state.ship, pilot: owned.pilot.name, station: key, resource: order.resource });
    }
  } else if (order.kind === 'mine' && owned.state.cargo.length > 0) {
    sellAll(world, sim, owned, key);
    tripDone(world, sim, owned, 'mining');
  }
}

function tripDone(world: World, sim: Simulation, owned: OwnedShip, skill: 'piloting' | 'mining' | 'combat'): void {
  const pilot = owned.pilot!;
  pilot.trips++;
  if (pilot.trips % CREW_RULES.tripsPerSkill === 0 && pilot.skills[skill] < 5) {
    pilot.skills[skill]++;
    note(world, sim.fleet, { kind: 'skill', ship: owned.state.ship, pilot: pilot.name });
  }
}

function depart(world: World, owned: OwnedShip, stop: string | 'site'): void {
  const order = owned.order!;
  const from = owned.station;
  const run = newRun('travel', stop === 'site' ? null : stop, 0);
  run.legs = stop === 'site' ? planToPoint(from, sitePlace((order as { site: string }).site)) : planRoute(from, stop);
  owned.run = run;
  startLeg(world, run, cruiseSpeed(owned.pilot!));
}

function headBack(world: World, owned: OwnedShip, from: Place, key: string): void {
  owned.run = newRun('travel', key, 0);
  owned.run.legs = planFromPoint(from, key);
  startLeg(world, owned.run, cruiseSpeed(owned.pilot!));
}

function finishLeg(world: World, sim: Simulation, owned: OwnedShip): void {
  const run = owned.run!;
  despawn(world, owned);
  if (run.leg + 1 < run.legs.length) {
    run.leg++;
    startLeg(world, run, cruiseSpeed(owned.pilot!));
    return;
  }
  if (run.target !== null) {
    arrive(world, sim, owned, run.target);
    return;
  }
  // At the site: mine for a stint.
  const order = owned.order;
  const end = run.legs[run.legs.length - 1];
  if (order?.kind !== 'mine') {
    // Recalled on the way out: head back.
    headBack(world, owned, { sector: end.sector, point: end.to }, owned.station);
    return;
  }
  owned.run = newRun('work', null, world.tick + Math.round(stintSeconds(owned, order.site) * 60));
  owned.run.legs = run.legs;
  owned.run.leg = run.legs.length - 1;
  owned.run.legStartTick = world.tick;
}

/** Off-screen danger of a leg: the sector's pirate risk, less for skilled (and, if armed, combat-ready) pilots. */
function legRisk(economy: Economy, owned: OwnedShip, sector: string): number {
  const pilot = owned.pilot!;
  const def = defOf(owned.state);
  const skill = pilot.skills.piloting - 1 + (hasGuns(def) ? (pilot.skills.combat - 1) * 0.5 : 0);
  const share = Math.max(0.3, 1 - CREW_RULES.riskPerPiloting * skill);
  return (EVENT_RULES.sectorRisk[sector] ?? 0) * raidFactor(economy, sector) * share * CREW_RULES.fleetRisk;
}

function materialise(world: World, owned: OwnedShip): EntityId {
  const run = owned.run!;
  const id = spawnOnLeg(world, run, getShip(owned.state.ship), cruiseSpeed(owned.pilot!), 'player');
  spawnOwned(world, owned, id);
  run.shipId = id;
  return id;
}

/** A real ship is gone or wrecked: true when it was lost (and handled). */
function checkLoss(world: World, sim: Simulation, owned: OwnedShip): boolean {
  const id = owned.run!.shipId!;
  const ship = world.ships.get(id);
  const body = world.bodies.get(id);
  if (ship && body && !ship.destroyed) {
    noteAttack(world, sim, owned, ship);
    return false;
  }
  if (ship && body) {
    captureOwned(world, owned);
    lose(world, sim, owned, body.position);
  } else lose(world, sim, owned, null);
  return true;
}

const attackNoted = new WeakMap<OwnedShip, number>();
function noteAttack(world: World, sim: Simulation, owned: OwnedShip, ship: Ship): void {
  if (world.tick - ship.lastDamageTick > 1 || (attackNoted.get(owned) ?? -1e9) > world.tick - 600) return;
  if (ship.lastDamageTick === 0) return;
  attackNoted.set(owned, world.tick);
  note(world, sim.fleet, { kind: 'attacked', ship: owned.state.ship, pilot: owned.pilot?.name ?? null, sector: world.sectorId });
}

function advance(world: World, sim: Simulation, owned: OwnedShip): void {
  const run = owned.run!;
  if (run.phase === 'docked') {
    if (owned.pilot?.unpaid) {
      quit(world, sim, owned);
      return;
    }
    if (world.tick < run.untilTick) return;
    const stop = nextStop(owned);
    if (stop === null) {
      owned.run = null;
      return;
    }
    // A trader that could not load waits for stock or credits.
    if (owned.order?.kind === 'trade' && stop === owned.order.from && owned.station === owned.order.from) {
      if (buyCargo(world, sim, owned, owned.station, owned.order.resource, owned.order.to) === 0) {
        run.untilTick = world.tick + CREW_RULES.turnaroundSeconds * 60;
        return;
      }
      depart(world, owned, owned.order.to);
      return;
    }
    if (stop === owned.station) {
      business(world, sim, owned, owned.station);
      run.untilTick = world.tick + CREW_RULES.turnaroundSeconds * 60;
      return;
    }
    depart(world, owned, stop);
    return;
  }
  if (run.phase === 'work') {
    const order = owned.order;
    const site = order?.kind === 'mine' ? siteOf(order.site)! : null;
    const here = site?.sector === world.sectorId;
    if (here && site) {
      if (run.shipId === null) spawnMiner(world, owned, sitePlace(site.id).point);
      else if (checkLoss(world, sim, owned)) return;
      const ship = world.ships.get(run.shipId!)!;
      const full = [...ship.cargo.keys()].some((r) => holdFull(ship, r));
      if (world.tick < run.untilTick && !full) return;
      despawn(world, owned);
    } else {
      if (world.tick < run.untilTick) return;
      if (site) for (const [resource, units] of miningYield(owned, site.id, (run.untilTick - run.legStartTick) / 60)) addCargo(owned.state, resource, units);
    }
    const end = run.legs[run.legs.length - 1];
    headBack(world, owned, { sector: end.sector, point: end.to }, site ? site.station : owned.station);
    return;
  }
  // Travel.
  const leg = run.legs[run.leg];
  if (leg.sector === world.sectorId) {
    if (run.shipId === null) materialise(world, owned);
    else if (checkLoss(world, sim, owned)) return;
    const body = world.bodies.get(run.shipId!)!;
    if (distance(body.position, leg.to) < 70) finishLeg(world, sim, owned);
    return;
  }
  if (world.tick < run.legStartTick + run.legTicks) return;
  // One roll per sector crossed, on the way out of it.
  const leaving = run.leg + 1 >= run.legs.length || run.legs[run.leg + 1].sector !== leg.sector;
  if (leaving && world.rng.next() < legRisk(sim.economy!, owned, leg.sector)) lose(world, sim, owned, null);
  else finishLeg(world, sim, owned);
}

function holdFull(ship: Ship, resource: string): boolean {
  return ship.definition.cargo.maxMass - [...ship.cargo].reduce((sum, [r, u]) => sum + u * getResource(r).unitMass, 0) < getResource(resource).unitMass;
}

function spawnMiner(world: World, owned: OwnedShip, at: Vec2): void {
  const run = owned.run!;
  const id = spawnShip(world, getShip(owned.state.ship), { position: { x: at.x + 150, y: at.y + 150 }, faction: 'player' });
  world.pilots.set(id, { mode: 'patrol', patrol: [at], waypoint: 0, target: null, retreatUntil: 0, orbit: 1, mine: { site: { ...at }, rock: null } });
  spawnOwned(world, owned, id);
  run.shipId = id;
}

function quit(world: World, sim: Simulation, owned: OwnedShip): void {
  const pilot = owned.pilot!;
  despawn(world, owned);
  owned.pilot = null;
  owned.order = null;
  owned.run = null;
  note(world, sim.fleet, { kind: 'quit', ship: owned.state.ship, pilot: pilot.name, station: owned.station });
}

// --- Wingmen ------------------------------------------------------------------------


/** The player launched from a station: wingmen parked there launch too. */
export function launchWingmen(sim: Simulation, key: string): void {
  for (const owned of sim.fleet.ships) {
    if (owned.order?.kind !== 'wingman' || !owned.pilot || !isParkedAt(owned, key) || owned.pilot.unpaid) continue;
    owned.run = newRun('escort', null, 0);
  }
}

function parkEscort(world: World, owned: OwnedShip, key: string): void {
  despawn(world, owned);
  owned.station = key;
  owned.run = null;
}

function escort(world: World, sim: Simulation, owned: OwnedShip, slot: number): void {
  const run = owned.run!;
  const leader = world.ships.get(sim.playerId);
  const leaderBody = world.bodies.get(sim.playerId);
  if (!leader || !leaderBody) return;
  const key = dockedStationKey(world, sim.playerId);
  if (key) {
    parkEscort(world, owned, key);
    return;
  }
  if (run.shipId === null) {
    const side = slot % 2 === 0 ? 1 : -1;
    const id = spawnShip(world, getShip(owned.state.ship), {
      position: formationPoint(leaderBody.position, leaderBody.angle, slot),
      velocity: { ...leaderBody.velocity },
      angle: leaderBody.angle,
      faction: 'player',
    });
    world.pilots.set(id, { mode: 'patrol', patrol: [{ ...leaderBody.position }], waypoint: 0, target: null, retreatUntil: 0, orbit: side, escort: { leader: sim.playerId, slot } });
    spawnOwned(world, owned, id);
    run.shipId = id;
    return;
  }
  const pilot = world.pilots.get(run.shipId);
  if (pilot?.escort) pilot.escort.leader = sim.playerId;
  if (checkLoss(world, sim, owned)) return;
  // A minute on escort duty counts as a trip toward combat skill.
  if (world.tick % 3600 === 0 && owned.pilot) tripDone(world, sim, owned, 'combat');
}

// --- System ---------------------------------------------------------------------------

/** Fleet ships at work, every step: real in the simulated sector, by the clock elsewhere. */
export function fleetSystem(sim: Simulation): void {
  const world = sim.world;
  if (!sim.economy) return;
  let slot = 0;
  for (const owned of [...sim.fleet.ships]) {
    if (!sim.fleet.ships.includes(owned)) continue;
    if (!owned.run) {
      if (owned.pilot?.unpaid) quit(world, sim, owned);
      continue;
    }
    if (owned.run.phase === 'escort') escort(world, sim, owned, slot++);
    else advance(world, sim, owned);
  }
}

/** Ships in the simulated sector that belong to the player's fleet, by entity id. */
export function fleetEntities(sim: Simulation): Map<EntityId, OwnedShip> {
  const out = new Map<EntityId, OwnedShip>();
  for (const owned of sim.fleet.ships) if (owned.run?.shipId !== null && owned.run?.shipId !== undefined && sim.world.ships.has(owned.run.shipId)) out.set(owned.run.shipId, owned);
  return out;
}
