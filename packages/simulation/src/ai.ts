import { MINING_RULES, getArchetype, getShip, getWeapon, type EncounterDefinition, type PirateArchetype } from '@void-frontier/content';
import { atan2, clamp, cos, length, sin, toRadians, worldToLocal, wrapAngle, type Vec2 } from '@void-frontier/kernel';
import { hostilesNear, leadPoint, muzzlePosition } from './combat.ts';
import { nearestObstacle } from './proximity.ts';
import { forwardOf, sensorRange, spawnShip } from './ship.ts';
import { raycast } from './spatial.ts';
import { isDisabled } from './subsystems.ts';
import { idleCommand, type AiPilot, type Body, type EntityId, type Ship } from './types.ts';
import type { World } from './world.ts';

/** Tuning shared by every AI pilot; how each pirate archetype fights lives in pirates.json. */
const AI = {
  patrolSpeed: 55,
  waypointRadius: 80,
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
  /** Wingmen drop targets further than this from their leader (m). */
  escortLeash: 1400,
  /** Wingmen engage hostiles within this distance of their leader (m). */
  escortEngage: 700,
  /** m/s a wingman closes on its formation slot at. */
  escortCatchUp: 220,
  /** Fleet miners pick rocks within this distance of their site (m). */
  mineRadius: 700,
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
    if (ship.destroyed || isDisabled(ship)) {
      ship.command = idleCommand();
      // A crew that gave up holds still to be boarded.
      if (ship.surrendered) ship.command.brake = true;
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
  if (pilot.mine) {
    mine(world, id, ship, body, pilot.mine);
    return;
  }
  const range = sensorRange(ship);
  const archetype = getArchetype(pilot.archetype, ship.baseDefinition.id);
  if (pilot.mode === 'flee') {
    flee(world, id, ship, body, pilot, range);
    return;
  }

  // Keep a target while it stays inside the leash; otherwise take the nearest hostile in sensor range.
  if (pilot.target !== null) {
    const t = world.ships.get(pilot.target);
    const tb = world.bodies.get(pilot.target);
    const far = !tb || length({ x: tb.position.x - body.position.x, y: tb.position.y - body.position.y }) > range * AI.leashFactor;
    // Wingmen break off rather than chase a fight away from their leader.
    const leader = pilot.escort ? world.bodies.get(pilot.escort.leader) : undefined;
    const strayed = !!leader && !!tb && length({ x: tb.position.x - leader.position.x, y: tb.position.y - leader.position.y }) > AI.escortLeash;
    if (!t || t.destroyed || far || strayed) pilot.target = null;
  }
  if (pilot.target === null) {
    // Wingmen only take on threats close to their leader.
    const guard = pilot.escort ? world.bodies.get(pilot.escort.leader) : undefined;
    const near = (other: EntityId) => {
      if (!guard) return true;
      const p = world.bodies.get(other)!.position;
      return length({ x: p.x - guard.position.x, y: p.y - guard.position.y }) <= AI.escortEngage;
    };
    pilot.target = hostilesNear(world, id, range).find(near) ?? null;
  }

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

  const leader = pilot.escort ? world.bodies.get(pilot.escort.leader) : undefined;
  if ((pilot.mode === 'patrol' || pilot.target === null) && leader && pilot.escort) {
    const slot = formationPoint(leader.position, leader.angle, pilot.escort.slot);
    const gx = slot.x - body.position.x;
    const gy = slot.y - body.position.y;
    const gap = Math.sqrt(gx * gx + gy * gy);
    const catchUp = Math.min(AI.escortCatchUp, gap * 0.6);
    desired = { x: leader.velocity.x + (gap > 1 ? (gx / gap) * catchUp : 0), y: leader.velocity.y + (gap > 1 ? (gy / gap) * catchUp : 0) };
    command.boost = gap > 600;
    const f = forwardOf(leader.angle);
    aim = gap > 250 ? slot : { x: body.position.x + f.x * 200, y: body.position.y + f.y * 200 };
  } else if (pilot.mode === 'patrol' || pilot.target === null) {
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
      desired = engageVelocity(archetype, pilot, targetBody.velocity, ux, uy, d);
      // A brawler burns in; a kiter burns away when the target gets inside half its range.
      if (archetype.style === 'ram' && d > 140) command.boost = true;
      if (archetype.style === 'kite' && d < archetype.preferredRange * 0.5) command.boost = true;
      const gun = ship.weapons[0];
      if (gun && gun.definition.kind === 'missile') {
        aim = targetBody.position;
        const reach = gun.definition.speed * gun.definition.lifetime * 0.7;
        const error = Math.abs(wrapAngle(atan2(ry, rx) - body.angle));
        command.fireSecondary = d < reach && error < toRadians(gun.definition.gimbal);
        command.firePrimary = command.fireSecondary;
      } else if (gun && gun.definition.kind === 'projectile') {
        const muzzle = muzzlePosition(body, gun);
        const lead = leadPoint(muzzle, body.velocity, targetBody.position, targetBody.velocity, gun.definition.projectileSpeed, gun.definition.velocityInheritance);
        aim = lead ? lead.point : targetBody.position;
        const maxRange = gun.definition.projectileSpeed * gun.definition.projectileLifetime * 0.55;
        const error = Math.abs(wrapAngle(atan2(aim.y - muzzle.y, aim.x - muzzle.x) - body.angle));
        if (d < maxRange && error < toRadians(gun.definition.gimbal + AI.fireAngleSlack)) {
          // Hold fire when a rock or the station is in the way.
          const blocker = raycast(world, muzzle, targetBody.position, id);
          command.firePrimary = !blocker || blocker.id === pilot.target;
          // Whatever is on the secondary trigger (lasers, missile racks) goes with the guns.
          command.fireSecondary = command.firePrimary;
        }
      } else {
        aim = targetBody.position;
      }
      command.target = pilot.target;
    }
  }

  // A brawler means to hit its target: it only steers around everything else.
  desired = avoid(world, id, body, desired, archetype.style === 'ram' ? pilot.target : null);
  const error = worldToLocal(forwardOf(body.angle), { x: desired.x - body.velocity.x, y: desired.y - body.velocity.y });
  command.thrust = clamp(error.x * AI.steeringGain, -1, 1);
  command.strafe = clamp(error.y * AI.steeringGain, -1, 1);
  if (command.boost && error.x < 40) command.boost = false;
  command.aim = aim;
  ship.command = command;
}

/**
 * The velocity a pilot wants against its target, by archetype: an orbiter closes to its
 * range and circles; a brawler flies straight in, faster than the target, to ram it; a
 * kiter holds a long range and backs off quickly when pressed.
 */
export function engageVelocity(archetype: PirateArchetype, pilot: AiPilot, target: Vec2, ux: number, uy: number, d: number): Vec2 {
  if (archetype.style === 'ram') return { x: target.x + ux * archetype.approachSpeed, y: target.y + uy * archetype.approachSpeed };
  const back = archetype.style === 'kite' ? archetype.approachSpeed : archetype.approachSpeed * 0.6;
  const radial = clamp((d - archetype.preferredRange) * 0.5, -back, archetype.approachSpeed);
  const orbit = archetype.orbitSpeed * pilot.orbit;
  return { x: target.x + ux * radial - uy * orbit, y: target.y + uy * radial + ux * orbit };
}

/** A pilot whose nerve broke: boost straight away from whatever it was fighting. */
function flee(world: World, id: EntityId, ship: Ship, body: Body, pilot: AiPilot, range: number): void {
  const command = idleCommand();
  const threatId = pilot.target ?? hostilesNear(world, id, range)[0] ?? null;
  const threat = threatId !== null ? world.bodies.get(threatId) : undefined;
  let away = forwardOf(body.angle);
  if (threat) {
    const dx = body.position.x - threat.position.x;
    const dy = body.position.y - threat.position.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    away = { x: dx / d, y: dy / d };
  }
  const desired = avoid(world, id, body, { x: away.x * AI.retreatSpeed, y: away.y * AI.retreatSpeed });
  const error = worldToLocal(forwardOf(body.angle), { x: desired.x - body.velocity.x, y: desired.y - body.velocity.y });
  command.thrust = clamp(error.x * AI.steeringGain, -1, 1);
  command.strafe = clamp(error.y * AI.steeringGain, -1, 1);
  command.boost = error.x > 40;
  command.aim = { x: body.position.x + away.x * 100, y: body.position.y + away.y * 100 };
  ship.command = command;
}

/** Where wingman `slot` flies: behind the leader, alternating sides, further back in pairs. */
export function formationPoint(leader: Vec2, angle: number, slot: number): Vec2 {
  const f = forwardOf(angle);
  const side = slot % 2 === 0 ? 1 : -1;
  const back = 90 + 50 * Math.floor(slot / 2);
  const lateral = side * (70 + 20 * Math.floor(slot / 2));
  // Right of forward (f.x, f.y) is (f.y, -f.x).
  return { x: leader.x - f.x * back + f.y * lateral, y: leader.y - f.y * back - f.x * lateral };
}

/** Fleet miners: pick the nearest rock with ore, hold off it at the laser's optimal range, cut it. */
function mine(world: World, id: EntityId, ship: Ship, body: Body, job: NonNullable<AiPilot['mine']>): void {
  const command = idleCommand();
  if (job.rock !== null && !((world.asteroids.get(job.rock)?.ore ?? 0) > 0)) job.rock = null;
  if (job.rock === null) {
    let best = Infinity;
    for (const [rockId, rock] of world.asteroids) {
      if (rock.ore <= 0) continue;
      const p = world.bodies.get(rockId)!.position;
      if (length({ x: p.x - job.site.x, y: p.y - job.site.y }) > AI.mineRadius) continue;
      const d = length({ x: p.x - body.position.x, y: p.y - body.position.y });
      if (d < best) {
        best = d;
        job.rock = rockId;
      }
    }
  }
  const laser = ship.weapons.find((w) => w.definition.kind === 'mining');
  let desired: Vec2 = { x: (job.site.x - body.position.x) * 0.2, y: (job.site.y - body.position.y) * 0.2 };
  let aim: Vec2 = job.site;
  if (job.rock !== null && laser && laser.definition.kind === 'mining') {
    const rockBody = world.bodies.get(job.rock)!;
    const rock = world.asteroids.get(job.rock)!;
    const rx = body.position.x - rockBody.position.x;
    const ry = body.position.y - rockBody.position.y;
    const d = Math.sqrt(rx * rx + ry * ry) || 1;
    const standoff = rock.radius + laser.definition.optimalRange * 0.6;
    const spot = { x: rockBody.position.x + (rx / d) * standoff, y: rockBody.position.y + (ry / d) * standoff };
    const sx = spot.x - body.position.x;
    const sy = spot.y - body.position.y;
    const gap = Math.sqrt(sx * sx + sy * sy);
    const speed = Math.min(60, gap * 0.5);
    desired = { x: rockBody.velocity.x + (gap > 1 ? (sx / gap) * speed : 0), y: rockBody.velocity.y + (gap > 1 ? (sy / gap) * speed : 0) };
    aim = rockBody.position;
    const error = Math.abs(wrapAngle(atan2(-ry, -rx) - body.angle));
    // Pulse the laser like a careful pilot: off when the rock runs hot, on again once it cools
    // back to the sweet spot, so it never cracks.
    if (rock.stress >= MINING_RULES.aiCutBelow) job.resting = true;
    else if (rock.stress <= MINING_RULES.sweetSpot[0]) job.resting = false;
    command.fireMining = !job.resting && d - rock.radius < laser.definition.range * 0.9 && error < toRadians(laser.definition.gimbal + 4);
  }
  desired = avoid(world, id, body, desired);
  const error = worldToLocal(forwardOf(body.angle), { x: desired.x - body.velocity.x, y: desired.y - body.velocity.y });
  command.thrust = clamp(error.x * AI.steeringGain, -1, 1);
  command.strafe = clamp(error.y * AI.steeringGain, -1, 1);
  command.aim = aim;
  ship.command = command;
}

/** Bend the desired velocity away from an obstacle that is about to be hit. */
function avoid(world: World, id: EntityId, body: Body, desired: Vec2, ignore: EntityId | null = null): Vec2 {
  const threat = nearestObstacle(world, id, 250);
  if (!threat || threat.id === ignore || threat.timeToImpact === null || threat.timeToImpact > AI.avoidHorizon) return desired;
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
    const ship = world.ships.get(id)!;
    definition.loadout?.forEach((weapon, slot) => {
      if (ship.weapons[slot]) ship.weapons[slot].definition = getWeapon(weapon);
    });
    const archetype = getArchetype(definition.archetype, definition.ship);
    world.pilots.set(id, {
      mode: 'patrol',
      patrol: definition.patrol.map(([x, y]) => ({ x, y })),
      waypoint: i % definition.patrol.length,
      target: null,
      retreatUntil: 0,
      orbit: i % 2 === 0 ? 1 : -1,
      archetype: archetype.id,
      morale: archetype.courage,
      // The first ship leads; the others fly on its wing and fight near it.
      squad: definition.count > 1 ? members[0] ?? id : undefined,
      escort: i > 0 ? { leader: members[0], slot: i - 1 } : undefined,
    });
    members.push(id);
  }
  return members;
}

/** Brings destroyed groups back after their respawn delay; wrecks are cleared first. */
export function encounterSystem(world: World, dt: number): void {
  if (world.hostilesHeld) return;
  for (const encounter of world.encounters) {
    // A crew that surrendered no longer holds the group's place in the sector.
    const alive = encounter.members.some((id) => {
      const ship = world.ships.get(id);
      return !ship?.destroyed && !ship?.surrendered;
    });
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
