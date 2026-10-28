import { describe, expect, it } from 'vitest';
import { OUTPOST_ALPHA, getResource, getShip, getUpgrade } from '@void-frontier/content';
import { Simulation, bayOf, dockShip, dockingStatus, installUpgrades, quote, readTelemetry, spawnShip, spawnStation, unitPrice } from '../src/index.ts';
import { body, ship } from './helpers.ts';

const kestrel = getShip('kestrel');

function atStation() {
  const sim = new Simulation();
  const station = spawnStation(sim.world, 'outpost', 'test', { x: 0, y: 0 }, 0);
  const bay = bayOf(sim.world, station)!;
  const id = spawnShip(sim.world, kestrel, { position: { ...bay.centre }, angle: bay.dockAngle });
  sim.playerId = id;
  return { sim, id, station, bay };
}

describe('docking', () => {
  it('docks a slow, aligned ship inside the bay', () => {
    const { sim, id, station } = atStation();
    expect(sim.requestDock(id)).toEqual({ ok: true });
    expect(ship(sim, id).docked).toBe(station);
    expect(sim.world.colliders.has(id)).toBe(false);
  });

  it('refuses a ship that is too far, too fast or misaligned, and says why', () => {
    const far = atStation();
    body(far.sim, far.id).position.x += 60;
    expect(far.sim.requestDock(far.id)).toEqual({ ok: false, refusals: ['tooFar'] });

    const fast = atStation();
    body(fast.sim, fast.id).velocity.x = -5;
    expect(fast.sim.requestDock(fast.id)).toEqual({ ok: false, refusals: ['tooFast'] });

    const crooked = atStation();
    body(crooked.sim, crooked.id).angle += 0.6;
    expect(crooked.sim.requestDock(crooked.id)).toEqual({ ok: false, refusals: ['misaligned'] });
  });

  it('refuses while a hostile is close', () => {
    const { sim, id, bay } = atStation();
    spawnShip(sim.world, getShip('jackal'), { position: { x: bay.mouth.x + 200, y: 0 }, faction: 'pirate' });
    expect(sim.requestDock(id)).toEqual({ ok: false, refusals: ['hostiles'] });
  });

  it('holds a docked ship still and safe, then releases it outside the mouth', () => {
    const { sim, id, bay } = atStation();
    sim.requestDock(id);
    sim.setCommand(id, { thrust: 1, firePrimary: true });
    sim.run(60);
    expect(body(sim, id).position).toEqual(bay.centre);
    expect(sim.world.projectiles.size).toBe(0);
    expect(sim.undock(id)).toBe(true);
    const b = body(sim, id);
    expect(b.position.x).toBeGreaterThan(bay.mouth.x);
    expect(Math.hypot(b.velocity.x, b.velocity.y)).toBe(0);
    expect(sim.world.colliders.has(id)).toBe(true);
    sim.run(30);
    expect(sim.drainEvents().some((e) => e.type === 'collision')).toBe(false);
  });

  it('reports distance, speed and alignment for the approach', () => {
    const { sim, id, bay } = atStation();
    body(sim, id).position = { x: bay.mouth.x + 100, y: 0 };
    body(sim, id).velocity = { x: -4, y: 0 };
    const status = dockingStatus(sim.world, id)!;
    expect(status.distance).toBeCloseTo(100 + 17, 6);
    expect(status.speed).toBeCloseTo(4, 9);
    expect(status.angleError).toBeCloseTo(0, 6);
    expect(status.refusals).toEqual(['tooFar', 'tooFast']);
  });

  it('starts the sector docked with starting credits', () => {
    const sim = Simulation.fromSector(OUTPOST_ALPHA);
    const t = readTelemetry(sim.world, sim.playerId)!;
    expect(t.docked).toBe(true);
    expect(t.credits).toBe(OUTPOST_ALPHA.startingCredits);
  });
});

describe('market', () => {
  function docked(credits = 5000) {
    const rig = atStation();
    dockShip(rig.sim.world, rig.id, rig.station);
    rig.sim.world.credits = credits;
    return rig;
  }

  it('sells ore for credits and empties the hold', () => {
    const { sim, id } = docked(0);
    ship(sim, id).cargo.set('copper_ore', 20);
    const result = sim.trade(id, 'copper_ore', 20, 'sell');
    expect(result.ok).toBe(true);
    expect(sim.world.credits).toBeGreaterThan(20 * getResource('copper_ore').basePrice * 0.5);
    expect(ship(sim, id).cargo.has('copper_ore')).toBe(false);
  });

  it('pays less per unit as the station fills up, and charges more when stock is scarce', () => {
    const { sim, station } = docked();
    const item = sim.world.stations.get(station)!.market.find((m) => m.resource === 'iron_ore')!;
    const fresh = unitPrice(item, 'sell');
    item.stock = item.baseStock * 4;
    expect(unitPrice(item, 'sell')).toBeLessThan(fresh);
    item.stock = item.baseStock / 4;
    expect(unitPrice(item, 'buy')).toBeGreaterThan(unitPrice({ ...item, stock: item.baseStock }, 'buy'));
    expect(unitPrice(item, 'buy')).toBeGreaterThan(unitPrice(item, 'sell'));
  });

  it('prices a big sale unit by unit', () => {
    const { sim, station } = docked();
    const item = sim.world.stations.get(station)!.market.find((m) => m.resource === 'iron_ore')!;
    expect(quote(item, 'sell', 300)).toBeLessThan(unitPrice(item, 'sell') * 300);
  });

  it('buys only what credits, stock and the hold allow', () => {
    const { sim, id } = docked(1000);
    const result = sim.trade(id, 'machine_parts', 1000, 'buy');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.credits).toBeLessThanOrEqual(1000);
      expect(ship(sim, id).cargo.get('machine_parts')).toBe(result.units);
    }
    expect(sim.world.credits).toBeGreaterThanOrEqual(0);
    expect(sim.trade(id, 'titanium_ore', 1, 'buy')).toEqual({ ok: false, reason: 'notTraded' });
  });

  it('refuses to trade in flight or to sell what is not in the hold', () => {
    const { sim, id } = atStation();
    expect(sim.trade(id, 'iron_ore', 1, 'sell')).toEqual({ ok: false, reason: 'notDocked' });
    dockShip(sim.world, id, [...sim.world.stations.keys()][0]);
    expect(sim.trade(id, 'iron_ore', 1, 'sell')).toEqual({ ok: false, reason: 'nothingToSell' });
  });

  it('drifts stock back toward its base level over time', () => {
    const { sim, station } = docked();
    const item = sim.world.stations.get(station)!.market[0];
    item.stock = item.baseStock * 3;
    sim.run(60 * 120);
    expect(item.stock).toBeLessThan(item.baseStock * 3);
    expect(item.stock).toBeGreaterThan(item.baseStock);
  });
});

describe('services and upgrades', () => {
  function docked(credits: number) {
    const rig = atStation();
    dockShip(rig.sim.world, rig.id, rig.station);
    rig.sim.world.credits = credits;
    return rig;
  }

  it('repairs and refuels for credits, as far as money goes', () => {
    const { sim, id } = docked(150);
    const s = ship(sim, id);
    s.hull = kestrel.hull.integrity - 200;
    s.fuel = 100;
    const spent = sim.service(id, 'repair');
    expect(spent).toBeLessThanOrEqual(150);
    expect(s.hull).toBeGreaterThan(kestrel.hull.integrity - 200);
    expect(s.hull).toBeLessThan(kestrel.hull.integrity);
    sim.world.credits = 10_000;
    sim.service(id, 'refuel');
    expect(s.fuel).toBeCloseTo(kestrel.fuel.capacity, 6);
  });

  it('installs an upgrade once, charges for it and changes the ship', () => {
    const { sim, id } = docked(5000);
    const before = readTelemetry(sim.world, id)!;
    expect(sim.buyUpgrade(id, 'cargo_frame')).toEqual({ ok: true });
    expect(sim.world.credits).toBe(5000 - getUpgrade('cargo_frame').cost);
    expect(ship(sim, id).definition.cargo.maxMass).toBe(kestrel.cargo.maxMass + 3000);
    expect(readTelemetry(sim.world, id)!.mass).toBeGreaterThan(before.mass);
    expect(sim.buyUpgrade(id, 'cargo_frame')).toEqual({ ok: false, reason: 'installed' });
    expect(kestrel.cargo.maxMass).toBe(6000);
  });

  it('makes engine tuning measurably faster', () => {
    const { sim, id } = docked(5000);
    const before = readTelemetry(sim.world, id)!.mainAcceleration;
    sim.buyUpgrade(id, 'engine_tuning');
    expect(readTelemetry(sim.world, id)!.mainAcceleration).toBeGreaterThan(before * 1.1);
  });

  it('refuses an upgrade the player cannot afford', () => {
    const { sim, id } = docked(100);
    expect(sim.buyUpgrade(id, 'reinforced_hull')).toEqual({ ok: false, reason: 'noCredits' });
  });

  it('refits insured upgrades for free on a new ship', () => {
    const { sim, id } = docked(0);
    installUpgrades(sim.world, id, ['reinforced_hull']);
    expect(ship(sim, id).hull).toBe(kestrel.hull.integrity + 400);
    expect(sim.world.credits).toBe(0);
  });

  it('closes the loop: mine, dock, sell, upgrade', () => {
    const { sim, id } = docked(OUTPOST_ALPHA.startingCredits);
    ship(sim, id).cargo.set('titanium_ore', 50);
    sim.trade(id, 'titanium_ore', 50, 'sell');
    expect(sim.buyUpgrade(id, 'cargo_frame')).toEqual({ ok: true });
  });
});
