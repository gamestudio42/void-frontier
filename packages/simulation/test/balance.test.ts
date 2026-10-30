import { describe, expect, it } from 'vitest';
import { getSector } from '@void-frontier/content';
import { Simulation, bayApproach, boardShip, distance, dockShip, holdSpaceFor, sitePlace, wageFor } from '../src/index.ts';

const MINUTES = 4;

/** A hull flown by hand, approximated: mine at the field until full, fly back, sell everything, repeat. */
function activeMining(hull: string, site: string): number {
  const sim = Simulation.fromSector(getSector(sitePlace(site).sector), undefined, { startDocked: true });
  sim.campaign = null;
  sim.world.credits = 50_000;
  // Pirates are measured separately: this is the ore rate.
  for (const encounter of sim.world.encounters) for (const id of encounter.members) sim.world.destroyEntity(id);
  sim.world.encounters.length = 0;
  if (hull !== 'kestrel') {
    const bought = sim.buyShip(hull);
    if (bought.ok) boardShip(sim, bought.id);
  }
  const key = [...sim.world.stations.values()][0].name;
  const stationId = [...sim.world.stations.keys()][0];
  const field = sitePlace(site).point;
  const start = sim.world.credits;
  sim.undock(sim.playerId);
  const pilot = (extra: object) => sim.world.pilots.set(sim.playerId, { mode: 'patrol', patrol: [field], waypoint: 0, target: null, retreatUntil: 0, orbit: 1, ...extra });
  pilot({ travel: { to: field, speed: 55 } });
  let phase: 'out' | 'mine' | 'back' = 'out';
  for (let i = 0; i < 60 * 60 * MINUTES; i++) {
    sim.step();
    sim.drainEvents();
    const ship = sim.world.ships.get(sim.playerId)!;
    // This measures the ore rate, not crashes: a bump never ends the run.
    ship.hull = ship.definition.hull.integrity;
    const body = sim.world.bodies.get(sim.playerId)!;
    if (phase === 'out' && distance(body.position, field) < 150) {
      phase = 'mine';
      pilot({ mine: { site: field, rock: null } });
    } else if (phase === 'mine') {
      if (holdSpaceFor(ship, 'iron_ore') < 2) {
        phase = 'back';
        pilot({ travel: { to: bayApproach(key).point, speed: 55 } });
      }
    } else if (phase === 'back' && distance(body.position, bayApproach(key).point) < 80) {
      sim.world.pilots.delete(sim.playerId);
      dockShip(sim.world, sim.playerId, stationId);
      for (const [resource, units] of [...ship.cargo]) sim.trade(sim.playerId, resource, units, 'sell');
      sim.undock(sim.playerId);
      phase = 'out';
      pilot({ travel: { to: field, speed: 55 } });
    }
  }
  return ((sim.world.credits - start) / MINUTES) * 60;
}

/** The same hull and field worked by an average hired pilot, off-screen. */
function fleetMining(hull: string, site: string): number {
  const sim = Simulation.fromSector(getSector('outpost_alpha'), undefined, { startDocked: true });
  sim.world.credits = 50_000;
  sim.step();
  const bought = sim.buyShip(hull);
  if (!bought.ok) throw new Error(bought.reason);
  const pilot = sim.crewOffers()[0];
  sim.hirePilot(pilot.id);
  sim.assignPilot(pilot.id, bought.id);
  const owned = sim.fleet.ships[0];
  Object.assign(owned.pilot!, { skills: { piloting: 3, mining: 3, combat: 3 }, wage: wageFor({ piloting: 3, mining: 3, combat: 3 }) });
  sim.setOrder(owned.id, { kind: 'mine', site });
  const away = new Simulation();
  away.world.sectorId = 'deep_space';
  away.fleet = sim.fleet;
  away.economy = sim.economy;
  away.world.tick = sim.world.tick;
  away.world.credits = sim.world.credits;
  away.run(60 * 60 * 60);
  return owned.earned;
}

describe('balance', () => {
  it('keeps a fleet miner alive in the player\'s sector', () => {
    const sim = Simulation.fromSector(getSector('outpost_alpha'), undefined, { startDocked: true });
    sim.campaign = null;
    sim.world.credits = 50_000;
    for (const encounter of sim.world.encounters) for (const id of encounter.members) sim.world.destroyEntity(id);
    sim.world.encounters.length = 0;
    for (const trader of sim.economy!.traders) trader.departTick = 1e9;
    sim.step();
    const bought = sim.buyShip('prospector');
    const pilot = sim.crewOffers()[0];
    sim.hirePilot(pilot.id);
    sim.assignPilot(pilot.id, bought.ok ? bought.id : -1);
    const owned = sim.fleet.ships[0];
    sim.setOrder(owned.id, { kind: 'mine', site: 'copper_reach' });
    sim.run(60 * 60 * 10);
    expect(sim.fleet.log.some((n) => n.kind === 'lost')).toBe(false);
    expect(sim.fleet.log.some((n) => n.kind === 'sold')).toBe(true);
  }, 120_000);

  it('pays better to fly a ship than to hire a pilot for it', () => {
    const rows: [string, string, number, number][] = [];
    for (const [hull, site] of [['prospector', 'copper_reach']]) {
      rows.push([hull, site, Math.round(activeMining(hull, site)), Math.round(fleetMining(hull, site))]);
    }
    for (const [, , active, fleet] of rows) expect(active).toBeGreaterThan(fleet);
  }, 240_000);
});
