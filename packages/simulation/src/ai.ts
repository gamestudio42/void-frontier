import { getShip, type EncounterDefinition } from '@void-frontier/content';
import { atan2, clamp, cos, length, sin, toRadians, worldToLocal, wrapAngle, type Vec2 } from '@void-frontier/kernel';
import { hostilesNear, leadPoint, muzzlePosition } from './combat.ts';
import { nearestObstacle } from './proximity.ts';
import { forwardOf, sensorRange, spawnShip } from './ship.ts';
import { raycast } from './spatial.ts';
import { idleCommand, type AiPilot, type Body, type EntityId, type Ship } from './types.ts';
import type { World } from './world.ts';

/** Tuning for pirate pilots; kept together so balance passes touch one place. */
const AI = {
  patrolSpeed: 55,
  waypointRadius: 80,
  preferredRange: 230,
  approachSpeed: 150,
  orbitSpeed: 45,
  /** Gain from velocity error (m/s) to thruster throttle. */
  steeringGain: 0.2,
  /** Engagement is dropped beyond this multiple of sensor range. */
  leashFactor: 1.6,
  retreatHull: 0.35,
  retreatSeconds: 7,
  retreatSpeed: 170,
  fireAngleSlack: 2.5,
  /** Seconds of look-ahead for obstacle avoidance. */
  avoidHorizon: 3.5,
};

/**
 * Pirate pilots. Every decision ends in a ShipCommand, the same input the player
 * produces, so AI ships obey exactly the same physics, fuel and heat limits.
 */
export function aiSystem(world: World): void {
  for (const [id, pilot] of world.pilots) {
    const ship = world.ships.get(id);
    const body = world.bodies.get(id);
    if (!ship || !body) continue;
    if (ship.destroyed) {
      ship.command = idleCommand();
      continue;
    }
    think(world, id, ship, body, pilot);
  }
}

/** Haulers: fly the route, slow down on arrival, burn hard when shot at, steer around rocks. */
function travel(world: World, id: EntityId, ship: Ship, body: Body, goal: { to: { x: number; y: number }; speed: number }): void {
  const command = idleCommand();
  const dx = goal.to.x - body.position.x;
  const dy = goal.to.y - body.position.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  const underFire = (world.tick - ship.lastDamageTick) / 60 < 4;
  const speed = Math.min(goal.speed * (underFire ? 1.6 : 1), d * 0.35);
  let desired = { x: (dx / d) * speed, y: (dy / d) * speed };
  desired = avoid(world, id, body, desired);
  const error = worldToLocal(forwardOf(body.angle), { x: desired.x - body.velocity.x, y: desired.y - body.velocity.y });
  command.thrust = clamp(error.x * AI.steeringGain, -1, 1);
  command.strafe = clamp(error.y * AI.steeringGain, -1, 1);
  command.boost = underFire && error.x > 20;
  command.aim = { x: body.position.x + desired.x * 10, y: body.position.y + desired.y * 10 };
  ship.command = command;
}

function think(world: World, id: EntityId, ship: Ship, body: Body, pilot: AiPilot): void {
  if (pilot.travel) {
    travel(world, id, ship, body, pilot.travel);
    return;
  }
  const range = sensorRange(ship);

  // Keep a target while it stays inside the leash; otherwise take the nearest hostile in sensor range.
  if (pilot.target !== null) {
    const t = world.ships.get(pilot.target);
    const tb = world.bodies.get(pilot.target);
    const far = !tb || length({ x: tb.position.x - body.position.x, y: tb.position.y - body.position.y }) > range * AI.leashFactor;
    if (!t || t.destroyed || far) pilot.target = null;
  }
  if (pilot.target === null) pilot.target = hostilesNear(world, id, range)[0] ?? null;

  const hullRatio = ship.hull / ship.definition.hull.integrity;
  if (pilot.target === null) pilot.mode = 'patrol';
  else if (pilot.mode !== 'retreat' && hullRatio < AI.retreatHull && ship.shield < ship.definition.shield.capacity * 0.1) {
    pilot.mode = 'retreat';
    pilot.retreatUntil = world.tick + Math.round(AI.retreatSeconds * 60);
  } else if (pilot.mode === 'retreat' && world.tick >= pilot.retreatUntil) pilot.mode = 'engage';
  else if (pilot.mode === 'patrol') pilot.mode = 'engage';

  const command = idleCommand();
  let desired: Vec2;
  let aim: Vec2 | null = null;

  if (pilot.mode === 'patrol' || pilot.target === null) {
    const waypoint = pilot.patrol[pilot.waypoint];
    const dx = waypoint.x - body.position.x;
    const dy = waypoint.y - body.position.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < AI.waypointRadius) pilot.waypoint = (pilot.waypoint + 1) % pilot.patrol.length;
    const speed = Math.min(AI.patrolSpeed, d * 0.4);
    desired = d > 1 ? { x: (dx / d) * speed, y: (dy / d) * speed } : { x: 0, y: 0 };
    aim = { x: body.position.x + dx, y: body.position.y + dy };
  } else {
    const targetBody = world.bodies.get(pilot.target)!;
    const rx = targetBody.position.x - body.position.x;
    const ry = targetBody.position.y - body.position.y;
    const d = Math.sqrt(rx * rx + ry * ry);
    const ux = d > 1e-6 ? rx / d : 1;
    const uy = d > 1e-6 ? ry / d : 0;
    if (pilot.mode === 'retreat') {
      desired = { x: -ux * AI.retreatSpeed, y: -uy * AI.retreatSpeed };
      aim = { x: body.position.x - ux * 100, y: body.position.y - uy * 100 };
      command.boost = true;
    } else {
      // Close to preferred range, match the target's motion and circle it.
      const radial = clamp((d - AI.preferredRange) * 0.5, -AI.approachSpeed * 0.6, AI.approachSpeed);
      desired = {
        x: targetBody.velocity.x + ux * radial - uy * AI.orbitSpeed * pilot.orbit,
        y: targetBody.velocity.y + uy * radial + ux * AI.orbitSpeed * pilot.orbit,
      };
      const gun = ship.weapons[0];
      if (gun && gun.definition.kind === 'projectile') {
        const muzzle = muzzlePosition(body, gun);
        const lead = leadPoint(muzzle, body.velocity, targetBody.position, targetBody.velocity, gun.definition.projectileSpeed, gun.definition.velocityInheritance);
        aim = lead ? lead.point : targetBody.position;
        const maxRange = gun.definition.projectileSpeed * gun.definition.projectileLifetime * 0.55;
        const error = Math.abs(wrapAngle(atan2(aim.y - muzzle.y, aim.x - muzzle.x) - body.angle));
        if (d < maxRange && error < toRadians(gun.definition.gimbal + AI.fireAngleSlack)) {
          // Hold fire when a rock or the station is in the way.
          const blocker = raycast(world, muzzle, targetBody.position, id);
          command.firePrimary = !blocker || blocker.id === pilot.target;
        }
      } else {
        aim = targetBody.position;
      }
      command.target = pilot.target;
    }
  }

  desired = avoid(world, id, body, desired);
  const error = worldToLocal(forwardOf(body.angle), { x: desired.x - body.velocity.x, y: desired.y - body.velocity.y });
  command.thrust = clamp(error.x * AI.steeringGain, -1, 1);
  command.strafe = clamp(error.y * AI.steeringGain, -1, 1);
  if (command.boost && error.x < 40) command.boost = false;
  command.aim = aim;
  ship.command = command;
}

/** Bend the desired velocity away from an obstacle that is about to be hit. */
function avoid(world: World, id: EntityId, body: Body, desired: Vec2): Vec2 {
  const threat = nearestObstacle(world, id, 250);
  if (!threat || threat.timeToImpact === null || threat.timeToImpact > AI.avoidHorizon) return desired;
  const other = world.bodies.get(threat.id)!.position;
  const ax = body.position.x - other.x;
  const ay = body.position.y - other.y;
  const d = Math.sqrt(ax * ax + ay * ay) || 1;
  const push = (1 - threat.timeToImpact / AI.avoidHorizon) * 120;
  return { x: desired.x + (ax / d) * push - body.velocity.x * 0.3, y: desired.y + (ay / d) * push - body.velocity.y * 0.3 };
}

/** Spawns an encounter's group around its spawn point and registers the pilots. */
export function spawnEncounter(world: World, definition: EncounterDefinition): EntityId[] {
  const members: EntityId[] = [];
  const shipDefinition = getShip(definition.ship);
  for (let i = 0; i < definition.count; i++) {
    const angle = (i / definition.count) * 6.283185307179586;
    const offset = definition.count > 1 ? 45 : 0;
    const id = spawnShip(world, shipDefinition, {
      position: { x: definition.spawn.x + cos(angle) * offset, y: definition.spawn.y + sin(angle) * offset },
      angle: world.rng.range(-3.14159, 3.14159),
      faction: definition.faction,
    });
    world.pilots.set(id, {
      mode: 'patrol',
      patrol: definition.patrol.map(([x, y]) => ({ x, y })),
      waypoint: i % definition.patrol.length,
      target: null,
      retreatUntil: 0,
      orbit: i % 2 === 0 ? 1 : -1,
    });
    members.push(id);
  }
  return members;
}

/** Brings destroyed groups back after their respawn delay; wrecks are cleared first. */
export function encounterSystem(world: World, dt: number): void {
  for (const encounter of world.encounters) {
    const alive = encounter.members.some((id) => !world.ships.get(id)?.destroyed);
    if (alive) continue;
    if (encounter.respawnAt === null) {
      encounter.respawnAt = world.tick + Math.round(encounter.definition.respawnDelay / dt);
    } else if (world.tick >= encounter.respawnAt) {
      for (const id of encounter.members) world.destroyEntity(id);
      encounter.members = spawnEncounter(world, encounter.definition);
      encounter.respawnAt = null;
    }
  }
}
