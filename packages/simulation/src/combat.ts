import { atan2, clamp, cos, sin, toRadians, wrapAngle, type Vec2 } from '@void-frontier/kernel';
import { applyWeaponDamage } from './damage.ts';
import { raycast } from './spatial.ts';
import type { Body, EntityId, Ship, WeaponMount } from './types.ts';
import type { World } from './world.ts';

/** World position of a hardpoint (ship-local x forward, y right). */
export function muzzlePosition(body: Body, mount: WeaponMount): Vec2 {
  const ca = cos(body.angle);
  const sa = sin(body.angle);
  const { x, y } = mount.hardpoint;
  // Right of forward (ca, sa) is (sa, -ca).
  return { x: body.position.x + x * ca + y * sa, y: body.position.y + x * sa - y * ca };
}

/**
 * Where to point a gun so a round meets a target moving at constant velocity.
 * Solves |r + v t| = s t for the smallest positive t, where r and v are relative to
 * the muzzle and the round inherits `inheritance` of the shooter's velocity.
 * Returns the aim point, or null when the round can never catch the target.
 */
export function leadPoint(
  muzzle: Vec2,
  shooterVelocity: Vec2,
  targetPosition: Vec2,
  targetVelocity: Vec2,
  projectileSpeed: number,
  inheritance: number,
): { point: Vec2; time: number } | null {
  const rx = targetPosition.x - muzzle.x;
  const ry = targetPosition.y - muzzle.y;
  const vx = targetVelocity.x - shooterVelocity.x * inheritance;
  const vy = targetVelocity.y - shooterVelocity.y * inheritance;
  const a = vx * vx + vy * vy - projectileSpeed * projectileSpeed;
  const b = 2 * (rx * vx + ry * vy);
  const c = rx * rx + ry * ry;
  let t: number;
  if (Math.abs(a) < 1e-9) {
    if (Math.abs(b) < 1e-12) return null;
    t = -c / b;
  } else {
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const root = Math.sqrt(disc);
    const t1 = (-b - root) / (2 * a);
    const t2 = (-b + root) / (2 * a);
    t = Math.min(t1, t2) > 0 ? Math.min(t1, t2) : Math.max(t1, t2);
  }
  if (!(t > 0)) return null;
  return { point: { x: targetPosition.x + vx * t, y: targetPosition.y + vy * t }, time: t };
}

/** Aim point for one mount: the target's lead if selected, otherwise the pilot's aim point. */
function desiredAim(world: World, body: Body, ship: Ship, mount: WeaponMount, muzzle: Vec2): Vec2 | null {
  const target = ship.command.target;
  if (target !== null) {
    const targetBody = world.bodies.get(target);
    const targetShip = world.ships.get(target);
    if (targetBody && targetShip && !targetShip.destroyed) {
      const def = mount.definition;
      if (def.kind === 'beam') return targetBody.position;
      const lead = leadPoint(muzzle, body.velocity, targetBody.position, targetBody.velocity, def.projectileSpeed, def.velocityInheritance);
      if (lead) {
        const offset = wrapAngle(atan2(lead.point.y - muzzle.y, lead.point.x - muzzle.x) - body.angle);
        if (Math.abs(offset) <= toRadians(def.gimbal)) return lead.point;
      }
    }
  }
  return ship.command.aim;
}

/** Firing angle: toward the aim point, limited to the gun's gimbal around the nose. */
function firingAngle(body: Body, muzzle: Vec2, aim: Vec2 | null, gimbalDegrees: number): number {
  if (!aim) return body.angle;
  const dx = aim.x - muzzle.x;
  const dy = aim.y - muzzle.y;
  if (dx * dx + dy * dy < 4) return body.angle;
  const offset = clamp(wrapAngle(atan2(dy, dx) - body.angle), -toRadians(gimbalDegrees), toRadians(gimbalDegrees));
  return body.angle + offset;
}

/** Cools weapons, fires guns and beams, recharges reactors and shields. */
export function weaponSystem(world: World, dt: number): void {
  for (const [id, ship] of world.ships) {
    const body = world.bodies.get(id);
    if (!body) continue;
    const reactor = ship.definition.reactor;
    ship.energy = Math.min(reactor.capacity, ship.energy + reactor.rechargeRate * dt);
    const shieldDef = ship.definition.shield;
    if (!ship.destroyed && (world.tick - ship.lastDamageTick) * dt >= shieldDef.rechargeDelay) {
      ship.shield = Math.min(shieldDef.capacity, ship.shield + shieldDef.rechargeRate * dt);
    }

    for (const mount of ship.weapons) {
      const def = mount.definition;
      mount.heat = Math.max(0, mount.heat - def.coolingRate * dt);
      if (mount.overheated && mount.heat <= def.maxHeat * 0.3) mount.overheated = false;
      mount.cooldown = Math.max(0, mount.cooldown - dt);
      mount.beam = null;
      if (ship.destroyed) continue;
      const triggered = mount.hardpoint.group === 'primary' ? ship.command.firePrimary : ship.command.fireSecondary;
      if (!triggered || mount.overheated) continue;

      const muzzle = muzzlePosition(body, mount);
      const angle = firingAngle(body, muzzle, desiredAim(world, body, ship, mount, muzzle), def.gimbal);

      if (def.kind === 'projectile') {
        if (mount.cooldown > 0 || ship.energy < def.energyPerShot) continue;
        const spread = def.spread > 0 ? world.rng.range(-def.spread, def.spread) : 0;
        const dir = { x: cos(angle + spread), y: sin(angle + spread) };
        const projectileId = world.createEntity();
        world.projectiles.set(projectileId, {
          owner: id,
          position: muzzle,
          velocity: {
            x: dir.x * def.projectileSpeed + body.velocity.x * def.velocityInheritance,
            y: dir.y * def.projectileSpeed + body.velocity.y * def.velocityInheritance,
          },
          life: def.projectileLifetime,
          damage: def.damage,
          multipliers: def.multipliers,
        });
        mount.cooldown += 1 / def.fireRate;
        mount.heat += def.heatPerShot;
        ship.energy -= def.energyPerShot;
        world.events.push({ type: 'shot', owner: id, position: { ...muzzle }, direction: dir });
      } else {
        const energy = def.energyPerSecond * dt;
        if (ship.energy < energy) continue;
        ship.energy -= energy;
        mount.heat += def.heatPerSecond * dt;
        const end = { x: muzzle.x + cos(angle) * def.range, y: muzzle.y + sin(angle) * def.range };
        const hit = raycast(world, muzzle, end, id);
        mount.beam = { from: muzzle, to: hit ? hit.point : end, hit: hit ? hit.id : null };
        if (hit) applyWeaponDamage(world, hit.id, id, def.damagePerSecond * dt, def.multipliers, hit.point, true);
      }
      if (mount.heat >= def.maxHeat) {
        mount.heat = def.maxHeat;
        mount.overheated = true;
      }
    }
  }
}

/** Moves rounds and resolves hits with a swept test, so fast rounds never skip a thin target. */
export function projectileSystem(world: World, dt: number): void {
  for (const [id, round] of world.projectiles) {
    round.life -= dt;
    if (round.life <= 0) {
      world.projectiles.delete(id);
      continue;
    }
    const from = round.position;
    const to = { x: from.x + round.velocity.x * dt, y: from.y + round.velocity.y * dt };
    const hit = raycast(world, from, to, round.owner);
    if (hit) {
      world.projectiles.delete(id);
      if (world.ships.has(hit.id)) applyWeaponDamage(world, hit.id, round.owner, round.damage, round.multipliers, hit.point, false);
      else world.events.push({ type: 'hit', target: hit.id, attacker: round.owner, point: hit.point, shieldDamage: 0, hullDamage: 0, beam: false });
      continue;
    }
    round.position = to;
  }
}

/** Living ships of other factions within `range`, nearest first. */
export function hostilesNear(world: World, id: EntityId, range: number): EntityId[] {
  const self = world.ships.get(id);
  const body = world.bodies.get(id);
  if (!self || !body) return [];
  const found: { id: EntityId; d: number }[] = [];
  for (const [other, ship] of world.ships) {
    if (other === id || ship.destroyed || ship.faction === self.faction) continue;
    const p = world.bodies.get(other)!.position;
    const dx = p.x - body.position.x;
    const dy = p.y - body.position.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= range) found.push({ id: other, d });
  }
  return found.sort((a, b) => a.d - b.d || a.id - b.id).map((f) => f.id);
}
