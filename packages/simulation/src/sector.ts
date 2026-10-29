import { atan2, type Vec2 } from '@void-frontier/kernel';
import { getSector, type SectorDefinition } from '@void-frontier/content';
import { resizeRock, spawnPickup } from './mining.ts';
import type { MissionBoard } from './missions.ts';
import { Simulation } from './simulation.ts';
import { dockShip, installUpgrades, undock } from './station.ts';
import type { FlightMode, SubsystemId } from './types.ts';

type Pair = [number, number];

/** What a sector remembers while the player is elsewhere. */
export interface SectorSnapshot {
  rng: [number, number, number, number];
  /** Surviving rocks: [id, x, y, vx, vy, angle, spin, ore, pendingOre]. Missing ids were mined out. */
  asteroids: number[][];
  /** Market stock per station, in sector order. */
  markets: number[][];
  pickups: { resource: string; units: number; position: Pair; velocity: Pair; life: number }[];
}

/** Everything that travels with the player between sectors. */
export interface PlayerState {
  ship: string;
  upgrades: string[];
  hull: number;
  shield: number;
  energy: number;
  fuel: number;
  cargo: [string, number][];
  kills: number;
  mode: FlightMode;
  /** Index of the station docked at in the current sector, or null in flight. */
  dockedAt: number | null;
  position: Pair;
  velocity: Pair;
  angle: number;
  angularVelocity: number;
  scanReadyTick: number;
  subsystems: Record<SubsystemId, number>;
  /** Weapon mount health, in hardpoint order. */
  mounts: number[];
}

export function captureSector(sim: Simulation): SectorSnapshot {
  const world = sim.world;
  return {
    rng: world.rng.getState(),
    asteroids: [...world.asteroids.entries()].map(([id, rock]) => {
      const b = world.bodies.get(id)!;
      return [id, b.position.x, b.position.y, b.velocity.x, b.velocity.y, b.angle, b.angularVelocity, rock.ore, rock.pendingOre];
    }),
    markets: [...world.stations.values()].map((s) => s.market.map((item) => item.stock)),
    pickups: [...world.pickups.values()].map((p) => ({
      resource: p.resource,
      units: p.units,
      position: [p.position.x, p.position.y],
      velocity: [p.velocity.x, p.velocity.y],
      life: p.life,
    })),
  };
}

export function applySectorSnapshot(sim: Simulation, snapshot: SectorSnapshot): void {
  const world = sim.world;
  world.rng.setState(snapshot.rng);
  const saved = new Map(snapshot.asteroids.map((row) => [row[0], row]));
  for (const rockId of [...world.asteroids.keys()]) {
    const row = saved.get(rockId);
    if (!row) {
      world.destroyEntity(rockId);
      continue;
    }
    const [, x, y, vx, vy, angle, spin, ore, pending] = row;
    const body = world.bodies.get(rockId)!;
    body.position = { x, y };
    body.previousPosition = { x, y };
    body.velocity = { x: vx, y: vy };
    body.angle = angle;
    body.previousAngle = angle;
    body.angularVelocity = spin;
    const rock = world.asteroids.get(rockId)!;
    rock.ore = ore;
    rock.pendingOre = pending;
    resizeRock(world, rockId);
  }
  for (const p of snapshot.pickups) {
    const id = spawnPickup(world, p.resource, p.units, { x: p.position[0], y: p.position[1] }, { x: p.velocity[0], y: p.velocity[1] });
    world.pickups.get(id)!.life = p.life;
  }
}

export function capturePlayer(sim: Simulation): PlayerState {
  const world = sim.world;
  const ship = world.ships.get(sim.playerId)!;
  const body = world.bodies.get(sim.playerId)!;
  const stationIds = [...world.stations.keys()];
  return {
    ship: ship.baseDefinition.id,
    upgrades: [...ship.upgrades],
    hull: ship.hull,
    shield: ship.shield,
    energy: ship.energy,
    fuel: ship.fuel,
    cargo: [...ship.cargo.entries()],
    kills: ship.kills,
    mode: ship.mode,
    dockedAt: ship.docked === null ? null : stationIds.indexOf(ship.docked),
    position: [body.position.x, body.position.y],
    velocity: [body.velocity.x, body.velocity.y],
    angle: body.angle,
    angularVelocity: body.angularVelocity,
    scanReadyTick: ship.scanReadyTick,
    subsystems: { ...ship.subsystems },
    mounts: ship.weapons.map((w) => w.health),
  };
}

/** Puts the player's ship state into a world; position applies unless `placeAt` overrides it. */
export function applyPlayer(sim: Simulation, player: PlayerState, placeAt?: { position: Vec2; velocity: Vec2; angle: number }): void {
  const world = sim.world;
  const id = sim.playerId;
  const ship = world.ships.get(id)!;
  if (ship.baseDefinition.id !== player.ship) throw new Error(`Unknown player ship: ${player.ship}`);
  installUpgrades(world, id, player.upgrades);
  Object.assign(ship, {
    hull: player.hull,
    shield: player.shield,
    energy: player.energy,
    fuel: player.fuel,
    cargo: new Map(player.cargo),
    kills: player.kills,
    mode: player.mode,
    scanReadyTick: player.scanReadyTick,
    subsystems: { ...player.subsystems },
  });
  ship.weapons.forEach((mount, i) => (mount.health = player.mounts[i] ?? 1));
  const stationIds = [...world.stations.keys()];
  if (!placeAt && player.dockedAt !== null && stationIds[player.dockedAt] !== undefined) {
    if (ship.docked !== stationIds[player.dockedAt]) {
      if (ship.docked !== null) undock(world, id);
      dockShip(world, id, stationIds[player.dockedAt]);
    }
    return;
  }
  if (ship.docked !== null) undock(world, id);
  const body = world.bodies.get(id)!;
  body.position = placeAt ? { ...placeAt.position } : { x: player.position[0], y: player.position[1] };
  body.previousPosition = { ...body.position };
  body.velocity = placeAt ? { ...placeAt.velocity } : { x: player.velocity[0], y: player.velocity[1] };
  body.angle = placeAt ? placeAt.angle : player.angle;
  body.previousAngle = body.angle;
  body.angularVelocity = placeAt ? 0 : player.angularVelocity;
}

/** Where a ship comes out of a gate: a little way in toward the sector centre, already moving. */
export function gateExit(sector: SectorDefinition, gateId: string): { position: Vec2; velocity: Vec2; angle: number } {
  const gate = sector.gates.find((g) => g.id === gateId);
  if (!gate) throw new Error(`Unknown gate ${gateId} in ${sector.id}`);
  const d = Math.sqrt(gate.x * gate.x + gate.y * gate.y) || 1;
  const dir = { x: -gate.x / d, y: -gate.y / d };
  return { position: { x: gate.x + dir.x * 120, y: gate.y + dir.y * 120 }, velocity: { x: dir.x * 15, y: dir.y * 15 }, angle: atan2(dir.y, dir.x) };
}

/**
 * Jump: builds the destination sector (restoring what it remembers), carries the player,
 * credits, contracts and clock across, and returns the snapshot of the sector left behind.
 */
export function jump(
  sim: Simulation,
  gateId: string,
  memory: Record<string, SectorSnapshot>,
  discovered: Set<string>,
): { sim: Simulation; left: SectorSnapshot } {
  const gate = sim.world.gates.get(gateId);
  if (!gate) throw new Error(`Unknown gate ${gateId}`);
  const left = captureSector(sim);
  const player = capturePlayer(sim);
  const destination = getSector(gate.to);
  const next = Simulation.fromSector(destination, sim.dt, {
    board: sim.missions ?? undefined,
    economy: sim.economy ?? undefined,
    fleet: sim.fleet,
    playerShip: player.ship,
    startDocked: false,
  });
  next.world.tick = sim.world.tick;
  next.world.credits = sim.world.credits;
  const snapshot = memory[destination.id];
  if (snapshot) applySectorSnapshot(next, snapshot);
  markDiscovered(next, discovered);
  applyPlayer(next, player, gateExit(destination, gate.toGate));
  next.world.events.length = 0;
  return { sim: next, left };
}

/** Points of interest already found stay found in every sector. */
export function markDiscovered(sim: Simulation, discovered: Set<string>): void {
  for (const [id, poi] of sim.world.pointsOfInterest) if (discovered.has(id)) poi.found = true;
}

export type { MissionBoard };

/** The gate to take first on the shortest route from one sector to another, or null when already there. */
export function nextGate(from: string, to: string): string | null {
  if (from === to) return null;
  const firstStep = new Map<string, string>();
  let frontier = [from];
  const seen = new Set([from]);
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const gate of getSector(id).gates) {
        if (seen.has(gate.to)) continue;
        seen.add(gate.to);
        firstStep.set(gate.to, id === from ? gate.id : firstStep.get(id)!);
        if (gate.to === to) return firstStep.get(gate.to)!;
        next.push(gate.to);
      }
    }
    frontier = next;
  }
  return null;
}
