import { describe, expect, it } from 'vitest';
import { CAMPAIGN, STATION_PLACEMENTS, getSector } from '@void-frontier/content';
import { SAVE_VERSION, Simulation, campaignStep, dockShip, jump, migrate, nextGate, restore, serialize, unitPrice, applyWeaponDamage, type Economy } from '../src/index.ts';
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
  /** Plays one step with the game's own mechanics; returns the simulation, which may have jumped. */
  function play(start: Simulation): Simulation {
    let sim = start;
    const step = campaignStep(sim.campaign!)!;
    const objective = step.objective;
    const goTo = (sector: string) => {
      if (sim.world.sectorId === sector) return;
      for (let hops = 0; sim.world.sectorId !== sector && hops < 8; hops++) {
        if (sim.world.ships.get(sim.playerId)!.docked !== null) sim.undock(sim.playerId);
        sim = jump(sim, nextGate(sim.world.sectorId, sector)!, {}, new Set()).sim;
      }
    };
    if (objective.kind === 'discover') {
      goTo(objective.sector);
      if (sim.world.ships.get(sim.playerId)!.docked !== null) sim.undock(sim.playerId);
      moveTo(sim, sim.world.pointsOfInterest.get(objective.poi)!.position);
    } else if (objective.kind === 'kill') {
      for (let i = 0; i < objective.count; i++) {
        killNearestPirate(sim);
        sim.step();
        // Pirates may all be down: bring the next group in.
        for (const e of sim.world.encounters) e.respawnAt = e.respawnAt === null ? null : 0;
        sim.step();
      }
    } else if (objective.kind === 'deliver') {
      goTo(STATION_PLACEMENTS.get(objective.station)!.sector);
      dockAt(sim, objective.station);
      ship(sim, sim.playerId).cargo.clear();
      ship(sim, sim.playerId).cargo.set(objective.resource, objective.units);
    } else if (objective.kind === 'boss') {
      goTo(objective.sector);
      sim.step();
      const boss = sim.world.encounters.find((e) => e.definition.id === `campaign_boss_${step.id}`)!.members[0];
      applyWeaponDamage(sim.world, boss, sim.playerId, 1e6, { shield: 1, hull: 1 }, body(sim, boss).position, false);
    }
    sim.run(3);
    return sim;
  }

  for (const branch of ['justice', 'deal']) {
    it(`plays to the end on the ${branch} branch with the game's own mechanics`, () => {
      let sim = Simulation.fromSector(getSector('outpost_alpha'), undefined, { startDocked: true });
      const seen: string[] = [];
      for (let guard = 0; guard < 30 && campaignStep(sim.campaign!); guard++) {
        const step = campaignStep(sim.campaign!)!;
        seen.push(step.id);
        if (step.objective.kind === 'choice') {
          const credits = sim.world.credits;
          expect(sim.chooseCampaign(branch)).toBe(true);
          expect(sim.world.credits).toBe(credits + step.objective.options.find((o) => o.id === branch)!.credits);
          continue;
        }
        sim = play(sim);
        expect(campaignStep(sim.campaign!)?.id).not.toBe(step.id);
      }
      expect(campaignStep(sim.campaign!)).toBeNull();
      expect(sim.campaign!.branch).toBe(branch);
      const other = branch === 'justice' ? 'deal' : 'justice';
      expect(seen).toHaveLength(15);
      expect(seen).toEqual(CAMPAIGN.steps.filter((s) => s.when !== other).map((s) => s.id));
      expect(sim.campaign!.stats.steps).toHaveLength(15);
    }, 60_000);
  }

  it('refuses a choice at any other step, or an unknown option', () => {
    const sim = Simulation.fromSector(getSector('outpost_alpha'));
    expect(sim.chooseCampaign('justice')).toBe(false);
    sim.campaign!.step = CAMPAIGN.steps.findIndex((s) => s.objective.kind === 'choice');
    expect(sim.chooseCampaign('nonsense')).toBe(false);
  });

  it('round-trips a save at every step, with a fleet at work', () => {
    const sim = Simulation.fromSector(getSector('outpost_alpha'), undefined, { startDocked: true });
    sim.world.credits = 60_000;
    sim.step();
    const bought = sim.buyShip('prospector');
    const pilot = sim.crewOffers()[0];
    sim.hirePilot(pilot.id);
    sim.assignPilot(pilot.id, bought.ok ? bought.id : -1);
    sim.setOrder(bought.ok ? bought.id : -1, { kind: 'mine', site: 'copper_reach' });
    sim.run(600);
    for (let step = 0; step <= CAMPAIGN.steps.length; step++) {
      sim.campaign!.step = step;
      const data = JSON.parse(JSON.stringify(serialize({ sim, memory: {}, discovered: new Set() })));
      expect(serialize(restore(data))).toEqual(data);
    }
  }, 120_000);

  it('brings the flagship back, repaired, after the player leaves its sector', () => {
    let sim = Simulation.fromSector(getSector('pirate_territory'));
    sim.campaign!.step = CAMPAIGN.steps.findIndex((s) => s.id === 'flagship');
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
