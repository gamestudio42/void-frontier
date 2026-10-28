import { describe, expect, it } from 'vitest';
import { OUTPOST_ALPHA } from '@void-frontier/content';
import { SAVE_VERSION, Simulation, decodeSave, encodeSave, extractOre, migrate, restore, serialize, type GameState } from '../src/index.ts';
import { ship } from './helpers.ts';

function played(): GameState {
  const sim = Simulation.fromSector(OUTPOST_ALPHA);
  const id = sim.playerId;
  sim.world.credits = 5000;
  sim.buyUpgrade(id, 'engine_tuning');
  sim.acceptContract(sim.missions!.offers.outpost_alpha_station[0].id);
  sim.trade(id, 'iron_ore', 5, 'buy');
  sim.undock(id);
  sim.setCommand(id, { thrust: 1, turn: 0.3 });
  sim.run(240);
  const rocks = [...sim.world.asteroids.keys()];
  extractOre(sim.world, rocks[0], 10, sim.world.bodies.get(rocks[0])!.position);
  const small = rocks.find((r) => sim.world.asteroids.get(r)!.baseRadius < 6)!;
  extractOre(sim.world, small, 1e6, sim.world.bodies.get(small)!.position);
  sim.run(30);
  return { sim, memory: {}, discovered: new Set(['alpha_wreck']) };
}

describe('saves', () => {
  it('round-trips the player, economy, rocks, contracts and discoveries exactly', () => {
    const state = played();
    const data = serialize(state);
    const loaded = restore(data);
    expect(serialize(loaded)).toEqual(data);
    expect(ship(loaded.sim, loaded.sim.playerId).upgrades).toEqual(['engine_tuning']);
    expect(loaded.sim.world.asteroids.size).toBe(state.sim.world.asteroids.size);
    expect(loaded.sim.world.pointsOfInterest.get('alpha_wreck')!.found).toBe(true);
  });

  it('restores a docked game docked', () => {
    const sim = Simulation.fromSector(OUTPOST_ALPHA);
    const loaded = restore(serialize({ sim, memory: {}, discovered: new Set() }));
    expect(ship(loaded.sim, loaded.sim.playerId).docked).not.toBeNull();
  });

  it('keeps flying the same way after a load', () => {
    const state = played();
    const loaded = restore(serialize(state));
    for (const s of [state.sim, loaded.sim]) {
      s.setCommand(s.playerId, { thrust: 1 });
      s.run(120);
    }
    const a = state.sim.world.bodies.get(state.sim.playerId)!;
    const b = loaded.sim.world.bodies.get(loaded.sim.playerId)!;
    expect(b.position.x).toBeCloseTo(a.position.x, 6);
    expect(b.position.y).toBeCloseTo(a.position.y, 6);
  });

  it('detects a damaged file and rejects saves from the future', () => {
    const file = encodeSave(serialize(played()));
    expect(decodeSave(file).version).toBe(SAVE_VERSION);
    expect(() => decodeSave({ ...file, payload: file.payload.replace('"credits":', '"credits":1') })).toThrow(/damaged/);
    expect(() => migrate({ version: SAVE_VERSION + 1 })).toThrow(/newer/);
    expect(() => decodeSave({ hello: 'world' })).toThrow(/Not a Void Frontier save/);
  });

  it('migrates a version 1 save from the single-sector game through every step', () => {
    const state = played();
    const v2 = serialize(state);
    const v1 = {
      version: 1,
      sector: 'outpost_alpha',
      seed: OUTPOST_ALPHA.seed,
      tick: v2.tick,
      credits: v2.credits,
      rng: v2.sectors.outpost_alpha.rng,
      player: (({ subsystems: _s, mounts: _m, ...p }) => p)(v2.player),
      asteroids: v2.sectors.outpost_alpha.asteroids,
      markets: v2.sectors.outpost_alpha.markets,
      pickups: v2.sectors.outpost_alpha.pickups,
      missions: {
        offers: v2.missions!.offers.outpost_alpha_station.map(({ issuer: _issuer, faction: _faction, ...c }) => c),
        active: v2.missions!.active.map(({ issuer: _issuer, faction: _faction, ...c }) => ({ ...c, ...(c.delivery ? { delivery: { drop: c.delivery.drop, units: c.delivery.units } } : {}) })),
        history: v2.missions!.history,
        reputation: v2.missions!.reputation.outpost_authority,
        nextId: v2.missions!.nextId,
        refreshTick: v2.missions!.refreshTick,
      },
    };
    const migrated = migrate(v1);
    expect(migrated.version).toBe(SAVE_VERSION);
    const loaded = restore(migrated);
    expect(loaded.sim.world.credits).toBe(state.sim.world.credits);
    expect(loaded.sim.missions!.active.length).toBe(state.sim.missions!.active.length);
    expect(loaded.sim.world.asteroids.size).toBe(state.sim.world.asteroids.size);
  });
});
