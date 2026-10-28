import type { CollisionRules } from '@void-frontier/content';
import { cos, sin } from '@void-frontier/kernel';
import type { Body, Collider, EntityId } from '../types.ts';
import { destroyShip } from '../damage.ts';
import { SpatialIndex } from '../spatial.ts';
import type { World } from '../world.ts';

const CELL = 96;

interface Entry {
  id: EntityId;
  body: Body;
  collider: Collider;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface Contact {
  /** unit normal pointing from B toward A */
  nx: number;
  ny: number;
  /** contact point in world space */
  px: number;
  py: number;
  /** overlap depth after any time-of-impact rewind */
  depth: number;
  /** fraction of the step at which contact begins; 1 for resting overlap */
  toi: number;
}

/**
 * Detects and resolves contacts between colliders after integration.
 *
 * - Broad phase: uniform grid over each body's swept bounding box.
 * - Narrow phase: circle pairs. Fast movers use a swept test (continuous collision
 *   detection), so a ship at full burn cannot tunnel through a small rock.
 * - Response: impulse with restitution and Coulomb friction, including spin for
 *   off-centre hits, then a positional push-out.
 * - Damage: impact energy above the safe speed, applied to ships in the pair.
 */
export function collisionSystem(world: World, rules: CollisionRules): void {
  const entries: Entry[] = [];
  for (const [id, collider] of world.colliders) {
    const body = world.bodies.get(id);
    if (!body) continue;
    const r = collider.bound;
    entries.push({
      id,
      body,
      collider,
      minX: Math.min(body.position.x, body.previousPosition.x) - r,
      minY: Math.min(body.position.y, body.previousPosition.y) - r,
      maxX: Math.max(body.position.x, body.previousPosition.x) + r,
      maxY: Math.max(body.position.y, body.previousPosition.y) + r,
    });
  }

  const spatial = new SpatialIndex(CELL);
  for (const entry of entries) spatial.insert(entry.id, entry.minX, entry.minY, entry.maxX, entry.maxY);
  world.spatial = spatial;

  const grid = new Map<number, number[]>();
  const key = (cx: number, cy: number) => cx * 92821 + cy;
  entries.forEach((entry, index) => {
    for (let cx = Math.floor(entry.minX / CELL); cx <= Math.floor(entry.maxX / CELL); cx++) {
      for (let cy = Math.floor(entry.minY / CELL); cy <= Math.floor(entry.maxY / CELL); cy++) {
        const k = key(cx, cy);
        const cell = grid.get(k);
        if (cell) cell.push(index);
        else grid.set(k, [index]);
      }
    }
  });

  const tested = new Set<number>();
  for (let i = 0; i < entries.length; i++) {
    const a = entries[i];
    const candidates: number[] = [];
    for (let cx = Math.floor(a.minX / CELL); cx <= Math.floor(a.maxX / CELL); cx++) {
      for (let cy = Math.floor(a.minY / CELL); cy <= Math.floor(a.maxY / CELL); cy++) {
        for (const j of grid.get(key(cx, cy)) ?? []) {
          if (j <= i) continue;
          const pairKey = i * entries.length + j;
          if (tested.has(pairKey)) continue;
          tested.add(pairKey);
          candidates.push(j);
        }
      }
    }
    candidates.sort((x, y) => x - y);
    for (const j of candidates) {
      const b = entries[j];
      if (a.maxX < b.minX || b.maxX < a.minX || a.maxY < b.minY || b.maxY < a.minY) continue;
      const aMoves = a.body.mass !== Infinity;
      const bMoves = b.body.mass !== Infinity;
      if (!aMoves && !bMoves) continue;
      const contact = findContact(a, b);
      if (contact) resolve(world, rules, a, b, contact);
    }
  }
}

function worldCircle(body: Body, c: { x: number; y: number }, position: { x: number; y: number }): { x: number; y: number } {
  if (c.x === 0 && c.y === 0) return { x: position.x, y: position.y };
  const ca = cos(body.angle);
  const sa = sin(body.angle);
  return { x: position.x + c.x * ca - c.y * sa, y: position.y + c.x * sa + c.y * ca };
}

function findContact(a: Entry, b: Entry): Contact | null {
  let best: Contact | null = null;
  for (const ca of a.collider.circles) {
    const a1 = worldCircle(a.body, ca, a.body.position);
    const a0 = worldCircle(a.body, ca, a.body.previousPosition);
    for (const cb of b.collider.circles) {
      const b1 = worldCircle(b.body, cb, b.body.position);
      const radius = ca.r + cb.r;
      // Cheap reject on the end-of-step positions plus the relative sweep length.
      const ex = a1.x - b1.x;
      const ey = a1.y - b1.y;
      const b0 = worldCircle(b.body, cb, b.body.previousPosition);
      const sx = a1.x - a0.x - (b1.x - b0.x);
      const sy = a1.y - a0.y - (b1.y - b0.y);
      const sweep = Math.sqrt(sx * sx + sy * sy);
      const reach = radius + sweep;
      if (ex * ex + ey * ey > reach * reach) continue;

      let toi = 1;
      let rx = ex;
      let ry = ey;
      let dist = Math.sqrt(ex * ex + ey * ey);
      if (dist >= radius) {
        // Separated at the end of the step: did the relative path cross the contact circle?
        const r0x = a0.x - b0.x;
        const r0y = a0.y - b0.y;
        const qa = sx * sx + sy * sy;
        if (qa < 1e-12) continue;
        const qb = 2 * (r0x * sx + r0y * sy);
        const qc = r0x * r0x + r0y * r0y - radius * radius;
        if (qc < 0) continue;
        const disc = qb * qb - 4 * qa * qc;
        if (disc < 0) continue;
        const t = (-qb - Math.sqrt(disc)) / (2 * qa);
        if (t < 0 || t > 1) continue;
        toi = t;
        rx = r0x + sx * t;
        ry = r0y + sy * t;
        dist = Math.sqrt(rx * rx + ry * ry);
      }
      const nx = dist > 1e-9 ? rx / dist : 1;
      const ny = dist > 1e-9 ? ry / dist : 0;
      const depth = toi < 1 ? 0 : radius - dist;
      const bx = toi < 1 ? b0.x + (b1.x - b0.x) * toi : b1.x;
      const by = toi < 1 ? b0.y + (b1.y - b0.y) * toi : b1.y;
      const candidate: Contact = { nx, ny, px: bx + nx * cb.r, py: by + ny * cb.r, depth, toi };
      if (!best || candidate.toi < best.toi || (candidate.toi === best.toi && candidate.depth > best.depth)) best = candidate;
    }
  }
  return best;
}

function resolve(world: World, rules: CollisionRules, a: Entry, b: Entry, contact: Contact): void {
  const A = a.body;
  const B = b.body;

  // Rewind swept contacts to the moment of impact so nothing ends the step inside a rock.
  if (contact.toi < 1) {
    for (const body of [A, B]) {
      if (body.mass === Infinity) continue;
      body.position.x = body.previousPosition.x + (body.position.x - body.previousPosition.x) * contact.toi;
      body.position.y = body.previousPosition.y + (body.position.y - body.previousPosition.y) * contact.toi;
    }
  }

  const invMa = 1 / A.mass;
  const invMb = 1 / B.mass;
  const invIa = 1 / A.inertia;
  const invIb = 1 / B.inertia;
  const rax = contact.px - A.position.x;
  const ray = contact.py - A.position.y;
  const rbx = contact.px - B.position.x;
  const rby = contact.py - B.position.y;

  // Velocities of the contact point on each body (v + w x r).
  const vax = A.velocity.x - A.angularVelocity * ray;
  const vay = A.velocity.y + A.angularVelocity * rax;
  const vbx = B.velocity.x - B.angularVelocity * rby;
  const vby = B.velocity.y + B.angularVelocity * rbx;
  const rvx = vax - vbx;
  const rvy = vay - vby;
  const closing = -(rvx * contact.nx + rvy * contact.ny);

  if (closing > 0) {
    const raN = rax * contact.ny - ray * contact.nx;
    const rbN = rbx * contact.ny - rby * contact.nx;
    const normalMass = invMa + invMb + raN * raN * invIa + rbN * rbN * invIb;
    const j = ((1 + rules.restitution) * closing) / normalMass;
    applyImpulse(A, B, contact.nx * j, contact.ny * j, rax, ray, rbx, rby);

    // Friction along the tangent, capped by the Coulomb cone.
    const tx = -contact.ny;
    const ty = contact.nx;
    const slide = rvx * tx + rvy * ty;
    const raT = rax * ty - ray * tx;
    const rbT = rbx * ty - rby * tx;
    const tangentMass = invMa + invMb + raT * raT * invIa + rbT * rbT * invIb;
    let jt = -slide / tangentMass;
    const cap = rules.friction * j;
    jt = Math.max(-cap, Math.min(cap, jt));
    applyImpulse(A, B, tx * jt, ty * jt, rax, ray, rbx, rby);

    const damage = impactDamage(rules, closing, invMa + invMb);
    for (const id of [a.id, b.id]) {
      const ship = world.ships.get(id);
      if (!ship || ship.destroyed || damage <= 0) continue;
      ship.hull = Math.max(0, ship.hull - damage);
      if (ship.hull === 0) destroyShip(world, id, null);
    }
    if (closing > 0.5) {
      world.events.push({
        type: 'collision',
        a: a.id,
        b: b.id,
        point: { x: contact.px, y: contact.py },
        normal: { x: contact.nx, y: contact.ny },
        speed: closing,
        damage,
      });
    }
  }

  // Push apart whatever overlap remains, split by inverse mass.
  if (contact.depth > 0) {
    const share = invMa + invMb;
    const push = Math.max(0, contact.depth - 0.01) / share;
    A.position.x += contact.nx * push * invMa;
    A.position.y += contact.ny * push * invMa;
    B.position.x -= contact.nx * push * invMb;
    B.position.y -= contact.ny * push * invMb;
  }
}

function applyImpulse(A: Body, B: Body, jx: number, jy: number, rax: number, ray: number, rbx: number, rby: number): void {
  if (A.mass !== Infinity) {
    A.velocity.x += jx / A.mass;
    A.velocity.y += jy / A.mass;
    A.angularVelocity += (rax * jy - ray * jx) / A.inertia;
  }
  if (B.mass !== Infinity) {
    B.velocity.x -= jx / B.mass;
    B.velocity.y -= jy / B.mass;
    B.angularVelocity -= (rbx * jy - rby * jx) / B.inertia;
  }
}

/** Hull damage from the kinetic energy of the closing motion above the safe speed. */
export function impactDamage(rules: CollisionRules, closingSpeed: number, inverseMassSum: number): number {
  if (closingSpeed <= rules.safeImpactSpeed) return 0;
  const reducedMass = 1 / inverseMassSum;
  const joules = 0.5 * reducedMass * (closingSpeed * closingSpeed - rules.safeImpactSpeed * rules.safeImpactSpeed);
  return (joules / 1000) * rules.hullDamagePerKilojoule;
}
