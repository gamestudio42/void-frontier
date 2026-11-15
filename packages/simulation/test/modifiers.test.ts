import { describe, expect, it } from 'vitest';
import { CONTRACT_RULES, OUTPOST_ALPHA } from '@void-frontier/content';
import { Simulation, applyModifier, installUpgrades, loyaltyBonus, payout, type Contract, type SimEvent } from '../src/index.ts';

const HOME = 'outpost_alpha_station';
const mods = CONTRACT_RULES.modifiers;

/** Outpost Alpha, docked, with a drop delivery on the board turned into a `modifier` job. */
function job(modifier: Contract['modifier'] | null) {
  const sim = Simulation.fromSector(OUTPOST_ALPHA);
  const board = sim.missions!;
  let offer: Contract | undefined;
  for (let i = 0; i < 400 && !offer; i++) {
    offer = board.offers[HOME].find((o) => o.delivery?.drop && !o.modifier && !o.client);
    if (!offer) {
      board.offers[HOME].shift();
      board.refreshTick = 0;
      sim.step();
    }
  }
  if (!offer) throw new Error('no plain drop delivery');
  const base = offer.reward;
  if (modifier) applyModifier(board.rules, offer, modifier);
  expect(sim.acceptContract(offer.id)).toEqual({ ok: true });
  sim.undock(sim.playerId);
  // Clear of the bay and the rocks: open space east of the station, at rest.
  const body = sim.world.bodies.get(sim.playerId)!;
  body.position = { x: 3000, y: 3000 };
  body.previousPosition = { ...body.position };
  body.velocity = { x: 0, y: 0 };
  sim.holdHostiles(true, 1e6);
  const contract = board.active.find((c) => c.id === offer!.id)!;
  return { sim, board, contract, base, id: sim.playerId };
}

function run(sim: Simulation, seconds: number, each?: (events: SimEvent[]) => void) {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    sim.step();
    each?.(sim.drainEvents());
  }
}

const crates = (sim: Simulation) => sim.world.ships.get(sim.playerId)!.cargo.get(CONTRACT_RULES.delivery.cargo) ?? 0;

describe('contract modifiers', () => {
  it('each modifier raises the pay, and a rush cuts the time', () => {
    const plain = job(null);
    const rush = job('rush');
    expect(rush.contract.reward).toBe(Math.round(rush.base * mods.rush.reward));
    expect(rush.contract.duration).toBeLessThan(plain.contract.duration);
    const fragile = job('fragile');
    expect(fragile.contract.reward).toBe(Math.round(fragile.base * mods.fragile.reward));
  });

  it('cargo conditions only go on jobs that carry cargo', () => {
    const bounty: Contract = { id: 1, kind: 'bounty', issuer: HOME, faction: 'outpost_authority', reward: 100, repGain: 1, duration: 100, deadlineTick: 0, elite: false, bounty: { count: 1, killsAtStart: 0 } };
    expect(applyModifier(CONTRACT_RULES, bounty, 'fragile')).toBe(false);
    expect(bounty.modifier).toBeUndefined();
    expect(applyModifier(CONTRACT_RULES, bounty, 'rush')).toBe(true);
  });

  it('fragile crates ride out the main engine but crack under boost and break on a dash', () => {
    const { sim, contract, id } = job('fragile');
    sim.setCommand(id, { thrust: 1 });
    run(sim, 3);
    expect(contract.cargo!.integrity).toBe(1);
    expect(contract.cargo!.g).toBeGreaterThan(1);
    expect(contract.cargo!.g).toBeLessThan(mods.fragile.maxG);

    sim.setCommand(id, { thrust: 1, boost: true });
    run(sim, 1);
    expect(contract.cargo!.integrity).toBeLessThan(1);
    expect(contract.cargo!.integrity).toBeGreaterThan(mods.fragile.failBelow);
    const before = payout(sim.missions!, contract);

    // An afterburner dash is a kick of tens of g: each one costs the most a step can.
    sim.setCommand(id, { thrust: 0, boost: false });
    installUpgrades(sim.world, id, ['afterburner']);
    const events: SimEvent[] = [];
    let dashes = 0;
    while (sim.missions!.active.includes(contract) && dashes < 5) {
      sim.world.ships.get(id)!.moduleReady = {};
      sim.useAbility(id, 'dash');
      dashes++;
      run(sim, 0.1, (e) => events.push(...e));
    }
    expect(dashes).toBeLessThanOrEqual(3);
    expect(events.some((e) => e.type === 'cargo' && e.state === 'shattered')).toBe(true);
    expect(events.find((e) => e.type === 'contract')).toMatchObject({ outcome: 'failed' });
    expect(crates(sim)).toBe(0);
    expect(before).toBeLessThan(contract.reward);
  });

  it('a gravity well alone does not crack fragile crates', () => {
    const { sim, contract } = job('fragile');
    const body = sim.world.bodies.get(sim.playerId)!;
    sim.world.anomalies.push({ id: 'test', position: { x: body.position.x + 400, y: body.position.y }, radius: 2000, strength: 4e6, coreRadius: 100 });
    run(sim, 4);
    expect(contract.cargo!.integrity).toBe(1);
  });

  it('volatile cargo goes off on a hard impact and hurts the hull through the shield', () => {
    const { sim, contract, id } = job('volatile');
    const ship = sim.world.ships.get(id)!;
    const hull = ship.hull;
    const shield = ship.shield;
    // Bump a rock at 10 m/s: a scrape for the ship, enough to set the cargo off.
    const rock = [...sim.world.asteroids.keys()][0];
    const target = sim.world.bodies.get(rock)!.position;
    const body = sim.world.bodies.get(id)!;
    body.position = { x: target.x - 120, y: target.y };
    body.previousPosition = { ...body.position };
    body.velocity = { x: 10, y: 0 };
    const events: SimEvent[] = [];
    run(sim, 15, (e) => events.push(...e));
    expect(events.some((e) => e.type === 'cargo' && e.state === 'detonated')).toBe(true);
    expect(sim.missions!.active.includes(contract)).toBe(false);
    expect(ship.hull).toBeLessThan(hull - mods.volatile.blastDamage * 0.5);
    expect(ship.shield).toBeLessThanOrEqual(shield);
  });

  it('volatile cargo survives a gentle flight', () => {
    const { sim, contract, id } = job('volatile');
    sim.setCommand(id, { thrust: 0.5 });
    run(sim, 4);
    expect(sim.missions!.active.includes(contract)).toBe(true);
  });

  it('a no-brake job loses its bonus the moment the brake is used, and pays the base after', () => {
    const { sim, board, contract, id } = job('noBrake');
    const full = payout(board, contract);
    const events: SimEvent[] = [];
    sim.setCommand(id, { brake: true });
    run(sim, 0.2, (e) => events.push(...e));
    expect(contract.bonusLost).toBe(true);
    expect(events.filter((e) => e.type === 'cargo' && e.state === 'bonusLost')).toHaveLength(1);
    expect(payout(board, contract)).toBe(Math.round(full / mods.noBrake.reward));
    expect(board.active.includes(contract)).toBe(true);
  });
});

describe('named clients', () => {
  it('turn up on the boards of their own faction, for the kinds of job they give', () => {
    const sim = Simulation.fromSector(OUTPOST_ALPHA);
    const board = sim.missions!;
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      for (const o of board.offers[HOME]) {
        if (!o.client) continue;
        const client = CONTRACT_RULES.clients.find((c) => c.id === o.client)!;
        expect(client.faction).toBe(o.faction);
        expect(client.kinds).toContain(o.kind);
        if (client.modifier) expect(o.modifier).toBe(client.modifier);
        seen.add(o.client);
      }
      board.offers[HOME].shift();
      board.refreshTick = 0;
      sim.step();
    }
    const local = CONTRACT_RULES.clients.filter((c) => c.faction === 'outpost_authority').map((c) => c.id);
    expect([...seen].sort()).toEqual([...local].sort());
  });

  it('pay more for each job done for them, up to the cap, and less after a failure', () => {
    const sim = Simulation.fromSector(OUTPOST_ALPHA);
    const board = sim.missions!;
    const contract: Contract = { id: 99, kind: 'bounty', issuer: HOME, faction: 'outpost_authority', reward: 1000, repGain: 1, duration: 1000, deadlineTick: 1e9, elite: false, bounty: { count: 0, killsAtStart: 0 }, client: 'dr_maru' };
    const first = payout(board, contract);
    board.clients.dr_maru = 2;
    expect(loyaltyBonus(board, 'dr_maru')).toBeCloseTo(2 * CONTRACT_RULES.loyalty.bonusPerJob);
    expect(payout(board, contract)).toBeGreaterThan(first);
    board.clients.dr_maru = 50;
    expect(loyaltyBonus(board, 'dr_maru')).toBe(CONTRACT_RULES.loyalty.maxBonus);

    // Completing a job raises loyalty; abandoning one lowers it.
    board.clients.dr_maru = 1;
    board.active.push(contract);
    expect(sim.handInContract(contract.id)).toMatchObject({ ok: true });
    expect(board.clients.dr_maru).toBe(2);
    board.active.push({ ...contract, id: 100 });
    sim.abandonContract(100);
    expect(board.clients.dr_maru).toBe(1);
  });

  it('loyalty survives a save', async () => {
    const { serialize, restore } = await import('../src/index.ts');
    const sim = Simulation.fromSector(OUTPOST_ALPHA);
    sim.missions!.clients.halden_optics = 4;
    const back = restore(serialize({ sim, memory: {}, discovered: new Set() }));
    expect(back.sim.missions!.clients.halden_optics).toBe(4);
  });
});
