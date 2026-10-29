import { getSector, getStation, STATION_PLACEMENTS, type ShipDefinition } from '@void-frontier/content';
import { atan2, cos, sin, toRadians, type Vec2 } from '@void-frontier/kernel';
import { gateExit, nextGate } from './sector.ts';
import { spawnShip } from './ship.ts';
import { stationCollider } from './universe.ts';
import type { EntityId, Faction } from './types.ts';
import type { World } from './world.ts';

/** One stretch of a route, inside a single sector. */
export interface Leg {
  sector: string;
  from: Vec2;
  to: Vec2;
}

/** Where a ship leaves or reaches a station: 40 m out from the bay mouth, plus the bay's outward axis. */
export function bayApproach(stationKey: string): { sector: string; point: Vec2; axis: Vec2 } {
  const placement = STATION_PLACEMENTS.get(stationKey)!;
  const dock = getStation(placement.definition).modules.find((m) => m.kind === 'dock');
  const angle = toRadians(placement.angle);
  if (!dock || dock.kind !== 'dock') return { sector: placement.sector, point: { x: placement.x, y: placement.y }, axis: { x: 1, y: 0 } };
  const ca = cos(angle);
  const sa = sin(angle);
  const mouth = { x: placement.x + dock.x * ca - dock.y * sa, y: placement.y + dock.x * sa + dock.y * ca };
  const axis = { x: cos(angle + dock.angle), y: sin(angle + dock.angle) };
  return { sector: placement.sector, point: { x: mouth.x + axis.x * 40, y: mouth.y + axis.y * 40 }, axis };
}

/** Station hulls in a sector, as circles a lane must clear. */
function stationDiscs(sectorId: string): { centre: Vec2; radius: number }[] {
  return getSector(sectorId).stations.map((s) => ({ centre: { x: s.x, y: s.y }, radius: stationCollider(getStation(s.definition)).bound + 120 }));
}

/** Straight path from a to b, bent around any station hull in the way. */
function lane(sectorId: string, a: Vec2, b: Vec2): Vec2[] {
  for (const disc of stationDiscs(sectorId)) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((disc.centre.x - a.x) * dx + (disc.centre.y - a.y) * dy) / len2));
    const closest = { x: a.x + dx * t, y: a.y + dy * t };
    if (t <= 0.02 || t >= 0.98 || distance(closest, disc.centre) >= disc.radius) continue;
    // Go round on the side the line already leans toward.
    let nx = closest.x - disc.centre.x;
    let ny = closest.y - disc.centre.y;
    const n = Math.sqrt(nx * nx + ny * ny);
    if (n < 1) {
      nx = -dy;
      ny = dx;
    }
    const norm = Math.sqrt(nx * nx + ny * ny) || 1;
    const detour = { x: disc.centre.x + (nx / norm) * (disc.radius + 60), y: disc.centre.y + (ny / norm) * (disc.radius + 60) };
    return [...lane(sectorId, a, detour), ...lane(sectorId, detour, b).slice(1)];
  }
  return [a, b];
}

/** The legs from one station to another through the gate network, routed around station hulls. */
export function planRoute(fromKey: string, toKey: string): Leg[] {
  const start = bayApproach(fromKey);
  const end = bayApproach(toKey);
  const legs: Leg[] = [];
  const push = (sector: string, points: Vec2[]) => {
    for (let i = 0; i + 1 < points.length; i++) legs.push({ sector, from: points[i], to: points[i + 1] });
  };
  // Back straight out of the bay before turning.
  const out = (p: { point: Vec2; axis: Vec2 }) => ({ x: p.point.x + p.axis.x * 200, y: p.point.y + p.axis.y * 200 });
  let sector = start.sector;
  let position = out(start);
  push(sector, [start.point, position]);
  for (let hops = 0; sector !== end.sector && hops < 10; hops++) {
    const gateId = nextGate(sector, end.sector)!;
    const gate = getSector(sector).gates.find((g) => g.id === gateId)!;
    push(sector, lane(sector, position, { x: gate.x, y: gate.y }));
    position = gateExit(getSector(gate.to), gate.toGate).position;
    sector = gate.to;
  }
  push(sector, [...lane(sector, position, out(end)), end.point]);
  return legs;
}

/** A point anywhere in the universe. */
export interface Place {
  sector: string;
  point: Vec2;
}

/** The legs from a station to a point in space (a mining site), leaving the bay straight. */
export function planToPoint(fromKey: string, to: Place): Leg[] {
  const start = bayApproach(fromKey);
  const legs: Leg[] = [];
  const out = { x: start.point.x + start.axis.x * 200, y: start.point.y + start.axis.y * 200 };
  legs.push({ sector: start.sector, from: start.point, to: out });
  legs.push(...throughGates({ sector: start.sector, point: out }, to));
  return legs;
}

/** The legs from a point in space back to a station's bay. */
export function planFromPoint(from: Place, toKey: string): Leg[] {
  const end = bayApproach(toKey);
  const out = { x: end.point.x + end.axis.x * 200, y: end.point.y + end.axis.y * 200 };
  const legs = throughGates(from, { sector: end.sector, point: out });
  legs.push({ sector: end.sector, from: out, to: end.point });
  return legs;
}

function throughGates(from: Place, to: Place): Leg[] {
  const legs: Leg[] = [];
  const push = (sector: string, points: Vec2[]) => {
    for (let i = 0; i + 1 < points.length; i++) legs.push({ sector, from: points[i], to: points[i + 1] });
  };
  let sector = from.sector;
  let position = from.point;
  for (let hops = 0; sector !== to.sector && hops < 10; hops++) {
    const gateId = nextGate(sector, to.sector)!;
    const gate = getSector(sector).gates.find((g) => g.id === gateId)!;
    push(sector, lane(sector, position, { x: gate.x, y: gate.y }));
    position = gateExit(getSector(gate.to), gate.toGate).position;
    sector = gate.to;
  }
  push(sector, lane(sector, position, to.point));
  return legs;
}

export const distance = (a: Vec2, b: Vec2) => Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));

/** Progress along a route: which leg, when it started and how long it takes at cruising speed. */
export interface RouteRun {
  legs: Leg[];
  leg: number;
  legStartTick: number;
  legTicks: number;
}

/** Starts the run's current leg at a cruising speed (m/s). */
export function startLeg(world: World, run: RouteRun, speed: number): void {
  const leg = run.legs[run.leg];
  run.legStartTick = world.tick;
  run.legTicks = Math.max(60, Math.round((distance(leg.from, leg.to) / speed) * 60));
}

/** Spawns a ship partway along the run's current leg (as far as the clock says), flying it. */
export function spawnOnLeg(world: World, run: RouteRun, ship: ShipDefinition, speed: number, faction: Faction, allegiance: string | null = null): EntityId {
  const leg = run.legs[run.leg];
  const t = Math.min(0.95, Math.max(0, (world.tick - run.legStartTick) / run.legTicks));
  const dx = leg.to.x - leg.from.x;
  const dy = leg.to.y - leg.from.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  const id = spawnShip(world, ship, {
    position: { x: leg.from.x + dx * t, y: leg.from.y + dy * t },
    velocity: { x: (dx / d) * speed * 0.6, y: (dy / d) * speed * 0.6 },
    angle: atan2(dy, dx),
    faction,
    allegiance,
  });
  world.pilots.set(id, { mode: 'patrol', patrol: [leg.to], waypoint: 0, target: null, retreatUntil: 0, orbit: 1, travel: { to: leg.to, speed } });
  return id;
}
