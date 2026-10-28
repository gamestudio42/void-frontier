import { wrapAngle } from '@void-frontier/kernel';
import type { World } from '../world.ts';

/**
 * Semi-implicit Euler: velocity first, then position with the new velocity. With no force
 * the velocity is untouched; there is no drag or artificial damping anywhere.
 */
export function integrationSystem(world: World, dt: number): void {
  for (const [id, body] of world.bodies) {
    // Docked ships ride with the station and ignore forces.
    if (world.ships.get(id)?.docked != null) continue;
    body.previousPosition.x = body.position.x;
    body.previousPosition.y = body.position.y;
    body.previousAngle = body.angle;

    body.velocity.x += (body.force.x / body.mass) * dt;
    body.velocity.y += (body.force.y / body.mass) * dt;
    body.position.x += body.velocity.x * dt;
    body.position.y += body.velocity.y * dt;

    body.angularVelocity += (body.torque / body.inertia) * dt;
    body.angle = wrapAngle(body.angle + body.angularVelocity * dt);

    body.force.x = 0;
    body.force.y = 0;
    body.torque = 0;
  }
}
