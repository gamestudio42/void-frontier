import { PIRATE_RULES, getArchetype } from '@void-frontier/content';
import type { EntityId } from './types.ts';
import type { World } from './world.ts';

/**
 * Pirate nerve. Hull damage and losses in the squad wear it down; quiet time brings it
 * back toward the pilot's courage. When it breaks the pilot runs for a while and then
 * regroups, or, badly hurt, gives up and waits to be boarded. Fearless pilots (the boss)
 * never break. Only pirates have morale.
 */
export function shaken(world: World, id: EntityId, amount: number): void {
  const pilot = world.pilots.get(id);
  const ship = world.ships.get(id);
  if (!pilot || !ship || pilot.morale === undefined || ship.destroyed || amount <= 0) return;
  pilot.morale = Math.max(0, pilot.morale - amount);
}

/** A pirate died: the rest of its squad takes it hard, harder when it was the leader. */
export function squadLost(world: World, id: EntityId): void {
  const lost = world.pilots.get(id);
  if (lost?.squad === undefined) return;
  const rules = PIRATE_RULES.morale;
  const leader = lost.squad === id;
  for (const [other, pilot] of world.pilots) {
    if (other !== id && pilot.squad === lost.squad) shaken(world, other, leader ? rules.leaderLoss : rules.squadLoss);
  }
}

export function surrender(world: World, id: EntityId): void {
  const ship = world.ships.get(id);
  const pilot = world.pilots.get(id);
  if (!ship || !pilot || ship.destroyed || ship.surrendered) return;
  ship.surrendered = true;
  pilot.mode = 'surrendered';
  pilot.target = null;
  world.events.push({ type: 'morale', ship: id, state: 'surrendered' });
}

export function moraleSystem(world: World, dt: number): void {
  const rules = PIRATE_RULES.morale;
  for (const [id, pilot] of world.pilots) {
    const ship = world.ships.get(id);
    if (!ship || ship.destroyed || ship.surrendered || pilot.morale === undefined) continue;
    const archetype = getArchetype(pilot.archetype, ship.baseDefinition.id);
    if ((world.tick - ship.lastDamageTick) * dt > rules.calmAfter) pilot.morale = Math.min(archetype.courage, pilot.morale + rules.recoverPerSecond * dt);
    if (archetype.fearless || ship.elite?.fearless || ship.boss) continue;
    const hull = ship.hull / ship.definition.hull.integrity;
    if (pilot.mode === 'flee') {
      if (world.tick >= (pilot.fleeUntil ?? 0)) {
        // Far enough: regroup, a little steadier than when it broke.
        pilot.mode = 'patrol';
        pilot.target = null;
        pilot.morale = Math.max(pilot.morale, rules.fleeBelow + 0.15);
        pilot.surrenderRolled = false;
        world.events.push({ type: 'morale', ship: id, state: 'rallied' });
        continue;
      }
    } else if (pilot.morale < rules.fleeBelow) {
      pilot.mode = 'flee';
      pilot.fleeUntil = world.tick + Math.round(rules.fleeSeconds / dt);
      world.events.push({ type: 'morale', ship: id, state: 'fleeing' });
    }
    // Broken and badly hurt, a pilot decides once whether to give up.
    if (pilot.mode === 'flee' && !pilot.surrenderRolled && pilot.morale < rules.surrenderBelow && hull < rules.surrenderHull) {
      pilot.surrenderRolled = true;
      if (world.rng.next() < rules.surrenderChance) surrender(world, id);
    }
  }
}
