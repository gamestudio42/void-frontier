import { COLLISION_RULES, getShip, type CollisionRules, type SectorDefinition } from '@void-frontier/content';
import { FIXED_DT, Rng, toRadians } from '@void-frontier/kernel';
import { spawnShip } from './ship.ts';
import { aiSystem, encounterSystem, spawnEncounter } from './ai.ts';
import { projectileSystem, weaponSystem } from './combat.ts';
import { jettison, pickupSystem, scan, scanExpirySystem } from './mining.ts';
import { abandonContract, acceptContract, createBoard, handInContract, missionSystem, type MissionBoard } from './missions.ts';
import { buyUpgrade, dockShip, marketSystem, requestDock, service, trade, undock } from './station.ts';
import { collisionSystem } from './systems/collision.ts';
import { flightControlSystem } from './systems/flightControl.ts';
import { integrationSystem } from './systems/integration.ts';
import { massSystem } from './systems/mass.ts';
import { thrusterSystem } from './systems/thrusters.ts';
import { idleCommand, type EntityId, type FlightMode, type ShipCommand, type SimEvent } from './types.ts';
import { generateAsteroidField, spawnStation } from './universe.ts';
import { World } from './world.ts';

/**
 * The authoritative game state and its fixed-step update. It has no DOM, no clock and
 * no renderer: the browser, tests and future tools all drive it the same way.
 */
export class Simulation {
  readonly world = new World();
  readonly dt: number;
  playerId: EntityId = 0;

  rules: CollisionRules = COLLISION_RULES;
  /** Contract board for the player; null in bare test worlds. */
  missions: MissionBoard | null = null;

  constructor(dt = FIXED_DT) {
    this.dt = dt;
  }

  static fromSector(sector: SectorDefinition, dt = FIXED_DT): Simulation {
    const sim = new Simulation(dt);
    const rng = new Rng(sector.seed);
    const occupied = sector.clearZones.map((zone) => ({ ...zone }));
    for (const station of sector.stations) {
      const id = spawnStation(sim.world, station.definition, station.id, { x: station.x, y: station.y }, toRadians(station.angle));
      occupied.push({ x: station.x, y: station.y, radius: sim.world.colliders.get(id)!.bound });
    }
    for (const field of sector.asteroidFields) generateAsteroidField(sim.world, field, rng, occupied);
    sim.world.rng = new Rng(sector.seed ^ 0x5bd1e995);
    for (const encounter of sector.encounters) {
      sim.world.encounters.push({ definition: encounter, members: spawnEncounter(sim.world, encounter), respawnAt: null });
    }
    // The sector heading is a compass bearing; the sim angle is counter-clockwise from +X.
    sim.playerId = spawnShip(sim.world, getShip(sector.playerShip), {
      position: { x: sector.playerStart.x, y: sector.playerStart.y },
      angle: toRadians(90 - sector.playerStart.heading),
    });
    for (const beacon of sector.beacons) {
      sim.world.beacons.set(sim.world.createEntity(), { name: beacon.id, position: { x: beacon.x, y: beacon.y } });
    }
    sim.world.credits = sector.startingCredits;
    sim.missions = createBoard(sector, sim.world);
    if (sector.startDocked) {
      const first = [...sim.world.stations.keys()][0];
      if (first !== undefined) dockShip(sim.world, sim.playerId, first);
      sim.drainEvents();
    }
    return sim;
  }

  /** Systems run in a fixed order; see docs/ARCHITECTURE.md. */
  step(): void {
    massSystem(this.world);
    aiSystem(this.world);
    flightControlSystem(this.world, this.dt);
    thrusterSystem(this.world, this.dt);
    integrationSystem(this.world, this.dt);
    collisionSystem(this.world, this.rules);
    weaponSystem(this.world, this.dt);
    projectileSystem(this.world, this.dt);
    pickupSystem(this.world, this.dt);
    scanExpirySystem(this.world);
    encounterSystem(this.world, this.dt);
    marketSystem(this.world, this.dt);
    if (this.missions) missionSystem(this.world, this.missions, this.playerId, this.dt);
    this.world.tick++;
  }

  /** Events since the last drain, oldest first. */
  drainEvents(): SimEvent[] {
    return this.world.events.splice(0, this.world.events.length);
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

  requestDock(id: EntityId) {
    return requestDock(this.world, id);
  }

  undock(id: EntityId): boolean {
    return undock(this.world, id);
  }

  trade(id: EntityId, resource: string, units: number, side: 'buy' | 'sell') {
    return trade(this.world, id, resource, units, side);
  }

  service(id: EntityId, kind: 'repair' | 'refuel'): number {
    return service(this.world, id, kind);
  }

  buyUpgrade(id: EntityId, upgrade: string) {
    return buyUpgrade(this.world, id, upgrade);
  }

  acceptContract(offerId: number) {
    return this.missions ? acceptContract(this.world, this.missions, this.playerId, offerId) : ({ ok: false, reason: 'unknown' } as const);
  }

  handInContract(contractId: number) {
    return this.missions ? handInContract(this.world, this.missions, this.playerId, contractId) : ({ ok: false, reason: 'unknown' } as const);
  }

  abandonContract(contractId: number): boolean {
    return this.missions ? abandonContract(this.world, this.missions, contractId) : false;
  }

  /** Scanner pulse for a ship; false while it recharges. */
  scan(id: EntityId): boolean {
    return scan(this.world, id, this.dt);
  }

  /** Dump a ship's hold into space; returns units dropped. */
  jettison(id: EntityId): number {
    return jettison(this.world, id, this.dt);
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
