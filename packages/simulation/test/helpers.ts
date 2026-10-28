import { getShip } from '@void-frontier/content';
import { Simulation, spawnShip, type SpawnShipOptions } from '../src/index.ts';

/** A lone kestrel facing +X at the origin. */
export function createTestSim(options: SpawnShipOptions = {}): { sim: Simulation; id: number } {
  const sim = new Simulation();
  const id = spawnShip(sim.world, getShip('kestrel'), options);
  sim.playerId = id;
  return { sim, id };
}

export const seconds = (sim: Simulation, s: number): void => sim.run(Math.round(s / sim.dt));
export const body = (sim: Simulation, id: number) => sim.world.bodies.get(id)!;
export const ship = (sim: Simulation, id: number) => sim.world.ships.get(id)!;
