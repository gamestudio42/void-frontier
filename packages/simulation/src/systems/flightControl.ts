import { atan2, clamp, sub, worldToLocal, wrapAngle } from '@void-frontier/kernel';
import { forwardOf } from '../ship.ts';
import type { Body, Ship } from '../types.ts';
import type { World } from '../world.ts';

/** Proportional gain of the steering controller near the target, in 1/s. */
const AIM_GAIN = 6;
/** Fraction of the theoretical maximum deceleration the steering plan relies on. */
const AIM_BRAKE_MARGIN = 0.8;

/**
 * Turns the pilot's command into thruster throttles. Every assist (flight assist, brake,
 * mouse steering) works by firing thrusters; nothing here touches velocity or position.
 */
export function flightControlSystem(world: World, dt: number): void {
  for (const [id, ship] of world.ships) {
    const body = world.bodies.get(id);
    if (!body) continue;
    if (ship.destroyed) {
      Object.assign(ship.output, { main: 0, reverse: 0, lateral: 0, rotation: 0, boosting: false });
      continue;
    }
    controlShip(ship, body, dt);
  }
}

function controlShip(ship: Ship, body: Body, dt: number): void {
  const { command, output, definition } = ship;
  const movement = definition.movement;
  const assisted = ship.mode === 'assisted';
  const brake = command.brake;

  // Translation, in ship-local axes: x forward, y right.
  const localVelocity = worldToLocal(forwardOf(body.angle), body.velocity);
  const thrust = brake ? 0 : clamp(command.thrust, -1, 1);
  const strafe = brake ? 0 : clamp(command.strafe, -1, 1);
  const holdAxes = assisted || brake;

  output.boosting = false;
  if (thrust > 0) {
    output.main = thrust;
    output.reverse = 0;
    output.boosting = command.boost;
  } else if (thrust < 0) {
    output.main = 0;
    output.reverse = -thrust;
  } else if (holdAxes) {
    const neededForce = (-localVelocity.x * body.mass) / dt;
    output.main = neededForce > 0 ? clamp(neededForce / movement.mainThrust, 0, 1) : 0;
    output.reverse = neededForce < 0 ? clamp(-neededForce / movement.reverseThrust, 0, 1) : 0;
  } else {
    output.main = 0;
    output.reverse = 0;
  }

  if (strafe !== 0) {
    output.lateral = strafe;
  } else if (holdAxes) {
    output.lateral = clamp((-localVelocity.y * body.mass) / dt / movement.lateralThrust, -1, 1);
  } else {
    output.lateral = 0;
  }

  // Rotation.
  const maxTorque = movement.rotationalTorque;
  const maxOmega = movement.maxAngularVelocity;
  const omega = body.angularVelocity;
  const turn = brake ? 0 : clamp(command.turn, -1, 1);
  let targetOmega: number | null = null;

  if (turn !== 0) {
    // Manual turning: thrusters push until the rated turn rate, then coast.
    const saturated = turn > 0 ? omega >= maxOmega * turn : omega <= maxOmega * turn;
    output.rotation = saturated ? 0 : turn;
  } else if (command.aim && !brake) {
    const toAim = sub(command.aim, body.position);
    if (toAim.x * toAim.x + toAim.y * toAim.y > 1) {
      const error = wrapAngle(atan2(toAim.y, toAim.x) - body.angle);
      const maxAlpha = maxTorque / body.inertia;
      const magnitude = Math.min(maxOmega, Math.sqrt(2 * maxAlpha * AIM_BRAKE_MARGIN * Math.abs(error)), AIM_GAIN * Math.abs(error));
      targetOmega = error >= 0 ? magnitude : -magnitude;
    } else {
      targetOmega = assisted ? 0 : null;
    }
  } else if (assisted || brake) {
    targetOmega = 0;
  }

  if (turn === 0) {
    output.rotation = targetOmega === null ? 0 : clamp(((targetOmega - omega) * body.inertia) / dt / maxTorque, -1, 1);
  }
}
