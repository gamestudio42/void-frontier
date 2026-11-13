import { CRUISE_RULES, type CruiseRules } from '@void-frontier/content';
import { PI, atan2, clamp, cos, sin, toRadians, worldToLocal, wrapAngle, type Vec2 } from '@void-frontier/kernel';
import { forwardOf } from '../ship.ts';
import { circleCentre } from '../spatial.ts';
import type { Body, CruiseOrder, CruisePhase, EntityId, Ship } from '../types.ts';
import type { World } from '../world.ts';

/** Proportional gain of the steering controller near the wanted heading, in 1/s. */
const AIM_GAIN = 6;
/** Fraction of the theoretical maximum angular deceleration the steering plan relies on. */
const AIM_BRAKE_MARGIN = 0.8;
/** Seconds of main-engine burn under which a velocity error is trimmed without turning. */
const TRIM_SECONDS = 0.6;
/** Radians: the nose counts as on the wanted heading inside this. */
const ALIGNED = toRadians(12);
/** Radians: inside this the nose already points against the motion. */
const RETRO_FACING = toRadians(30);

/**
 * Rotation throttle that turns the nose to `heading` and holds it there, braking the turn
 * so it does not overshoot. Shared by mouse steering and the cruise autopilot.
 */
export function steerTo(ship: Ship, body: Body, heading: number, dt: number): number {
  const movement = ship.definition.movement;
  const error = wrapAngle(heading - body.angle);
  const maxAlpha = movement.rotationalTorque / body.inertia;
  const magnitude = Math.min(movement.maxAngularVelocity, Math.sqrt(2 * maxAlpha * AIM_BRAKE_MARGIN * Math.abs(error)), AIM_GAIN * Math.abs(error));
  const targetOmega = error >= 0 ? magnitude : -magnitude;
  return clamp(((targetOmega - body.angularVelocity) * body.inertia) / dt / movement.rotationalTorque, -1, 1);
}

/** Seconds the ship needs to turn its nose half way round and settle, with a safety factor. */
export function flipTime(ship: Ship, body: Body, rules: CruiseRules = CRUISE_RULES): number {
  const movement = ship.definition.movement;
  const alpha = movement.rotationalTorque / body.inertia;
  return rules.flipAllowance * (PI / movement.maxAngularVelocity + movement.maxAngularVelocity / alpha);
}

/**
 * Fastest closing speed from which the main engine, after a flip, still stops the ship
 * inside `distance`.
 */
export function plannedSpeed(distance: number, closing: number, deceleration: number, flip: number, rules: CruiseRules = CRUISE_RULES): number {
  const budget = Math.max(0, distance - Math.max(0, closing) * flip);
  return Math.min(rules.maxSpeed, Math.sqrt(2 * deceleration * rules.brakeMargin * budget));
}

interface Course {
  dir: Vec2;
  /** metres to the first obstacle on the direct course, or null when it is clear */
  blockedAt: number | null;
  /** true when no detour is clear either */
  boxedIn: boolean;
}

/**
 * The direct line to the destination when it is clear, otherwise the smallest detour
 * from the rules' list that is.
 */
/**
 * Metres the ship, as a disc `radius` wide, can move along `dir` before it touches a
 * collider, or null if it stays clear for `reach`. Obstacles it already overlaps only
 * count when the move goes deeper into them, so a ship may always back away.
 */
function firstHitAlong(world: World, id: EntityId, body: Body, dir: Vec2, reach: number, radius: number): number | null {
  const from = body.position;
  const to = { x: from.x + dir.x * reach, y: from.y + dir.y * reach };
  const candidates = world.spatial
    ? world.spatial.query(Math.min(from.x, to.x) - radius, Math.min(from.y, to.y) - radius, Math.max(from.x, to.x) + radius, Math.max(from.y, to.y) + radius)
    : [...world.colliders.keys()];
  let nearest: number | null = null;
  for (const other of candidates) {
    if (other === id) continue;
    const collider = world.colliders.get(other);
    const otherBody = world.bodies.get(other);
    if (!collider || !otherBody) continue;
    if (sweep(from, dir, reach, otherBody.position, collider.bound + radius) === null) continue;
    for (const circle of collider.circles) {
      const t = sweep(from, dir, reach, circleCentre(otherBody, circle), circle.r + radius);
      if (t !== null && (nearest === null || t < nearest)) nearest = t;
    }
  }
  return nearest;
}

/** Distance along the unit `dir` at which a point from `from` enters the circle, or null. */
function sweep(from: Vec2, dir: Vec2, reach: number, centre: Vec2, r: number): number | null {
  const fx = from.x - centre.x;
  const fy = from.y - centre.y;
  const b = fx * dir.x + fy * dir.y;
  // Moving away from (or along) the centre never enters, even from inside.
  if (b >= 0) return null;
  const c = fx * fx + fy * fy - r * r;
  if (c <= 0) return 0;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t <= reach ? t : null;
}

function chooseCourse(world: World, id: EntityId, body: Body, direct: Vec2, reach: number, radius: number, rules: CruiseRules): Course {
  const firstHit = (dir: Vec2) => firstHitAlong(world, id, body, dir, reach, radius);
  const blockedAt = firstHit(direct);
  if (blockedAt === null) return { dir: direct, blockedAt: null, boxedIn: false };
  // Try the side the ship is already sliding toward first, so the choice does not
  // flicker between left and right from one step to the next.
  const v = body.velocity;
  const slide = direct.x * v.y - direct.y * v.x;
  const sides = slide >= 0 ? [1, -1] : [-1, 1];
  for (const degrees of rules.avoidAngles) {
    for (const sign of sides) {
      const a = toRadians(degrees * sign);
      const c = cos(a);
      const s = sin(a);
      const dir = { x: direct.x * c - direct.y * s, y: direct.x * s + direct.y * c };
      if (firstHit(dir) === null) return { dir, blockedAt, boxedIn: false };
    }
  }
  return { dir: direct, blockedAt, boxedIn: true };
}

/**
 * Flies a cruise order: burn toward the destination, coast, flip, brake on the main
 * engine and stop `stopRadius` short of it, steering around what lies on the course.
 * It only sets thruster throttles, like every other assist.
 */
export function cruiseControl(world: World, id: EntityId, ship: Ship, body: Body, order: CruiseOrder, dt: number, rules: CruiseRules = CRUISE_RULES): CruisePhase {
  const { output, definition } = ship;
  const movement = definition.movement;
  const mass = body.mass;
  const deceleration = movement.mainThrust / mass;
  const reverseDeceleration = movement.reverseThrust / mass;
  const dx = order.to.x - body.position.x;
  const dy = order.to.y - body.position.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const remaining = distance - order.stopRadius;
  const v = body.velocity;
  const speed = Math.sqrt(v.x * v.x + v.y * v.y);
  // Already nose to the motion, the brake burn needs no flip first.
  const facingRetro = speed > rules.arrivalSpeed && Math.abs(wrapAngle(body.angle - atan2(-v.y, -v.x))) < RETRO_FACING;
  const flip = facingRetro ? 0 : flipTime(ship, body, rules);
  // Fastest closing speed that still stops inside `room`: the main engine after a flip,
  // or the weaker reverse thrusters straight away, whichever allows more.
  const stoppable = (room: number, closingSpeed: number) =>
    Math.max(plannedSpeed(room, closingSpeed, deceleration, flip, rules), plannedSpeed(room, 0, reverseDeceleration, 0, rules));

  let desired: Vec2 = { x: 0, y: 0 };
  let blocked = false;
  let closing = 0;
  if (remaining > 0 && distance > 1e-6) {
    const direct = { x: dx / distance, y: dy / distance };
    closing = v.x * direct.x + v.y * direct.y;
    const collider = world.colliders.get(id);
    const radius = (collider?.bound ?? definition.hull.length / 2) + rules.clearance;
    // Look at least as far as the ship needs to flip and stop from its present speed.
    const stopping = speed * flipTime(ship, body, rules) + (speed * speed) / (2 * deceleration * rules.brakeMargin);
    const lookAhead = Math.max(rules.minLookAhead, speed * rules.lookAheadSeconds, stopping + radius);
    const reach = Math.min(remaining, lookAhead);
    const course = chooseCourse(world, id, body, direct, reach, radius, rules);
    let want = stoppable(remaining, closing);
    if (course.boxedIn) {
      blocked = true;
      want = Math.min(want, stoppable(course.blockedAt!, closing));
    }
    desired = { x: course.dir.x * want, y: course.dir.y * want };
    // Whatever the course, the ship may only keep as much speed toward what lies on its
    // present track as it can still brake away before reaching it.
    if (speed > rules.arrivalSpeed) {
      const track = { x: v.x / speed, y: v.y / speed };
      const ahead = firstHitAlong(world, id, body, track, lookAhead, radius);
      if (ahead !== null) {
        const cap = stoppable(ahead, speed);
        const along = desired.x * track.x + desired.y * track.y;
        if (along > cap) {
          desired = { x: desired.x - track.x * (along - cap), y: desired.y - track.y * (along - cap) };
        }
      }
    }
  }

  const error = { x: desired.x - v.x, y: desired.y - v.y };
  const errorSize = Math.sqrt(error.x * error.x + error.y * error.y);
  const forward = forwardOf(body.angle);

  // Every thruster trims its own axis of the velocity error, so none pushes the wrong way.
  const local = worldToLocal(forward, error);
  const force = (component: number) => (component * mass) / dt;
  output.main = local.x > 0 ? clamp(force(local.x) / movement.mainThrust, 0, 1) : 0;
  output.reverse = local.x < 0 ? clamp(force(-local.x) / movement.reverseThrust, 0, 1) : 0;
  output.lateral = clamp(force(local.y) / movement.lateralThrust, -1, 1);
  output.boosting = false;

  // The nose goes where the big burn is needed. While coasting it turns early to face
  // the braking burn, so the flip is done before the brake point.
  let heading: number;
  if (errorSize > deceleration * TRIM_SECONDS) {
    heading = atan2(error.y, error.x);
  } else if (remaining > 0 && speed > rules.arrivalSpeed) {
    const soon = stoppable(remaining - closing * flip, closing);
    heading = soon < closing ? atan2(-v.y, -v.x) : atan2(v.y, v.x);
  } else {
    heading = remaining > 0 ? atan2(dy, dx) : body.angle;
  }

  // The phase names what the ship is visibly doing, for the HUD.
  let phase: CruisePhase;
  const slowing = speed > rules.arrivalSpeed && Math.sqrt(desired.x * desired.x + desired.y * desired.y) < speed - 1;
  const aligned = Math.abs(wrapAngle(heading - body.angle)) < ALIGNED;
  const noseBack = speed > rules.arrivalSpeed && Math.abs(wrapAngle(body.angle - atan2(-v.y, -v.x))) < PI / 4;
  if (remaining <= 0 && speed < rules.arrivalSpeed) phase = 'arrived';
  else if (slowing || noseBack) phase = !aligned ? 'flip' : output.main > 0.05 || output.reverse > 0.05 ? 'brake' : 'coast';
  else if (output.main > 0.05 || !aligned) phase = 'burn';
  else phase = 'coast';
  if (blocked && speed < rules.arrivalSpeed) phase = 'blocked';
  output.rotation = steerTo(ship, body, heading, dt);
  return phase;
}
