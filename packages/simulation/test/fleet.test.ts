import { describe, expect, it } from 'vitest';
import { OUTPOST_ALPHA, getSector, getShip } from '@void-frontier/content';
import { SAVE_VERSION, Simulation, jump, migrate, readTelemetry, restore, serialize, shipValue, shipyardOffers } from '../src/index.ts';
import { body, ship } from './helpers.ts';

function rich(sectorId = 'outpost_alpha') {
  const sim = Simulation.fromSector(getSector(sectorId), undefined, { startDocked: true });
  sim.world.credits = 50_000;
  return sim;
}

describe('shipyard', () => {
  it('sells the station\'s hulls, gating faction ships', () => {
    const belt = rich('industrial_belt');
    const lancer = shipyardOffers(belt.world, belt.playerId).find((o) => o.ship === 'lancer')!;
    expect(lancer.locked).not.toBeNull();
    expect(belt.buyShip('lancer')).toEqual({ ok: false, reason: 'reputation' });
    belt.missions!.reputation.ferrum_combine = 20;
    expect(belt.buyShip('lancer').ok).toBe(true);
    expect(rich().buyShip('lancer')).toEqual({ ok: false, reason: 'notSold' });
  });

  it('charges the price and parks the new hull in this station\'s hangar', () => {
    const sim = rich();
    const result = sim.buyShip('prospector');
    expect(result.ok).toBe(true);
    expect(sim.world.credits).toBe(50_000 - getShip('prospector').price);
    expect(sim.fleet.ships[0]).toMatchObject({ station: 'outpost_alpha_station', state: { ship: 'prospector' } });
  });

  it('refuses without the credits', () => {
    const sim = Simulation.fromSector(OUTPOST_ALPHA);
    expect(sim.buyShip('mule')).toEqual({ ok: false, reason: 'noCredits' });
  });
});

describe('hangar', () => {
  it('swaps ships: the old one is parked with its cargo, the new one is docked and flown', () => {
    const sim = rich();
    ship(sim, sim.playerId).cargo.set('iron_ore', 12);
    const bought = sim.buyShip('prospector');
    const oldId = sim.playerId;
    expect(sim.boardShip(bought.ok ? bought.id : -1).ok).toBe(true);
    expect(sim.playerId).not.toBe(oldId);
    const t = readTelemetry(sim.world, sim.playerId)!;
    expect(t.docked).toBe(true);
    expect(ship(sim, sim.playerId).definition.id).toBe('prospector');
    expect(ship(sim, sim.playerId).cargo.size).toBe(0);
    const parked = sim.fleet.ships.find((s) => s.state.ship === 'kestrel')!;
    expect(parked.state.cargo).toEqual([['iron_ore', 12]]);
    expect(sim.world.ships.has(oldId)).toBe(false);
  });

  it('flies the new hull: the prospector carries more and mines harder', () => {
    const sim = rich();
    const bought = sim.buyShip('prospector');
    sim.boardShip(bought.ok ? bought.id : -1);
    const s = ship(sim, sim.playerId);
    expect(s.definition.cargo.maxMass).toBeGreaterThan(getShip('kestrel').cargo.maxMass);
    expect(s.weapons.some((w) => w.definition.id === 'mining_laser_mk2')).toBe(true);
    sim.undock(sim.playerId);
    sim.setCommand(sim.playerId, { thrust: 1 });
    sim.run(30);
    expect(Math.hypot(body(sim, sim.playerId).velocity.x, body(sim, sim.playerId).velocity.y)).toBeGreaterThan(1);
  });

  it('only boards or sells ships parked at this station', () => {
    const sim = rich();
    const bought = sim.buyShip('mule');
    const id = bought.ok ? bought.id : -1;
    sim.fleet.ships[0].station = 'ferrum_refinery';
    expect(sim.boardShip(id)).toEqual({ ok: false, reason: 'elsewhere' });
    expect(sim.sellShip(id)).toEqual({ ok: false, reason: 'elsewhere' });
  });

  it('sells a parked ship for part of its value', () => {
    const sim = rich();
    const bought = sim.buyShip('mule');
    const credits = sim.world.credits;
    const value = shipValue(sim.fleet.ships[0].state);
    expect(sim.sellShip(bought.ok ? bought.id : -1).ok).toBe(true);
    expect(sim.world.credits).toBe(credits + value);
    expect(value).toBeLessThan(getShip('mule').price);
  });
});

describe('flying another hull through the frontier', () => {
  it('keeps the ship type through a jump and a save', () => {
    const sim = rich();
    const bought = sim.buyShip('mule');
    sim.boardShip(bought.ok ? bought.id : -1);
    sim.undock(sim.playerId);
    const gate = sim.world.gates.get('alpha_to_belt')!;
    body(sim, sim.playerId).position = { ...gate.position };
    const { sim: next } = jump(sim, 'alpha_to_belt', {}, new Set());
    expect(ship(next, next.playerId).definition.id).toBe('mule');
    expect(next.fleet).toBe(sim.fleet);
    const loaded = restore(serialize({ sim: next, memory: {}, discovered: new Set() }));
    expect(ship(loaded.sim, loaded.sim.playerId).definition.id).toBe('mule');
    expect(loaded.sim.fleet.ships.map((s) => s.state.ship)).toEqual(['kestrel']);
  });

  it('migrates a version 4 save with an empty hangar', () => {
    const sim = Simulation.fromSector(OUTPOST_ALPHA);
    const { fleet: _fleet, ...v4 } = { ...serialize({ sim, memory: {}, discovered: new Set() }), version: 4 };
    const migrated = migrate(v4);
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(restore(migrated).sim.fleet.ships).toEqual([]);
  });
});
