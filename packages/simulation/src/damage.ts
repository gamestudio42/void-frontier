import { FACTIONS } from '@void-frontier/content';
import { dropSalvage } from './mining.ts';
import { damageSubsystems } from './subsystems.ts';
import type { EntityId } from './types.ts';
import type { World } from './world.ts';

/** Marks a ship destroyed, removes its collider and emits the event. Safe to call twice. */
export function destroyShip(world: World, id: EntityId, by: EntityId | null): void {
  const ship = world.ships.get(id);
  if (!ship || ship.destroyed) return;
  ship.hull = 0;
  ship.destroyed = true;
  ship.shield = 0;
  for (const weapon of ship.weapons) weapon.beam = null;
  // The wreck is gone as a solid object; its body stays so the camera can settle.
  world.colliders.delete(id);
  const body = world.bodies.get(id)!;
  world.events.push({ type: 'shipDestroyed', id, position: { x: body.position.x, y: body.position.y }, by });
  if (ship.faction === 'pirate') dropSalvage(world, body.position, body.velocity);
  if (by !== null) {
    const killer = world.ships.get(by);
    if (killer) killer.kills++;
    // Lawful factions thank whoever thins out the pirates, and more when it saves one of their haulers.
    if (killer?.faction === 'player' && ship.faction === 'pirate') {
      for (const faction of FACTIONS.values()) {
        if (faction.hostile || faction.killReward <= 0) continue;
        world.standing[faction.id] = Math.min(100, (world.standing[faction.id] ?? 0) + faction.killReward);
      }
      for (const [otherId, other] of world.ships) {
        if (other.faction !== 'trader' || other.destroyed || !other.allegiance || (world.tick - other.lastDamageTick) / 60 > 15) continue;
        const p = world.bodies.get(otherId)!.position;
        const dx = p.x - body.position.x;
        const dy = p.y - body.position.y;
        if (dx * dx + dy * dy > 1200 * 1200) continue;
        world.standing[other.allegiance] = Math.min(100, (world.standing[other.allegiance] ?? 0) + 3);
      }
    }
    // Shooting down a hauler is remembered.
    if (killer?.faction === 'player' && ship.faction === 'trader' && ship.allegiance) {
      world.standing[ship.allegiance] = Math.max(-100, (world.standing[ship.allegiance] ?? 0) - 15);
    }
  }
}

/**
 * Weapon damage through the defence layers: shield first (scaled by the shield
 * multiplier), then armour stops a fraction, then the hull takes the rest.
 */
export function applyWeaponDamage(
  world: World,
  targetId: EntityId,
  attackerId: EntityId,
  amount: number,
  multipliers: { shield: number; hull: number },
  point: { x: number; y: number },
  beam: boolean,
): void {
  const ship = world.ships.get(targetId);
  if (!ship || ship.destroyed || ship.docked !== null || amount <= 0) return;
  ship.lastDamageTick = world.tick;
  let raw = amount;
  let shieldDamage = 0;
  if (ship.shield > 0) {
    const scaled = raw * multipliers.shield;
    if (scaled <= ship.shield) {
      ship.shield -= scaled;
      shieldDamage = scaled;
      raw = 0;
    } else {
      shieldDamage = ship.shield;
      raw -= ship.shield / multipliers.shield;
      ship.shield = 0;
    }
  }
  const hullDamage = raw * multipliers.hull * (1 - ship.definition.hull.armor);
  if (ship.faction === 'trader' && ship.allegiance && world.ships.get(attackerId)?.faction === 'player') {
    world.standing[ship.allegiance] = Math.max(-100, (world.standing[ship.allegiance] ?? 0) - (shieldDamage + hullDamage) * 0.02);
  }
  ship.hull = Math.max(0, ship.hull - hullDamage);
  damageSubsystems(world, targetId, point, hullDamage);
  world.events.push({ type: 'hit', target: targetId, attacker: attackerId, point: { ...point }, shieldDamage, hullDamage, beam });
  if (ship.hull === 0) destroyShip(world, targetId, attackerId);
}
