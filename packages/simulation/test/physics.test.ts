import { describe, expect, it } from 'vitest';
import { OUTPOST_ALPHA, getShip } from '@void-frontier/content';
import { Simulation, readTelemetry } from '../src/index.ts';
import { body, createTestSim, seconds, ship } from './helpers.ts';

const kestrel = getShip('kestrel');

describe('Newtonian flight', () => {
  it('accelerates along the nose under main thrust', () => {
    const { sim, id } = createTestSim();
    sim.setCommand(id, { thrust: 1 });
    seconds(sim, 1);
    const b = body(sim, id);
    expect(b.velocity.x).toBeGreaterThan(15);
    expect(Math.abs(b.velocity.y)).toBeLessThan(1e-9);
  });

  it('keeps its velocity exactly when no force acts', () => {
    const { sim, id } = createTestSim({ velocity: { x: 100, y: -40 } });
    seconds(sim, 10);
    const b = body(sim, id);
    expect(b.velocity.x).toBe(100);
    expect(b.velocity.y).toBe(-40);
    expect(b.position.x).toBeCloseTo(1000, 6);
    expect(b.position.y).toBeCloseTo(-400, 6);
  });

  it('rotates without changing the velocity vector', () => {
    const { sim, id } = createTestSim({ velocity: { x: 50, y: 0 } });
    sim.setCommand(id, { turn: 1 });
    seconds(sim, 1.5);
    const b = body(sim, id);
    expect(Math.abs(b.angle)).toBeGreaterThan(1);
    expect(b.velocity.x).toBe(50);
    expect(b.velocity.y).toBe(0);
  });

  it('keeps spinning after the turn input is released in Newtonian mode', () => {
    const { sim, id } = createTestSim();
    sim.setCommand(id, { turn: 1 });
    seconds(sim, 0.5);
    sim.setCommand(id, {});
    const omega = body(sim, id).angularVelocity;
    seconds(sim, 1);
    expect(omega).toBeGreaterThan(0);
    expect(body(sim, id).angularVelocity).toBe(omega);
  });

  it('moves sideways with lateral thrusters, + to the right', () => {
    const { sim, id } = createTestSim({ angle: Math.PI / 2 }); // nose up (+Y), right is +X
    sim.setCommand(id, { strafe: 1 });
    seconds(sim, 1);
    const b = body(sim, id);
    expect(b.velocity.x).toBeGreaterThan(4);
    expect(Math.abs(b.velocity.y)).toBeLessThan(1e-6);
  });

  it('reduces forward velocity with reverse thrust', () => {
    const { sim, id } = createTestSim({ velocity: { x: 60, y: 0 } });
    sim.setCommand(id, { thrust: -1 });
    seconds(sim, 1);
    expect(body(sim, id).velocity.x).toBeLessThan(55);
  });

  it('accelerates less when loaded with cargo, by F/m', () => {
    const empty = createTestSim({ fuel: 0.0001 });
    const loaded = createTestSim({ fuel: 0.0001, cargoMass: 5000 });
    for (const { sim, id } of [empty, loaded]) {
      ship(sim, id).fuel = 500;
      sim.setCommand(id, { thrust: 1 });
      sim.step();
    }
    const aEmpty = body(empty.sim, empty.id).velocity.x / empty.sim.dt;
    const aLoaded = body(loaded.sim, loaded.id).velocity.x / loaded.sim.dt;
    expect(aLoaded).toBeLessThan(aEmpty);
    expect(aEmpty / aLoaded).toBeCloseTo((8000 + 500 + 5000) / (8000 + 500), 3);
    expect(aEmpty).toBeCloseTo(kestrel.movement.mainThrust / 8500, 3);
  });

  it('turns more slowly when loaded', () => {
    const empty = createTestSim();
    const loaded = createTestSim({ cargoMass: 6000 });
    for (const { sim, id } of [empty, loaded]) {
      sim.setCommand(id, { turn: 1 });
      sim.step();
    }
    expect(body(loaded.sim, loaded.id).angularVelocity).toBeLessThan(body(empty.sim, empty.id).angularVelocity);
  });

  it('respects the rated turn rate when turning manually', () => {
    const { sim, id } = createTestSim();
    sim.setCommand(id, { turn: 1 });
    seconds(sim, 5);
    expect(body(sim, id).angularVelocity).toBeLessThan(kestrel.movement.maxAngularVelocity * 1.1);
  });
});

describe('fuel', () => {
  it('burns fuel while thrusting and not while coasting', () => {
    const { sim, id } = createTestSim();
    sim.setCommand(id, { thrust: 1 });
    seconds(sim, 2);
    const afterBurn = ship(sim, id).fuel;
    expect(afterBurn).toBeLessThan(kestrel.fuel.capacity);
    expect(afterBurn).toBeCloseTo(kestrel.fuel.capacity - 0.16 * 15 * 2, 6);
    sim.setCommand(id, {});
    seconds(sim, 2);
    expect(ship(sim, id).fuel).toBe(afterBurn);
  });

  it('produces no thrust with an empty tank', () => {
    const { sim, id } = createTestSim({ fuel: 0 });
    sim.setCommand(id, { thrust: 1, strafe: 1, turn: 1 });
    seconds(sim, 1);
    const b = body(sim, id);
    expect(b.velocity.x).toBe(0);
    expect(b.velocity.y).toBe(0);
    expect(b.angularVelocity).toBe(0);
  });

  it('boost pushes harder and burns more', () => {
    const plain = createTestSim();
    const boosted = createTestSim();
    plain.sim.setCommand(plain.id, { thrust: 1 });
    boosted.sim.setCommand(boosted.id, { thrust: 1, boost: true });
    seconds(plain.sim, 1);
    seconds(boosted.sim, 1);
    expect(body(boosted.sim, boosted.id).velocity.x).toBeGreaterThan(body(plain.sim, plain.id).velocity.x * 1.4);
    expect(ship(boosted.sim, boosted.id).fuel).toBeLessThan(ship(plain.sim, plain.id).fuel);
  });
});

describe('flight assist', () => {
  it('stops drift and rotation with no input, using thrusters and fuel', () => {
    const { sim, id } = createTestSim({ velocity: { x: 30, y: 20 }, mode: 'assisted' });
    body(sim, id).angularVelocity = 1;
    seconds(sim, 10);
    const b = body(sim, id);
    expect(Math.hypot(b.velocity.x, b.velocity.y)).toBeLessThan(1e-6);
    expect(Math.abs(b.angularVelocity)).toBeLessThan(1e-6);
    expect(ship(sim, id).fuel).toBeLessThan(kestrel.fuel.capacity);
  });

  it('cancels sideways slide while the main engine fires', () => {
    const { sim, id } = createTestSim({ velocity: { x: 0, y: 25 }, mode: 'assisted' });
    sim.setCommand(id, { thrust: 1 });
    seconds(sim, 8);
    const b = body(sim, id);
    expect(Math.abs(b.velocity.y)).toBeLessThan(1e-6);
    expect(b.velocity.x).toBeGreaterThan(100);
  });

  it('cannot exceed what the thrusters can deliver in one step', () => {
    const { sim, id } = createTestSim({ velocity: { x: 0, y: 200 }, mode: 'assisted' });
    sim.step();
    const maxDeltaV = (kestrel.movement.lateralThrust / body(sim, id).mass) * sim.dt;
    expect(200 - body(sim, id).velocity.y).toBeLessThanOrEqual(maxDeltaV + 1e-9);
  });
});

describe('brake', () => {
  it('stops a Newtonian ship within the predicted stopping distance', () => {
    const { sim, id } = createTestSim({ velocity: { x: 80, y: 30 } });
    const predicted = readTelemetry(sim.world, id)!.stoppingDistance;
    const start = { ...body(sim, id).position };
    sim.setCommand(id, { brake: true });
    seconds(sim, 30);
    const b = body(sim, id);
    expect(Math.hypot(b.velocity.x, b.velocity.y)).toBeLessThan(1e-6);
    const travelled = Math.hypot(b.position.x - start.x, b.position.y - start.y);
    expect(travelled).toBeLessThan(predicted * 1.05 + 2);
    expect(travelled).toBeGreaterThan(predicted * 0.9);
  });
});

describe('mouse steering', () => {
  it('turns the nose to the aim point and settles without overshoot', () => {
    const { sim, id } = createTestSim();
    sim.setCommand(id, { aim: { x: -100, y: 100 } }); // 135 degrees counter-clockwise
    let maxAngle = 0;
    for (let i = 0; i < 240; i++) {
      sim.step();
      maxAngle = Math.max(maxAngle, body(sim, id).angle);
    }
    const b = body(sim, id);
    expect(b.angle).toBeCloseTo((3 * Math.PI) / 4, 2);
    expect(Math.abs(b.angularVelocity)).toBeLessThan(0.01);
    expect(maxAngle).toBeLessThan((3 * Math.PI) / 4 + 0.05);
  });
});

describe('determinism', () => {
  function scriptedRun(): string {
    const sim = Simulation.fromSector(OUTPOST_ALPHA);
    const id = sim.playerId;
    sim.undock(id);
    const script = [
      { thrust: 1 }, { thrust: 1, turn: 1 }, { strafe: -1 }, { aim: { x: 300, y: -200 } },
      { thrust: 1, boost: true }, { brake: true }, { thrust: -1, strafe: 1 },
    ];
    for (let i = 0; i < 1400; i++) {
      if (i === 700) sim.setFlightMode(id, 'assisted');
      if (i === 400) sim.setCargoMass(id, 3000);
      sim.setCommand(id, script[Math.floor(i / 50) % script.length]);
      sim.step();
    }
    const b = body(sim, id);
    return JSON.stringify([b.position, b.velocity, b.angle, b.angularVelocity, ship(sim, id).fuel]);
  }

  it('reproduces the same state bit for bit from the same commands', () => {
    expect(scriptedRun()).toBe(scriptedRun());
  });
});

describe('telemetry', () => {
  it('reports compass heading, course and drift', () => {
    const { sim, id } = createTestSim({ angle: Math.PI / 2, velocity: { x: 10, y: 0 } });
    const t = readTelemetry(sim.world, id)!;
    expect(t.heading).toBeCloseTo(0, 6);
    expect(t.course).toBeCloseTo(90, 6);
    expect(t.drift).toBeCloseTo(90, 6);
    expect(t.speed).toBeCloseTo(10, 9);
  });

  it('starts the Outpost Alpha player at the sector heading', () => {
    const sim = Simulation.fromSector(OUTPOST_ALPHA);
    expect(readTelemetry(sim.world, sim.playerId)!.heading).toBeCloseTo(OUTPOST_ALPHA.playerStart.heading, 6);
    expect(sim.world.beacons.size).toBe(OUTPOST_ALPHA.beacons.length);
  });
});
