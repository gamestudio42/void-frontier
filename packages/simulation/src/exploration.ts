import { spawnPickup } from './mining.ts';
import type { EntityId } from './types.ts';
import type { World } from './world.ts';

/** Metres within which a derelict or cache is found by flying to it. */
export const VISIT_RADIUS = 90;

/**
 * Gravity wells pull ships toward their centre with a = strength / d^2, capped inside
 * the core. The pull is a force like any other, so thrusters fight it honestly.
 */
export function gravitySystem(world: World): void {
  if (world.anomalies.length === 0) return;
  for (const [id, ship] of world.ships) {
    if (ship.docked !== null) continue;
    const body = world.bodies.get(id)!;
    for (const well of world.anomalies) {
      const dx = well.position.x - body.position.x;
      const dy = well.position.y - body.position.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > well.radius || d < 1e-6) continue;
      const r = Math.max(d, well.coreRadius);
      const accel = well.strength / (r * r);
      body.force.x += (dx / d) * accel * body.mass;
      body.force.y += (dy / d) * accel * body.mass;
    }
  }
}

/** m/s^2 of pull on a ship from every well, for the HUD. */
export function gravityAt(world: World, position: { x: number; y: number }): number {
  let total = 0;
  for (const well of world.anomalies) {
    const d = Math.sqrt((well.position.x - position.x) * (well.position.x - position.x) + (well.position.y - position.y) * (well.position.y - position.y));
    if (d > well.radius) continue;
    const r = Math.max(d, well.coreRadius);
    total += well.strength / (r * r);
  }
  return total;
}

/** Marks a point of interest found, pays its reward once and drops its goods nearby. */
export function discover(world: World, poiId: string): void {
  const poi = world.pointsOfInterest.get(poiId);
  if (!poi || poi.found) return;
  poi.found = true;
  world.credits += poi.reward.credits;
  let left = poi.reward.units;
  while (left > 0) {
    const chunk = Math.min(5, left);
    left -= chunk;
    const a = world.rng.range(0, 6.283185307179586);
    spawnPickup(world, poi.reward.resource, chunk, { x: poi.position.x, y: poi.position.y }, { x: Math.sqrt(9) * (a < 3.14 ? 1 : -1) * world.rng.range(0.5, 1), y: world.rng.range(-3, 3) });
  }
  world.events.push({ type: 'discovered', id: poiId, kind: poi.kind, credits: poi.reward.credits });
}

/** Derelicts and caches are found by flying close; deposits need a scanner pulse in range. */
export function explorationSystem(world: World, playerId: EntityId): void {
  const body = world.bodies.get(playerId);
  const ship = world.ships.get(playerId);
  if (!body || !ship || ship.destroyed) return;
  const scanned = world.events.some((e) => e.type === 'scan' && e.owner === playerId);
  for (const [id, poi] of world.pointsOfInterest) {
    if (poi.found) continue;
    const dx = poi.position.x - body.position.x;
    const dy = poi.position.y - body.position.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (poi.kind === 'deposit' ? scanned && d <= ship.definition.sensors.scanRange : d <= VISIT_RADIUS) discover(world, id);
  }
}

export interface GateStatus {
  id: string;
  to: string;
  position: { x: number; y: number };
  distance: number;
  speed: number;
  /** Inside the ring and slow enough to jump. */
  ready: boolean;
}

export const GATE_RADIUS = 45;
export const GATE_MAX_SPEED = 30;

/** The nearest jump gate within `range`, with whether the ship can jump now. */
export function gateStatus(world: World, shipId: EntityId, range = 500): GateStatus | null {
  const body = world.bodies.get(shipId);
  const ship = world.ships.get(shipId);
  if (!body || !ship || ship.destroyed || ship.docked !== null) return null;
  let best: GateStatus | null = null;
  for (const gate of world.gates.values()) {
    const dx = gate.position.x - body.position.x;
    const dy = gate.position.y - body.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > range || (best && distance >= best.distance)) continue;
    const speed = Math.sqrt(body.velocity.x * body.velocity.x + body.velocity.y * body.velocity.y);
    best = { id: gate.id, to: gate.to, position: gate.position, distance, speed, ready: distance <= GATE_RADIUS && speed <= GATE_MAX_SPEED };
  }
  return best;
}
