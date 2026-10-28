import { describe, expect, it } from 'vitest';
import { OUTPOST_ALPHA } from '@void-frontier/content';
import { SAVE_VERSION, Simulation, decodeSave, encodeSave, extractOre, migrate, restore, serialize } from '../src/index.ts';
import { ship } from './helpers.ts';

function played(): Simulation {
  const sim = Simulation.fromSector(OUTPOST_ALPHA);
  const id = sim.playerId;
  sim.buyUpgrade(id, 'cargo_frame'); // 800 cr is not enough: stays uninstalled
  sim.world.credits = 5000;
  sim.buyUpgrade(id, 'engine_tuning');
  sim.acceptContract(sim.missions!.offers[0].id);
  sim.trade(id, 'iron_ore', 5, 'buy');
  sim.undock(id);
  sim.setCommand(id, { thrust: 1, turn: 0.3 });
  sim.run(240);
  // Mine a rock partly and one completely.
  const rocks = [...sim.world.asteroids.keys()];
  extractOre(sim.world, rocks[0], 10, sim.world.bodies.get(rocks[0])!.position);
  const small = rocks.find((r) => sim.world.asteroids.get(r)!.baseRadius < 6)!;
  extractOre(sim.world, small, 1e6, sim.world.bodies.get(small)!.position);
  sim.run(30);
  return sim;
}

describe('saves', () => {
  it('round-trips the player, economy, rocks and contracts exactly', () => {
    const sim = played();
    const data = serialize(sim, OUTPOST_ALPHA);
    const loaded = restore(OUTPOST_ALPHA, data);
    expect(serialize(loaded, OUTPOST_ALPHA)).toEqual(data);
    expect(ship(loaded, loaded.playerId).upgrades).toEqual(['engine_tuning']);
    expect(loaded.world.asteroids.size).toBe(sim.world.asteroids.size);
  });

  it('restores a docked game docked', () => {
    const sim = Simulation.fromSector(OUTPOST_ALPHA);
    const loaded = restore(OUTPOST_ALPHA, serialize(sim, OUTPOST_ALPHA));
    expect(ship(loaded, loaded.playerId).docked).not.toBeNull();
  });

  it('keeps flying the same way after a load', () => {
    const sim = played();
    const loaded = restore(OUTPOST_ALPHA, serialize(sim, OUTPOST_ALPHA));
    for (const s of [sim, loaded]) {
      s.setCommand(s.playerId, { thrust: 1 });
      s.run(120);
    }
    const a = sim.world.bodies.get(sim.playerId)!;
    const b = loaded.world.bodies.get(loaded.playerId)!;
    expect(b.position.x).toBeCloseTo(a.position.x, 6);
    expect(b.position.y).toBeCloseTo(a.position.y, 6);
  });

  it('detects a damaged file and rejects saves from the future', () => {
    const file = encodeSave(serialize(played(), OUTPOST_ALPHA));
    expect(decodeSave(file).version).toBe(SAVE_VERSION);
    expect(() => decodeSave({ ...file, payload: file.payload.replace('"credits":', '"credits":1') })).toThrow(/damaged/);
    expect(() => migrate({ version: SAVE_VERSION + 1 })).toThrow(/newer/);
    expect(() => decodeSave({ hello: 'world' })).toThrow(/Not a Void Frontier save/);
  });
});
