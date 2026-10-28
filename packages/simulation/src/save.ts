import { CONTRACT_RULES, getShip, type SectorDefinition } from '@void-frontier/content';
import { resizeRock, spawnPickup } from './mining.ts';
import type { MissionBoard } from './missions.ts';
import { Simulation } from './simulation.ts';
import { dockShip, installUpgrades, undock } from './station.ts';
import type { FlightMode } from './types.ts';

/** Bump when the save shape changes, and add a migration below. */
export const SAVE_VERSION = 1;

type Vec = [number, number];

export interface SaveData {
  version: number;
  sector: string;
  seed: number;
  tick: number;
  credits: number;
  rng: [number, number, number, number];
  player: {
    ship: string;
    upgrades: string[];
    hull: number;
    shield: number;
    energy: number;
    fuel: number;
    cargo: [string, number][];
    kills: number;
    mode: FlightMode;
    /** Index of the station in the sector, or null in flight. */
    dockedAt: number | null;
    position: Vec;
    velocity: Vec;
    angle: number;
    angularVelocity: number;
    scanReadyTick: number;
  };
  /** Every surviving rock by entity id: [id, x, y, vx, vy, angle, spin, ore, pendingOre]. Missing ids were mined out. */
  asteroids: number[][];
  /** Market stock per station, in sector order. */
  markets: number[][];
  pickups: { resource: string; units: number; position: Vec; velocity: Vec; life: number }[];
  missions: Omit<MissionBoard, 'rules'> | null;
}

/** A consistent snapshot of everything a player would miss. Pirates and rounds in flight are not kept. */
export function serialize(sim: Simulation, sector: SectorDefinition): SaveData {
  const world = sim.world;
  const ship = world.ships.get(sim.playerId)!;
  const body = world.bodies.get(sim.playerId)!;
  const stationIds = [...world.stations.keys()];
  const missions = sim.missions ? (({ rules: _rules, ...rest }) => structuredClone(rest))(sim.missions) : null;
  return {
    version: SAVE_VERSION,
    sector: sector.id,
    seed: sector.seed,
    tick: world.tick,
    credits: world.credits,
    rng: world.rng.getState(),
    player: {
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
    },
    asteroids: [...world.asteroids.entries()].map(([id, rock]) => {
      const b = world.bodies.get(id)!;
      return [id, b.position.x, b.position.y, b.velocity.x, b.velocity.y, b.angle, b.angularVelocity, rock.ore, rock.pendingOre];
    }),
    markets: stationIds.map((id) => world.stations.get(id)!.market.map((item) => item.stock)),
    pickups: [...world.pickups.values()].map((p) => ({
      resource: p.resource,
      units: p.units,
      position: [p.position.x, p.position.y],
      velocity: [p.velocity.x, p.velocity.y],
      life: p.life,
    })),
    missions,
  };
}

/** Rebuilds the sector from its seed, then applies the saved state on top. */
export function restore(sector: SectorDefinition, data: SaveData): Simulation {
  if (data.sector !== sector.id || data.seed !== sector.seed) throw new Error('Save belongs to another sector');
  const sim = Simulation.fromSector(sector);
  const world = sim.world;
  world.tick = data.tick;
  world.credits = data.credits;
  world.rng.setState(data.rng);

  const id = sim.playerId;
  const ship = world.ships.get(id)!;
  if (ship.baseDefinition.id !== data.player.ship) throw new Error(`Unknown player ship in save: ${data.player.ship}`);
  getShip(data.player.ship);
  installUpgrades(world, id, data.player.upgrades);
  Object.assign(ship, {
    hull: data.player.hull,
    shield: data.player.shield,
    energy: data.player.energy,
    fuel: data.player.fuel,
    cargo: new Map(data.player.cargo),
    kills: data.player.kills,
    mode: data.player.mode,
    scanReadyTick: data.player.scanReadyTick,
  });
  const stationIds = [...world.stations.keys()];
  if (data.player.dockedAt === null) {
    if (ship.docked !== null) undock(world, id);
    const body = world.bodies.get(id)!;
    body.position = { x: data.player.position[0], y: data.player.position[1] };
    body.previousPosition = { ...body.position };
    body.velocity = { x: data.player.velocity[0], y: data.player.velocity[1] };
    body.angle = data.player.angle;
    body.previousAngle = body.angle;
    body.angularVelocity = data.player.angularVelocity;
  } else if (ship.docked !== stationIds[data.player.dockedAt]) {
    if (ship.docked !== null) undock(world, id);
    dockShip(world, id, stationIds[data.player.dockedAt]);
  }

  const saved = new Map(data.asteroids.map((row) => [row[0], row]));
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

  data.markets.forEach((stocks, index) => {
    const station = world.stations.get(stationIds[index]);
    station?.market.forEach((item, i) => {
      if (stocks[i] !== undefined) item.stock = stocks[i];
    });
  });
  for (const p of data.pickups) {
    const pickupId = spawnPickup(world, p.resource, p.units, { x: p.position[0], y: p.position[1] }, { x: p.velocity[0], y: p.velocity[1] });
    world.pickups.get(pickupId)!.life = p.life;
  }
  if (data.missions) sim.missions = { ...structuredClone(data.missions), rules: CONTRACT_RULES };
  world.events.length = 0;
  return sim;
}

/** Upgrades older saves step by step. Each entry turns version n into n + 1. */
const MIGRATIONS: Record<number, (data: Record<string, unknown>) => Record<string, unknown>> = {};

export function migrate(raw: unknown): SaveData {
  if (!raw || typeof raw !== 'object' || typeof (raw as { version?: unknown }).version !== 'number') throw new Error('Not a Void Frontier save');
  let data = raw as Record<string, unknown>;
  let version = data.version as number;
  if (version > SAVE_VERSION) throw new Error(`Save is from a newer version (${version})`);
  while (version < SAVE_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) throw new Error(`No migration from save version ${version}`);
    data = { ...step(data), version: version + 1 };
    version++;
  }
  return data as unknown as SaveData;
}

/** FNV-1a over the JSON text: catches truncated or hand-edited saves. */
export function checksum(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16).padStart(8, '0');
}

export interface SaveFile {
  format: 'void-frontier-save';
  checksum: string;
  payload: string;
}

export function encodeSave(data: SaveData): SaveFile {
  const payload = JSON.stringify(data);
  return { format: 'void-frontier-save', checksum: checksum(payload), payload };
}

/** Verifies integrity, then migrates. Throws with a readable reason on any problem. */
export function decodeSave(file: unknown): SaveData {
  const f = file as Partial<SaveFile>;
  if (!f || f.format !== 'void-frontier-save' || typeof f.payload !== 'string') throw new Error('Not a Void Frontier save');
  if (checksum(f.payload) !== f.checksum) throw new Error('Save is damaged (checksum mismatch)');
  return migrate(JSON.parse(f.payload));
}
