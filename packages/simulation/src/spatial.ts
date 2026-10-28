import { cos, sin } from '@void-frontier/kernel';
import type { Body, EntityId } from './types.ts';
import type { World } from './world.ts';

/** Uniform grid of collider bounds, keyed by cell. Rebuilt each step; queries return ids in insertion order. */
export class SpatialIndex {
  private readonly cells = new Map<number, EntityId[]>();

  constructor(readonly cellSize: number) {}

  private static key(cx: number, cy: number): number {
    return cx * 92821 + cy;
  }

  insert(id: EntityId, minX: number, minY: number, maxX: number, maxY: number): void {
    const c = this.cellSize;
    for (let cx = Math.floor(minX / c); cx <= Math.floor(maxX / c); cx++) {
      for (let cy = Math.floor(minY / c); cy <= Math.floor(maxY / c); cy++) {
        const k = SpatialIndex.key(cx, cy);
        const cell = this.cells.get(k);
        if (cell) cell.push(id);
        else this.cells.set(k, [id]);
      }
    }
  }

  query(minX: number, minY: number, maxX: number, maxY: number): EntityId[] {
    const c = this.cellSize;
    const seen = new Set<EntityId>();
    const out: EntityId[] = [];
    for (let cx = Math.floor(minX / c); cx <= Math.floor(maxX / c); cx++) {
      for (let cy = Math.floor(minY / c); cy <= Math.floor(maxY / c); cy++) {
        for (const id of this.cells.get(SpatialIndex.key(cx, cy)) ?? []) {
          if (seen.has(id)) continue;
          seen.add(id);
          out.push(id);
        }
      }
    }
    return out.sort((a, b) => a - b);
  }
}

export function circleCentre(body: Body, c: { x: number; y: number }): { x: number; y: number } {
  if (c.x === 0 && c.y === 0) return { x: body.position.x, y: body.position.y };
  const ca = cos(body.angle);
  const sa = sin(body.angle);
  return { x: body.position.x + c.x * ca - c.y * sa, y: body.position.y + c.x * sa + c.y * ca };
}

export interface RayHit {
  id: EntityId;
  point: { x: number; y: number };
  /** fraction of the segment, 0..1 */
  t: number;
}

/**
 * First collider hit by the segment from `from` to `to`, ignoring `ignore`.
 * Uses the spatial index when it exists, otherwise tests every collider.
 */
export function raycast(world: World, from: { x: number; y: number }, to: { x: number; y: number }, ignore: EntityId | null): RayHit | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq < 1e-12) return null;
  const candidates = world.spatial
    ? world.spatial.query(Math.min(from.x, to.x), Math.min(from.y, to.y), Math.max(from.x, to.x), Math.max(from.y, to.y))
    : [...world.colliders.keys()];
  let best: RayHit | null = null;
  for (const id of candidates) {
    if (id === ignore) continue;
    const collider = world.colliders.get(id);
    const body = world.bodies.get(id);
    if (!collider || !body) continue;
    // Bound check first.
    if (segmentCircle(from, dx, dy, lengthSq, body.position, collider.bound) === null) continue;
    for (const circle of collider.circles) {
      const t = segmentCircle(from, dx, dy, lengthSq, circleCentre(body, circle), circle.r);
      if (t !== null && (!best || t < best.t)) best = { id, t, point: { x: from.x + dx * t, y: from.y + dy * t } };
    }
  }
  return best;
}

/** Smallest t in [0, 1] where the segment enters the circle, 0 if it starts inside, or null. */
function segmentCircle(from: { x: number; y: number }, dx: number, dy: number, lengthSq: number, centre: { x: number; y: number }, r: number): number | null {
  const fx = from.x - centre.x;
  const fy = from.y - centre.y;
  const c = fx * fx + fy * fy - r * r;
  if (c <= 0) return 0;
  const b = 2 * (fx * dx + fy * dy);
  if (b >= 0) return null;
  const disc = b * b - 4 * lengthSq * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * lengthSq);
  return t <= 1 ? t : null;
}
