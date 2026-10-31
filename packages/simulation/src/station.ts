import { getFaction, getResource, getUpgrade, getWeapon, weaponGroup, type ShipDefinition } from '@void-frontier/content';
import { PI, atan2, cos, length, sin, toDegrees, wrapAngle, type Vec2 } from '@void-frontier/kernel';
import { hostilesNear } from './combat.ts';
import { holdSpaceFor, shipCollider } from './ship.ts';
import { SUBSYSTEMS, idleCommand, type EntityId, type MarketItem, type Ship } from './types.ts';
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

export type DockRefusal = 'tooFar' | 'tooFast' | 'misaligned' | 'hostiles' | 'destroyed' | 'hostileStation' | 'reputation';

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
    const faction = getFaction(station.definition.faction);
    if (faction.hostile) refusals.push('hostileStation');
    else if ((world.standing[faction.id] ?? 0) <= faction.dockingThreshold) refusals.push('reputation');
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
  return Math.max(1, Math.round(base * factor * (item.priceFactor ?? 1) * (side === 'buy' ? ASK_MARKUP : BID_DISCOUNT)));
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

/** Credits to restore a fully wrecked subsystem, and a wrecked weapon mount. */
const SUBSYSTEM_REPAIR = 250;
const MOUNT_REPAIR = 120;

function repairBill(ship: Ship, perHull: number) {
  const hull = Math.max(0, ship.definition.hull.integrity - ship.hull);
  const systems = SUBSYSTEMS.reduce((sum, id) => sum + (1 - ship.subsystems[id]), 0);
  const mounts = ship.weapons.reduce((sum, m) => sum + (1 - m.health), 0);
  return { hull, systems, mounts, total: hull * perHull + systems * SUBSYSTEM_REPAIR + mounts * MOUNT_REPAIR };
}

/**
 * Repairs (hull, subsystems and weapon mounts together) or refuels as much as the
 * player can afford; returns credits spent.
 */
export function service(world: World, shipId: EntityId, kind: 'repair' | 'refuel'): number {
  const ship = world.ships.get(shipId);
  if (!ship || ship.docked === null) return 0;
  const prices = world.stations.get(ship.docked)!.definition.services;
  if (kind === 'refuel') {
    const amount = Math.min(ship.definition.fuel.capacity - ship.fuel, world.credits / prices.fuelPerKg);
    if (amount <= 0) return 0;
    const cost = Math.ceil(amount * prices.fuelPerKg);
    ship.fuel += amount;
    world.credits = Math.max(0, world.credits - cost);
    return cost;
  }
  const bill = repairBill(ship, prices.repairPerHull);
  if (bill.total <= 0 || world.credits <= 0) return 0;
  const share = Math.min(1, world.credits / bill.total);
  ship.hull += bill.hull * share;
  for (const id of SUBSYSTEMS) ship.subsystems[id] += (1 - ship.subsystems[id]) * share;
  for (const mount of ship.weapons) mount.health += (1 - mount.health) * share;
  const cost = Math.ceil(bill.total * share);
  world.credits = Math.max(0, world.credits - cost);
  return cost;
}

export function serviceCost(world: World, shipId: EntityId, kind: 'repair' | 'refuel'): number {
  const ship = world.ships.get(shipId);
  if (!ship || ship.docked === null) return 0;
  const prices = world.stations.get(ship.docked)!.definition.services;
  if (kind === 'refuel') return Math.ceil(Math.max(0, ship.definition.fuel.capacity - ship.fuel) * prices.fuelPerKg);
  return Math.ceil(repairBill(ship, prices.repairPerHull).total);
}

// --- Upgrades -----------------------------------------------------------------

/** The base ship with every installed module applied. */
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
    if (e.boostBonus) def.movement.boostMultiplier += e.boostBonus;
    if (e.scanRangeBonus) def.sensors.scanRange += e.scanRangeBonus;
    if (e.sensorRangeBonus) def.sensors.range += e.sensorRangeBonus;
    if (e.tractorMultiplier) def.tractor.range *= e.tractorMultiplier;
    if (e.salvageBonus) def.salvageYield += e.salvageBonus;
    if (e.fuelEfficiency) def.fuel.consumptionPerMegaNewtonSecond *= e.fuelEfficiency;
  }
  return def;
}

/** Module effects that are not ship stats: gun gimbal and in-flight repair. */
export function moduleModifiers(upgrades: string[]): { gimbal: number; repairRate: number; cooling: number; missileEvasion: number } {
  let gimbal = 0;
  let repairRate = 0;
  let cooling = 1;
  let missileEvasion = 0;
  for (const id of upgrades) {
    const e = getUpgrade(id).effects;
    gimbal += e.gimbalBonus ?? 0;
    repairRate += e.repairRate ?? 0;
    cooling *= e.coolingMultiplier ?? 1;
    missileEvasion = Math.max(missileEvasion, e.missileEvasion ?? 0);
  }
  return { gimbal, repairRate, cooling, missileEvasion };
}

/** Slots in use and available, by kind. */
export function slotUsage(ship: Ship): Record<'engine' | 'utility' | 'defense', { used: number; total: number }> {
  const total = ship.baseDefinition.slots;
  const used = { engine: 0, utility: 0, defense: 0 };
  for (const id of ship.upgrades) used[getUpgrade(id).slot]++;
  return {
    engine: { used: used.engine, total: total.engine },
    utility: { used: used.utility, total: total.utility },
    defense: { used: used.defense, total: total.defense },
  };
}

/** Share of a weapon's price paid back when it is taken off a mount. */
export const WEAPON_RESALE = 0.5;

export type WeaponResult = { ok: true } | { ok: false; reason: 'notDocked' | 'notOffered' | 'noCredits' | 'wrongMount' | 'unknown' };

/** Refits one mount with a weapon sold here; the old one is taken in part exchange. */
export function buyWeapon(world: World, shipId: EntityId, index: number, weaponId: string): WeaponResult {
  const ship = world.ships.get(shipId);
  if (!ship || ship.docked === null) return { ok: false, reason: 'notDocked' };
  const mount = ship.weapons[index];
  if (!mount) return { ok: false, reason: 'unknown' };
  if (!world.stations.get(ship.docked)!.definition.weapons.includes(weaponId)) return { ok: false, reason: 'notOffered' };
  const weapon = getWeapon(weaponId);
  if (weaponGroup(weapon) !== mount.hardpoint.group) return { ok: false, reason: 'wrongMount' };
  const cost = weapon.price - Math.round(mount.definition.price * WEAPON_RESALE);
  if (world.credits < cost) return { ok: false, reason: 'noCredits' };
  world.credits -= cost;
  mount.definition = weapon;
  mount.heat = 0;
  mount.cooldown = 0;
  mount.overheated = false;
  return { ok: true };
}

export type UpgradeResult = { ok: true } | { ok: false; reason: 'notDocked' | 'notOffered' | 'installed' | 'noCredits' | 'noSlot' | 'reputation' };

export function buyUpgrade(world: World, shipId: EntityId, upgradeId: string): UpgradeResult {
  const ship = world.ships.get(shipId);
  if (!ship || ship.docked === null) return { ok: false, reason: 'notDocked' };
  const station = world.stations.get(ship.docked)!;
  if (!station.definition.upgrades.includes(upgradeId)) return { ok: false, reason: 'notOffered' };
  if (ship.upgrades.includes(upgradeId)) return { ok: false, reason: 'installed' };
  const upgrade = getUpgrade(upgradeId);
  const slots = slotUsage(ship)[upgrade.slot];
  if (slots.used >= slots.total) return { ok: false, reason: 'noSlot' };
  if (upgrade.requires && (world.standing[upgrade.requires.faction] ?? 0) < upgrade.requires.reputation) return { ok: false, reason: 'reputation' };
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

/** Share of the price refunded when a module is removed. */
export const RESALE = 0.5;

/** Removes a module at a station for half its price, freeing the slot. */
export function sellUpgrade(world: World, shipId: EntityId, upgradeId: string): boolean {
  const ship = world.ships.get(shipId);
  if (!ship || ship.docked === null || !ship.upgrades.includes(upgradeId)) return false;
  const upgrade = getUpgrade(upgradeId);
  ship.upgrades = ship.upgrades.filter((id) => id !== upgradeId);
  ship.equipmentMass = Math.max(0, ship.equipmentMass - upgrade.equipmentMass);
  ship.definition = applyUpgrades(ship.baseDefinition, ship.upgrades);
  ship.hull = Math.min(ship.hull, ship.definition.hull.integrity);
  ship.shield = Math.min(ship.shield, ship.definition.shield.capacity);
  world.credits += Math.round(upgrade.cost * RESALE);
  return true;
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
