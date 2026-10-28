import { getResource, getUpgrade, type ShipDefinition } from '@void-frontier/content';
import { PI, atan2, cos, length, sin, toDegrees, wrapAngle, type Vec2 } from '@void-frontier/kernel';
import { hostilesNear } from './combat.ts';
import { holdSpaceFor, shipCollider } from './ship.ts';
import { idleCommand, type EntityId, type MarketItem } from './types.ts';
import type { World } from './world.ts';

export interface Bay {
  station: EntityId;
  /** Centre of the bay, where a docked ship sits. */
  centre: Vec2;
  /** Middle of the open mouth. */
  mouth: Vec2;
  /** Direction out of the bay (unit). */
  axis: Vec2;
  /** Heading a ship must hold to dock: nose into the bay. */
  dockAngle: number;
}

/** The docking bay of a station in world coordinates. */
export function bayOf(world: World, stationId: EntityId): Bay | null {
  const station = world.stations.get(stationId);
  const body = world.bodies.get(stationId);
  if (!station || !body) return null;
  const dock = station.definition.modules.find((m) => m.kind === 'dock');
  if (!dock || dock.kind !== 'dock') return null;
  const ca = cos(body.angle);
  const sa = sin(body.angle);
  const toWorld = (x: number, y: number): Vec2 => ({ x: body.position.x + x * ca - y * sa, y: body.position.y + x * sa + y * ca });
  const axisAngle = body.angle + dock.angle;
  const axis = { x: cos(axisAngle), y: sin(axisAngle) };
  const mouth = toWorld(dock.x, dock.y);
  return {
    station: stationId,
    mouth,
    centre: { x: mouth.x - axis.x * dock.depth * 0.5, y: mouth.y - axis.y * dock.depth * 0.5 },
    axis,
    dockAngle: wrapAngle(axisAngle + PI),
  };
}

export type DockRefusal = 'tooFar' | 'tooFast' | 'misaligned' | 'hostiles' | 'destroyed' | 'hostileStation';

export interface DockingStatus {
  station: EntityId;
  bay: Bay;
  /** metres from the ship to the bay centre */
  distance: number;
  /** m/s relative to the station */
  speed: number;
  /** degrees between the nose and the docking heading */
  angleError: number;
  refusals: DockRefusal[];
  limits: { maxDistance: number; maxRelativeSpeed: number; maxAngle: number };
}

/** Docking readout for the nearest station bay within `range`, or null when none is close. */
export function dockingStatus(world: World, shipId: EntityId, range = 600): DockingStatus | null {
  const ship = world.ships.get(shipId);
  const body = world.bodies.get(shipId);
  if (!ship || !body) return null;
  let best: DockingStatus | null = null;
  for (const [stationId, station] of world.stations) {
    const bay = bayOf(world, stationId);
    if (!bay) continue;
    const distance = length({ x: bay.centre.x - body.position.x, y: bay.centre.y - body.position.y });
    if (distance > range || (best && distance >= best.distance)) continue;
    const stationBody = world.bodies.get(stationId)!;
    const speed = length({ x: body.velocity.x - stationBody.velocity.x, y: body.velocity.y - stationBody.velocity.y });
    const angleError = Math.abs(toDegrees(wrapAngle(body.angle - bay.dockAngle)));
    const rules = station.definition.docking;
    const refusals: DockRefusal[] = [];
    if (ship.destroyed) refusals.push('destroyed');
    if (station.definition.faction === 'pirate') refusals.push('hostileStation');
    if (distance > rules.maxDistance) refusals.push('tooFar');
    if (speed > rules.maxRelativeSpeed) refusals.push('tooFast');
    if (angleError > rules.maxAngle) refusals.push('misaligned');
    if (rules.hostileClearance > 0 && hostilesNear(world, shipId, rules.hostileClearance).length > 0) refusals.push('hostiles');
    best = {
      station: stationId,
      bay,
      distance,
      speed,
      angleError,
      refusals,
      limits: { maxDistance: rules.maxDistance, maxRelativeSpeed: rules.maxRelativeSpeed, maxAngle: rules.maxAngle },
    };
  }
  return best;
}

/** Locks a ship into a bay: no collider, no motion, no weapons, safe from harm. */
export function dockShip(world: World, shipId: EntityId, stationId: EntityId): void {
  const ship = world.ships.get(shipId)!;
  const body = world.bodies.get(shipId)!;
  const bay = bayOf(world, stationId)!;
  ship.docked = stationId;
  ship.command = idleCommand();
  for (const mount of ship.weapons) mount.beam = null;
  body.position = { ...bay.centre };
  body.previousPosition = { ...bay.centre };
  body.velocity = { x: 0, y: 0 };
  body.angle = bay.dockAngle;
  body.previousAngle = bay.dockAngle;
  body.angularVelocity = 0;
  world.colliders.delete(shipId);
  world.events.push({ type: 'docked', ship: shipId, station: stationId });
}

/** Docks if every condition holds; otherwise returns the reasons it was refused. */
export function requestDock(world: World, shipId: EntityId): { ok: true } | { ok: false; refusals: DockRefusal[] } {
  const ship = world.ships.get(shipId);
  if (!ship || ship.docked !== null) return { ok: false, refusals: [] };
  const status = dockingStatus(world, shipId);
  if (!status) return { ok: false, refusals: ['tooFar'] };
  if (status.refusals.length > 0) return { ok: false, refusals: status.refusals };
  dockShip(world, shipId, status.station);
  return { ok: true };
}

/** Releases a docked ship just outside the bay mouth, nose out, at rest. */
export function undock(world: World, shipId: EntityId): boolean {
  const ship = world.ships.get(shipId);
  const body = world.bodies.get(shipId);
  if (!ship || !body || ship.docked === null) return false;
  const stationId = ship.docked;
  const bay = bayOf(world, stationId)!;
  const clear = ship.definition.hull.length;
  body.position = { x: bay.mouth.x + bay.axis.x * clear, y: bay.mouth.y + bay.axis.y * clear };
  body.previousPosition = { ...body.position };
  body.velocity = { x: 0, y: 0 };
  body.angle = atan2(bay.axis.y, bay.axis.x);
  body.previousAngle = body.angle;
  body.angularVelocity = 0;
  ship.docked = null;
  world.colliders.set(shipId, shipCollider(ship.definition));
  world.events.push({ type: 'undocked', ship: shipId, station: stationId });
  return true;
}

// --- Market -------------------------------------------------------------------

/** Spread between what the station asks and what it pays. */
const ASK_MARKUP = 1.12;
const BID_DISCOUNT = 0.9;

/**
 * Unit price at the current stock: scarce goods cost more. The factor is
 * sqrt(baseStock / stock), clamped to 0.5..2.5 so prices never run away.
 */
export function unitPrice(item: MarketItem, side: 'buy' | 'sell', stock = item.stock): number {
  const base = getResource(item.resource).basePrice;
  const factor = Math.min(2.5, Math.max(0.5, Math.sqrt(item.baseStock / Math.max(stock, 1))));
  return Math.max(1, Math.round(base * factor * (side === 'buy' ? ASK_MARKUP : BID_DISCOUNT)));
}

/** Total for `units`, priced one unit at a time so a big sale moves the price as it goes. */
export function quote(item: MarketItem, side: 'buy' | 'sell', units: number): number {
  let total = 0;
  for (let i = 0; i < units; i++) total += unitPrice(item, side, side === 'buy' ? item.stock - i : item.stock + i);
  return total;
}

export type TradeResult = { ok: true; units: number; credits: number } | { ok: false; reason: 'notDocked' | 'notTraded' | 'noStock' | 'noCredits' | 'noSpace' | 'nothingToSell' };

/** Buy from or sell to the station the ship is docked at. Credits and goods move together or not at all. */
export function trade(world: World, shipId: EntityId, resource: string, units: number, side: 'buy' | 'sell'): TradeResult {
  const ship = world.ships.get(shipId);
  if (!ship || ship.docked === null) return { ok: false, reason: 'notDocked' };
  const station = world.stations.get(ship.docked)!;
  const item = station.market.find((m) => m.resource === resource);
  if (!item || (side === 'buy' ? !item.sells : !item.buys)) return { ok: false, reason: 'notTraded' };

  if (side === 'sell') {
    const held = ship.cargo.get(resource) ?? 0;
    const count = Math.min(units, held);
    if (count <= 0) return { ok: false, reason: 'nothingToSell' };
    const credits = quote(item, 'sell', count);
    item.stock += count;
    world.credits += credits;
    if (held - count > 0) ship.cargo.set(resource, held - count);
    else ship.cargo.delete(resource);
    return { ok: true, units: count, credits };
  }

  let count = Math.min(units, Math.floor(item.stock), holdSpaceFor(ship, resource));
  if (Math.floor(item.stock) <= 0) return { ok: false, reason: 'noStock' };
  if (holdSpaceFor(ship, resource) <= 0) return { ok: false, reason: 'noSpace' };
  while (count > 0 && quote(item, 'buy', count) > world.credits) count--;
  if (count <= 0) return { ok: false, reason: 'noCredits' };
  const credits = quote(item, 'buy', count);
  item.stock -= count;
  world.credits -= credits;
  ship.cargo.set(resource, (ship.cargo.get(resource) ?? 0) + count);
  return { ok: true, units: count, credits };
}

/** Repairs or refuels as much as the player can afford; returns credits spent. */
export function service(world: World, shipId: EntityId, kind: 'repair' | 'refuel'): number {
  const ship = world.ships.get(shipId);
  if (!ship || ship.docked === null) return 0;
  const prices = world.stations.get(ship.docked)!.definition.services;
  const missing = kind === 'repair' ? ship.definition.hull.integrity - ship.hull : ship.definition.fuel.capacity - ship.fuel;
  const price = kind === 'repair' ? prices.repairPerHull : prices.fuelPerKg;
  const amount = Math.min(missing, world.credits / price);
  if (amount <= 0) return 0;
  const cost = Math.ceil(amount * price);
  if (kind === 'repair') ship.hull += amount;
  else ship.fuel += amount;
  world.credits = Math.max(0, world.credits - cost);
  return cost;
}

export function serviceCost(world: World, shipId: EntityId, kind: 'repair' | 'refuel'): number {
  const ship = world.ships.get(shipId);
  if (!ship || ship.docked === null) return 0;
  const prices = world.stations.get(ship.docked)!.definition.services;
  const missing = kind === 'repair' ? ship.definition.hull.integrity - ship.hull : ship.definition.fuel.capacity - ship.fuel;
  return Math.ceil(Math.max(0, missing) * (kind === 'repair' ? prices.repairPerHull : prices.fuelPerKg));
}

// --- Upgrades -----------------------------------------------------------------

/** The base ship with every installed upgrade applied. */
export function applyUpgrades(base: ShipDefinition, upgrades: string[]): ShipDefinition {
  const def = structuredClone(base);
  for (const id of upgrades) {
    const e = getUpgrade(id).effects;
    if (e.thrustMultiplier) {
      def.movement.mainThrust *= e.thrustMultiplier;
      def.movement.reverseThrust *= e.thrustMultiplier;
      def.movement.lateralThrust *= e.thrustMultiplier;
    }
    if (e.hullBonus) def.hull.integrity += e.hullBonus;
    if (e.armorBonus) def.hull.armor = Math.min(0.9, def.hull.armor + e.armorBonus);
    if (e.cargoMassBonus) def.cargo.maxMass += e.cargoMassBonus;
    if (e.cargoVolumeBonus) def.cargo.maxVolume += e.cargoVolumeBonus;
    if (e.shieldBonus) def.shield.capacity += e.shieldBonus;
    if (e.shieldRechargeBonus) def.shield.rechargeRate += e.shieldRechargeBonus;
  }
  return def;
}

export type UpgradeResult = { ok: true } | { ok: false; reason: 'notDocked' | 'notOffered' | 'installed' | 'noCredits' };

export function buyUpgrade(world: World, shipId: EntityId, upgradeId: string): UpgradeResult {
  const ship = world.ships.get(shipId);
  if (!ship || ship.docked === null) return { ok: false, reason: 'notDocked' };
  const station = world.stations.get(ship.docked)!;
  if (!station.definition.upgrades.includes(upgradeId)) return { ok: false, reason: 'notOffered' };
  if (ship.upgrades.includes(upgradeId)) return { ok: false, reason: 'installed' };
  const upgrade = getUpgrade(upgradeId);
  if (world.credits < upgrade.cost) return { ok: false, reason: 'noCredits' };
  world.credits -= upgrade.cost;
  ship.upgrades.push(upgradeId);
  ship.equipmentMass += upgrade.equipmentMass;
  ship.definition = applyUpgrades(ship.baseDefinition, ship.upgrades);
  // New capacity arrives charged and repaired.
  ship.hull += upgrade.effects.hullBonus ?? 0;
  ship.shield += upgrade.effects.shieldBonus ?? 0;
  return { ok: true };
}

/** Markets drift back toward their base stock: about 3% of the gap per minute. */
export function marketSystem(world: World, dt: number): void {
  if (world.tick % Math.round(1 / dt) !== 0) return;
  for (const station of world.stations.values()) {
    for (const item of station.market) item.stock += (item.baseStock - item.stock) * 0.0005;
  }
}

/** Fits upgrades without charging for them (an insured ship after a loss, or a loaded save). */
export function installUpgrades(world: World, shipId: EntityId, upgrades: string[]): void {
  const ship = world.ships.get(shipId);
  if (!ship) return;
  for (const id of upgrades) {
    if (ship.upgrades.includes(id)) continue;
    ship.upgrades.push(id);
    ship.equipmentMass += getUpgrade(id).equipmentMass;
  }
  ship.definition = applyUpgrades(ship.baseDefinition, ship.upgrades);
  ship.hull = ship.definition.hull.integrity;
  ship.shield = ship.definition.shield.capacity;
}
