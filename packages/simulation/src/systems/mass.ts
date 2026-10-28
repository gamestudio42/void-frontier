import { shipInertia, shipMass } from '../ship.ts';
import type { World } from '../world.ts';

/** Cargo, equipment and fuel all change mass, so refresh it before anything reads it. */
export function massSystem(world: World): void {
  for (const [id, ship] of world.ships) {
    const body = world.bodies.get(id);
    if (!body) continue;
    body.mass = shipMass(ship);
    body.inertia = shipInertia(ship, body.mass);
  }
}
