import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EVENT_RULES, OUTPOST_ALPHA, getSector, getShip } from '@void-frontier/content';
import { Simulation, applyWeaponDamage, hostilesNear, jump, planRoute, spawnShip, unitPrice, type Economy, type TraderState } from '../src/index.ts';
import { body, ship } from './helpers.ts';

const savedRisk = { ...EVENT_RULES.sectorRisk };
beforeEach(() => {
  for (const k of Object.keys(EVENT_RULES.sectorRisk)) (EVENT_RULES.sectorRisk as Record<string, number>)[k] = 0;
});
afterEach(() => Object.assign(EVENT_RULES.sectorRisk, savedRisk));

const item = (economy: Economy, station: string, resource: string) => economy.markets[station].find((m) => m.resource === resource)!;
const trader = (sim: Simulation, route: string): TraderState => sim.economy!.traders.find((t) => t.route === route)!;

/** A world with nobody else around: pirates removed so haulers fly undisturbed. */
function quiet(sectorId: string) {
  const sim = Simulation.fromSector(getSector(sectorId));
  for (const id of [...sim.world.pilots.keys()]) sim.world.destroyEntity(id);
  sim.world.encounters.length = 0;
  sim.economy!.nextEventTick = 1e9;
  return sim;
}

describe('station economies', () => {
  it('produce and consume over time, wherever the player is', () => {
    const sim = quiet('anomaly_zone');
    const parts = item(sim.economy!, 'ferrum_refinery', 'machine_parts').stock;
    const iron = item(sim.economy!, 'ferrum_refinery', 'iron_ore').stock;
    for (const t of sim.economy!.traders) t.departTick = 1e9;
    sim.run(60 * 120);
    expect(item(sim.economy!, 'ferrum_refinery', 'machine_parts').stock).toBeGreaterThan(parts);
    expect(item(sim.economy!, 'ferrum_refinery', 'iron_ore').stock).toBeLessThan(iron);
  });

  it('shares one market between the sector you are in and the economy', () => {
    const sim = Simulation.fromSector(OUTPOST_ALPHA);
    const station = [...sim.world.stations.values()][0];
    expect(station.market).toBe(sim.economy!.markets.outpost_alpha_station);
  });
});

describe('haulers', () => {
  it('plan routes through the gate network', () => {
    const legs = planRoute('ferrum_refinery', 'outpost_alpha_station');
    expect([...new Set(legs.map((l) => l.sector))]).toEqual(['industrial_belt', 'outpost_alpha']);
    // No lane cuts through a station hull.
    for (const leg of legs) {
      const station = getSector(leg.sector).stations[0];
      const dx = leg.to.x - leg.from.x;
      const dy = leg.to.y - leg.from.y;
      const t = Math.max(0, Math.min(1, ((station.x - leg.from.x) * dx + (station.y - leg.from.y) * dy) / (dx * dx + dy * dy)));
      const cx = leg.from.x + dx * t - station.x;
      const cy = leg.from.y + dy * t - station.y;
      if (t > 0.05 && t < 0.95) expect(Math.hypot(cx, cy)).toBeGreaterThan(250);
    }
  });

  it('carry goods between stations off-screen and deliver them', () => {
    const sim = quiet('anomaly_zone');
    const t = trader(sim, 'ferrum_parts_run');
    t.departTick = sim.world.tick + 1;
    const before = item(sim.economy!, 'outpost_alpha_station', 'machine_parts').stock;
    sim.run(5);
    expect(t.phase).toBe('travel');
    expect(t.units).toBeGreaterThan(0);
    const carried = t.units;
    sim.run(60 * 200);
    expect(t.outbound).toBe(false);
    expect(item(sim.economy!, 'outpost_alpha_station', 'machine_parts').stock).toBeGreaterThan(before + carried * 0.5);
    expect(sim.economy!.news.some((n) => n.kind === 'traderArrived')).toBe(true);
  });

  it('fly as real ships in the sector you are in and reach their waypoint', () => {
    const sim = quiet('outpost_alpha');
    sim.undock(sim.playerId);
    const t = trader(sim, 'outpost_ore_run');
    t.departTick = sim.world.tick + 1;
    sim.run(3);
    expect(t.shipId).not.toBeNull();
    const hauler = ship(sim, t.shipId!);
    expect(hauler.faction).toBe('trader');
    expect(hauler.allegiance).toBe('outpost_authority');
    sim.run(60 * 90);
    expect(t.leg).toBeGreaterThan(1);
  });

  it('are lost when destroyed, dropping part of their cargo', () => {
    const sim = quiet('outpost_alpha');
    const t = trader(sim, 'outpost_ore_run');
    t.departTick = sim.world.tick + 1;
    sim.run(3);
    const hauler = t.shipId!;
    const pirate = spawnShip(sim.world, getShip('jackal'), { position: { x: 5000, y: 5000 }, faction: 'pirate' });
    ship(sim, hauler).shield = 0;
    applyWeaponDamage(sim.world, hauler, pirate, 1e6, { shield: 1, hull: 1 }, body(sim, hauler).position, false);
    sim.step();
    expect(t.phase).toBe('lost');
    expect([...sim.world.pickups.values()].some((p) => p.resource === 'iron_ore')).toBe(true);
    expect(sim.economy!.news[0].kind).toBe('traderLost');
  });

  it('are prey for pirates but not for the player', () => {
    const sim = quiet('outpost_alpha');
    const t = trader(sim, 'outpost_ore_run');
    t.departTick = sim.world.tick + 1;
    sim.run(3);
    const p = body(sim, t.shipId!).position;
    const pirate = spawnShip(sim.world, getShip('jackal'), { position: { x: p.x + 100, y: p.y }, faction: 'pirate' });
    expect(hostilesNear(sim.world, pirate, 500)).toContain(t.shipId);
    expect(hostilesNear(sim.world, sim.playerId, 5000)).not.toContain(t.shipId);
  });

  it('keep flying through a jump: the economy travels with the player', () => {
    const sim = quiet('outpost_alpha');
    sim.undock(sim.playerId);
    const gate = sim.world.gates.get('alpha_to_belt')!;
    body(sim, sim.playerId).position = { ...gate.position };
    const { sim: next } = jump(sim, 'alpha_to_belt', {}, new Set());
    expect(next.economy).toBe(sim.economy);
  });
});

describe('reputation and haulers', () => {
  it('drops when the player shoots a hauler and rises for saving one', () => {
    const sim = quiet('outpost_alpha');
    sim.undock(sim.playerId);
    const t = trader(sim, 'outpost_ore_run');
    t.departTick = sim.world.tick + 1;
    sim.run(3);
    const hauler = t.shipId!;
    ship(sim, hauler).shield = 0;
    applyWeaponDamage(sim.world, hauler, sim.playerId, 200, { shield: 1, hull: 1 }, body(sim, hauler).position, false);
    expect(sim.missions!.reputation.outpost_authority).toBeLessThan(0);

    const before = sim.missions!.reputation.outpost_authority;
    const p = body(sim, hauler).position;
    const pirate = spawnShip(sim.world, getShip('jackal'), { position: { x: p.x + 200, y: p.y }, faction: 'pirate' });
    ship(sim, hauler).lastDamageTick = sim.world.tick;
    ship(sim, pirate).shield = 0;
    applyWeaponDamage(sim.world, pirate, sim.playerId, 1e6, { shield: 1, hull: 1 }, body(sim, pirate).position, false);
    expect(sim.missions!.reputation.outpost_authority).toBeCloseTo(before + 1 + 3, 6);
  });
});

describe('events', () => {
  it('start and end on the clock, and move prices', () => {
    const sim = quiet('anomaly_zone');
    for (const t of sim.economy!.traders) t.departTick = 1e9;
    const economy = sim.economy!;
    economy.nextEventTick = sim.world.tick + 1;
    sim.run(60 * 2);
    expect(economy.events.length).toBe(1);
    expect(economy.news[0].kind).toBe('eventStarted');
    const active = economy.events[0];
    sim.world.tick = active.endsTick - 1;
    economy.nextEventTick = 1e12;
    sim.run(120);
    expect(economy.events.length).toBe(0);
  });

  it('a mining boom raises what the station pays', () => {
    const sim = quiet('anomaly_zone');
    const economy = sim.economy!;
    const platinum = item(economy, 'ferrum_refinery', 'platinum_ore');
    const before = unitPrice(platinum, 'sell');
    // Every other event already running: the next one to start must be the platinum rush.
    const maxActive = EVENT_RULES.maxActive;
    (EVENT_RULES as { maxActive: number }).maxActive = 99;
    economy.events.push(...EVENT_RULES.events.filter((e) => e.id !== 'platinum_rush').map((e) => ({ id: e.id, endsTick: 1e12, spawnedIn: [] })));
    economy.nextEventTick = sim.world.tick + 1;
    sim.run(60 * 2);
    (EVENT_RULES as { maxActive: number }).maxActive = maxActive;
    expect(economy.events.some((e) => e.id === 'platinum_rush')).toBe(true);
    expect(unitPrice(platinum, 'sell')).toBeGreaterThan(before);
  });
});

describe('escort contracts', () => {
  function withEscortOffer() {
    const sim = Simulation.fromSector(getSector('industrial_belt'), undefined, { startDocked: true });
    for (const id of [...sim.world.pilots.keys()]) sim.world.destroyEntity(id);
    sim.world.encounters.length = 0;
    sim.economy!.nextEventTick = 1e9;
    const t = trader(sim, 'ferrum_parts_run');
    t.departTick = sim.world.tick + 60 * 60;
    sim.run(65);
    const offer = sim.missions!.offers.ferrum_refinery.find((o) => o.kind === 'escort')!;
    return { sim, t, offer };
  }

  it('are posted before a hauler leaves and ride with it once accepted', () => {
    const { sim, t, offer } = withEscortOffer();
    expect(offer).toBeDefined();
    expect(sim.acceptContract(offer.id)).toEqual({ ok: true });
    expect(t.escort).toBe(offer.id);
  });

  it('fail if the hauler is lost', () => {
    const { sim, t, offer } = withEscortOffer();
    sim.acceptContract(offer.id);
    t.departTick = sim.world.tick + 1;
    sim.run(3);
    const hauler = t.shipId!;
    ship(sim, hauler).shield = 0;
    const pirate = spawnShip(sim.world, getShip('jackal'), { position: { x: 9000, y: 9000 }, faction: 'pirate' });
    applyWeaponDamage(sim.world, hauler, pirate, 1e6, { shield: 1, hull: 1 }, body(sim, hauler).position, false);
    sim.step();
    expect(sim.missions!.history[0]).toMatchObject({ id: offer.id, outcome: 'failed' });
  });
});
