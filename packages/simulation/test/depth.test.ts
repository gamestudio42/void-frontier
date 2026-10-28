import { describe, expect, it } from 'vitest';
import { OUTPOST_ALPHA, getSector, getShip, getUpgrade } from '@void-frontier/content';
import {
  SAVE_VERSION,
  Simulation,
  applyWeaponDamage,
  bayOf,
  damageSubsystems,
  dockShip,
  engineFactor,
  migrate,
  readTelemetry,
  serialize,
  spawnShip,
  spawnStation,
  type SimEvent,
} from '../src/index.ts';
import { body, ship } from './helpers.ts';

const kestrel = getShip('kestrel');

function lone() {
  const sim = new Simulation();
  const id = spawnShip(sim.world, kestrel);
  sim.playerId = id;
  return { sim, id };
}

/** A point on the hull, `along` from -1 (tail) to 1 (nose). Ship faces +X at the origin. */
const at = (along: number) => ({ x: (kestrel.hull.length / 2) * along, y: 0 });

describe('subsystem damage', () => {
  it('hits the engines from behind and cuts thrust', () => {
    const { sim, id } = lone();
    damageSubsystems(sim.world, id, at(-0.9), kestrel.hull.integrity * 0.2);
    expect(ship(sim, id).subsystems.engines).toBeCloseTo(0.2, 6);
    expect(ship(sim, id).subsystems.reactor).toBe(1);
    sim.setCommand(id, { thrust: 1 });
    sim.step();
    const accel = body(sim, id).velocity.x / sim.dt;
    expect(accel).toBeCloseTo((kestrel.movement.mainThrust * engineFactor(ship(sim, id))) / body(sim, id).mass, 3);
  });

  it('hits sensors or guns from the front', () => {
    const { sim, id } = lone();
    for (let i = 0; i < 10; i++) damageSubsystems(sim.world, id, at(0.9), kestrel.hull.integrity * 0.02);
    const s = ship(sim, id);
    const frontDamage = 1 - s.subsystems.sensors + s.weapons.reduce((sum, m) => sum + (1 - m.health), 0);
    expect(frontDamage).toBeCloseTo(0.8, 6);
    expect(s.subsystems.engines).toBe(1);
  });

  it('routes weapon hits through the hull to the system under them', () => {
    const { sim, id } = lone();
    const s = ship(sim, id);
    s.shield = 0;
    applyWeaponDamage(sim.world, id, 999, 200, { shield: 1, hull: 1 }, at(-0.8), false);
    expect(s.subsystems.engines).toBeLessThan(1);
  });

  it('silences a wrecked gun', () => {
    const { sim, id } = lone();
    ship(sim, id).weapons.forEach((m) => (m.health = 0));
    sim.setCommand(id, { firePrimary: true });
    sim.run(30);
    expect(sim.world.projectiles.size).toBe(0);
  });

  it('caps the shield and slows energy with damaged generator and reactor', () => {
    const { sim, id } = lone();
    const s = ship(sim, id);
    s.subsystems.shieldGenerator = 0.5;
    s.subsystems.reactor = 0.25;
    s.energy = 0;
    sim.step();
    expect(s.shield).toBeCloseTo(kestrel.shield.capacity * 0.5, 6);
    expect(s.energy).toBeCloseTo(kestrel.reactor.rechargeRate * 0.25 * sim.dt, 9);
  });

  it('cannot scan with wrecked sensors', () => {
    const { sim, id } = lone();
    ship(sim, id).subsystems.sensors = 0.1;
    expect(sim.scan(id)).toBe(false);
  });

  it('leaks cargo from a breached hold', () => {
    const { sim, id } = lone();
    const s = ship(sim, id);
    s.cargo.set('iron_ore', 40);
    s.subsystems.cargoHold = 0;
    sim.run(60 * 20);
    expect(s.cargo.get('iron_ore') ?? 0).toBeLessThan(40);
    expect(sim.world.pickups.size).toBeGreaterThan(0);
  });

  it('reports a system dropping to damaged and to offline', () => {
    const { sim, id } = lone();
    damageSubsystems(sim.world, id, at(-0.9), kestrel.hull.integrity * 0.15);
    damageSubsystems(sim.world, id, at(-0.9), kestrel.hull.integrity * 0.15);
    const events = sim.drainEvents().filter((e): e is Extract<SimEvent, { type: 'subsystemDamaged' }> => e.type === 'subsystemDamaged');
    expect(events.map((e) => e.health === 0)).toEqual([false, true]);
  });

  it('is fixed by station repairs and by repair drones in flight', () => {
    const sim = new Simulation();
    const station = spawnStation(sim.world, 'outpost', 'test', { x: 0, y: 0 }, 0);
    const bay = bayOf(sim.world, station)!;
    const id = spawnShip(sim.world, kestrel, { position: bay.centre, angle: bay.dockAngle });
    sim.world.credits = 10_000;
    dockShip(sim.world, id, station);
    ship(sim, id).subsystems.engines = 0.2;
    sim.service(id, 'repair');
    expect(ship(sim, id).subsystems.engines).toBeCloseTo(1, 9);

    const flying = lone();
    flying.sim.world.standing = {};
    const s = ship(flying.sim, flying.id);
    s.upgrades.push('repair_drones');
    s.subsystems.reactor = 0.5;
    s.lastDamageTick = -10_000;
    flying.sim.run(60 * 10);
    expect(s.subsystems.reactor).toBeGreaterThan(0.6);
  });
});

describe('factions', () => {
  it('raises lawful standing for every pirate destroyed', () => {
    const sim = Simulation.fromSector(OUTPOST_ALPHA);
    const pirate = spawnShip(sim.world, getShip('jackal'), { position: { x: 3000, y: 3000 }, faction: 'pirate' });
    ship(sim, pirate).shield = 0;
    applyWeaponDamage(sim.world, pirate, sim.playerId, 100_000, { shield: 1, hull: 1 }, { x: 3000, y: 3000 }, false);
    expect(sim.missions!.reputation.outpost_authority).toBe(1);
    expect(sim.missions!.reputation.ferrum_combine).toBe(0.5);
    expect(sim.missions!.reputation.free_pirates).toBe(-100);
  });

  it('refuses docking to pilots the faction distrusts', () => {
    const sim = Simulation.fromSector(OUTPOST_ALPHA);
    sim.undock(sim.playerId);
    const bay = bayOf(sim.world, [...sim.world.stations.keys()][0])!;
    const b = body(sim, sim.playerId);
    b.position = { ...bay.centre };
    b.velocity = { x: 0, y: 0 };
    b.angle = bay.dockAngle;
    for (const id of [...sim.world.pilots.keys()]) sim.world.destroyEntity(id);
    sim.missions!.reputation.outpost_authority = -30;
    expect(sim.requestDock(sim.playerId)).toEqual({ ok: false, refusals: ['reputation'] });
    sim.missions!.reputation.outpost_authority = 0;
    expect(sim.requestDock(sim.playerId)).toEqual({ ok: true });
  });

  it('credits contract reputation to the issuing faction', () => {
    const sim = Simulation.fromSector(getSector('industrial_belt'), undefined, { startDocked: true });
    const offers = sim.missions!.offers.ferrum_refinery;
    expect(offers.every((o) => o.faction === 'ferrum_combine')).toBe(true);
    sim.acceptContract(offers[0].id);
    sim.abandonContract(sim.missions!.active[0].id);
    expect(sim.missions!.reputation.ferrum_combine).toBeLessThan(0);
    expect(sim.missions!.reputation.outpost_authority).toBe(0);
  });
});

describe('outfitting', () => {
  function atRefinery(credits: number) {
    const sim = Simulation.fromSector(getSector('industrial_belt'), undefined, { startDocked: true });
    sim.world.credits = credits;
    return sim;
  }

  it('limits modules to the ship\'s slots', () => {
    const sim = atRefinery(20_000);
    const id = sim.playerId;
    expect(sim.buyUpgrade(id, 'engine_tuning')).toEqual({ ok: true });
    expect(sim.buyUpgrade(id, 'afterburner')).toEqual({ ok: false, reason: 'noSlot' });
    expect(sim.buyUpgrade(id, 'cargo_frame')).toEqual({ ok: true });
    expect(sim.buyUpgrade(id, 'tractor_mk2')).toEqual({ ok: true });
    expect(sim.buyUpgrade(id, 'repair_drones')).toEqual({ ok: false, reason: 'noSlot' });
  });

  it('sells only faction equipment to trusted pilots', () => {
    const sim = atRefinery(20_000);
    expect(sim.buyUpgrade(sim.playerId, 'combat_computer')).toEqual({ ok: false, reason: 'reputation' });
    sim.missions!.reputation.ferrum_combine = 25;
    expect(sim.buyUpgrade(sim.playerId, 'combat_computer')).toEqual({ ok: true });
  });

  it('refunds half a module\'s price when it is removed', () => {
    const sim = atRefinery(5000);
    sim.buyUpgrade(sim.playerId, 'tractor_mk2');
    const credits = sim.world.credits;
    expect(sim.sellUpgrade(sim.playerId, 'tractor_mk2')).toBe(true);
    expect(sim.world.credits).toBe(credits + getUpgrade('tractor_mk2').cost / 2);
    expect(ship(sim, sim.playerId).definition.tractor.range).toBe(kestrel.tractor.range);
  });

  it('applies new module effects', () => {
    const sim = atRefinery(20_000);
    const id = sim.playerId;
    sim.buyUpgrade(id, 'afterburner');
    expect(ship(sim, id).definition.movement.boostMultiplier).toBeCloseTo(kestrel.movement.boostMultiplier + 0.5, 9);
    sim.buyUpgrade(id, 'tractor_mk2');
    expect(ship(sim, id).definition.tractor.range).toBe(kestrel.tractor.range * 2);
  });
});

describe('save version 3', () => {
  it('migrates a version 2 save: single reputation and no subsystems', () => {
    const sim = Simulation.fromSector(OUTPOST_ALPHA);
    sim.missions!.reputation.outpost_authority = 12;
    const v3 = serialize({ sim, memory: {}, discovered: new Set() });
    const { subsystems: _s, mounts: _m, ...player } = v3.player;
    const v2 = {
      ...v3,
      version: 2,
      player,
      missions: {
        ...v3.missions!,
        reputation: 12,
        offers: Object.fromEntries(Object.entries(v3.missions!.offers).map(([k, list]) => [k, list.map(({ faction: _f, ...c }) => c)])),
      },
    };
    const migrated = migrate(v2);
    expect(migrated.version).toBe(SAVE_VERSION);
    expect(migrated.missions!.reputation).toEqual({ outpost_authority: 12, ferrum_combine: 0, free_pirates: -100 });
    expect(migrated.player.subsystems.engines).toBe(1);
    expect(readTelemetry(sim.world, sim.playerId)!.subsystems.cargoHold).toBe(1);
  });
});
