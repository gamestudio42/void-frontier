import { describe, expect, it } from 'vitest';
import { OUTPOST_ALPHA, getShip, getWeapon } from '@void-frontier/content';
import { Simulation, aiSystem, leadPoint, spawnAsteroid, spawnEncounter, spawnShip, type SimEvent } from '../src/index.ts';
import { body, ship } from './helpers.ts';

const kestrel = getShip('kestrel');
const jackal = getShip('jackal');
const cannon = getWeapon('autocannon_mk1');
const laser = getWeapon('laser_mk1');

function duel(distance = 250, targetVelocity = { x: 0, y: 0 }) {
  const sim = new Simulation();
  const shooter = spawnShip(sim.world, kestrel);
  const target = spawnShip(sim.world, jackal, { position: { x: distance, y: 0 }, velocity: targetVelocity, faction: 'pirate' });
  sim.playerId = shooter;
  return { sim, shooter, target };
}

function runCollecting(sim: Simulation, steps: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < steps; i++) {
    sim.step();
    events.push(...sim.drainEvents());
  }
  return events;
}

describe('leadPoint', () => {
  it('solves the intercept for a crossing target', () => {
    const lead = leadPoint({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 300, y: 0 }, { x: 0, y: 80 }, 500, 1)!;
    // A round fired at the lead point reaches it at the same time as the target.
    const roundTravel = Math.hypot(lead.point.x, lead.point.y);
    expect(roundTravel / 500).toBeCloseTo(lead.time, 9);
    expect(lead.point.y).toBeCloseTo(80 * lead.time, 9);
  });

  it('returns null when the target outruns the round', () => {
    expect(leadPoint({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 900, y: 0 }, 500, 1)).toBeNull();
  });
});

describe('weapons', () => {
  it('lands autocannon rounds on a crossing target using the lead solution', () => {
    const { sim, shooter, target } = duel(260, { x: 0, y: 40 });
    const hits: SimEvent[] = [];
    for (let i = 0; i < 120; i++) {
      // Mouse steering keeps the nose on the target; the guns swivel to the lead.
      sim.setCommand(shooter, { firePrimary: true, target, aim: { ...body(sim, target).position } });
      sim.step();
      hits.push(...sim.drainEvents().filter((e) => e.type === 'hit' && e.target === target));
    }
    expect(hits.length).toBeGreaterThan(10);
  });

  it('strips shields before the hull, then armour softens hull damage', () => {
    const { sim, shooter, target } = duel(200);
    sim.setCommand(shooter, { firePrimary: true, target });
    const events = runCollecting(sim, 600);
    const hits = events.filter((e): e is Extract<SimEvent, { type: 'hit' }> => e.type === 'hit' && e.target === target);
    const firstHullHit = hits.findIndex((h) => h.hullDamage > 0);
    expect(firstHullHit).toBeGreaterThan(0);
    expect(hits.slice(0, firstHullHit).every((h) => h.shieldDamage > 0)).toBe(true);
    const pureHull = hits.find((h) => h.shieldDamage === 0 && h.hullDamage > 0)!;
    expect(pureHull.hullDamage).toBeCloseTo(cannon.kind === 'projectile' ? cannon.damage * cannon.multipliers.hull * (1 - jackal.hull.armor) : 0, 9);
  });

  it('destroys the target and credits the kill', () => {
    const { sim, shooter, target } = duel(200);
    sim.setCommand(shooter, { firePrimary: true, fireSecondary: true, target });
    const events = runCollecting(sim, 60 * 20);
    const kill = events.find((e) => e.type === 'shipDestroyed');
    expect(kill).toMatchObject({ id: target, by: shooter });
    expect(ship(sim, shooter).kills).toBe(1);
  });

  it('hits instantly with the laser and burns shields faster than the cannon', () => {
    const beam = duel(300);
    beam.sim.setCommand(beam.shooter, { fireSecondary: true, target: beam.target });
    beam.sim.run(60);
    const guns = duel(300);
    guns.sim.setCommand(guns.shooter, { firePrimary: true, target: guns.target });
    guns.sim.run(60);
    const beamShield = jackal.shield.capacity - ship(beam.sim, beam.target).shield;
    const gunShield = jackal.shield.capacity - ship(guns.sim, guns.target).shield;
    expect(beamShield).toBeGreaterThan(gunShield);
    expect(ship(beam.sim, beam.shooter).weapons[2].beam?.hit).toBe(beam.target);
  });

  it('does not reach past the laser range', () => {
    const { sim, shooter, target } = duel(laser.kind === 'beam' ? laser.range + 60 : 0);
    sim.setCommand(shooter, { fireSecondary: true, target });
    sim.run(30);
    expect(ship(sim, target).shield).toBe(jackal.shield.capacity);
  });

  it('is blocked by an asteroid in the line of fire', () => {
    const { sim, shooter, target } = duel(400);
    spawnAsteroid(sim.world, 'ferrous', 20, { x: 200, y: 0 }, { x: 0, y: 0 }, 0, 0, 1);
    sim.setCommand(shooter, { firePrimary: true, fireSecondary: true, target });
    sim.run(120);
    expect(ship(sim, target).shield).toBe(jackal.shield.capacity);
  });

  it('overheats under sustained fire, locks out, and recovers', () => {
    const { sim, shooter } = duel(2000);
    sim.setCommand(shooter, { firePrimary: true });
    let locked = false;
    for (let i = 0; i < 60 * 15 && !locked; i++) {
      sim.step();
      locked = ship(sim, shooter).weapons[0].overheated;
    }
    expect(locked).toBe(true);
    const shotsWhileLocked = (() => {
      const before = sim.world.projectiles.size;
      sim.step();
      return sim.world.projectiles.size > before;
    })();
    expect(shotsWhileLocked).toBe(false);
    sim.setCommand(shooter, {});
    sim.run(60 * 6);
    expect(ship(sim, shooter).weapons[0].overheated).toBe(false);
  });

  it('drains reactor energy with the laser and stops when it is empty', () => {
    const { sim, shooter } = duel(5000);
    sim.setCommand(shooter, { fireSecondary: true });
    sim.run(60 * 12);
    const mount = ship(sim, shooter).weapons[2];
    expect(ship(sim, shooter).energy).toBeLessThan(laser.kind === 'beam' ? laser.energyPerSecond / 60 + 0.5 : 0);
    // Either out of energy or overheated: in both cases the beam is limited.
    expect(mount.beam === null || mount.overheated || ship(sim, shooter).energy < 1).toBe(true);
  });

  it('recharges shields only after the damage delay', () => {
    const { sim, target } = duel();
    const t = ship(sim, target);
    t.shield = 50;
    t.lastDamageTick = 0;
    sim.run(60);
    expect(t.shield).toBe(50);
    sim.run(60 * jackal.shield.rechargeDelay);
    expect(t.shield).toBeGreaterThan(50);
  });

  it('never hits the ship that fired', () => {
    const { sim, shooter } = duel(3000);
    sim.setCommand(shooter, { firePrimary: true, fireSecondary: true });
    sim.run(120);
    expect(ship(sim, shooter).shield).toBe(kestrel.shield.capacity);
  });
});

describe('pirate AI', () => {
  function encounter(distance: number) {
    const sim = new Simulation();
    const player = spawnShip(sim.world, kestrel, { position: { x: 0, y: 0 } });
    sim.playerId = player;
    const [pirate] = spawnEncounter(sim.world, { id: 't', ship: 'jackal', faction: 'pirate', count: 1, spawn: { x: distance, y: 0 }, patrol: [[distance, 0], [distance, 400]], respawnDelay: 5 });
    return { sim, player, pirate };
  }

  it('patrols when nothing is in sensor range', () => {
    const { sim, pirate } = encounter(3000);
    sim.run(60 * 10);
    expect(sim.world.pilots.get(pirate)!.mode).toBe('patrol');
    expect(body(sim, pirate).position.y).toBeGreaterThan(50);
  });

  it('closes in on the player, opens fire and deals damage', () => {
    const { sim, player, pirate } = encounter(800);
    const events = runCollecting(sim, 60 * 25);
    expect(sim.world.pilots.get(pirate)!.mode).toBe('engage');
    expect(events.some((e) => e.type === 'shot' && e.owner === pirate)).toBe(true);
    expect(ship(sim, player).shield).toBeLessThan(kestrel.shield.capacity);
  });

  it('flies within its thrust limits: no velocity change larger than its engines allow', () => {
    const { sim, pirate } = encounter(700);
    const b = body(sim, pirate);
    const maxThrust = Math.hypot(jackal.movement.mainThrust * jackal.movement.boostMultiplier, jackal.movement.lateralThrust);
    for (let i = 0; i < 60 * 20; i++) {
      const before = { ...b.velocity };
      sim.step();
      const collided = sim.drainEvents().some((e) => e.type === 'collision' && (e.a === pirate || e.b === pirate));
      if (collided) continue;
      const dv = Math.hypot(b.velocity.x - before.x, b.velocity.y - before.y);
      expect(dv).toBeLessThanOrEqual((maxThrust / b.mass) * sim.dt + 1e-9);
    }
  });

  it('retreats when its hull is low and its shield is down', () => {
    const { sim, player, pirate } = encounter(500);
    const p = ship(sim, pirate);
    p.hull = jackal.hull.integrity * 0.2;
    p.shield = 0;
    p.lastDamageTick = sim.world.tick;
    sim.run(3);
    expect(sim.world.pilots.get(pirate)!.mode).toBe('retreat');
    const distance = () => Math.hypot(body(sim, pirate).position.x - body(sim, player).position.x, body(sim, pirate).position.y - body(sim, player).position.y);
    const start = distance();
    sim.run(60 * 4);
    expect(distance()).toBeGreaterThan(start + 100);
  });

  it('respawns a destroyed group after its delay', () => {
    const sim = Simulation.fromSector(OUTPOST_ALPHA);
    const group = sim.world.encounters[0];
    const first = [...group.members];
    for (const id of first) {
      ship(sim, id).hull = 0;
      ship(sim, id).destroyed = true;
    }
    sim.run(Math.round(group.definition.respawnDelay * 60) + 2);
    expect(group.members).not.toEqual(first);
    expect(group.members.every((id) => !ship(sim, id).destroyed)).toBe(true);
  });

  it('starts the sector with three pirates on patrol', () => {
    const sim = Simulation.fromSector(OUTPOST_ALPHA);
    aiSystem(sim.world);
    expect(sim.world.pilots.size).toBe(3);
    expect([...sim.world.pilots.values()].every((p) => p.mode === 'patrol')).toBe(true);
  });
});
