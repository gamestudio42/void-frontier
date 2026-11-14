import { describe, expect, it } from 'vitest';
import { CONTRACT_RULES, PIRATE_RULES, getShip } from '@void-frontier/content';
import { Rng } from '@void-frontier/kernel';
import { Simulation, applyWeaponDamage, boardDisabled, boardingStatus, hostilesNear, isDisabled, spawnEncounter, spawnShip, surrender, type SimEvent } from '../src/index.ts';

const morale = PIRATE_RULES.morale;

/** A still kestrel at the origin (the player) and a pirate group `distance` metres east. */
function scene(ship: string, options: { count?: number; archetype?: string; loadout?: string[]; distance?: number } = {}) {
  const sim = new Simulation();
  const me = spawnShip(sim.world, getShip('kestrel'));
  sim.playerId = me;
  const at = { x: options.distance ?? 600, y: 0 };
  const members = spawnEncounter(sim.world, {
    id: 'test',
    ship,
    faction: 'pirate',
    count: options.count ?? 1,
    spawn: at,
    patrol: [[at.x, at.y]],
    respawnDelay: 1e6,
    archetype: options.archetype,
    loadout: options.loadout,
  });
  return { sim, me, members };
}

function run(sim: Simulation, seconds: number, each?: (events: SimEvent[]) => void) {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    sim.step();
    each?.(sim.drainEvents());
  }
}

const gap = (sim: Simulation, a: number, b: number) => {
  const p = sim.world.bodies.get(a)!.position;
  const q = sim.world.bodies.get(b)!.position;
  return Math.hypot(p.x - q.x, p.y - q.y);
};

describe('pirate archetypes', () => {
  it('a brawler flies into its target', () => {
    const { sim, me, members } = scene('marauder', { distance: 700 });
    expect(sim.world.pilots.get(members[0])!.archetype).toBe('brawler');
    let rammed = false;
    run(sim, 30, (events) => {
      if (events.some((e) => e.type === 'collision' && ((e.a === me && e.b === members[0]) || (e.b === me && e.a === members[0])))) rammed = true;
    });
    expect(rammed).toBe(true);
  });

  it('a kiter holds its distance and fires missiles from it', () => {
    const { sim, me, members } = scene('jackal', { archetype: 'kiter', loadout: ['pirate_missile'], distance: 300 });
    let missiles = 0;
    let closest = Infinity;
    run(sim, 25, (events) => {
      missiles += events.filter((e) => e.type === 'shot' && e.owner === members[0]).length;
      if (sim.world.tick > 60 * 8) closest = Math.min(closest, gap(sim, me, members[0]));
    });
    expect(missiles).toBeGreaterThan(0);
    // Once it has opened the range, it stays well outside an orbiter's 230 m.
    expect(closest).toBeGreaterThan(350);
  });

  it('flies a squad behind its leader', () => {
    const { sim, members } = scene('jackal', { count: 3, distance: 3000 });
    const [leader, ...wings] = members;
    for (const id of members) expect(sim.world.pilots.get(id)!.squad).toBe(leader);
    for (const id of wings) expect(sim.world.pilots.get(id)!.escort?.leader).toBe(leader);
  });
});

describe('pirate morale', () => {
  it('breaks under fire: the pirate runs, then regroups', () => {
    const { sim, me, members } = scene('jackal', { distance: 400 });
    const [foe] = members;
    const pirate = sim.world.ships.get(foe)!;
    pirate.shield = 0;
    // Enough hull damage to break a skirmisher's nerve, not to kill it.
    applyWeaponDamage(sim.world, foe, me, pirate.definition.hull.integrity * 0.5, { shield: 1, hull: 1 }, { x: 400, y: 0 }, false);
    const states: string[] = [];
    run(sim, morale.fleeSeconds + 2, (events) => {
      for (const e of events) if (e.type === 'morale' && e.ship === foe) states.push(e.state);
    });
    expect(states[0]).toBe('fleeing');
    expect(states).toContain('rallied');
  });

  it('shakes the wings when their leader dies', () => {
    const { sim, me, members } = scene('jackal', { count: 3, distance: 3000 });
    const [leader, wing] = members;
    const before = sim.world.pilots.get(wing)!.morale!;
    const target = sim.world.ships.get(leader)!;
    target.shield = 0;
    applyWeaponDamage(sim.world, leader, me, 1e6, { shield: 1, hull: 1 }, { x: 3000, y: 0 }, false);
    expect(target.destroyed).toBe(true);
    expect(sim.world.pilots.get(wing)!.morale).toBeCloseTo(before - morale.leaderLoss, 6);
  });

  it('a pirate that surrenders stops, stops being a threat and pays a ransom when boarded', () => {
    const { sim, me, members } = scene('jackal', { distance: 60 });
    const [foe] = members;
    surrender(sim.world, foe);
    run(sim, 3);
    const pirate = sim.world.ships.get(foe)!;
    expect(isDisabled(pirate)).toBe(true);
    expect(pirate.command.firePrimary).toBe(false);
    expect(hostilesNear(sim.world, me, 2000)).not.toContain(foe);
    // Hold the player still beside it, as a pilot lining up would.
    const mine = sim.world.bodies.get(me)!;
    const theirs = sim.world.bodies.get(foe)!;
    mine.velocity = { ...theirs.velocity };
    mine.position = { x: theirs.position.x - 50, y: theirs.position.y };
    expect(boardingStatus(sim)?.ready).toBe(true);
    const credits = sim.world.credits;
    const loot = boardDisabled(sim);
    expect(loot.ok).toBe(true);
    expect(sim.world.credits - credits).toBeGreaterThanOrEqual(Math.round(CONTRACT_RULES.boarding.minCredits * morale.ransom));
  });

  it('some broken, badly hurt pirates give up on their own', () => {
    let surrendered = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const { sim, me, members } = scene('jackal', { distance: 400 });
      sim.world.rng = new Rng(seed * 7919);
      const [foe] = members;
      const pirate = sim.world.ships.get(foe)!;
      pirate.shield = 0;
      applyWeaponDamage(sim.world, foe, me, pirate.definition.hull.integrity * 0.7, { shield: 1, hull: 1 }, { x: 400, y: 0 }, false);
      run(sim, 1, (events) => {
        if (events.some((e) => e.type === 'morale' && e.state === 'surrendered')) surrendered++;
      });
    }
    expect(surrendered).toBeGreaterThan(0);
    expect(surrendered).toBeLessThan(8);
  });

  it('the boss never breaks', () => {
    const { sim, me, members } = scene('dreadmaw', { distance: 400 });
    const [boss] = members;
    const flagship = sim.world.ships.get(boss)!;
    flagship.shield = 0;
    applyWeaponDamage(sim.world, boss, me, flagship.definition.hull.integrity * 0.8, { shield: 1, hull: 1 }, { x: 400, y: 0 }, false);
    let broke = false;
    run(sim, 5, (events) => {
      if (events.some((e) => e.type === 'morale' && e.ship === boss)) broke = true;
    });
    expect(broke).toBe(false);
  });

  it('is deterministic', () => {
    const once = () => {
      const { sim, me, members } = scene('jackal', { count: 2, distance: 500 });
      applyWeaponDamage(sim.world, members[0], me, 400, { shield: 1, hull: 1 }, { x: 500, y: 0 }, false);
      run(sim, 15);
      return members.map((id) => ({ ...sim.world.bodies.get(id)!.position, morale: sim.world.pilots.get(id)!.morale }));
    };
    expect(once()).toEqual(once());
  });
});
