import { getUpgrade, upgradeTier, type AbilityDefinition, type AbilityKind } from '@void-frontier/content';
import { cos, sin } from '@void-frontier/kernel';
import { isHostile, type EntityId, type Ship } from './types.ts';
import type { World } from './world.ts';

/**
 * Module verbs: a dash from the afterburner, chaff from the countermeasures, a pulse
 * from the EMP projector. Each is a one-shot the pilot fires on its own key, with a
 * cooldown, and each tier of a module does it harder and more often.
 */

/** The fitted module that gives `kind`, with its numbers and tier; null when none does. */
export function abilityOf(ship: Ship, kind: AbilityKind): { module: string; tier: number; ability: AbilityDefinition } | null {
  for (const id of ship.upgrades) {
    const ability = getUpgrade(id).ability;
    if (ability?.kind === kind) return { module: id, tier: upgradeTier(id), ability };
  }
  return null;
}

/** Why a verb cannot fire now, or null when it can. */
export type AbilityBlock = 'none' | 'docked' | 'cooldown' | 'fuel' | 'damaged';

export function abilityBlock(world: World, shipId: EntityId, kind: AbilityKind): AbilityBlock | null {
  const ship = world.ships.get(shipId);
  const fitted = ship ? abilityOf(ship, kind) : null;
  if (!ship || ship.destroyed || !fitted) return 'none';
  if (ship.docked !== null) return 'docked';
  if (world.tick < (ship.moduleReady?.[kind] ?? 0)) return 'cooldown';
  const ability = fitted.ability;
  if (ability.kind === 'dash') {
    if (ship.subsystems.engines < 0.15) return 'damaged';
    if (ship.fuel < ability.fuel) return 'fuel';
  }
  if (ability.kind === 'emp' && ship.subsystems.reactor < 0.15) return 'damaged';
  return null;
}

/** Fires a module verb. Returns false (and changes nothing) when it cannot fire. */
export function useAbility(world: World, shipId: EntityId, kind: AbilityKind, dt: number): boolean {
  if (abilityBlock(world, shipId, kind) !== null) return false;
  const ship = world.ships.get(shipId)!;
  const body = world.bodies.get(shipId)!;
  const ability = abilityOf(ship, kind)!.ability;
  ship.moduleReady = { ...ship.moduleReady, [kind]: world.tick + Math.round(ability.cooldown / dt) };
  let hits = 0;
  if (ability.kind === 'dash') {
    // Along the stick if it is pushed (thrust forward, strafe right), else along the nose.
    const fx = cos(body.angle);
    const fy = sin(body.angle);
    const thrust = ship.command.thrust;
    const strafe = ship.command.strafe;
    // Body right is the forward vector turned clockwise: (fy, -fx).
    let dx = fx * thrust + fy * strafe;
    let dy = fy * thrust - fx * strafe;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length < 0.1) {
      dx = fx;
      dy = fy;
    } else {
      dx /= length;
      dy /= length;
    }
    body.velocity = { x: body.velocity.x + dx * ability.deltaV, y: body.velocity.y + dy * ability.deltaV };
    ship.fuel = Math.max(0, ship.fuel - ability.fuel);
    world.events.push({ type: 'ability', ship: shipId, kind, position: { ...body.position }, direction: { x: dx, y: dy }, radius: 0, hits: 0 });
    return true;
  }
  if (ability.kind === 'chaff') {
    ship.chaffUntil = world.tick + Math.round(ability.seconds / dt);
    ship.chaffRadius = ability.radius;
    hits = breakLocks(world, body.position, ability.radius, (target) => target === shipId);
  } else {
    hits = breakLocks(world, body.position, ability.radius, (target) => {
      const other = world.ships.get(target);
      return !!other && !isHostile(ship.faction, other.faction);
    });
    const jamTicks = Math.round(ability.jamSeconds / dt);
    for (const [id, other] of world.ships) {
      if (id === shipId || other.destroyed || other.docked !== null || !isHostile(ship.faction, other.faction)) continue;
      const p = world.bodies.get(id)!.position;
      const ox = p.x - body.position.x;
      const oy = p.y - body.position.y;
      if (ox * ox + oy * oy > ability.radius * ability.radius) continue;
      other.shield = Math.max(0, other.shield - ability.shieldDamage);
      other.lastDamageTick = world.tick;
      other.jammedUntil = world.tick + jamTicks;
      hits++;
    }
    // The pulse comes out of the ship's own shield.
    ship.shield *= 1 - ability.selfShield;
    ship.lastDamageTick = world.tick;
  }
  world.events.push({ type: 'ability', ship: shipId, kind, position: { ...body.position }, direction: { x: cos(body.angle), y: sin(body.angle) }, radius: ability.radius, hits });
  return true;
}

/** Missiles inside `radius` whose target passes `protect` lose their lock; returns how many. */
function breakLocks(world: World, at: { x: number; y: number }, radius: number, protect: (target: EntityId) => boolean): number {
  let broken = 0;
  for (const round of world.projectiles.values()) {
    if (!round.homing || round.homing.target === null || !protect(round.homing.target)) continue;
    const dx = round.position.x - at.x;
    const dy = round.position.y - at.y;
    if (dx * dx + dy * dy > radius * radius) continue;
    round.homing.target = null;
    broken++;
  }
  return broken;
}

/** True while a chaff cloud hides the ship from a missile at `at`. */
export function hiddenByChaff(world: World, ship: Ship, shipAt: { x: number; y: number }, at: { x: number; y: number }): boolean {
  if (world.tick >= (ship.chaffUntil ?? 0)) return false;
  const r = ship.chaffRadius ?? 0;
  const dx = at.x - shipAt.x;
  const dy = at.y - shipAt.y;
  return dx * dx + dy * dy <= r * r;
}

/** True while an EMP keeps the ship's guns cold. */
export const isJammed = (world: World, ship: Ship): boolean => world.tick < (ship.jammedUntil ?? 0);

/** For the HUD: every verb the ship has, how ready it is and why it cannot fire. */
export interface AbilityStatus {
  kind: AbilityKind;
  module: string;
  tier: number;
  /** 0 just fired .. 1 ready */
  ready: number;
  /** Seconds until it can fire again. */
  readyIn: number;
  block: AbilityBlock | null;
}

export function abilityStatus(world: World, shipId: EntityId, dt: number): AbilityStatus[] {
  const ship = world.ships.get(shipId);
  if (!ship) return [];
  const out: AbilityStatus[] = [];
  for (const kind of ['dash', 'chaff', 'emp'] as const) {
    const fitted = abilityOf(ship, kind);
    if (!fitted) continue;
    const left = Math.max(0, (ship.moduleReady?.[kind] ?? 0) - world.tick) * dt;
    out.push({
      kind,
      module: fitted.module,
      tier: fitted.tier,
      ready: 1 - Math.min(1, left / fitted.ability.cooldown),
      readyIn: left,
      block: abilityBlock(world, shipId, kind),
    });
  }
  return out;
}
