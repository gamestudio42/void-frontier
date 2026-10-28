import { getResource } from '@void-frontier/content';
import { PI, TAU, cbrt, cos, sin } from '@void-frontier/kernel';
import { forwardOf, holdSpaceFor } from './ship.ts';
import type { EntityId, Pickup } from './types.ts';
import type { World } from './world.ts';

/** Ore leaves a rock in chunks of this many units. */
export const CHUNK_UNITS = 4;
/** Below this base radius a fully mined rock breaks apart; larger ones remain as husks. */
const BREAKABLE_RADIUS = 12;
/** Fraction of a rock's volume left when its ore is gone. */
const HUSK_VOLUME = 0.3;
/** Seconds a scan reading lasts. */
const SCAN_DURATION = 30;
const PICKUP_LIFE = 150;
const TRACTOR_ACCELERATION = 70;

export function spawnPickup(world: World, resource: string, units: number, position: { x: number; y: number }, velocity: { x: number; y: number }, freeAfterTick = 0): EntityId {
  const id = world.createEntity();
  const pickup: Pickup = { resource, units, position: { ...position }, velocity: { ...velocity }, life: PICKUP_LIFE, freeAfterTick };
  world.pickups.set(id, pickup);
  return id;
}

/**
 * Removes ore from a rock. Every CHUNK_UNITS extracted are ejected as a chunk from the
 * point being cut; the rock shrinks with what is left and small ones break when empty.
 */
export function extractOre(world: World, asteroidId: EntityId, units: number, point: { x: number; y: number }): void {
  const rock = world.asteroids.get(asteroidId);
  const body = world.bodies.get(asteroidId);
  if (!rock || !body || rock.ore <= 0) return;
  const taken = Math.min(units, rock.ore);
  rock.ore -= taken;
  rock.pendingOre += taken;

  const nx = point.x - body.position.x;
  const ny = point.y - body.position.y;
  const nl = Math.sqrt(nx * nx + ny * ny) || 1;
  while (rock.pendingOre >= CHUNK_UNITS || (rock.ore <= 0 && rock.pendingOre > 0.5)) {
    const chunk = Math.min(CHUNK_UNITS, Math.round(rock.pendingOre));
    rock.pendingOre = Math.max(0, rock.pendingOre - chunk);
    const speed = world.rng.range(3, 7);
    const swirl = world.rng.range(-2.5, 2.5);
    spawnPickup(world, rock.type.resource, chunk, { x: point.x + (nx / nl) * 2, y: point.y + (ny / nl) * 2 }, {
      x: body.velocity.x + (nx / nl) * speed - (ny / nl) * swirl,
      y: body.velocity.y + (ny / nl) * speed + (nx / nl) * swirl,
    });
  }

  if (rock.ore <= 0 && rock.baseRadius < BREAKABLE_RADIUS) {
    world.events.push({ type: 'asteroidDepleted', id: asteroidId, position: { ...body.position }, radius: rock.radius, asteroidType: rock.type.id });
    world.destroyEntity(asteroidId);
    return;
  }
  resizeRock(world, asteroidId);
}

export function resizeRock(world: World, id: EntityId): void {
  const rock = world.asteroids.get(id)!;
  const body = world.bodies.get(id)!;
  const collider = world.colliders.get(id)!;
  const remaining = rock.oreMax > 0 ? rock.ore / rock.oreMax : 0;
  rock.radius = rock.baseRadius * cbrt(HUSK_VOLUME + (1 - HUSK_VOLUME) * remaining);
  collider.circles[0].r = rock.radius;
  collider.bound = rock.radius;
  body.mass = rock.type.density * (4 / 3) * PI * rock.radius * rock.radius * rock.radius;
  body.inertia = 0.4 * body.mass * rock.radius * rock.radius;
}

/** Drifts loose ore and pulls it into holds with a working tractor. */
export function pickupSystem(world: World, dt: number): void {
  for (const [id, pickup] of world.pickups) {
    pickup.life -= dt;
    if (pickup.life <= 0) {
      world.pickups.delete(id);
      continue;
    }
    pickup.position.x += pickup.velocity.x * dt;
    pickup.position.y += pickup.velocity.y * dt;
    if (world.tick < pickup.freeAfterTick) continue;

    for (const [shipId, ship] of world.ships) {
      const range = ship.definition.tractor.range;
      if (range <= 0 || ship.destroyed) continue;
      const body = world.bodies.get(shipId)!;
      const dx = body.position.x - pickup.position.x;
      const dy = body.position.y - pickup.position.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > range) continue;
      const space = holdSpaceFor(ship, pickup.resource);
      if (space <= 0) {
        if (world.tick % 60 === 0) world.events.push({ type: 'cargoFull', ship: shipId });
        continue;
      }
      if (d <= ship.definition.tractor.collectRadius) {
        const taken = Math.min(space, pickup.units);
        ship.cargo.set(pickup.resource, (ship.cargo.get(pickup.resource) ?? 0) + taken);
        pickup.units -= taken;
        world.events.push({ type: 'collected', ship: shipId, resource: pickup.resource, units: taken });
        if (pickup.units <= 0) world.pickups.delete(id);
        break;
      }
      // Ease toward the ship's own motion plus a closing speed, capped by the tractor's pull.
      const closing = Math.min(45, d * 1.5);
      const wantX = body.velocity.x + (dx / d) * closing;
      const wantY = body.velocity.y + (dy / d) * closing;
      const ex = wantX - pickup.velocity.x;
      const ey = wantY - pickup.velocity.y;
      const el = Math.sqrt(ex * ex + ey * ey);
      const step = Math.min(el, TRACTOR_ACCELERATION * dt);
      if (el > 1e-9) {
        pickup.velocity.x += (ex / el) * step;
        pickup.velocity.y += (ey / el) * step;
      }
      break;
    }
  }
}

/** Scanner pulse: reveals rock composition within range for a while. Returns false while recharging. */
export function scan(world: World, shipId: EntityId, dt: number): boolean {
  const ship = world.ships.get(shipId);
  const body = world.bodies.get(shipId);
  // A wrecked sensor array cannot pulse; a damaged one reaches less far.
  if (!ship || !body || ship.destroyed || world.tick < ship.scanReadyTick || ship.subsystems.sensors < 0.15) return false;
  const range = ship.definition.sensors.scanRange * (0.4 + 0.6 * ship.subsystems.sensors);
  ship.scanReadyTick = world.tick + Math.round(ship.definition.sensors.scanCooldown / dt);
  const until = world.tick + Math.round(SCAN_DURATION / dt);
  let found = 0;
  for (const [id] of world.asteroids) {
    const p = world.bodies.get(id)!.position;
    const dx = p.x - body.position.x;
    const dy = p.y - body.position.y;
    if (dx * dx + dy * dy <= range * range) {
      world.scanned.set(id, until);
      found++;
    }
  }
  world.events.push({ type: 'scan', owner: shipId, position: { ...body.position }, range, found });
  return true;
}

/** Drops the whole hold behind the ship; the tractor ignores it for a few seconds. */
export function jettison(world: World, shipId: EntityId, dt: number): number {
  const ship = world.ships.get(shipId);
  const body = world.bodies.get(shipId);
  if (!ship || !body) return 0;
  const back = forwardOf(body.angle);
  let dropped = 0;
  for (const [resource, units] of ship.cargo) {
    let left = units;
    while (left > 0) {
      const chunk = Math.min(10, left);
      left -= chunk;
      const spread = world.rng.range(-0.6, 0.6);
      const speed = world.rng.range(4, 9);
      spawnPickup(
        world,
        resource,
        chunk,
        { x: body.position.x - back.x * 10, y: body.position.y - back.y * 10 },
        { x: body.velocity.x - (back.x * cos(spread) - back.y * sin(spread)) * speed, y: body.velocity.y - (back.y * cos(spread) + back.x * sin(spread)) * speed },
        world.tick + Math.round(4 / dt),
      );
      dropped += chunk;
    }
  }
  ship.cargo.clear();
  return dropped;
}

/** Pirate wrecks shed salvage. */
export function dropSalvage(world: World, position: { x: number; y: number }, velocity: { x: number; y: number }): void {
  const chunks = 3 + Math.floor(world.rng.next() * 3);
  for (let i = 0; i < chunks; i++) {
    const a = world.rng.range(0, TAU);
    const s = world.rng.range(4, 12);
    spawnPickup(world, 'salvage', 4, position, { x: velocity.x + cos(a) * s, y: velocity.y + sin(a) * s });
  }
}

/** Expire old scan readings. */
export function scanExpirySystem(world: World): void {
  for (const [id, until] of world.scanned) if (world.tick >= until || !world.asteroids.has(id)) world.scanned.delete(id);
}

export const resourceColor = (id: string): string => getResource(id).color;
