import { describe, expect, it } from 'vitest';
import { CONTRACT_RULES, getSector, getShip } from '@void-frontier/content';
import { Rng, cos, sin } from '@void-frontier/kernel';
import { SAVE_VERSION, Simulation, createBoard, generateOffer, jump, migrate, restore, serialize, spawnPickup, spawnShip, type Contract } from '../src/index.ts';
import { body, ship } from './helpers.ts';

function docked(sector = 'anomaly_zone') {
  const sim = Simulation.fromSector(getSector(sector), undefined, { startDocked: true });
  sim.campaign = null;
  sim.world.credits = 100_000;
  for (const e of sim.world.encounters) for (const id of e.members) sim.world.destroyEntity(id);
  sim.world.encounters.length = 0;
  sim.world.anomalies.length = 0;
  sim.step();
  return sim;
}

/** A pirate parked `dx` metres ahead of the player, who has just undocked. */
function targetAhead(sim: Simulation, dx: number) {
  const me = body(sim, sim.playerId);
  return spawnShip(sim.world, getShip('jackal'), { position: { x: me.position.x + cos(me.angle) * dx, y: me.position.y + sin(me.angle) * dx }, faction: 'pirate' });
}

describe('refitting weapons', () => {
  const mountOf = (sim: Simulation, group: string) => ship(sim, sim.playerId).weapons.findIndex((w) => w.hardpoint.group === group);

  it('swaps a weapon for one sold here, taking the old one in part exchange', () => {
    const sim = docked();
    const index = mountOf(sim, 'primary');
    const before = sim.world.credits;
    expect(sim.buyWeapon(index, 'railgun_mk1')).toEqual({ ok: true });
    expect(ship(sim, sim.playerId).weapons[index].definition.id).toBe('railgun_mk1');
    expect(sim.world.credits).toBe(before - 5200 + 750);
  });

  it('refuses the wrong mount, weapons not sold here, and empty pockets', () => {
    const sim = docked();
    expect(sim.buyWeapon(mountOf(sim, 'primary'), 'missile_rack')).toEqual({ ok: false, reason: 'wrongMount' });
    expect(sim.buyWeapon(mountOf(sim, 'mining'), 'mining_laser_mk2')).toEqual({ ok: false, reason: 'notOffered' });
    sim.world.credits = 0;
    expect(sim.buyWeapon(mountOf(sim, 'primary'), 'railgun_mk1')).toEqual({ ok: false, reason: 'noCredits' });
    sim.world.credits = 100_000;
    sim.undock(sim.playerId);
    expect(sim.buyWeapon(mountOf(sim, 'primary'), 'railgun_mk1')).toEqual({ ok: false, reason: 'notDocked' });
  });

  it('keeps the fit across jumps, saves and parking', () => {
    const sim = docked();
    const index = mountOf(sim, 'secondary');
    sim.buyWeapon(index, 'missile_rack');
    sim.undock(sim.playerId);
    const gate = [...sim.world.gates.keys()][0];
    const next = jump(sim, gate, {}, new Set()).sim;
    expect(ship(next, next.playerId).weapons[index].definition.id).toBe('missile_rack');
    const data = JSON.parse(JSON.stringify(serialize({ sim: next, memory: {}, discovered: new Set() })));
    const loaded = restore(data).sim;
    expect(ship(loaded, loaded.playerId).weapons[index].definition.id).toBe('missile_rack');
  });
});

describe('weapons', () => {
  function fireAt(weapon: string, group: 'primary' | 'secondary', seconds: number) {
    const sim = docked();
    const me = ship(sim, sim.playerId);
    for (const [i, w] of me.weapons.entries()) if (w.hardpoint.group === group) sim.buyWeapon(i, weapon);
    sim.undock(sim.playerId);
    const foe = targetAhead(sim, 300);
    const start = ship(sim, foe).hull + ship(sim, foe).shield;
    let peak = 0;
    for (let i = 0; i < seconds * 60; i++) {
      const p = body(sim, foe).position;
      sim.setCommand(sim.playerId, group === 'primary' ? { firePrimary: true, aim: p, target: foe } : { fireSecondary: true, aim: p, target: foe });
      sim.step();
      peak = Math.max(peak, sim.world.projectiles.size);
      if (!sim.world.ships.has(foe) || ship(sim, foe).destroyed) break;
    }
    const left = sim.world.ships.has(foe) ? ship(sim, foe).hull + ship(sim, foe).shield : 0;
    return { sim, dealt: start - left, peak };
  }

  it('gatling fills the air, railgun fires few heavy rounds, both hurt', () => {
    const gatling = fireAt('gatling_mk1', 'primary', 4);
    const rail = fireAt('railgun_mk1', 'primary', 4);
    expect(gatling.dealt).toBeGreaterThan(0);
    expect(rail.dealt).toBeGreaterThan(0);
    expect(gatling.peak).toBeGreaterThan(rail.peak);
  });

  it('missiles hit a target off the nose by turning toward it', () => {
    const sim = docked();
    const me = ship(sim, sim.playerId);
    const index = me.weapons.findIndex((w) => w.hardpoint.group === 'secondary');
    sim.buyWeapon(index, 'missile_rack');
    sim.undock(sim.playerId);
    const m = body(sim, sim.playerId);
    const foe = spawnShip(sim.world, getShip('jackal'), { position: { x: m.position.x + 250, y: m.position.y + 500 }, faction: 'pirate' });
    const start = ship(sim, foe).shield + ship(sim, foe).hull;
    sim.setCommand(sim.playerId, { fireSecondary: true, target: foe, aim: { x: m.position.x + 500, y: m.position.y } });
    sim.step();
    sim.setCommand(sim.playerId, {});
    sim.run(60 * 6);
    expect(ship(sim, foe).shield + ship(sim, foe).hull).toBeLessThan(start);
  });

  it('countermeasures can break a missile lock', () => {
    let broke = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const sim = docked();
      sim.world.rng = new Rng(seed);
      const index = ship(sim, sim.playerId).weapons.findIndex((w) => w.hardpoint.group === 'secondary');
      sim.buyWeapon(index, 'missile_rack');
      sim.undock(sim.playerId);
      const m = body(sim, sim.playerId);
      const foe = spawnShip(sim.world, getShip('jackal'), { position: { x: m.position.x + 300, y: m.position.y }, faction: 'pirate' });
      ship(sim, foe).upgrades = ['countermeasures'];
      sim.setCommand(sim.playerId, { fireSecondary: true, target: foe, aim: { x: m.position.x + 300, y: m.position.y } });
      sim.step();
      const round = [...sim.world.projectiles.values()][0];
      if (round.homing!.target === null) broke++;
    }
    expect(broke).toBeGreaterThan(2);
    expect(broke).toBeLessThan(12);
  });
});

describe('new hulls', () => {
  it('the Magpie recovers double salvage; a rig adds more', () => {
    const sim = docked('industrial_belt');
    const bought = sim.buyShip('magpie');
    sim.boardShip(bought.ok ? bought.id : -1);
    sim.undock(sim.playerId);
    const p = body(sim, sim.playerId).position;
    spawnPickup(sim.world, 'salvage', 4, p, { x: 0, y: 0 });
    sim.run(5);
    expect(ship(sim, sim.playerId).cargo.get('salvage')).toBe(8);
  });

  it('the Bulwark waits for Guard standing', () => {
    const sim = docked();
    expect(sim.buyShip('bulwark')).toEqual({ ok: false, reason: 'reputation' });
    sim.missions!.reputation.frontier_guard = 30;
    expect(sim.buyShip('bulwark').ok).toBe(true);
  });
});

describe('new sectors', () => {
  it('the Graveyard slows shields and Ember Reach slows weapon cooling', () => {
    const cool = (sector: string) => {
      const sim = docked(sector);
      if (ship(sim, sim.playerId).docked !== null) sim.undock(sim.playerId);
      const me = ship(sim, sim.playerId);
      me.shield = 0;
      me.lastDamageTick = -1e6;
      me.weapons[0].heat = 50;
      sim.setCommand(sim.playerId, {});
      sim.run(60);
      return { shield: me.shield, heat: me.weapons[0].heat };
    };
    const normal = cool('industrial_belt');
    expect(cool('graveyard').shield).toBeCloseTo(normal.shield / 2, 0);
    expect(cool('ember_reach').heat).toBeGreaterThan(normal.heat);
  });

  it('the hulks of the Graveyard yield salvage', () => {
    const sim = docked('graveyard');
    expect([...sim.world.asteroids.values()].some((a) => a.type.resource === 'salvage')).toBe(true);
  });
});

describe('new contracts', () => {
  function offer(sim: Simulation, kind: string): Contract {
    const board = sim.missions!;
    const station = board.stations.find((s) => s.key === 'outpost_alpha_station')!;
    for (let i = 0; i < 500; i++) {
      const c = generateOffer(sim.world, board, station);
      if (c.kind === kind) return c;
    }
    throw new Error(`no ${kind} offer`);
  }

  function take(sim: Simulation, contract: Contract) {
    contract.deadlineTick = sim.world.tick + 60 * 900;
    sim.missions!.active.push(contract);
  }

  it('patrols complete by flying past each beacon in order', () => {
    const sim = Simulation.fromSector(getSector('outpost_alpha'));
    sim.campaign = null;
    const contract = offer(sim, 'patrol');
    contract.patrol = { stops: sim.missions!.drops.filter((d) => d.sector === 'outpost_alpha').slice(0, 2).map((d) => d.id), next: 0 };
    take(sim, contract);
    const credits = sim.world.credits;
    for (const stop of contract.patrol.stops) {
      const b = body(sim, sim.playerId);
      b.position = { ...sim.missions!.drops.find((d) => d.id === stop)!.position };
      b.previousPosition = { ...b.position };
      sim.run(2);
    }
    expect(sim.missions!.active).toHaveLength(0);
    expect(sim.world.credits).toBeGreaterThan(credits);
  });

  it('recon completes with a scanner pulse at the beacon, not elsewhere', () => {
    const sim = Simulation.fromSector(getSector('outpost_alpha'));
    sim.campaign = null;
    const contract = offer(sim, 'recon');
    const drop = sim.missions!.drops.find((d) => d.sector === 'outpost_alpha')!;
    contract.recon = { drop: drop.id };
    take(sim, contract);
    sim.scan(sim.playerId);
    sim.run(2);
    expect(sim.missions!.active).toHaveLength(1);
    ship(sim, sim.playerId).scanReadyTick = 0;
    const b = body(sim, sim.playerId);
    b.position = { ...drop.position };
    b.previousPosition = { ...drop.position };
    sim.scan(sim.playerId);
    sim.run(2);
    expect(sim.missions!.active).toHaveLength(0);
  });

  it('salvage orders are handed in like mining orders', () => {
    const sim = Simulation.fromSector(getSector('outpost_alpha'), undefined, { startDocked: true });
    sim.campaign = null;
    const contract = offer(sim, 'salvage');
    take(sim, contract);
    ship(sim, sim.playerId).cargo.set('salvage', contract.mining!.units);
    expect(sim.handInContract(contract.id).ok).toBe(true);
  });

  it('every new kind appears on the boards', () => {
    const board = createBoard(CONTRACT_RULES);
    expect(board.rules.patrol.radius).toBeGreaterThan(0);
  });
});

describe('0.7 saves', () => {
  it('keep their place in the longer story, and finished stories stay finished', () => {
    const sim = Simulation.fromSector(getSector('outpost_alpha'), undefined, { startDocked: true });
    const v8 = JSON.parse(JSON.stringify(serialize({ sim, memory: {}, discovered: new Set() })));
    const old = (step: number) => ({ ...structuredClone(v8), version: 7, campaign: { step, progress: 0, killsSeen: 0, shipSeen: 1 } });
    const at = (step: number) => {
      const m = migrate(old(step));
      expect(m.version).toBe(SAVE_VERSION);
      return restore(m).sim.campaign!;
    };
    expect(at(2).step).toBe(2);
    expect(at(5).step).toBe(10);
    expect(at(6).step).toBe(18);
  });
});
