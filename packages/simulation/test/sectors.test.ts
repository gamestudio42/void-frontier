import { describe, expect, it } from 'vitest';
import { CONTRACT_RULES, OUTPOST_ALPHA, getSector } from '@void-frontier/content';
import {
  Simulation,
  dockShip,
  extractOre,
  gateStatus,
  gravityAt,
  jump,
  sectorHops,
  type SectorSnapshot,
} from '../src/index.ts';
import { body, ship } from './helpers.ts';

function undocked() {
  const sim = Simulation.fromSector(OUTPOST_ALPHA);
  sim.undock(sim.playerId);
  return sim;
}

function flyTo(sim: Simulation, gateId: string) {
  const gate = sim.world.gates.get(gateId)!;
  const b = body(sim, sim.playerId);
  b.position = { ...gate.position };
  b.previousPosition = { ...gate.position };
  b.velocity = { x: 0, y: 0 };
}

describe('gates', () => {
  it('connects every sector', () => {
    expect(sectorHops('outpost_alpha', 'industrial_belt')).toBe(1);
    expect(sectorHops('outpost_alpha', 'pirate_territory')).toBe(2);
  });

  it('is ready to jump only inside the ring and slow', () => {
    const sim = undocked();
    flyTo(sim, 'alpha_to_belt');
    expect(gateStatus(sim.world, sim.playerId)!.ready).toBe(true);
    body(sim, sim.playerId).velocity = { x: 60, y: 0 };
    expect(gateStatus(sim.world, sim.playerId)!.ready).toBe(false);
  });

  it('carries the ship, cargo, credits, contracts and clock through a jump', () => {
    const sim = undocked();
    sim.world.credits = 1234;
    ship(sim, sim.playerId).cargo.set('iron_ore', 7);
    sim.run(100);
    flyTo(sim, 'alpha_to_belt');
    const { sim: next } = jump(sim, 'alpha_to_belt', {}, new Set());
    expect(next.world.sectorId).toBe('industrial_belt');
    expect(next.world.credits).toBe(1234);
    expect(next.world.tick).toBe(sim.world.tick);
    expect(ship(next, next.playerId).cargo.get('iron_ore')).toBe(7);
    expect(next.missions).toBe(sim.missions);
    const exit = getSector('industrial_belt').gates.find((g) => g.id === 'belt_to_alpha')!;
    const p = body(next, next.playerId).position;
    expect(Math.hypot(p.x - exit.x, p.y - exit.y)).toBeCloseTo(120, 6);
    expect(ship(next, next.playerId).docked).toBeNull();
  });

  it('remembers mined rocks when you come back', () => {
    const sim = undocked();
    const rock = [...sim.world.asteroids.entries()].find(([, a]) => a.radius > 15)![0];
    extractOre(sim.world, rock, 20, body(sim, rock).position);
    const ore = sim.world.asteroids.get(rock)!.ore;
    flyTo(sim, 'alpha_to_belt');
    const memory: Record<string, SectorSnapshot> = {};
    const away = jump(sim, 'alpha_to_belt', memory, new Set());
    memory.outpost_alpha = away.left;
    flyTo(away.sim, 'belt_to_alpha');
    const back = jump(away.sim, 'belt_to_alpha', memory, new Set());
    expect(back.sim.world.sectorId).toBe('outpost_alpha');
    expect(back.sim.world.asteroids.get(rock)!.ore).toBe(ore);
  });
});

describe('anomaly zone', () => {
  function inZone() {
    const sim = Simulation.fromSector(getSector('anomaly_zone'));
    return sim;
  }

  it('pulls ships toward the well, harder when closer', () => {
    const sim = inZone();
    expect(gravityAt(sim.world, { x: 300, y: 0 })).toBeGreaterThan(gravityAt(sim.world, { x: 800, y: 0 }));
    expect(gravityAt(sim.world, { x: 2000, y: 0 })).toBe(0);
    const b = body(sim, sim.playerId);
    b.position = { x: 500, y: 0 };
    b.previousPosition = { ...b.position };
    b.velocity = { x: 0, y: 0 };
    sim.run(60);
    expect(b.velocity.x).toBeLessThan(-1);
  });

  it('can be escaped with the main engine from the crystal ring', () => {
    const sim = inZone();
    const id = sim.playerId;
    const b = body(sim, id);
    b.position = { x: 350, y: 0 };
    b.previousPosition = { ...b.position };
    b.velocity = { x: 0, y: 0 };
    b.angle = 0;
    sim.world.asteroids.forEach((_, rockId) => sim.world.colliders.delete(rockId));
    sim.setCommand(id, { thrust: 1 });
    sim.run(60 * 10);
    expect(b.position.x).toBeGreaterThan(1000);
  });
});

describe('exploration', () => {
  it('pays for a derelict once, when you fly to it', () => {
    const sim = undocked();
    const poi = sim.world.pointsOfInterest.get('alpha_wreck')!;
    const credits = sim.world.credits;
    body(sim, sim.playerId).position = { x: poi.position.x + 40, y: poi.position.y };
    body(sim, sim.playerId).velocity = { x: 0, y: 0 };
    sim.step();
    const events = sim.drainEvents();
    expect(events.filter((e) => e.type === 'discovered')).toHaveLength(1);
    expect(sim.world.credits).toBe(credits + poi.reward.credits);
    expect(sim.world.pickups.size).toBeGreaterThan(0);
    sim.run(10);
    expect(sim.drainEvents().some((e) => e.type === 'discovered')).toBe(false);
  });

  it('finds a hidden deposit only with a scan in range', () => {
    const sim = Simulation.fromSector(getSector('industrial_belt'));
    const poi = sim.world.pointsOfInterest.get('belt_hidden_deposit')!;
    const b = body(sim, sim.playerId);
    b.position = { x: poi.position.x - 300, y: poi.position.y };
    b.velocity = { x: 0, y: 0 };
    sim.run(5);
    expect(poi.found).toBe(false);
    sim.scan(sim.playerId);
    sim.step();
    expect(poi.found).toBe(true);
  });
});

describe('pirate territory', () => {
  it('refuses docking at the pirate den', () => {
    const sim = Simulation.fromSector(getSector('pirate_territory'));
    const den = [...sim.world.stations.keys()][0];
    for (const id of [...sim.world.pilots.keys()]) sim.world.destroyEntity(id);
    const result = sim.requestDock(sim.playerId);
    expect(result.ok).toBe(false);
    dockShip(sim.world, sim.playerId, den);
    expect(sim.missions!.offers.black_harbour).toBeUndefined();
  });

  it('is guarded by a marauder', () => {
    const sim = Simulation.fromSector(getSector('pirate_territory'));
    expect([...sim.world.pilots.keys()].some((id) => ship(sim, id).definition.id === 'marauder')).toBe(true);
  });
});

describe('trade runs', () => {
  it('completes a station delivery by docking at the destination station', () => {
    const sim = Simulation.fromSector(OUTPOST_ALPHA);
    const board = sim.missions!;
    let offer = board.offers.outpost_alpha_station.find((o) => o.delivery?.station === 'ferrum_refinery');
    for (let i = 0; i < 400 && !offer; i++) {
      board.offers.outpost_alpha_station.shift();
      board.refreshTick = 0;
      sim.step();
      offer = board.offers.outpost_alpha_station.find((o) => o.delivery?.station === 'ferrum_refinery');
    }
    expect(offer).toBeDefined();
    sim.acceptContract(offer!.id);
    sim.undock(sim.playerId);
    flyTo(sim, 'alpha_to_belt');
    const { sim: belt } = jump(sim, 'alpha_to_belt', {}, new Set());
    const credits = belt.world.credits;
    dockShip(belt.world, belt.playerId, [...belt.world.stations.keys()][0]);
    belt.step();
    expect(board.active).toHaveLength(0);
    expect(belt.world.credits).toBeGreaterThan(credits);
    expect(ship(belt, belt.playerId).cargo.has(CONTRACT_RULES.delivery.cargo)).toBe(false);
  });

  it('pays more for ore at the refinery than at the outpost', () => {
    const alpha = Simulation.fromSector(OUTPOST_ALPHA);
    const belt = Simulation.fromSector(getSector('industrial_belt'));
    const price = (sim: Simulation) => {
      const station = [...sim.world.stations.values()][0];
      const item = station.market.find((m) => m.resource === 'iron_ore')!;
      return Math.sqrt(item.baseStock / item.stock);
    };
    expect(price(belt)).toBeGreaterThan(price(alpha));
  });
});
