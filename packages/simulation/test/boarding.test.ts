import { describe, expect, it } from 'vitest';
import { getSector, getShip } from '@void-frontier/content';
import { Simulation, applyWeaponDamage, boardDisabled, boardingStatus, isDisabled, spawnShip } from '../src/index.ts';
import { body, ship } from './helpers.ts';

function scene() {
  const sim = Simulation.fromSector(getSector('outpost_alpha'), undefined, { startDocked: false });
  sim.campaign = null;
  for (const e of sim.world.encounters) for (const id of e.members) sim.world.destroyEntity(id);
  sim.world.encounters.length = 0;
  const me = body(sim, sim.playerId);
  const foe = spawnShip(sim.world, getShip('jackal'), { position: { x: me.position.x + 60, y: me.position.y }, faction: 'pirate' });
  sim.world.pilots.set(foe, { mode: 'patrol', patrol: [{ x: 0, y: 0 }], waypoint: 0, target: null, retreatUntil: 0, orbit: 1 });
  return { sim, foe };
}

describe('aimed fire', () => {
  it('takes out the chosen system for less hull damage', () => {
    const { sim, foe } = scene();
    const target = ship(sim, foe);
    target.shield = 0;
    ship(sim, sim.playerId).command = { ...ship(sim, sim.playerId).command, target: foe, targetSystem: 'reactor' };
    const start = target.hull;
    applyWeaponDamage(sim.world, foe, sim.playerId, 40, { shield: 1, hull: 1 }, body(sim, foe).position, false);
    expect(target.subsystems.reactor).toBeLessThan(1);
    expect(target.subsystems.engines).toBe(1);
    expect(start - target.hull).toBeCloseTo(40 * 0.6 * (1 - target.definition.hull.armor), 3);
  });

  it('does nothing special against anyone but the selected target', () => {
    const { sim, foe } = scene();
    const target = ship(sim, foe);
    target.shield = 0;
    ship(sim, sim.playerId).command = { ...ship(sim, sim.playerId).command, target: null, targetSystem: 'reactor' };
    const start = target.hull;
    applyWeaponDamage(sim.world, foe, sim.playerId, 40, { shield: 1, hull: 1 }, body(sim, foe).position, false);
    expect(start - target.hull).toBeCloseTo(40 * (1 - target.definition.hull.armor), 3);
  });
});

describe('disabled ships', () => {
  it('stop flying and firing when engines or reactor die, and only pirates do', () => {
    const { sim, foe } = scene();
    const target = ship(sim, foe);
    target.subsystems.engines = 0;
    expect(isDisabled(target)).toBe(true);
    sim.step();
    expect(target.command.thrust).toBe(0);
    expect(target.command.firePrimary).toBe(false);
    ship(sim, sim.playerId).subsystems.engines = 0;
    expect(isDisabled(ship(sim, sim.playerId))).toBe(false);
  });

  it('can be boarded when close and slow: credits and salvage, one kill, ship gone', () => {
    const { sim, foe } = scene();
    ship(sim, foe).subsystems.reactor = 0;
    sim.step();
    const credits = sim.world.credits;
    expect(boardingStatus(sim)!.ready).toBe(true);
    const loot = boardDisabled(sim);
    expect(loot.ok).toBe(true);
    expect(sim.world.credits).toBeGreaterThan(credits);
    expect(ship(sim, sim.playerId).cargo.get('salvage')!).toBeGreaterThanOrEqual(12);
    expect(ship(sim, sim.playerId).kills).toBe(1);
    expect(ship(sim, foe).destroyed).toBe(true);
    expect(boardingStatus(sim)).toBeNull();
  });

  it('refuses boarding when too far or too fast', () => {
    const { sim, foe } = scene();
    ship(sim, foe).subsystems.engines = 0;
    sim.step();
    body(sim, sim.playerId).velocity = { x: 40, y: 0 };
    expect(boardingStatus(sim)!.ready).toBe(false);
    expect(boardDisabled(sim).ok).toBe(false);
    body(sim, sim.playerId).velocity = { ...body(sim, foe).velocity };
    body(sim, foe).position = { x: body(sim, sim.playerId).position.x + 300, y: body(sim, sim.playerId).position.y };
    expect(boardingStatus(sim)!.ready).toBe(false);
  });

  it('a healthy ship cannot be boarded', () => {
    const { sim } = scene();
    expect(boardingStatus(sim)).toBeNull();
    expect(boardDisabled(sim).ok).toBe(false);
  });
});
