import { MINING_RULES, getResource, type MiningRules } from '@void-frontier/content';
import { PI, TAU, atan2, cbrt, cos, sin } from '@void-frontier/kernel';
import { applyWeaponDamage } from './damage.ts';
import { forwardOf, holdSpaceFor } from './ship.ts';
import type { EntityId, Pickup } from './types.ts';
import { spawnAsteroid } from './universe.ts';
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

/** Smallest angle between two directions, radians, 0..PI. */
function angleBetween(a: number, b: number): number {
  let d = (a - b) % TAU;
  if (d < 0) d += TAU;
  return d > PI ? TAU - d : d;
}

/** Whether a cut at `point` lands on the rock's rich vein (the vein turns with the rock). */
export function onVein(world: World, asteroidId: EntityId, point: { x: number; y: number }, rules: MiningRules = MINING_RULES): boolean {
  const rock = world.asteroids.get(asteroidId);
  const body = world.bodies.get(asteroidId);
  if (!rock || !body) return false;
  const bearing = atan2(point.y - body.position.y, point.x - body.position.x);
  return angleBetween(bearing, body.angle + rock.vein) <= (rules.veinWidth * PI) / 180;
}

/** Extraction multiplier for a rock's heat: cold is slow, the sweet spot is best, hot is risky. */
export function stressYield(stress: number, rules: MiningRules = MINING_RULES): number {
  if (stress < rules.sweetSpot[0]) return rules.coldYield;
  if (stress <= rules.sweetSpot[1]) return rules.sweetYield;
  return rules.hotYield;
}

/**
 * One step of a mining laser on a rock: the rock heats (small rocks faster), the ore comes
 * out at the laser's rate times the vein and heat multipliers, and a rock pushed past its
 * fracture threshold cracks.
 */
export function cutRock(world: World, asteroidId: EntityId, rate: number, point: { x: number; y: number }, dt: number, by: EntityId | null, rules: MiningRules = MINING_RULES): void {
  const rock = world.asteroids.get(asteroidId);
  if (!rock) return;
  const yieldFactor = (onVein(world, asteroidId, point, rules) ? rules.veinYield : rules.offVeinYield) * stressYield(rock.stress, rules);
  const size = Math.min(2, Math.max(0.5, rules.referenceRadius / Math.max(1, rock.radius)));
  rock.stress += rules.heatPerSecond * size * dt;
  rock.cutTick = world.tick;
  world.heated.add(asteroidId);
  extractOre(world, asteroidId, rate * yieldFactor * dt, point);
  if (world.asteroids.has(asteroidId) && rock.stress >= rules.fractureAt) fractureRock(world, asteroidId, by, rules);
}

/** Rocks nobody is cutting give their heat back to space. */
export function rockCoolingSystem(world: World, dt: number, rules: MiningRules = MINING_RULES): void {
  for (const id of world.heated) {
    const rock = world.asteroids.get(id);
    if (!rock) {
      world.heated.delete(id);
      continue;
    }
    if (rock.cutTick === world.tick) continue;
    rock.stress = Math.max(0, rock.stress - rules.coolPerSecond * dt);
    if (rock.stress === 0) world.heated.delete(id);
  }
}

/**
 * Cracks an overheated rock. Part of its ore is lost; the rest goes into two or three
 * fragments (real rocks, with their share of the mass, drifting apart) or, when they would
 * be too small, spills as loose ore. A volatile rock explodes and hurts ships nearby.
 */
export function fractureRock(world: World, asteroidId: EntityId, by: EntityId | null, rules: MiningRules = MINING_RULES): void {
  const rock = world.asteroids.get(asteroidId);
  const body = world.bodies.get(asteroidId);
  if (!rock || !body) return;
  const position = { ...body.position };
  const velocity = { ...body.velocity };
  const kept = Math.max(0, rock.ore * (1 - rules.fractureLoss));
  const volatile = rock.type.volatile === true;
  const count = 2 + (world.rng.next() < 0.5 ? 1 : 0);
  const radius = rock.radius * cbrt(1 / count);
  const scanned = world.scanned.get(asteroidId);
  const start = world.rng.range(0, TAU);
  world.destroyEntity(asteroidId);
  let pieces = 0;
  if (!volatile && radius >= rules.fragmentMinRadius) {
    // Far enough apart that the pieces do not overlap.
    const spread = (radius * 1.05) / sin(PI / count);
    for (let i = 0; i < count; i++) {
      const a = start + (i * TAU) / count;
      const kick = world.rng.range(1.5, 3);
      const id = spawnAsteroid(
        world,
        rock.type.id,
        radius,
        { x: position.x + cos(a) * spread, y: position.y + sin(a) * spread },
        { x: velocity.x + cos(a) * kick, y: velocity.y + sin(a) * kick },
        world.rng.range(-PI, PI),
        world.rng.range(-0.4, 0.4),
        rock.look + i + 1,
      );
      const piece = world.asteroids.get(id)!;
      const share = kept / count;
      piece.ore = share;
      piece.oreMax = Math.max(share, 1);
      piece.baseRadius = radius;
      piece.vein = rock.vein;
      piece.fragment = true;
      if (scanned !== undefined) world.scanned.set(id, scanned);
      resizeRock(world, id);
      pieces++;
    }
  } else if (!volatile) {
    // Too small to hold together: the ore that survives floats free for the tractor.
    let left = Math.round(kept);
    while (left > 0) {
      const units = Math.min(CHUNK_UNITS, left);
      left -= units;
      const a = world.rng.range(0, TAU);
      const s = world.rng.range(2, 6);
      spawnPickup(world, rock.type.resource, units, position, { x: velocity.x + cos(a) * s, y: velocity.y + sin(a) * s });
    }
  } else {
    const blast = rules.volatileBlast;
    for (const [id, ship] of world.ships) {
      const b = world.bodies.get(id);
      if (!b || ship.destroyed) continue;
      const dx = b.position.x - position.x;
      const dy = b.position.y - position.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d >= blast.radius + rock.radius) continue;
      const falloff = 1 - Math.max(0, d - rock.radius) / blast.radius;
      applyWeaponDamage(world, id, by ?? id, blast.damage * falloff, { shield: 1, hull: 1 }, b.position, false);
    }
  }
  world.events.push({ type: 'asteroidFractured', id: asteroidId, position, radius: rock.radius, asteroidType: rock.type.id, pieces, volatile, by });
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
        // Salvage rigs recover extra from every scrap.
        const gained = pickup.resource === 'salvage' ? Math.min(space, Math.round(taken * ship.definition.salvageYield)) : taken;
        ship.cargo.set(pickup.resource, (ship.cargo.get(pickup.resource) ?? 0) + gained);
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
