import { atan2, clamp, sub, worldToLocal } from '@void-frontier/kernel';
import { forwardOf } from '../ship.ts';
import type { Body, Ship } from '../types.ts';
import type { World } from '../world.ts';
import { cruiseControl, steerTo } from './cruise.ts';

/**
 * Turns the pilot's command into thruster throttles. Every assist (flight assist, brake,
 * mouse steering) works by firing thrusters; nothing here touches velocity or position.
 */
export function flightControlSystem(world: World, dt: number): void {
  for (const [id, ship] of world.ships) {
    const body = world.bodies.get(id);
    if (!body) continue;
    if (ship.destroyed || ship.docked !== null) {
      Object.assign(ship.output, { main: 0, reverse: 0, lateral: 0, rotation: 0, boosting: false });
      ship.cruise = null;
      continue;
    }
    const { command } = ship;
    const manual = command.brake || command.thrust !== 0 || command.strafe !== 0 || command.turn !== 0;
    if (command.cruise && !manual) {
      ship.cruise = cruiseControl(world, id, ship, body, command.cruise, dt);
      continue;
    }
    ship.cruise = null;
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
  if (turn !== 0) {
    // Manual turning: thrusters push until the rated turn rate, then coast.
    const saturated = turn > 0 ? omega >= maxOmega * turn : omega <= maxOmega * turn;
    output.rotation = saturated ? 0 : turn;
    return;
  }
  const toAim = command.aim && !brake ? sub(command.aim, body.position) : null;
  if (toAim && toAim.x * toAim.x + toAim.y * toAim.y > 1) {
    output.rotation = steerTo(ship, body, atan2(toAim.y, toAim.x), dt);
    return;
  }
  // No aim (or the cursor on the ship): the assists hold the heading, Newtonian drifts.
  const hold = assisted || brake;
  output.rotation = hold ? clamp(((0 - omega) * body.inertia) / dt / maxTorque, -1, 1) : 0;
}
