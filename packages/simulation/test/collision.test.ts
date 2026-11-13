import { describe, expect, it } from 'vitest';
import { COLLISION_RULES, OUTPOST_ALPHA, getShip } from '@void-frontier/content';
import { Simulation, impactDamage, nearestObstacle, spawnAsteroid, spawnShip, spawnStation } from '../src/index.ts';
import { body, ship } from './helpers.ts';

const kestrel = getShip('kestrel');

/** A kestrel at (0, 0) flying +X at `speed` toward a rock of radius `radius` placed `gap` metres ahead of its nose. */
function headOn(speed: number, radius = 20, gap = 20) {
  const sim = new Simulation();
  const id = spawnShip(sim.world, kestrel, { velocity: { x: speed, y: 0 } });
  sim.playerId = id;
  const noseReach = kestrel.hull.length * 0.3 + kestrel.hull.collisionRadius * 0.5;
  const rock = spawnAsteroid(sim.world, 'ferrous', radius, { x: noseReach + gap + radius, y: 0 }, { x: 0, y: 0 }, 0, 0, 1);
  return { sim, id, rock };
}

function runUntilHit(sim: Simulation, maxSteps = 600) {
  for (let i = 0; i < maxSteps; i++) {
    sim.step();
    const events = sim.drainEvents();
    const hit = events.find((e) => e.type === 'collision');
    if (hit) return hit;
  }
  return null;
}

describe('collisions', () => {
  it('bounces a ship off a rock and reverses its normal velocity by the restitution', () => {
    const { sim, id } = headOn(10);
    const hit = runUntilHit(sim);
    expect(hit).not.toBeNull();
    const v = body(sim, id).velocity;
    // The rock is ~ 1e8 kg, so the ship rebounds at almost exactly e * v.
    expect(v.x).toBeCloseTo(-10 * COLLISION_RULES.restitution, 1);
  });

  it('damages the hull in proportion to impact energy above the safe speed', () => {
    const slow = headOn(COLLISION_RULES.safeImpactSpeed * 0.9);
    runUntilHit(slow.sim);
    expect(ship(slow.sim, slow.id).hull).toBe(kestrel.hull.integrity);

    const medium = headOn(10);
    const fast = headOn(20);
    const mediumHit = runUntilHit(medium.sim);
    const fastHit = runUntilHit(fast.sim);
    const mediumLoss = kestrel.hull.integrity - ship(medium.sim, medium.id).hull;
    const fastLoss = kestrel.hull.integrity - ship(fast.sim, fast.id).hull;
    expect(mediumLoss).toBeGreaterThan(0);
    expect(fastLoss).toBeGreaterThan(mediumLoss * 3);
    const mediumShip = mediumHit?.type === 'collision' ? mediumHit.losses.find((l) => l.ship === medium.id) : undefined;
    expect(mediumShip?.hull).toBeCloseTo(mediumLoss, 6);
    expect(fastHit?.type === 'collision' && fastHit.speed).toBeCloseTo(20, 0);
  });

  it('does not let a ship at very high speed tunnel through a small rock', () => {
    const { sim, id, rock } = headOn(600, 2.5, 30);
    const hit = runUntilHit(sim, 30);
    expect(hit).not.toBeNull();
    expect(body(sim, id).position.x).toBeLessThan(body(sim, rock).position.x);
  });

  it('destroys a ship in a hard crash and cuts its thrusters', () => {
    const { sim, id } = headOn(80);
    runUntilHit(sim);
    expect(ship(sim, id).destroyed).toBe(true);
    expect(ship(sim, id).hull).toBe(0);
    expect(sim.world.colliders.has(id)).toBe(false);
    const v = { ...body(sim, id).velocity };
    sim.setCommand(id, { thrust: 1 });
    sim.run(30);
    expect(body(sim, id).velocity.x).toBeCloseTo(v.x, 9);
    expect(ship(sim, id).output.main).toBe(0);
  });

  it('spins the ship on an off-centre hit', () => {
    const sim = new Simulation();
    const id = spawnShip(sim.world, kestrel, { velocity: { x: 12, y: 0 } });
    spawnAsteroid(sim.world, 'ferrous', 10, { x: 25, y: 7 }, { x: 0, y: 0 }, 0, 0, 1);
    runUntilHit(sim);
    expect(Math.abs(body(sim, id).angularVelocity)).toBeGreaterThan(0.01);
  });

  it('conserves momentum between two ships', () => {
    const sim = new Simulation();
    const a = spawnShip(sim.world, kestrel, { position: { x: 0, y: 0 }, velocity: { x: 6, y: 0 } });
    const b = spawnShip(sim.world, getShip('mule'), { position: { x: 40, y: 1 }, velocity: { x: -2, y: 0 } });
    const momentum = () => {
      const A = body(sim, a);
      const B = body(sim, b);
      return { x: A.mass * A.velocity.x + B.mass * B.velocity.x, y: A.mass * A.velocity.y + B.mass * B.velocity.y };
    };
    const before = momentum();
    expect(runUntilHit(sim)).not.toBeNull();
    const after = momentum();
    expect(after.x).toBeCloseTo(before.x, 3);
    expect(after.y).toBeCloseTo(before.y, 3);
  });

  it('stops ships at the station hull and leaves the station unmoved', () => {
    const sim = new Simulation();
    const station = spawnStation(sim.world, 'outpost', 'test', { x: 0, y: 0 }, 0);
    const id = spawnShip(sim.world, kestrel, { position: { x: -400, y: 0 }, velocity: { x: 15, y: 0 } });
    expect(runUntilHit(sim, 3000)).not.toBeNull();
    expect(body(sim, id).velocity.x).toBeLessThan(0);
    expect(body(sim, station).position).toEqual({ x: 0, y: 0 });
  });

  it('lets a slow ship fly into the docking bay mouth', () => {
    const sim = new Simulation();
    spawnStation(sim.world, 'outpost', 'test', { x: 0, y: 0 }, 0);
    // The bay opens toward +X at x = 214; aim straight in from the east.
    const id = spawnShip(sim.world, kestrel, { position: { x: 260, y: 0 }, angle: Math.PI, velocity: { x: -4, y: 0 } });
    for (let i = 0; i < 60 * 13; i++) sim.step();
    const hits = sim.drainEvents().filter((e) => e.type === 'collision');
    expect(body(sim, id).position.x).toBeLessThan(214);
    expect(hits).toHaveLength(0);
  });
});

describe('impactDamage', () => {
  const inv = 1 / 8500;
  const safe = COLLISION_RULES.safeImpactSpeed;
  const ramp = COLLISION_RULES.impactRampSpeed;
  const energy = (v: number) => v * v - safe * safe;

  it('is zero up to the safe speed and never falls as speed rises', () => {
    expect(impactDamage(COLLISION_RULES, safe, inv)).toBe(0);
    let last = 0;
    for (let v = safe; v <= 60; v += 0.25) {
      const d = impactDamage(COLLISION_RULES, v, inv);
      expect(d).toBeGreaterThanOrEqual(last);
      last = d;
    }
  });

  it('is scaled down below the ramp speed and grows with energy above it', () => {
    const d20 = impactDamage(COLLISION_RULES, ramp + 5, inv);
    const d40 = impactDamage(COLLISION_RULES, ramp + 25, inv);
    expect(d40 / d20).toBeCloseTo(energy(ramp + 25) / energy(ramp + 5), 6);
    const scrape = impactDamage(COLLISION_RULES, safe + 2, inv);
    const fullRate = (0.5 * 8500 * energy(safe + 2) * COLLISION_RULES.hullDamagePerKilojoule) / 1000;
    expect(scrape).toBeCloseTo(fullRate * (2 / (ramp - safe)), 6);
  });
});

describe('impacts and shields', () => {
  it('lets the shield take its share of a crash first, and the hull the rest', () => {
    const { sim, id } = headOn(20);
    const before = ship(sim, id).shield;
    const hit = runUntilHit(sim);
    const loss = hit?.type === 'collision' ? hit.losses.find((l) => l.ship === id) : undefined;
    expect(loss).toBeDefined();
    expect(loss!.shield).toBeCloseTo(Math.min(before, hit!.type === 'collision' ? hit!.damage * COLLISION_RULES.impactShieldShare : 0), 6);
    expect(loss!.shield + loss!.hull).toBeCloseTo(hit!.type === 'collision' ? hit!.damage : 0, 6);
    expect(ship(sim, id).shield).toBeCloseTo(before - loss!.shield, 6);
    expect(kestrel.hull.integrity - ship(sim, id).hull).toBeCloseTo(loss!.hull, 6);
  });

  it('puts the whole blow on the hull when the shield is down', () => {
    const { sim, id } = headOn(20);
    ship(sim, id).shield = 0;
    ship(sim, id).lastDamageTick = sim.world.tick; // just hit: no recharge before the crash
    const hit = runUntilHit(sim);
    const loss = hit?.type === 'collision' ? hit.losses.find((l) => l.ship === id) : undefined;
    expect(loss?.shield).toBe(0);
    expect(loss?.hull).toBeCloseTo(hit?.type === 'collision' ? hit.damage : -1, 6);
  });
});

describe('Outpost Alpha', () => {
  const sim = Simulation.fromSector(OUTPOST_ALPHA);

  it('generates the same field from the same seed', () => {
    const again = Simulation.fromSector(OUTPOST_ALPHA);
    const snapshot = (s: Simulation) => [...s.world.asteroids.keys()].map((id) => {
      const b = s.world.bodies.get(id)!;
      return [b.position.x, b.position.y, s.world.asteroids.get(id)!.radius, s.world.asteroids.get(id)!.type.id];
    });
    expect(snapshot(again)).toEqual(snapshot(sim));
    expect(sim.world.asteroids.size).toBeGreaterThan(300);
    expect(sim.world.stations.size).toBe(1);
  });

  it('places no rock overlapping another, the station or a clear zone', () => {
    const rocks = [...sim.world.asteroids.entries()].map(([id, a]) => ({ p: sim.world.bodies.get(id)!.position, r: a.radius }));
    let violations = 0;
    for (let i = 0; i < rocks.length; i++) {
      for (const zone of OUTPOST_ALPHA.clearZones) {
        if (Math.hypot(rocks[i].p.x - zone.x, rocks[i].p.y - zone.y) <= zone.radius + rocks[i].r) violations++;
      }
      for (let j = i + 1; j < rocks.length; j++) {
        if (Math.hypot(rocks[i].p.x - rocks[j].p.x, rocks[i].p.y - rocks[j].p.y) <= rocks[i].r + rocks[j].r) violations++;
      }
    }
    expect(violations).toBe(0);
  });

  it('includes all three rock types and a spread of sizes', () => {
    const types = new Set([...sim.world.asteroids.values()].map((a) => a.type.id));
    expect(types).toEqual(new Set(['ferrous', 'cupric', 'titanic']));
    const radii = [...sim.world.asteroids.values()].map((a) => a.radius);
    expect(Math.min(...radii)).toBeLessThan(4);
    expect(Math.max(...radii)).toBeGreaterThan(18);
  });

  it('reports an approaching obstacle with a time to impact', () => {
    const s = new Simulation();
    const id = spawnShip(s.world, kestrel, { velocity: { x: 20, y: 0 } });
    spawnAsteroid(s.world, 'cupric', 10, { x: 100, y: 0 }, { x: 0, y: 0 }, 0, 0, 1);
    const p = nearestObstacle(s.world, id)!;
    expect(p.kind).toBe('asteroid');
    expect(p.closingSpeed).toBeCloseTo(20, 6);
    expect(p.timeToImpact).toBeCloseTo(p.distance / 20, 6);
  });
});
