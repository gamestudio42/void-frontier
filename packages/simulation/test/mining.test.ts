import { describe, expect, it } from 'vitest';
import { getResource, getShip } from '@void-frontier/content';
import { CHUNK_UNITS, Simulation, applyWeaponDamage, holdMass, holdSpaceFor, readTelemetry, spawnAsteroid, spawnPickup, spawnShip } from '../src/index.ts';
import { body, ship } from './helpers.ts';

const kestrel = getShip('kestrel');

/** A kestrel at the origin facing +X with a rock of `radius` whose surface is `gap` metres ahead of the mining laser. */
function rig(radius = 8, gap = 30, type = 'cupric') {
  const sim = new Simulation();
  const id = spawnShip(sim.world, kestrel);
  sim.playerId = id;
  const muzzle = kestrel.hardpoints.find((h) => h.group === 'mining')!.x;
  const rock = spawnAsteroid(sim.world, type, radius, { x: muzzle + gap + radius, y: 0 }, { x: 0, y: 0 }, 0, 0, 1);
  return { sim, id, rock };
}

describe('mining laser', () => {
  it('extracts ore and ejects it as chunks', () => {
    const { sim, id, rock } = rig();
    const before = sim.world.asteroids.get(rock)!.ore;
    sim.setCommand(id, { fireMining: true });
    sim.run(60 * 3);
    expect(sim.world.asteroids.get(rock)!.ore).toBeLessThan(before);
    expect(sim.world.pickups.size).toBeGreaterThan(0);
    for (const p of sim.world.pickups.values()) expect(p.resource).toBe('copper_ore');
  });

  it('works best inside the optimal range', () => {
    const near = rig(20, 20);
    const far = rig(20, 150);
    for (const r of [near, far]) {
      r.sim.setCommand(r.id, { fireMining: true });
      r.sim.run(120);
    }
    const taken = (r: typeof near) => r.sim.world.asteroids.get(r.rock)!.oreMax - r.sim.world.asteroids.get(r.rock)!.ore;
    expect(taken(near)).toBeGreaterThan(taken(far) * 2);
  });

  it('does nothing beyond its range', () => {
    const { sim, id, rock } = rig(8, 200);
    sim.setCommand(id, { fireMining: true });
    sim.run(120);
    const r = sim.world.asteroids.get(rock)!;
    expect(r.ore).toBe(r.oreMax);
  });

  it('shrinks the rock as ore runs out and breaks small rocks when empty', () => {
    const { sim, id, rock } = rig(5, 20);
    const startRadius = sim.world.asteroids.get(rock)!.radius;
    sim.setCommand(id, { fireMining: true });
    let shrunk = false;
    let broke = false;
    for (let i = 0; i < 60 * 60 && !broke; i++) {
      sim.step();
      const r = sim.world.asteroids.get(rock);
      if (r && r.radius < startRadius) shrunk = true;
      broke = sim.drainEvents().some((e) => e.type === 'asteroidDepleted' && e.id === rock);
    }
    expect(shrunk).toBe(true);
    expect(broke).toBe(true);
    expect(sim.world.colliders.has(rock)).toBe(false);
  });

  it('leaves a husk of a large rock with a smaller collider', () => {
    const { sim, rock } = rig(20, 20);
    const r = sim.world.asteroids.get(rock)!;
    r.ore = 1;
    sim.setCommand(sim.playerId, { fireMining: true });
    sim.run(60);
    expect(sim.world.asteroids.has(rock)).toBe(true);
    expect(sim.world.colliders.get(rock)!.circles[0].r).toBeCloseTo(20 * Math.cbrt(0.3), 6);
  });
});

describe('tractor and hold', () => {
  it('pulls nearby ore into the hold and the ship gets heavier', () => {
    const { sim, id } = rig();
    const massBefore = body(sim, id).mass;
    spawnPickup(sim.world, 'iron_ore', 10, { x: 40, y: 10 }, { x: 0, y: 0 });
    sim.run(60 * 5);
    expect(ship(sim, id).cargo.get('iron_ore')).toBe(10);
    expect(sim.world.pickups.size).toBe(0);
    expect(body(sim, id).mass).toBeCloseTo(massBefore + 10 * getResource('iron_ore').unitMass, 6);
  });

  it('ignores ore outside tractor range', () => {
    const { sim, id } = rig();
    spawnPickup(sim.world, 'iron_ore', 10, { x: 0, y: 300 }, { x: 0, y: 0 });
    sim.run(120);
    expect(ship(sim, id).cargo.size).toBe(0);
  });

  it('mines, collects and loses acceleration: the full loop', () => {
    const { sim, id } = rig(10, 25);
    const accelBefore = readTelemetry(sim.world, id)!.mainAcceleration;
    sim.setCommand(id, { fireMining: true });
    sim.run(60 * 25);
    const t = readTelemetry(sim.world, id)!;
    expect(t.hold.find((h) => h.resource === 'copper_ore')!.units).toBeGreaterThanOrEqual(CHUNK_UNITS * 3);
    expect(t.mainAcceleration).toBeLessThan(accelBefore);
  });

  it('respects the hold mass limit and leaves the rest floating', () => {
    const { sim, id } = rig();
    const unitMass = getResource('iron_ore').unitMass;
    const capacity = Math.floor(kestrel.cargo.maxMass / unitMass);
    spawnPickup(sim.world, 'iron_ore', capacity + 15, { x: 30, y: 0 }, { x: 0, y: 0 });
    sim.run(60 * 6);
    expect(ship(sim, id).cargo.get('iron_ore')).toBe(capacity);
    expect([...sim.world.pickups.values()][0].units).toBe(15);
    expect(holdSpaceFor(ship(sim, id), 'iron_ore')).toBe(0);
    expect(holdMass(ship(sim, id))).toBeLessThanOrEqual(kestrel.cargo.maxMass);
  });

  it('jettisons the hold behind the ship and does not grab it straight back', () => {
    const { sim, id } = rig();
    ship(sim, id).cargo.set('titanium_ore', 25);
    const dropped = sim.jettison(id);
    expect(dropped).toBe(25);
    expect(ship(sim, id).cargo.size).toBe(0);
    sim.run(60);
    expect(ship(sim, id).cargo.size).toBe(0);
    const floating = [...sim.world.pickups.values()].reduce((sum, p) => sum + p.units, 0);
    expect(floating).toBe(25);
  });
});

describe('scanner', () => {
  it('reveals rocks in range and then needs to recharge', () => {
    const sim = new Simulation();
    const id = spawnShip(sim.world, kestrel);
    const near = spawnAsteroid(sim.world, 'ferrous', 6, { x: 300, y: 0 }, { x: 0, y: 0 }, 0, 0, 1);
    const far = spawnAsteroid(sim.world, 'ferrous', 6, { x: kestrel.sensors.scanRange + 200, y: 0 }, { x: 0, y: 0 }, 0, 0, 2);
    expect(sim.scan(id)).toBe(true);
    expect(sim.world.scanned.has(near)).toBe(true);
    expect(sim.world.scanned.has(far)).toBe(false);
    expect(sim.scan(id)).toBe(false);
    sim.run(Math.round(kestrel.sensors.scanCooldown * 60));
    expect(sim.scan(id)).toBe(true);
  });

  it('forgets readings after a while', () => {
    const sim = new Simulation();
    const id = spawnShip(sim.world, kestrel);
    const rock = spawnAsteroid(sim.world, 'ferrous', 6, { x: 300, y: 0 }, { x: 0, y: 0 }, 0, 0, 1);
    sim.scan(id);
    sim.run(60 * 31);
    expect(sim.world.scanned.has(rock)).toBe(false);
  });
});

describe('salvage', () => {
  it('drops salvage from a destroyed pirate', () => {
    const sim = new Simulation();
    const me = spawnShip(sim.world, kestrel);
    const pirate = spawnShip(sim.world, getShip('jackal'), { position: { x: 200, y: 0 }, faction: 'pirate' });
    ship(sim, pirate).shield = 0;
    applyWeaponDamage(sim.world, pirate, me, 10_000, { shield: 1, hull: 1 }, { x: 200, y: 0 }, false);
    const salvage = [...sim.world.pickups.values()].filter((p) => p.resource === 'salvage');
    expect(salvage.length).toBeGreaterThanOrEqual(3);
  });
});
