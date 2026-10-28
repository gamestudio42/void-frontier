import { describe, expect, it } from 'vitest';
import { CONTRACT_RULES, OUTPOST_ALPHA, getShip } from '@void-frontier/content';
import { Simulation, applyWeaponDamage, carryBoard, dockShip, contractProgress, payout, spawnShip, trade, type Contract } from '../src/index.ts';
import { body, ship } from './helpers.ts';

function sector() {
  const sim = Simulation.fromSector(OUTPOST_ALPHA);
  return { sim, board: sim.missions!, id: sim.playerId };
}

const HOME = 'outpost_alpha_station';
const local = (sim: Simulation) => sim.missions!.offers[HOME];

/** Puts a specific kind of offer on the home board (regenerating until one appears). */
function offerOf(sim: Simulation, kind: Contract['kind'], where: 'drop' | 'station' = 'drop'): Contract {
  const board = sim.missions!;
  for (let i = 0; i < 400; i++) {
    const found = local(sim).find((o) => o.kind === kind && (kind !== 'delivery' || (where === 'drop' ? !!o.delivery!.drop : !!o.delivery!.station)));
    if (found) return found;
    local(sim).shift();
    board.refreshTick = 0;
    sim.step();
  }
  throw new Error(`no ${kind} offer`);
}

describe('contract board', () => {
  it('opens with a full board of offers, the same for the same seed', () => {
    const a = sector();
    const b = sector();
    expect(a.board.offers[HOME]).toHaveLength(CONTRACT_RULES.offerSlots);
    expect(JSON.stringify(a.board.offers)).toBe(JSON.stringify(b.board.offers));
  });

  it('caps active contracts and only accepts while docked', () => {
    const { sim, board } = sector();
    for (let i = 0; i < CONTRACT_RULES.maxActive; i++) {
      const offer = offerOf(sim, i % 2 ? 'mining' : 'bounty');
      expect(sim.acceptContract(offer.id)).toEqual({ ok: true });
    }
    expect(sim.acceptContract(local(sim)[0].id)).toEqual({ ok: false, reason: 'tooMany' });
    sim.undock(sim.playerId);
    sim.abandonContract(board.active[0].id);
    expect(sim.acceptContract(local(sim)[0].id)).toEqual({ ok: false, reason: 'notDocked' });
  });
});

describe('delivery', () => {
  it('loads sealed crates, then pays when the ship stops at the drop point', () => {
    const { sim, board, id } = sector();
    let offer = offerOf(sim, 'delivery');
    for (let i = 0; i < 50 && board.drops.find((d) => d.id === offer.delivery!.drop)!.sector !== 'outpost_alpha'; i++) {
      local(sim).splice(local(sim).indexOf(offer), 1);
      offer = offerOf(sim, 'delivery');
    }
    expect(sim.acceptContract(offer.id)).toEqual({ ok: true });
    expect(ship(sim, id).cargo.get(CONTRACT_RULES.delivery.cargo)).toBe(offer.delivery!.units);
    const drop = board.drops.find((d) => d.id === offer.delivery!.drop)!;
    if (drop.sector !== 'outpost_alpha') return; // cross-sector drops are covered in sector tests
    sim.undock(id);
    const credits = sim.world.credits;

    // Racing through the drop zone does not count.
    body(sim, id).position = { x: drop.position.x - 20, y: drop.position.y };
    body(sim, id).velocity = { x: 40, y: 0 };
    sim.step();
    expect(board.active).toHaveLength(1);

    body(sim, id).position = { ...drop.position };
    body(sim, id).velocity = { x: 1, y: 0 };
    sim.step();
    expect(board.active).toHaveLength(0);
    expect(sim.world.credits).toBe(credits + payout({ ...board, reputation: 0 }, offer));
    expect(board.reputation).toBe(CONTRACT_RULES.delivery.repGain);
    expect(ship(sim, id).cargo.has(CONTRACT_RULES.delivery.cargo)).toBe(false);
  });

  it('cannot be sold at the station', () => {
    const { sim, id } = sector();
    sim.acceptContract(offerOf(sim, 'delivery').id);
    expect(trade(sim.world, id, CONTRACT_RULES.delivery.cargo, 1, 'sell')).toEqual({ ok: false, reason: 'notTraded' });
  });

  it('fails at the deadline and costs reputation', () => {
    const { sim, board } = sector();
    const offer = offerOf(sim, 'delivery');
    sim.acceptContract(offer.id);
    sim.world.tick = board.active[0].deadlineTick;
    sim.step();
    expect(board.active).toHaveLength(0);
    expect(board.history[0].outcome).toBe('failed');
    expect(board.reputation).toBe(-CONTRACT_RULES.penalty.failed);
  });
});

describe('mining contracts', () => {
  it('hands in ore from the hold for the reward', () => {
    const { sim, board, id } = sector();
    const offer = offerOf(sim, 'mining');
    sim.acceptContract(offer.id);
    const { resource, units } = offer.mining!;
    expect(sim.handInContract(offer.id)).toEqual({ ok: false, reason: 'incomplete' });
    ship(sim, id).cargo.set(resource, units + 5);
    expect(contractProgress(sim.world, board, id, board.active[0]).current).toBe(units);
    const credits = sim.world.credits;
    expect(sim.handInContract(offer.id).ok).toBe(true);
    expect(ship(sim, id).cargo.get(resource)).toBe(5);
    expect(sim.world.credits).toBeGreaterThan(credits);
  });
});

describe('bounties', () => {
  it('counts pirate kills made after accepting', () => {
    const { sim, board, id } = sector();
    ship(sim, id).kills = 4;
    const offer = offerOf(sim, 'bounty');
    sim.acceptContract(offer.id);
    sim.undock(id);
    for (let i = 0; i < offer.bounty!.count; i++) {
      const pirate = spawnShip(sim.world, getShip('jackal'), { position: { x: -3000 - i * 100, y: 3000 }, faction: 'pirate' });
      ship(sim, pirate).shield = 0;
      applyWeaponDamage(sim.world, pirate, id, 100_000, { shield: 1, hull: 1 }, { x: 0, y: 0 }, false);
    }
    expect(contractProgress(sim.world, board, id, board.active[0])).toEqual({ current: offer.bounty!.count, target: offer.bounty!.count });
    dockShip(sim.world, id, [...sim.world.stations.keys()][0]);
    expect(sim.handInContract(offer.id).ok).toBe(true);
  });
});

describe('reputation', () => {
  it('raises payouts and unlocks elite contracts', () => {
    const { sim, board } = sector();
    const offer = local(sim)[0];
    const base = payout(board, offer);
    board.reputation = 40;
    expect(payout(board, offer)).toBeGreaterThan(base);
    const elites = [];
    for (let i = 0; i < 60; i++) {
      local(sim).shift();
      board.refreshTick = 0;
      sim.step();
      elites.push(...local(sim).filter((o) => o.elite));
    }
    expect(elites.length).toBeGreaterThan(0);
  });

  it('drops when a contract is abandoned', () => {
    const { sim, board } = sector();
    const offer = offerOf(sim, 'mining');
    sim.acceptContract(offer.id);
    sim.abandonContract(offer.id);
    expect(board.reputation).toBe(-CONTRACT_RULES.penalty.abandoned);
    expect(board.history[0]).toMatchObject({ id: offer.id, outcome: 'abandoned' });
  });
});

describe('losing the ship', () => {
  it('fails deliveries but keeps other contracts, their time and their progress', () => {
    const { sim, board, id } = sector();
    sim.acceptContract(offerOf(sim, 'delivery').id);
    const bounty = offerOf(sim, 'bounty');
    sim.acceptContract(bounty.id);
    ship(sim, id).kills += 1;
    sim.run(600);
    const deadline = board.active.find((c) => c.id === bounty.id)!.deadlineTick;
    const next = carryBoard(board, ship(sim, id).kills);
    expect(next.active.map((c) => c.kind)).toEqual(['bounty']);
    expect(next.active[0].deadlineTick).toBe(deadline);
    const fresh = Simulation.fromSector(OUTPOST_ALPHA);
    fresh.missions = next;
    expect(contractProgress(fresh.world, next, fresh.playerId, next.active[0]).current).toBe(1);
    expect(next.reputation).toBe(-CONTRACT_RULES.penalty.failed);
  });
});
