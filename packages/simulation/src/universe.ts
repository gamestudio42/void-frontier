import { getAsteroidType, getStation, type AsteroidFieldDefinition, type StationDefinition, type StationModule } from '@void-frontier/content';
import { PI, Rng, TAU, cos, sin, type Vec2 } from '@void-frontier/kernel';
import type { Body, Collider, EntityId } from './types.ts';
import type { World } from './world.ts';

function staticBody(position: Vec2, angle: number): Body {
  return {
    position: { ...position },
    velocity: { x: 0, y: 0 },
    angle,
    angularVelocity: 0,
    // Infinite mass: impulses and forces cannot move it.
    mass: Infinity,
    inertia: Infinity,
    force: { x: 0, y: 0 },
    torque: 0,
    previousPosition: { ...position },
    previousAngle: angle,
  };
}

/** Circles that approximate each station module. Spacing keeps gaps smaller than a ship. */
export function stationCollider(definition: StationDefinition): Collider {
  const circles: Collider['circles'] = [];
  const along = (from: [number, number], to: [number, number], r: number) => {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const length = Math.sqrt(dx * dx + dy * dy);
    const count = Math.max(1, Math.ceil(length / r));
    for (let i = 0; i <= count; i++) circles.push({ x: from[0] + (dx * i) / count, y: from[1] + (dy * i) / count, r });
  };
  for (const module of definition.modules) addModule(module);
  function addModule(module: StationModule) {
    switch (module.kind) {
      case 'core':
      case 'tank':
        circles.push({ x: module.x, y: module.y, r: module.r });
        break;
      case 'ring': {
        const r = module.thickness / 2;
        const count = Math.ceil((TAU * module.r) / r);
        for (let i = 0; i < count; i++) {
          const a = (TAU * i) / count;
          circles.push({ x: cos(a) * module.r, y: sin(a) * module.r, r });
        }
        break;
      }
      case 'truss':
        along(module.from, module.to, module.width / 2);
        break;
      case 'panel':
        // Panels are wide and thin; model them as a line of circles across their width.
        along(module.from, module.to, Math.min(module.width / 2, 14));
        for (const side of [-1, 1]) {
          const half = (module.width / 2 - 7) * side;
          const nx = module.from[1] === module.to[1] ? 0 : 1;
          const ny = 1 - nx;
          along([module.from[0] + half * nx, module.from[1] + half * ny], [module.to[0] + half * nx, module.to[1] + half * ny], 7);
        }
        break;
      case 'dock': {
        // Two side walls and a back wall; the mouth faces `angle` and stays open.
        const ca = cos(module.angle);
        const sa = sin(module.angle);
        const toWorld = (fx: number, sy: number): [number, number] => [module.x + fx * ca - sy * sa, module.y + fx * sa + sy * ca];
        const halfW = module.width / 2;
        const wall = 3;
        along(toWorld(-module.depth, halfW), toWorld(0, halfW), wall);
        along(toWorld(-module.depth, -halfW), toWorld(0, -halfW), wall);
        along(toWorld(-module.depth, -halfW), toWorld(-module.depth, halfW), wall);
        break;
      }
    }
  }
  let bound = 0;
  for (const c of circles) bound = Math.max(bound, Math.sqrt(c.x * c.x + c.y * c.y) + c.r);
  return { circles, bound };
}

export function spawnStation(world: World, definitionId: string, name: string, position: Vec2, angle: number): EntityId {
  const definition = getStation(definitionId);
  const id = world.createEntity();
  world.bodies.set(id, staticBody(position, angle));
  world.colliders.set(id, stationCollider(definition));
  world.stations.set(id, { definition, name });
  return id;
}

export function spawnAsteroid(
  world: World,
  typeId: string,
  radius: number,
  position: Vec2,
  velocity: Vec2,
  angle: number,
  spin: number,
  look: number,
): EntityId {
  const type = getAsteroidType(typeId);
  const id = world.createEntity();
  const mass = type.density * (4 / 3) * PI * radius * radius * radius;
  world.bodies.set(id, {
    position: { ...position },
    velocity: { ...velocity },
    angle,
    angularVelocity: spin,
    mass,
    inertia: 0.4 * mass * radius * radius,
    force: { x: 0, y: 0 },
    torque: 0,
    previousPosition: { ...position },
    previousAngle: angle,
  });
  world.colliders.set(id, { circles: [{ x: 0, y: 0, r: radius }], bound: radius });
  world.asteroids.set(id, { type, radius, look });
  return id;
}

interface Occupied {
  x: number;
  y: number;
  radius: number;
}

function pickType(rng: Rng, weights: Record<string, number>): string {
  // Sorted keys keep the draw independent of JSON key order.
  const keys = Object.keys(weights).sort();
  const total = keys.reduce((sum, key) => sum + weights[key], 0);
  let roll = rng.next() * total;
  for (const key of keys) {
    roll -= weights[key];
    if (roll < 0) return key;
  }
  return keys[keys.length - 1];
}

/**
 * Fills a field with non-overlapping rocks. Small rocks are far more common than large
 * ones (radius drawn from r^-2.5), which reads naturally and keeps lanes open.
 */
export function generateAsteroidField(world: World, field: AsteroidFieldDefinition, rng: Rng, occupied: Occupied[]): EntityId[] {
  const ids: EntityId[] = [];
  const { minRadius, maxRadius } = field;
  for (let i = 0; i < field.count; i++) {
    for (let attempt = 0; attempt < 30; attempt++) {
      const u = rng.next();
      // Inverse transform of a truncated power law with exponent -2.5.
      const a = 1 / Math.sqrt(minRadius * minRadius * minRadius);
      const b = 1 / Math.sqrt(maxRadius * maxRadius * maxRadius);
      const inv = a - u * (a - b);
      const radius = 1 / cubeRootSquared(inv);
      const distance = field.radius * Math.sqrt(rng.next());
      const theta = rng.range(0, TAU);
      const x = field.center.x + cos(theta) * distance;
      const y = field.center.y + sin(theta) * distance;
      const clear = occupied.every((o) => {
        const dx = o.x - x;
        const dy = o.y - y;
        const gap = o.radius + radius + 6;
        return dx * dx + dy * dy > gap * gap;
      });
      const typeId = pickType(rng, field.types);
      const driftAngle = rng.range(0, TAU);
      const drift = rng.range(0, field.maxDrift);
      const spin = rng.range(-0.4, 0.4) / Math.max(1, radius / 4);
      const angle = rng.range(-PI, PI);
      const look = rng.nextUint32();
      if (!clear) continue;
      ids.push(spawnAsteroid(world, typeId, radius, { x, y }, { x: cos(driftAngle) * drift, y: sin(driftAngle) * drift }, angle, spin, look));
      occupied.push({ x, y, radius });
      break;
    }
  }
  return ids;
}

/** x^(2/3) by Newton's method on the cube root; only + - * / so it stays deterministic. */
function cubeRootSquared(x: number): number {
  let r = x > 1 ? x / 3 : 1;
  for (let i = 0; i < 40; i++) r = r - (r * r * r - x) / (3 * r * r);
  return r * r;
}
