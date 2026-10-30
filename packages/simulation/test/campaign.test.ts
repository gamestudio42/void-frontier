import { describe, expect, it } from 'vitest';
import { CAMPAIGN, STATION_PLACEMENTS, getSector } from '@void-frontier/content';
import { SAVE_VERSION, Simulation, campaignStep, dockShip, jump, migrate, restore, serialize, unitPrice, applyWeaponDamage, type Economy } from '../src/index.ts';
import { body, ship } from './helpers.ts';

const stepId = (sim: Simulation) => campaignStep(sim.campaign!)?.id ?? null;

function moveTo(sim: Simulation, point: { x: number; y: number }) {
  const b = body(sim, sim.playerId);
  b.position = { ...point };
  b.previousPosition = { ...point };
  b.velocity = { x: 0, y: 0 };
}

/** Jumps gate by gate along the given sectors. */
function travel(start: Simulation, sectors: string[]): Simulation {
  let sim = start;
  if (sim.world.ships.get(sim.playerId)!.docked !== null) sim.undock(sim.playerId);
  for (const to of sectors) {
    const gate = [...sim.world.gates.values()].find((g) => g.to === to)!;
    sim = jump(sim, gate.id, {}, new Set()).sim;
  }
  return sim;
}

function dockAt(sim: Simulation, key: string) {
  const station = [...sim.world.stations].find(([, s]) => s.name === key)![0];
  dockShip(sim.world, sim.playerId, station);
}

function killNearestPirate(sim: Simulation) {
  const [id] = [...sim.world.ships].find(([, s]) => s.faction === 'pirate' && !s.destroyed)!;
  applyWeaponDamage(sim.world, id, sim.playerId, 1e6, { shield: 1, hull: 1 }, body(sim, id).position, false);
}

describe('campaign', () => {
  it('plays from the first step to the end with the game\'s own mechanics', () => {
    let sim = Simulation.fromSector(getSector('outpost_alpha'), undefined, { startDocked: true });
    sim.world.credits = 0;
    expect(stepId(sim)).toBe('distress');
    sim.undock(sim.playerId);

    moveTo(sim, sim.world.pointsOfInterest.get('alpha_wreck')!.position);
    sim.run(3);
    expect(stepId(sim)).toBe('raiders');
    expect(sim.world.credits).toBeGreaterThanOrEqual(600);

    killNearestPirate(sim);
    sim.step();
    expect(stepId(sim)).toBe('raiders');
    killNearestPirate(sim);
    sim.step();
    expect(stepId(sim)).toBe('parts');

    sim = travel(sim, ['anomaly_zone']);
    dockAt(sim, 'bastion_watch');
    sim.step();
    expect(stepId(sim)).toBe('parts');
    ship(sim, sim.playerId).cargo.set('machine_parts', 25);
    const stock = sim.economy!.markets.bastion_watch.find((m) => m.resource === 'machine_parts')!;
    const before = stock.stock;
    sim.step();
    expect(stepId(sim)).toBe('signal');
    expect(ship(sim, sim.playerId).cargo.get('machine_parts')).toBe(5);
    expect(stock.stock).toBeGreaterThan(before + 19);
    expect(sim.world.standing.frontier_guard).toBeGreaterThanOrEqual(10);

    sim.undock(sim.playerId);
    moveTo(sim, sim.world.pointsOfInterest.get('ancient_structure')!.position);
    sim.run(3);
    expect(stepId(sim)).toBe('trail');

    sim = travel(sim, ['pirate_territory']);
    moveTo(sim, sim.world.pointsOfInterest.get('gunship_wreck')!.position);
    sim.run(3);
    expect(stepId(sim)).toBe('flagship');

    sim.step();
    const boss = [...sim.world.ships].find(([, s]) => s.baseDefinition.id === 'dreadmaw')![0];
    const credits = sim.world.credits;
    applyWeaponDamage(sim.world, boss, sim.playerId, 1e6, { shield: 1, hull: 1 }, body(sim, boss).position, false);
    sim.step();
    expect(stepId(sim)).toBeNull();
    expect(sim.world.credits).toBeGreaterThanOrEqual(credits + CAMPAIGN.steps.at(-1)!.reward.credits);
    sim.run(5);
    expect([...sim.world.ships.values()].filter((s) => s.baseDefinition.id === 'dreadmaw' && !s.destroyed)).toHaveLength(0);
  });

  it('brings the flagship back, repaired, after the player leaves its sector', () => {
    let sim = Simulation.fromSector(getSector('pirate_territory'));
    sim.campaign!.step = CAMPAIGN.steps.length - 1;
    sim.step();
    const count = (s: Simulation) => [...s.world.ships.values()].filter((v) => v.baseDefinition.id === 'dreadmaw' && !v.destroyed).length;
    expect(count(sim)).toBe(1);
    sim.run(3);
    expect(count(sim)).toBe(1);
    sim = travel(sim, ['anomaly_zone']);
    sim.step();
    expect(count(sim)).toBe(0);
    sim = travel(sim, ['pirate_territory']);
    sim.step();
    expect(count(sim)).toBe(1);
    expect(stepId(sim)).toBe('flagship');
  });

  it('survives a save, and a 0.6 save starts the story with the new station in its economy', () => {
    const sim = Simulation.fromSector(getSector('outpost_alpha'), undefined, { startDocked: true });
    sim.campaign!.step = 2;
    const data = serialize({ sim, memory: {}, discovered: new Set() });
    expect(data.version).toBe(SAVE_VERSION);
    const again = restore(JSON.parse(JSON.stringify(data)));
    expect(again.sim.campaign!.step).toBe(2);
    expect(serialize(again)).toEqual(data);

    const v6 = JSON.parse(JSON.stringify(data));
    v6.version = 6;
    delete v6.campaign;
    delete v6.economy.markets.bastion_watch;
    v6.economy.traders = v6.economy.traders.filter((t: { route: string }) => t.route !== 'ferrum_bastion_run');
    delete v6.missions.reputation.frontier_guard;
    v6.sectors.anomaly_zone = { rng: [1, 2, 3, 4], asteroids: [], markets: [], pickups: [] };
    const migrated = migrate(v6);
    expect(migrated.sectors.anomaly_zone).toBeUndefined();
    const old = restore(migrated);
    expect(old.sim.campaign!.step).toBe(0);
    expect(old.sim.economy!.markets.bastion_watch).toBeDefined();
    expect(old.sim.economy!.traders.some((t) => t.route === 'ferrum_bastion_run')).toBe(true);
    expect(old.sim.world.standing.frontier_guard).toBe(0);
  });
});

describe('Bastion Watch', () => {
  it('is a lawful station that takes parts and sells combat gear', () => {
    const placement = STATION_PLACEMENTS.get('bastion_watch')!;
    expect(placement.sector).toBe('anomaly_zone');
    const sim = Simulation.fromSector(getSector('anomaly_zone'));
    const station = [...sim.world.stations.values()].find((s) => s.name === 'bastion_watch')!;
    expect(station.definition.upgrades).toContain('combat_computer');
    expect(sim.missions!.stations.some((s) => s.key === 'bastion_watch')).toBe(true);
  });

  it('runs short of parts when its hauler stops coming, and the price climbs', () => {
    const away = new Simulation();
    away.world.sectorId = 'deep_space';
    const home = Simulation.fromSector(getSector('outpost_alpha'));
    away.economy = home.economy as Economy;
    const item = away.economy.markets.bastion_watch.find((m) => m.resource === 'machine_parts')!;
    const start = unitPrice(item, 'sell');
    for (const trader of away.economy.traders) if (trader.route === 'ferrum_bastion_run') trader.departTick = 1e9;
    away.run(60 * 60 * 25);
    expect(item.stock).toBeLessThan(60);
    expect(unitPrice(item, 'sell')).toBeGreaterThan(start);
  });
});
