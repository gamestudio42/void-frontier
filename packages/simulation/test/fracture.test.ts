import { describe, expect, it } from 'vitest';
import { MINING_RULES, OUTPOST_ALPHA, getShip } from '@void-frontier/content';
import { Simulation, applySectorSnapshot, captureSector, onVein, spawnAsteroid, spawnShip, stressYield, type SimEvent } from '../src/index.ts';

const kestrel = getShip('kestrel');
const muzzle = kestrel.hardpoints.find((h) => h.group === 'mining')!.x;

/** A kestrel facing +X with a rock `gap` metres ahead; `veinTowardShip` turns the rich side to face the laser. */
function rig(radius = 15, type = 'cupric', veinTowardShip = true) {
  const sim = new Simulation();
  const id = spawnShip(sim.world, kestrel);
  sim.playerId = id;
  const rock = spawnAsteroid(sim.world, type, radius, { x: muzzle + 30 + radius, y: 0 }, { x: 0, y: 0 }, 0, 0, 1);
  // The laser hits the rock's -X side; point the vein there or directly away.
  sim.world.asteroids.get(rock)!.vein = veinTowardShip ? Math.PI : 0;
  return { sim, id, rock };
}

const taken = (sim: Simulation, rock: number) => {
  const r = sim.world.asteroids.get(rock)!;
  return r.oreMax - r.ore;
};

/** Holds stress inside a band by pulsing the laser; returns the events seen. */
function cut(sim: Simulation, id: number, rock: number, seconds: number, band: [number, number] | null) {
  const events: SimEvent[] = [];
  let resting = false;
  for (let i = 0; i < seconds * 60; i++) {
    const stress = sim.world.asteroids.get(rock)?.stress ?? 0;
    if (band) {
      if (stress >= band[1]) resting = true;
      else if (stress <= band[0]) resting = false;
    }
    sim.setCommand(id, { fireMining: !resting });
    sim.step();
    events.push(...sim.drainEvents());
  }
  return events;
}

describe('fracture mining', () => {
  it('pays more on the vein than off it', () => {
    const on = rig(15, 'cupric', true);
    const off = rig(15, 'cupric', false);
    cut(on.sim, on.id, on.rock, 4, [0.55, 0.8]);
    cut(off.sim, off.id, off.rock, 4, [0.55, 0.8]);
    expect(onVein(on.sim.world, on.rock, { x: muzzle + 30, y: 0 })).toBe(true);
    expect(onVein(off.sim.world, off.rock, { x: muzzle + 30, y: 0 })).toBe(false);
    expect(taken(on.sim, on.rock)).toBeGreaterThan(taken(off.sim, off.rock) * 2);
  });

  it('rewards keeping the heat in the sweet spot', () => {
    expect(stressYield(0)).toBe(MINING_RULES.coldYield);
    expect(stressYield((MINING_RULES.sweetSpot[0] + MINING_RULES.sweetSpot[1]) / 2)).toBe(MINING_RULES.sweetYield);
    expect(stressYield(MINING_RULES.sweetSpot[1] + 0.05)).toBe(MINING_RULES.hotYield);
    // Pulsing beats holding the trigger, and the rock survives.
    const careful = rig(25);
    const greedy = rig(25);
    // A big rock heats slowly, but holding the trigger cracks it all the same.
    cut(careful.sim, careful.id, careful.rock, 12, [0.55, 0.8]);
    const events = cut(greedy.sim, greedy.id, greedy.rock, 12, null);
    expect(careful.sim.world.asteroids.has(careful.rock)).toBe(true);
    expect(events.some((e) => e.type === 'asteroidFractured')).toBe(true);
  });

  it('cracks an overheated rock into drifting fragments and loses part of the ore', () => {
    const { sim, id, rock } = rig(20);
    const before = sim.world.asteroids.get(rock)!;
    const oreBefore = before.ore;
    const mass = sim.world.bodies.get(rock)!.mass;
    const events = cut(sim, id, rock, 10, null);
    const crack = events.find((e) => e.type === 'asteroidFractured');
    expect(crack && crack.type === 'asteroidFractured' && crack.pieces).toBeGreaterThanOrEqual(2);
    expect(sim.world.asteroids.has(rock)).toBe(false);
    const pieces = [...sim.world.asteroids.values()].filter((r) => r.fragment);
    expect(pieces.length).toBeGreaterThanOrEqual(2);
    const left = pieces.reduce((sum, r) => sum + r.ore, 0);
    expect(left).toBeLessThan(oreBefore * (1 - MINING_RULES.fractureLoss) + 1);
    // Real rocks: each piece is lighter than the parent and they drift apart.
    for (const [pid, r] of sim.world.asteroids) {
      if (!r.fragment) continue;
      expect(sim.world.bodies.get(pid)!.mass).toBeLessThan(mass);
    }
  });

  it('crumbles a small rock into loose ore', () => {
    const { sim, id, rock } = rig(5);
    const events = cut(sim, id, rock, 6, null);
    const crack = events.find((e) => e.type === 'asteroidFractured' && e.id === rock);
    expect(crack && crack.type === 'asteroidFractured' && crack.pieces).toBe(0);
    // The ore that survives floats free, and the tractor brings it in.
    const hold = sim.world.ships.get(id)!.cargo.get('copper_ore') ?? 0;
    expect(sim.world.pickups.size + hold).toBeGreaterThan(0);
  });

  it('a volatile rock explodes and hurts the ship that overheated it', () => {
    // Off the vein, so the rock is still there when it overheats.
    const { sim, id, rock } = rig(14, 'exotic', false);
    const ship = sim.world.ships.get(id)!;
    const health = ship.shield + ship.hull;
    const events = cut(sim, id, rock, 8, null);
    const crack = events.find((e) => e.type === 'asteroidFractured');
    expect(crack && crack.type === 'asteroidFractured' && crack.volatile).toBe(true);
    expect(ship.shield + ship.hull).toBeLessThan(health);
    expect([...sim.world.asteroids.values()].some((r) => r.fragment)).toBe(false);
  });

  it('cools a rock nobody is cutting', () => {
    const { sim, id, rock } = rig(15);
    cut(sim, id, rock, 1, null);
    const hot = sim.world.asteroids.get(rock)!.stress;
    expect(hot).toBeGreaterThan(0);
    sim.setCommand(id, { fireMining: false });
    sim.run(60);
    expect(sim.world.asteroids.get(rock)!.stress).toBeCloseTo(Math.max(0, hot - MINING_RULES.coolPerSecond), 1);
  });

  it('remembers fragments and heat when the player leaves the sector', () => {
    const sim = Simulation.fromSector(OUTPOST_ALPHA);
    const [rockId] = [...sim.world.asteroids.entries()].find(([, r]) => r.radius > 15)!;
    const body = sim.world.bodies.get(rockId)!;
    const id = sim.playerId;
    sim.undock(id);
    const me = sim.world.bodies.get(id)!;
    me.position = { x: body.position.x - (muzzle + 30 + sim.world.asteroids.get(rockId)!.radius), y: body.position.y };
    me.previousPosition = { ...me.position };
    me.angle = 0;
    me.velocity = { x: 0, y: 0 };
    let cracked = false;
    for (let i = 0; i < 60 * 10 && !cracked; i++) {
      sim.setCommand(id, { fireMining: true, aim: body.position });
      sim.step();
      cracked = sim.drainEvents().some((e) => e.type === 'asteroidFractured');
    }
    expect(cracked).toBe(true);
    const snapshot = captureSector(sim);
    expect(snapshot.fragments!.length).toBeGreaterThanOrEqual(2);
    const again = Simulation.fromSector(OUTPOST_ALPHA);
    applySectorSnapshot(again, snapshot);
    const count = (s: Simulation) => [...s.world.asteroids.values()].filter((r) => r.fragment).length;
    expect(count(again)).toBe(count(sim));
    expect(again.world.asteroids.has(rockId)).toBe(false);
  });

  it('is deterministic', () => {
    const run = () => {
      const { sim, id, rock } = rig(20);
      cut(sim, id, rock, 10, null);
      return [...sim.world.asteroids.entries()].map(([k, r]) => [k, r.ore, sim.world.bodies.get(k)!.position]);
    };
    expect(run()).toEqual(run());
  });
});
