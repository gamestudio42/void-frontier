import { describe, expect, it } from 'vitest';
import { UPGRADES, getShip, getUpgrade, previousTier, upgradeFamily, upgradeTier } from '@void-frontier/content';
import { Simulation, abilityStatus, bayOf, dockShip, installUpgrades, readTelemetry, spawnEncounter, spawnShip, spawnStation, upgradeFit, type SimEvent } from '../src/index.ts';

/** A still kestrel at the origin, flying, with `modules` fitted. */
function flying(modules: string[]) {
  const sim = new Simulation();
  const me = spawnShip(sim.world, getShip('kestrel'));
  sim.playerId = me;
  installUpgrades(sim.world, me, modules);
  return { sim, me };
}

function run(sim: Simulation, seconds: number, each?: (events: SimEvent[]) => void) {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    sim.step();
    each?.(sim.drainEvents());
  }
}

const speedOf = (sim: Simulation, id: number) => {
  const v = sim.world.bodies.get(id)!.velocity;
  return Math.hypot(v.x, v.y);
};

/** A homing missile `distance` metres east of `target`, flying at it. */
function missileAt(sim: Simulation, target: number, distance: number) {
  const p = sim.world.bodies.get(target)!.position;
  const id = sim.world.createEntity();
  sim.world.projectiles.set(id, {
    owner: 9999,
    position: { x: p.x + distance, y: p.y },
    velocity: { x: -170, y: 0 },
    life: 7,
    damage: 70,
    multipliers: { shield: 0.8, hull: 1.5 },
    homing: { target, turnRate: 1.6 },
  });
  return id;
}

describe('the afterburner dash', () => {
  it('kicks the ship along the nose, burns fuel and then waits its cooldown', () => {
    const { sim, me } = flying(['afterburner']);
    const fuel = sim.world.ships.get(me)!.fuel;
    expect(sim.useAbility(me, 'dash')).toBe(true);
    const dash = getUpgrade('afterburner').ability!;
    if (dash.kind !== 'dash') throw new Error('afterburner should dash');
    expect(speedOf(sim, me)).toBeCloseTo(dash.deltaV, 5);
    expect(sim.world.bodies.get(me)!.velocity.x).toBeGreaterThan(0);
    expect(sim.world.ships.get(me)!.fuel).toBeCloseTo(fuel - dash.fuel, 5);
    expect(sim.useAbility(me, 'dash')).toBe(false);
    run(sim, dash.cooldown - 0.5);
    expect(abilityStatus(sim.world, me, sim.dt)[0].block).toBe('cooldown');
    run(sim, 0.6);
    expect(sim.useAbility(me, 'dash')).toBe(true);
  });

  it('follows the stick: strafing right dashes to the right of the nose', () => {
    const { sim, me } = flying(['afterburner']);
    sim.setCommand(me, { strafe: 1 });
    sim.useAbility(me, 'dash');
    const v = sim.world.bodies.get(me)!.velocity;
    // The nose points along +X, so its right is -Y.
    expect(v.y).toBeLessThan(-40);
    expect(Math.abs(v.x)).toBeLessThan(1);
  });

  it('cannot fire without the module, docked or on a dry tank', () => {
    const bare = flying([]);
    expect(bare.sim.useAbility(bare.me, 'dash')).toBe(false);
    const dry = flying(['afterburner']);
    dry.sim.world.ships.get(dry.me)!.fuel = 1;
    expect(dry.sim.useAbility(dry.me, 'dash')).toBe(false);
    expect(abilityStatus(dry.sim.world, dry.me, dry.sim.dt)[0].block).toBe('fuel');
  });

  it('each tier kicks harder and comes back sooner', () => {
    const kicks = ['afterburner', 'afterburner_mk2', 'afterburner_mk3'].map((id) => {
      const { sim, me } = flying([id]);
      sim.useAbility(me, 'dash');
      return { speed: speedOf(sim, me), cooldown: abilityStatus(sim.world, me, sim.dt)[0].readyIn };
    });
    expect(kicks[1].speed).toBeGreaterThan(kicks[0].speed);
    expect(kicks[2].speed).toBeGreaterThan(kicks[1].speed);
    expect(kicks[1].cooldown).toBeLessThan(kicks[0].cooldown);
    expect(kicks[2].cooldown).toBeLessThan(kicks[1].cooldown);
  });
});

describe('chaff', () => {
  it('breaks the lock of a missile homing on the ship, and of one that flies in afterwards', () => {
    const { sim, me } = flying(['countermeasures']);
    const near = missileAt(sim, me, 300);
    expect(sim.useAbility(me, 'chaff')).toBe(true);
    expect(sim.world.projectiles.get(near)!.homing!.target).toBeNull();
    expect(readTelemetry(sim.world, me)!.chaff).toBe(true);
    // A second missile from outside the cloud keeps its lock until it enters it.
    const late = missileAt(sim, me, 900);
    sim.step();
    expect(sim.world.projectiles.get(late)!.homing!.target).toBe(me);
    run(sim, 3);
    expect(sim.world.projectiles.get(late)?.homing?.target ?? null).toBeNull();
  });

  it('without chaff the same missile stays locked and hits', () => {
    const { sim, me } = flying(['countermeasures']);
    const id = missileAt(sim, me, 300);
    let hit = false;
    run(sim, 3, (events) => {
      if (events.some((e) => e.type === 'hit' && e.target === me)) hit = true;
    });
    expect(sim.world.projectiles.has(id)).toBe(false);
    expect(hit).toBe(true);
  });
});

describe('the EMP projector', () => {
  it('strips nearby pirate shields, jams their guns and costs the ship half its own shield', () => {
    const { sim, me } = flying(['emp_projector']);
    const [near] = spawnEncounter(sim.world, { id: 'near', ship: 'jackal', faction: 'pirate', count: 1, spawn: { x: 200, y: 0 }, patrol: [[200, 0]], respawnDelay: 1e6 });
    const [far] = spawnEncounter(sim.world, { id: 'far', ship: 'jackal', faction: 'pirate', count: 1, spawn: { x: 900, y: 0 }, patrol: [[900, 0]], respawnDelay: 1e6 });
    const pirate = sim.world.ships.get(near)!;
    const shield = pirate.shield;
    const mine = sim.world.ships.get(me)!.shield;
    const events: SimEvent[] = [];
    expect(sim.useAbility(me, 'emp')).toBe(true);
    events.push(...sim.drainEvents());
    expect(pirate.shield).toBe(Math.max(0, shield - 150));
    expect(sim.world.ships.get(far)!.shield).toBe(shield);
    expect(sim.world.ships.get(me)!.shield).toBeCloseTo(mine * 0.5, 5);
    expect(events.find((e) => e.type === 'ability')).toMatchObject({ kind: 'emp', hits: 1 });

    // Jammed: it holds fire with the trigger down, then fires again once the pulse wears off.
    let shots = 0;
    const pilot = sim.world.pilots.get(near)!;
    sim.world.pilots.delete(near);
    pirate.command.firePrimary = true;
    run(sim, 2, (e) => (shots += e.filter((x) => x.type === 'shot' && x.owner === near).length));
    expect(shots).toBe(0);
    run(sim, 2, (e) => (shots += e.filter((x) => x.type === 'shot' && x.owner === near).length));
    expect(shots).toBeGreaterThan(0);
    sim.world.pilots.set(near, pilot);
  });

  it('leaves friendly ships alone', () => {
    const { sim, me } = flying(['emp_projector']);
    const friend = spawnShip(sim.world, getShip('kestrel'), { position: { x: 120, y: 0 } });
    const shield = sim.world.ships.get(friend)!.shield;
    sim.useAbility(me, 'emp');
    expect(sim.world.ships.get(friend)!.shield).toBe(shield);
    expect(readTelemetry(sim.world, friend)!.jammed).toBe(false);
  });
});

describe('module tiers', () => {
  function docked(credits: number, modules: string[] = []) {
    const sim = new Simulation();
    const station = spawnStation(sim.world, 'bastion', 'test', { x: 0, y: 0 }, 0);
    const bay = bayOf(sim.world, station)!;
    const id = spawnShip(sim.world, getShip('kestrel'), { position: { ...bay.centre }, angle: bay.dockAngle });
    sim.playerId = id;
    installUpgrades(sim.world, id, modules);
    dockShip(sim.world, id, station);
    sim.world.credits = credits;
    return { sim, id };
  }

  it('a Mk II needs the Mk I fitted', () => {
    const { sim, id } = docked(20_000);
    expect(sim.buyUpgrade(id, 'countermeasures_mk2')).toEqual({ ok: false, reason: 'needsTier' });
  });

  it('buys over the lower tier in the same slot and trades it in', () => {
    const { sim, id } = docked(20_000, ['countermeasures', 'armor_plating']);
    const fit = upgradeFit(sim.world.ships.get(id)!, 'countermeasures_mk2');
    expect(fit.replaces).toBe('countermeasures');
    expect(fit.price).toBe(getUpgrade('countermeasures_mk2').cost - getUpgrade('countermeasures').cost / 2);
    // Both defence slots are full, yet the upgrade goes in where the Mk I was.
    expect(sim.buyUpgrade(id, 'countermeasures_mk2')).toEqual({ ok: true });
    expect(sim.world.credits).toBe(20_000 - fit.price);
    expect(sim.world.ships.get(id)!.upgrades).toEqual(['countermeasures_mk2', 'armor_plating']);
    expect(sim.buyUpgrade(id, 'countermeasures')).toEqual({ ok: false, reason: 'installed' });
    expect(sim.buyUpgrade(id, 'countermeasures_mk2')).toEqual({ ok: false, reason: 'installed' });
  });

  it('a Mk III is gated by standing with the station faction', () => {
    const { sim, id } = docked(20_000, ['countermeasures_mk2']);
    expect(sim.buyUpgrade(id, 'countermeasures_mk3')).toEqual({ ok: false, reason: 'reputation' });
    sim.world.standing.frontier_guard = 30;
    expect(sim.buyUpgrade(id, 'countermeasures_mk3')).toEqual({ ok: true });
  });

  it('every family climbs one tier at a time in one slot', () => {
    for (const upgrade of UPGRADES.values()) {
      const below = previousTier(upgrade.id);
      if (!below) continue;
      expect(upgradeFamily(below)).toBe(upgradeFamily(upgrade.id));
      expect(upgradeTier(below)).toBe(upgradeTier(upgrade.id) - 1);
      expect(getUpgrade(below).slot).toBe(upgrade.slot);
      expect(getUpgrade(below).cost).toBeLessThan(upgrade.cost);
    }
  });
});

describe('determinism', () => {
  it('the same verbs on the same ticks give the same world', () => {
    const play = () => {
      const { sim, me } = flying(['afterburner', 'emp_projector']);
      spawnEncounter(sim.world, { id: 'p', ship: 'jackal', faction: 'pirate', count: 2, spawn: { x: 400, y: 0 }, patrol: [[400, 0]], respawnDelay: 1e6 });
      run(sim, 2);
      sim.setCommand(me, { thrust: 1, strafe: -1 });
      sim.useAbility(me, 'dash');
      run(sim, 3);
      sim.useAbility(me, 'emp');
      run(sim, 4);
      const b = sim.world.bodies.get(me)!;
      return [b.position.x, b.position.y, ...[...sim.world.ships.values()].map((s) => s.shield)];
    };
    expect(play()).toEqual(play());
  });
});
