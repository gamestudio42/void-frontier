import { describe, expect, it } from 'vitest';
import { OUTPOST_ALPHA } from '@void-frontier/content';
import { Simulation, hostilesNear } from '../src/index.ts';

const pirates = (sim: Simulation) => [...sim.world.ships.entries()].filter(([, s]) => s.faction === 'pirate' && !s.destroyed).map(([id]) => id);

describe('the first sortie', () => {
  it('holds the sector pirates away and brings them back after the release delay', () => {
    const sim = Simulation.fromSector(OUTPOST_ALPHA);
    expect(pirates(sim).length).toBeGreaterThan(0);
    sim.holdHostiles(true);
    expect(pirates(sim)).toEqual([]);
    sim.undock(sim.playerId);
    // A long quiet stretch: nothing comes back while held.
    sim.run(120 * 60);
    expect(pirates(sim)).toEqual([]);
    sim.holdHostiles(false, 10);
    sim.run(9 * 60);
    expect(pirates(sim)).toEqual([]);
    sim.run(2 * 60);
    expect(pirates(sim).length).toBeGreaterThan(0);
  });

  it('sends one sparring pirate ahead of the player, already hunting it', () => {
    const sim = Simulation.fromSector(OUTPOST_ALPHA);
    sim.holdHostiles(true);
    sim.undock(sim.playerId);
    const id = sim.spawnSparring('jackal', 700)!;
    expect(id).not.toBeNull();
    expect(sim.world.pilots.get(id)!.target).toBe(sim.playerId);
    expect(hostilesNear(sim.world, sim.playerId, 800)).toContain(id);
    // The hold is for the sector's groups, not for the lesson.
    sim.run(60);
    expect(sim.world.ships.get(id)!.destroyed).toBe(false);
  });

  it('is deterministic', () => {
    const run = () => {
      const sim = Simulation.fromSector(OUTPOST_ALPHA);
      sim.holdHostiles(true);
      sim.undock(sim.playerId);
      const id = sim.spawnSparring('jackal', 700)!;
      sim.run(600);
      return sim.world.bodies.get(id)!.position;
    };
    expect(run()).toEqual(run());
  });
});
