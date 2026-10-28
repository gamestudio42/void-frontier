import { localToWorld } from '@void-frontier/kernel';
import { engineFactor, forwardOf } from '../ship.ts';
import type { World } from '../world.ts';

/** Converts throttles into force and torque on the body and burns fuel for them. */
export function thrusterSystem(world: World, dt: number): void {
  for (const [id, ship] of world.ships) {
    const body = world.bodies.get(id);
    if (!body) continue;
    const { output } = ship;
    const movement = ship.definition.movement;

    const boost = output.boosting ? movement.boostMultiplier : 1;
    const boostFuel = output.boosting ? movement.boostFuelMultiplier : 1;
    // Damaged engines deliver less of every thruster's rated force.
    const power = engineFactor(ship);
    const mainForce = output.main * movement.mainThrust * boost * power;
    const reverseForce = output.reverse * movement.reverseThrust * power;
    const lateralForce = output.lateral * movement.lateralThrust * power;
    const torque = output.rotation * movement.rotationalTorque * power;
    // Rotation thrusters sit near the nose and tail, half a hull length from the centre.
    const rotationForce = Math.abs(torque) / (ship.definition.hull.length / 2);

    const thrustNewtons = mainForce * boostFuel + reverseForce + Math.abs(lateralForce) + rotationForce;
    const burn = (thrustNewtons / 1e6) * ship.definition.fuel.consumptionPerMegaNewtonSecond * dt;

    let available = 1;
    if (burn > 0) {
      if (ship.fuel <= 0) available = 0;
      else if (burn > ship.fuel) available = ship.fuel / burn;
      ship.fuel = Math.max(0, ship.fuel - burn * available);
    }
    if (available < 1) {
      output.main *= available;
      output.reverse *= available;
      output.lateral *= available;
      output.rotation *= available;
      if (available === 0) output.boosting = false;
    }

    const local = { x: (mainForce - reverseForce) * available, y: lateralForce * available };
    const world2 = localToWorld(forwardOf(body.angle), local);
    body.force.x += world2.x;
    body.force.y += world2.y;
    body.torque += torque * available;
  }
}
