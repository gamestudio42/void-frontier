import { CONTRACT_RULES } from '@void-frontier/content';
import { destroyShip } from './damage.ts';
import { holdSpaceFor } from './ship.ts';
import type { Simulation } from './simulation.ts';
import { isDisabled } from './subsystems.ts';
import type { EntityId } from './types.ts';

export interface BoardingStatus {
  id: EntityId;
  distance: number;
  relativeSpeed: number;
  ready: boolean;
}

/** The nearest disabled pirate in reach of the player, if any. */
export function boardingStatus(sim: Simulation): BoardingStatus | null {
  const world = sim.world;
  const me = world.ships.get(sim.playerId);
  const body = world.bodies.get(sim.playerId);
  if (!me || !body || me.destroyed || me.docked !== null) return null;
  const rules = CONTRACT_RULES.boarding;
  let best: BoardingStatus | null = null;
  for (const [id, ship] of world.ships) {
    if (!isDisabled(ship)) continue;
    const other = world.bodies.get(id)!;
    const dx = other.position.x - body.position.x;
    const dy = other.position.y - body.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    // The prompt shows a little beyond reach, so the player can line up.
    if (distance > rules.range * 4 || (best && distance >= best.distance)) continue;
    const vx = other.velocity.x - body.velocity.x;
    const vy = other.velocity.y - body.velocity.y;
    const relativeSpeed = Math.sqrt(vx * vx + vy * vy);
    best = { id, distance, relativeSpeed, ready: distance <= rules.range && relativeSpeed <= rules.maxSpeed };
  }
  return best;
}

/** Boards a disabled ship in reach: its holds and strongbox are the player's, and it is scuttled. */
export function boardDisabled(sim: Simulation): { ok: true; credits: number; salvage: number } | { ok: false } {
  const status = boardingStatus(sim);
  if (!status?.ready) return { ok: false };
  const world = sim.world;
  const rules = CONTRACT_RULES.boarding;
  const me = world.ships.get(sim.playerId)!;
  const credits = Math.round(world.rng.range(rules.minCredits, rules.maxCredits));
  const salvage = Math.min(Math.round(world.rng.range(rules.minSalvage, rules.maxSalvage)), holdSpaceFor(me, 'salvage'));
  world.credits += credits;
  if (salvage > 0) me.cargo.set('salvage', (me.cargo.get('salvage') ?? 0) + salvage);
  destroyShip(world, status.id, sim.playerId);
  world.events.push({ type: 'boarded', ship: status.id, credits, salvage });
  return { ok: true, credits, salvage };
}
