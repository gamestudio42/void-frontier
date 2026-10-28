import { cos, sin } from '@void-frontier/kernel';
import type { EntityId } from './types.ts';
import type { World } from './world.ts';

export interface Proximity {
  id: EntityId;
  kind: 'asteroid' | 'station' | 'ship';
  /** surface-to-surface distance in metres, using bounding circles */
  distance: number;
  /** m/s, positive when approaching */
  closingSpeed: number;
  /** seconds until contact at the current closing speed, or null when not approaching */
  timeToImpact: number | null;
}

/** The obstacle most urgent for a ship: soonest impact if any is approaching, else the closest. */
export function nearestObstacle(world: World, id: EntityId, range = 400): Proximity | null {
  const self = world.bodies.get(id);
  const selfCollider = world.colliders.get(id);
  if (!self || !selfCollider) return null;
  let best: Proximity | null = null;
  for (const [other, collider] of world.colliders) {
    if (other === id) continue;
    const body = world.bodies.get(other)!;
    const dx = body.position.x - self.position.x;
    const dy = body.position.y - self.position.y;
    const centre = Math.sqrt(dx * dx + dy * dy);
    const distance = centre - collider.bound - selfCollider.bound;
    if (distance > range) continue;
    let surface = distance;
    // Stations are large and hollow; measure to their nearest circle instead of the bound.
    if (world.stations.has(other)) {
      surface = Infinity;
      const ca = cos(body.angle);
      const sa = sin(body.angle);
      for (const c of collider.circles) {
        const cx = body.position.x + c.x * ca - c.y * sa - self.position.x;
        const cy = body.position.y + c.x * sa + c.y * ca - self.position.y;
        surface = Math.min(surface, Math.sqrt(cx * cx + cy * cy) - c.r - selfCollider.bound);
      }
    }
    const rvx = self.velocity.x - body.velocity.x;
    const rvy = self.velocity.y - body.velocity.y;
    const closingSpeed = centre > 1e-6 ? (rvx * dx + rvy * dy) / centre : 0;
    const timeToImpact = closingSpeed > 0.1 ? Math.max(0, surface) / closingSpeed : null;
    const kind = world.stations.has(other) ? 'station' : world.ships.has(other) ? 'ship' : 'asteroid';
    const candidate: Proximity = { id: other, kind, distance: Math.max(0, surface), closingSpeed, timeToImpact };
    if (!best) best = candidate;
    else if (candidate.timeToImpact !== null && (best.timeToImpact === null || candidate.timeToImpact < best.timeToImpact)) best = candidate;
    else if (candidate.timeToImpact === null && best.timeToImpact === null && candidate.distance < best.distance) best = candidate;
  }
  return best;
}
