import { cos, sin } from '@void-frontier/kernel';
import { spawnPickup } from './mining.ts';
import { moduleModifiers } from './station.ts';
import { SUBSYSTEMS, type EntityId, type SubsystemId } from './types.ts';
import type { World } from './world.ts';

/** A quarter of the hull's worth of damage in one zone wrecks the system there. */
const WRECK_FRACTION = 0.25;

/**
 * Hull damage also hurts what sits where the hit landed: the nose holds the sensors and
 * guns, the tail the engines, the middle the reactor, shield generator and hold. So the
 * angle of attack matters: hit a ship from behind and you cripple its engines.
 */
export function damageSubsystems(world: World, shipId: EntityId, point: { x: number; y: number }, hullDamage: number): void {
  const ship = world.ships.get(shipId);
  const body = world.bodies.get(shipId);
  if (!ship || !body || ship.destroyed || hullDamage <= 0) return;
  const half = ship.definition.hull.length / 2;
  const fx = cos(body.angle);
  const fy = sin(body.angle);
  const along = ((point.x - body.position.x) * fx + (point.y - body.position.y) * fy) / half;
  const amount = hullDamage / (ship.definition.hull.integrity * WRECK_FRACTION);
  const roll = world.rng.next();

  if (along > 0.35) {
    // Nose: half the time a weapon mount, otherwise the sensor array.
    if (roll < 0.5 && ship.weapons.length > 0) {
      const mount = ship.weapons[Math.floor(world.rng.next() * ship.weapons.length)];
      const before = mount.health;
      mount.health = Math.max(0, mount.health - amount);
      report(world, shipId, 'weapon', before, mount.health);
      return;
    }
    hit(world, shipId, 'sensors', amount);
  } else if (along < -0.35) {
    hit(world, shipId, 'engines', amount);
  } else {
    hit(world, shipId, roll < 0.35 ? 'reactor' : roll < 0.7 ? 'shieldGenerator' : 'cargoHold', amount);
  }
}

function hit(world: World, shipId: EntityId, system: SubsystemId, amount: number): void {
  const ship = world.ships.get(shipId)!;
  const before = ship.subsystems[system];
  ship.subsystems[system] = Math.max(0, before - amount);
  report(world, shipId, system, before, ship.subsystems[system]);
}

/** Tell the HUD when a system crosses into "damaged" (50%) or "offline" (0%). */
function report(world: World, ship: EntityId, system: SubsystemId | 'weapon', before: number, after: number): void {
  if ((before > 0.5 && after <= 0.5) || (before > 0 && after === 0)) world.events.push({ type: 'subsystemDamaged', ship, system, health: after });
}

/**
 * Ongoing subsystem effects: a breached hold leaks cargo; repair drones patch the worst
 * system while the ship is out of combat, drawing reactor energy.
 */
export function subsystemSystem(world: World, dt: number): void {
  const everySecond = world.tick % Math.round(1 / dt) === 0;
  for (const [id, ship] of world.ships) {
    if (ship.destroyed || ship.docked !== null) continue;
    const body = world.bodies.get(id)!;

    if (everySecond && ship.subsystems.cargoHold < 0.5 && ship.cargo.size > 0 && world.rng.next() < (0.5 - ship.subsystems.cargoHold) * 1.2) {
      const resources = [...ship.cargo.keys()].sort();
      const resource = resources[Math.floor(world.rng.next() * resources.length)];
      const held = ship.cargo.get(resource)!;
      const lost = Math.min(held, 1 + Math.floor(world.rng.next() * 3));
      if (held - lost > 0) ship.cargo.set(resource, held - lost);
      else ship.cargo.delete(resource);
      spawnPickup(world, resource, lost, { ...body.position }, { x: body.velocity.x + world.rng.range(-4, 4), y: body.velocity.y + world.rng.range(-4, 4) }, world.tick + Math.round(6 / dt));
    }

    const { repairRate } = moduleModifiers(ship.upgrades);
    const calm = (world.tick - ship.lastDamageTick) * dt > 5;
    const energy = 4 * dt;
    if (repairRate > 0 && calm && ship.energy >= energy) {
      let worst: { health: number; set(v: number): void } | null = null;
      for (const system of SUBSYSTEMS) {
        if (ship.subsystems[system] < 1 && (!worst || ship.subsystems[system] < worst.health)) worst = { health: ship.subsystems[system], set: (v) => (ship.subsystems[system] = v) };
      }
      for (const mount of ship.weapons) {
        if (mount.health < 1 && (!worst || mount.health < worst.health)) worst = { health: mount.health, set: (v) => (mount.health = v) };
      }
      if (worst) {
        worst.set(Math.min(1, worst.health + repairRate * dt));
        ship.energy -= energy;
      }
    }
  }
}
