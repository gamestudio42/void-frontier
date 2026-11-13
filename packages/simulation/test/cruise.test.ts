import { describe, expect, it } from 'vitest';
import { CRUISE_RULES } from '@void-frontier/content';
import { OUTPOST_ALPHA } from '@void-frontier/content';
import { Simulation, bayEntryPoint, dockingStatus, gateStatus, plannedSpeed, spawnAsteroid, type CruiseOrder, type SimEvent } from '../src/index.ts';
import { body, createTestSim, ship } from './helpers.ts';

/** Holds a cruise order every step, as the game does; returns what happened on the way. */
function fly(sim: Simulation, id: number, order: CruiseOrder, maxSeconds = 180) {
  let topSpeed = 0;
  let collisions = 0;
  const phases = new Set<string>();
  for (let i = 0; i < Math.round(maxSeconds / sim.dt); i++) {
    sim.setCommand(id, { cruise: order });
    sim.step();
    collisions += sim.drainEvents().filter((e) => e.type === 'collision').length;
    const b = body(sim, id);
    topSpeed = Math.max(topSpeed, Math.hypot(b.velocity.x, b.velocity.y));
    const phase = ship(sim, id).cruise;
    if (phase) phases.add(phase);
    if (phase === 'arrived' || phase === 'blocked') return { phase, topSpeed, collisions, phases, seconds: i * sim.dt };
  }
  return { phase: ship(sim, id).cruise ?? null, topSpeed, collisions, phases, seconds: maxSeconds };
}

const distanceTo = (sim: Simulation, id: number, to: { x: number; y: number }) => {
  const p = body(sim, id).position;
  return Math.hypot(to.x - p.x, to.y - p.y);
};

describe('cruise autopilot', () => {
  it('flies 4 km, flips, brakes and comes to rest at the stop radius', () => {
    const { sim, id } = createTestSim({ angle: Math.PI / 2 });
    const order = { to: { x: 4000, y: 0 }, stopRadius: 150 };
    const fuel = ship(sim, id).fuel;
    const run = fly(sim, id, order);
    expect(run.phase).toBe('arrived');
    expect(run.collisions).toBe(0);
    expect(run.phases).toContain('flip');
    expect(run.phases).toContain('brake');
    const d = distanceTo(sim, id, order.to);
    expect(d).toBeGreaterThan(order.stopRadius - 40);
    expect(d).toBeLessThan(order.stopRadius + 40);
    // Honest thrusters: the trip costs fuel and the plan never goes past its cap.
    expect(ship(sim, id).fuel).toBeLessThan(fuel);
    expect(run.topSpeed).toBeLessThanOrEqual(CRUISE_RULES.maxSpeed + 5);
    // Much faster than a walk at the 50 m/s people fly by hand.
    expect(run.seconds).toBeLessThan(4000 / 50);
  });

  it('brakes when it starts already flying past the destination', () => {
    const { sim, id } = createTestSim({ velocity: { x: -120, y: 40 } });
    const order = { to: { x: 1500, y: 0 }, stopRadius: 100 };
    const run = fly(sim, id, order);
    expect(run.phase).toBe('arrived');
    expect(distanceTo(sim, id, order.to)).toBeLessThan(order.stopRadius + 40);
  });

  it('steers around a rock on the direct line', () => {
    const { sim, id } = createTestSim();
    spawnAsteroid(sim.world, 'ferrous', 60, { x: 1200, y: 0 }, { x: 0, y: 0 }, 0, 0, 1);
    const order = { to: { x: 2600, y: 0 }, stopRadius: 100 };
    const run = fly(sim, id, order);
    expect(run.collisions).toBe(0);
    expect(run.phase).toBe('arrived');
  });

  it('stops short and reports blocked in a pocket with no way forward', () => {
    const { sim, id } = createTestSim({ velocity: { x: 40, y: 0 } });
    // Rocks ahead and on both flanks; the only open side is behind the ship.
    for (let y = -600; y <= 600; y += 100) spawnAsteroid(sim.world, 'ferrous', 60, { x: 500, y }, { x: 0, y: 0 }, 0, 0, 1);
    for (let x = -300; x <= 400; x += 100) {
      spawnAsteroid(sim.world, 'ferrous', 60, { x, y: 600 }, { x: 0, y: 0 }, 0, 0, 1);
      spawnAsteroid(sim.world, 'ferrous', 60, { x, y: -600 }, { x: 0, y: 0 }, 0, 0, 1);
    }
    const run = fly(sim, id, { to: { x: 2000, y: 0 }, stopRadius: 100 }, 120);
    expect(run.phase).toBe('blocked');
    expect(run.collisions).toBe(0);
    expect(body(sim, id).position.x).toBeLessThan(500);
  });

  it('yields to any manual input on the same step', () => {
    const { sim, id } = createTestSim();
    sim.setCommand(id, { cruise: { to: { x: 3000, y: 0 }, stopRadius: 100 }, brake: true });
    sim.step();
    expect(ship(sim, id).cruise).toBeNull();
  });

  it('plans less speed with less room and never past the cap', () => {
    expect(plannedSpeed(0, 0, 10, 2)).toBe(0);
    expect(plannedSpeed(500, 0, 10, 2)).toBeLessThan(plannedSpeed(2000, 0, 10, 2));
    expect(plannedSpeed(1e7, 0, 10, 2)).toBe(CRUISE_RULES.maxSpeed);
    // The flip eats into the braking room: closing fast means planning slower.
    expect(plannedSpeed(2000, 200, 10, 2)).toBeLessThan(plannedSpeed(2000, 0, 10, 2));
  });

  it('is deterministic', () => {
    const run = () => {
      const { sim, id } = createTestSim();
      spawnAsteroid(sim.world, 'ferrous', 60, { x: 1200, y: 30 }, { x: 0, y: 0 }, 0, 0, 1);
      fly(sim, id, { to: { x: 2600, y: 0 }, stopRadius: 100 });
      return { ...body(sim, id).position, fuel: ship(sim, id).fuel };
    };
    expect(run()).toEqual(run());
  });
});

describe('cruise in Outpost Alpha', () => {
  it('crosses the sector to a gate and back to the bay without touching anything', () => {
    const sim = Simulation.fromSector(OUTPOST_ALPHA);
    const id = sim.playerId;
    const station = [...sim.world.stations.keys()][0];
    sim.undock(id);
    sim.drainEvents();
    const hits = (events: SimEvent[]) => events.filter((e) => e.type === 'collision' && (e.a === id || e.b === id)).length;
    const leg = (order: CruiseOrder) => {
      let collisions = 0;
      for (let i = 0; i < 180 * 60; i++) {
        sim.setCommand(id, { cruise: order });
        sim.step();
        collisions += hits(sim.drainEvents());
        if (ship(sim, id).cruise === 'arrived') return { arrived: true, collisions };
      }
      return { arrived: false, collisions };
    };
    const gate = sim.world.gates.get('alpha_to_belt')!;
    const out = leg({ to: gate.position, stopRadius: 25 });
    expect(out).toEqual({ arrived: true, collisions: 0 });
    expect(gateStatus(sim.world, id)?.ready).toBe(true);

    const back = leg({ to: bayEntryPoint(sim.world, station)!, stopRadius: 20 });
    expect(back).toEqual({ arrived: true, collisions: 0 });
    expect(dockingStatus(sim.world, id)!.distance).toBeLessThan(260);
  });
});
