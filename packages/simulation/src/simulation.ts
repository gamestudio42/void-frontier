import { getShip, type SectorDefinition } from '@void-frontier/content';
import { FIXED_DT, toRadians } from '@void-frontier/kernel';
import { spawnShip } from './ship.ts';
import { flightControlSystem } from './systems/flightControl.ts';
import { integrationSystem } from './systems/integration.ts';
import { massSystem } from './systems/mass.ts';
import { thrusterSystem } from './systems/thrusters.ts';
import { idleCommand, type EntityId, type FlightMode, type ShipCommand } from './types.ts';
import { World } from './world.ts';

/**
 * The authoritative game state and its fixed-step update. It has no DOM, no clock and
 * no renderer: the browser, tests and future tools all drive it the same way.
 */
export class Simulation {
  readonly world = new World();
  readonly dt: number;
  playerId: EntityId = 0;

  constructor(dt = FIXED_DT) {
    this.dt = dt;
  }

  static fromSector(sector: SectorDefinition, dt = FIXED_DT): Simulation {
    const sim = new Simulation(dt);
    // The sector heading is a compass bearing; the sim angle is counter-clockwise from +X.
    sim.playerId = spawnShip(sim.world, getShip(sector.playerShip), {
      position: { x: sector.playerStart.x, y: sector.playerStart.y },
      angle: toRadians(90 - sector.playerStart.heading),
    });
    for (const beacon of sector.beacons) {
      sim.world.beacons.set(sim.world.createEntity(), { name: beacon.id, position: { x: beacon.x, y: beacon.y } });
    }
    return sim;
  }

  /** Systems run in a fixed order; see docs/ARCHITECTURE.md. */
  step(): void {
    massSystem(this.world);
    flightControlSystem(this.world, this.dt);
    thrusterSystem(this.world, this.dt);
    integrationSystem(this.world, this.dt);
    this.world.tick++;
  }

  run(steps: number): void {
    for (let i = 0; i < steps; i++) this.step();
  }

  setCommand(id: EntityId, command: Partial<ShipCommand>): void {
    const ship = this.world.ships.get(id);
    if (!ship) return;
    ship.command = { ...idleCommand(), ...command };
  }

  setFlightMode(id: EntityId, mode: FlightMode): void {
    const ship = this.world.ships.get(id);
    if (ship) ship.mode = mode;
  }

  /** Development hook until mining and trading exist: load test cargo to feel the mass change. */
  setCargoMass(id: EntityId, kg: number): void {
    const ship = this.world.ships.get(id);
    if (ship) ship.cargoMass = Math.max(0, Math.min(kg, ship.definition.cargo.maxMass));
  }

  get time(): number {
    return this.world.tick * this.dt;
  }
}
