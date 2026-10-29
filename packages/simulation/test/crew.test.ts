import { describe, expect, it } from 'vitest';
import { CREW_RULES, EVENT_RULES, getSector } from '@void-frontier/content';
import { SAVE_VERSION, Simulation, dockShip, fleetEntities, hireFee, wageFor, jump, migrate, restore, serialize, type FleetOrder, type OwnedShip } from '../src/index.ts';
import { body, ship } from './helpers.ts';

const CYCLE = CREW_RULES.cycleSeconds * 60;

function docked(sectorId = 'outpost_alpha') {
  const sim = Simulation.fromSector(getSector(sectorId), undefined, { startDocked: true });
  sim.world.credits = 80_000;
  sim.step();
  return sim;
}

/** Buys a hull here, hires the first pilot on the board and puts them aboard. */
function crewed(sim: Simulation, hull: string): OwnedShip {
  const bought = sim.buyShip(hull);
  if (!bought.ok) throw new Error(bought.reason);
  const pilot = sim.crewOffers()[0];
  expect(sim.hirePilot(pilot.id)).toEqual({ ok: true });
  expect(sim.assignPilot(pilot.id, bought.id)).toEqual({ ok: true });
  return sim.fleet.ships.find((s) => s.id === bought.id)!;
}

/** The same fleet and economy with the player far away: an empty world, so every route runs on the clock. */
function elsewhere(sim: Simulation): Simulation {
  const away = new Simulation();
  away.world.sectorId = 'deep_space';
  away.fleet = sim.fleet;
  away.economy = sim.economy;
  away.world.tick = sim.world.tick;
  away.world.credits = sim.world.credits;
  return away;
}

describe('crew board', () => {
  it('offers pilots at lawful stations and none at the pirate den', () => {
    const sim = docked();
    const offers = sim.crewOffers();
    expect(offers).toHaveLength(CREW_RULES.offersPerStation);
    for (const p of offers) {
      expect(p.wage).toBeGreaterThan(CREW_RULES.wage.base);
      for (const v of Object.values(p.skills)) expect(v).toBeGreaterThanOrEqual(1);
    }
    expect(sim.fleet.offers.black_harbour).toBeUndefined();
    expect(new Set(Object.values(sim.fleet.offers).flat().map((p) => p.name)).size).toBe(Object.values(sim.fleet.offers).flat().length);
  });

  it('charges the hiring fee and keeps the pilot waiting here', () => {
    const sim = docked();
    const pilot = sim.crewOffers()[0];
    const before = sim.world.credits;
    expect(sim.hirePilot(pilot.id)).toEqual({ ok: true });
    expect(sim.world.credits).toBe(before - hireFee(pilot));
    expect(sim.fleet.crew).toEqual([{ pilot, station: 'outpost_alpha_station' }]);
    expect(sim.crewOffers().some((p) => p.id === pilot.id)).toBe(false);
  });

  it('pays wages every cycle and loses pilots it cannot pay', () => {
    const sim = docked();
    const owned = crewed(sim, 'mule');
    const wage = owned.pilot!.wage;
    const away = elsewhere(sim);
    away.world.credits = wage + 10;
    away.run(CYCLE + 1);
    expect(away.world.credits).toBe(10);
    expect(owned.earned).toBe(-wage);
    away.run(CYCLE + 1);
    expect(owned.pilot).toBeNull();
    expect(away.fleet.log.some((n) => n.kind === 'quit')).toBe(true);
  });

  it('caps the payroll', () => {
    const sim = docked();
    let hired = 0;
    for (let round = 0; round < 6 && hired < CREW_RULES.maxPilots; round++) {
      for (const p of sim.crewOffers()) if (sim.hirePilot(p.id).ok) hired++;
      // New faces on the board.
      sim.fleet.offersTick = sim.world.tick;
      sim.step();
    }
    expect(hired).toBe(CREW_RULES.maxPilots);
    const next = sim.crewOffers()[0];
    expect(sim.hirePilot(next.id)).toEqual({ ok: false, reason: 'tooMany' });
  });
});

describe('orders', () => {
  it('checks the ship can do the job', () => {
    const sim = docked();
    const mule = crewed(sim, 'mule');
    expect(sim.setOrder(mule.id, { kind: 'mine', site: 'nowhere' })).toEqual({ ok: false, reason: 'invalid' });
    expect(sim.setOrder(mule.id, { kind: 'trade', from: 'outpost_alpha_station', to: 'outpost_alpha_station', resource: 'iron_ore' })).toEqual({ ok: false, reason: 'invalid' });
    expect(sim.setOrder(mule.id, { kind: 'trade', from: 'outpost_alpha_station', to: 'ferrum_refinery', resource: 'platinum_ore' })).toEqual({ ok: false, reason: 'invalid' });
    const bare = sim.buyShip('kestrel');
    expect(sim.setOrder(bare.ok ? bare.id : -1, { kind: 'wingman' })).toEqual({ ok: false, reason: 'noPilot' });
  });

  it('trades off-screen: buys at one station, sells at the other, and the profit lands in the account', () => {
    const sim = docked();
    const mule = crewed(sim, 'mule');
    const order: FleetOrder = { kind: 'trade', from: 'ferrum_refinery', to: 'outpost_alpha_station', resource: 'machine_parts' };
    expect(sim.setOrder(mule.id, order)).toEqual({ ok: true });
    // Parts run short at the outpost, so the run pays.
    sim.economy!.markets.outpost_alpha_station.find((m) => m.resource === 'machine_parts')!.stock = 5;
    // Keep the NPC haulers docked: a competing delivery would move the price under us.
    for (const trader of sim.economy!.traders) trader.departTick = 1e9;
    const away = elsewhere(sim);
    away.run(60 * 60 * 12);
    const kinds = away.fleet.log.map((n) => n.kind);
    expect(kinds).toContain('bought');
    expect(kinds).toContain('sold');
    const sales = away.fleet.log.filter((n) => n.kind === 'sold');
    expect(sales.every((n) => n.station === 'outpost_alpha_station' && n.resource === 'machine_parts')).toBe(true);
    // The first load sells for more than it cost (wages aside); later ones may still be on the way.
    const oldest = [...away.fleet.log].reverse();
    const bought = oldest.find((n) => n.kind === 'bought')!;
    const sold = oldest.find((n) => n.kind === 'sold' && n.tick > bought.tick)!;
    expect(sold.credits!).toBeGreaterThan(bought.credits!);
  });

  it('waits rather than trade at a loss', () => {
    const sim = docked();
    const mule = crewed(sim, 'mule');
    sim.economy!.markets.outpost_alpha_station.find((m) => m.resource === 'machine_parts')!.stock = 10_000;
    sim.setOrder(mule.id, { kind: 'trade', from: 'ferrum_refinery', to: 'outpost_alpha_station', resource: 'machine_parts' });
    const away = elsewhere(sim);
    away.run(60 * 60 * 3);
    expect(away.fleet.log.some((n) => n.kind === 'bought')).toBe(false);
    expect(away.fleet.log.some((n) => n.kind === 'idle')).toBe(true);
  });

  it('mines off-screen and sells the ore at the site\'s station', () => {
    const sim = docked();
    const miner = crewed(sim, 'prospector');
    expect(sim.setOrder(miner.id, { kind: 'mine', site: 'copper_reach' })).toEqual({ ok: true });
    const away = elsewhere(sim);
    const start = away.world.credits;
    away.run(60 * 60 * 15);
    const sales = away.fleet.log.filter((n) => n.kind === 'sold');
    expect(sales.length).toBeGreaterThan(0);
    expect(sales.every((n) => n.station === 'outpost_alpha_station')).toBe(true);
    expect(away.world.credits).toBeGreaterThan(start);
    expect(miner.earned).toBe(away.world.credits - start);
  });

  it('pays a fleet miner well in rich fields and modestly near home, never a hull an hour', () => {
    const hourly = (site: string) => {
      const sim = docked();
      const miner = crewed(sim, 'prospector');
      // An average pilot.
      Object.assign(miner.pilot!, { skills: { piloting: 3, mining: 3, combat: 3 }, wage: wageFor({ piloting: 3, mining: 3, combat: 3 }) });
      sim.setOrder(miner.id, { kind: 'mine', site });
      elsewhere(sim).run(60 * 60 * 60);
      return miner.earned;
    };
    const home = hourly('copper_reach');
    const belt = hourly('belt_mid');
    expect(home).toBeGreaterThan(1_000);
    expect(belt).toBeGreaterThan(home * 2);
    expect(belt).toBeLessThan(14_500);
  });

  it('flies for real in the player\'s sector and keeps its progress across the boundary', () => {
    const sim = docked();
    const mule = crewed(sim, 'mule');
    sim.setOrder(mule.id, { kind: 'trade', from: 'ferrum_refinery', to: 'outpost_alpha_station', resource: 'machine_parts' });
    sim.run(60);
    const real = [...fleetEntities(sim)];
    expect(real).toHaveLength(1);
    const [id] = real[0];
    expect(ship(sim, id).faction).toBe('player');
    const start = { ...body(sim, id).position };
    sim.run(600);
    // A new leg brings a new entity; either way the ship has moved on.
    const [now] = [...fleetEntities(sim).keys()];
    const where = now !== undefined ? body(sim, now).position : start;
    expect(mule.run!.leg > 0 || Math.hypot(where.x - start.x, where.y - start.y) > 100).toBe(true);
    expect(mule.run?.phase).toBe('travel');
    const leg = mule.run!.leg;
    const away = elsewhere(sim);
    away.run(60);
    expect(fleetEntities(away).size).toBe(0);
    expect(mule.run!.leg).toBeGreaterThanOrEqual(leg);
  });

  it('mines rocks for real when the player is at the site\'s sector', () => {
    const sim = docked();
    const miner = crewed(sim, 'prospector');
    sim.setOrder(miner.id, { kind: 'mine', site: 'copper_reach' });
    let mined = 0;
    for (let i = 0; i < 60 * 60 * 6 && mined === 0; i++) {
      sim.step();
      if (miner.run?.phase === 'work' && miner.run.shipId !== null && i % 60 === 0) {
        mined = [...ship(sim, miner.run.shipId).cargo.values()].reduce((a, b) => a + b, 0);
      }
    }
    expect(mined).toBeGreaterThan(0);
  });

  it('loses ships to pirates off-screen: the cargo is gone, the pilot ejects and waits at a station', () => {
    const saved = { ...EVENT_RULES.sectorRisk };
    const fleetRisk = CREW_RULES.fleetRisk;
    try {
      for (const k of Object.keys(EVENT_RULES.sectorRisk)) EVENT_RULES.sectorRisk[k] = 1;
      CREW_RULES.fleetRisk = 1;
      const sim = docked();
      const mule = crewed(sim, 'mule');
      const pilot = mule.pilot!;
      sim.setOrder(mule.id, { kind: 'trade', from: 'ferrum_refinery', to: 'outpost_alpha_station', resource: 'machine_parts' });
      const away = elsewhere(sim);
      away.run(60 * 60 * 4);
      expect(away.fleet.ships.includes(mule)).toBe(false);
      expect(away.fleet.crew.some((c) => c.pilot === pilot)).toBe(true);
      expect(away.fleet.log.some((n) => n.kind === 'lost')).toBe(true);
    } finally {
      Object.assign(EVENT_RULES.sectorRisk, saved);
      CREW_RULES.fleetRisk = fleetRisk;
    }
  });

  it('recalls a ship to the next station', () => {
    const sim = docked();
    const mule = crewed(sim, 'mule');
    sim.setOrder(mule.id, { kind: 'trade', from: 'ferrum_refinery', to: 'outpost_alpha_station', resource: 'machine_parts' });
    const away = elsewhere(sim);
    away.run(600);
    expect(away.setOrder(mule.id, null)).toEqual({ ok: true });
    away.run(60 * 60 * 6);
    expect(mule.run).toBeNull();
    expect(mule.station).toBe('ferrum_refinery');
  });
});

describe('wingmen', () => {
  function withWingman() {
    const sim = docked();
    sim.missions!.reputation.ferrum_combine = 0;
    const wing = crewed(sim, 'kestrel');
    expect(sim.setOrder(wing.id, { kind: 'wingman' })).toEqual({ ok: true });
    return { sim, wing };
  }

  it('launches with the player and holds formation', () => {
    const { sim, wing } = withWingman();
    sim.undock(sim.playerId);
    sim.run(2);
    expect(wing.run?.phase).toBe('escort');
    const [id] = [...fleetEntities(sim).keys()];
    sim.setCommand(sim.playerId, { thrust: 1 });
    sim.run(60 * 8);
    sim.setCommand(sim.playerId, {});
    sim.run(60 * 6);
    const me = body(sim, sim.playerId).position;
    const them = body(sim, id).position;
    expect(Math.hypot(me.x - them.x, me.y - them.y)).toBeLessThan(400);
  });

  it('follows through a gate and parks where the player docks', () => {
    const { sim, wing } = withWingman();
    sim.undock(sim.playerId);
    sim.run(5);
    const gate = [...sim.world.gates.keys()][0];
    const { sim: next } = jump(sim, gate, {}, new Set());
    next.run(3);
    expect(fleetEntities(next).size).toBe(1);
    expect(wing.run?.phase).toBe('escort');
    const station = [...next.world.stations.keys()][0];
    if (station !== undefined) {
      dockShip(next.world, next.playerId, station);
      next.run(2);
      expect(wing.run).toBeNull();
      expect(wing.station).toBe(next.world.stations.get(station)!.name);
      expect(fleetEntities(next).size).toBe(0);
    }
  });

  it('fights pirates near the player', () => {
    const { sim, wing } = withWingman();
    sim.undock(sim.playerId);
    sim.run(2);
    const [id] = [...fleetEntities(sim).keys()];
    const pirate = [...sim.world.ships].find(([, s]) => s.faction === 'pirate')![0];
    const pb = body(sim, pirate);
    pb.position = { x: body(sim, sim.playerId).position.x + 300, y: body(sim, sim.playerId).position.y };
    pb.previousPosition = { ...pb.position };
    sim.run(30);
    const target = sim.world.pilots.get(id)!.target;
    expect(target).not.toBeNull();
    expect(ship(sim, target!).faction).toBe('pirate');
    expect(wing.pilot).not.toBeNull();
  });
});

describe('fleet saves', () => {
  it('round-trips a fleet at work, and the same steps give the same fleet', () => {
    const sim = docked();
    const miner = crewed(sim, 'prospector');
    sim.setOrder(miner.id, { kind: 'mine', site: 'copper_reach' });
    sim.run(60 * 30);
    const data = serialize({ sim, memory: {}, discovered: new Set() });
    expect(data.version).toBe(SAVE_VERSION);
    const again = restore(JSON.parse(JSON.stringify(data)));
    expect(serialize(again)).toEqual(data);
    const a = restore(JSON.parse(JSON.stringify(data)));
    const b = restore(JSON.parse(JSON.stringify(data)));
    a.sim.run(60 * 60);
    b.sim.run(60 * 60);
    expect(serialize(a)).toEqual(serialize(b));
  });

  it('migrates a 0.5 save: every ship parked without a pilot', () => {
    const sim = docked();
    sim.buyShip('mule');
    const v6 = serialize({ sim, memory: {}, discovered: new Set() });
    const v5 = JSON.parse(JSON.stringify(v6));
    v5.version = 5;
    v5.fleet = { ships: v5.fleet.ships.map((s: OwnedShip) => ({ id: s.id, station: s.station, state: s.state })), nextId: v5.fleet.nextId, activeId: v5.fleet.activeId };
    const migrated = migrate(v5);
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.fleet!.ships[0]).toMatchObject({ pilot: null, order: null, run: null, earned: 0 });
    expect(migrated.fleet!.crew).toEqual([]);
    expect(() => restore(migrated)).not.toThrow();
  });
});
