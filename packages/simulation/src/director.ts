import {
  DIRECTOR_RULES,
  INCIDENT_KINDS,
  type DirectorRules,
  type IncidentKind,
} from "@void-frontier/content";
import { TAU, cos, sin } from "@void-frontier/kernel";
import { spawnEncounter } from "./ai.ts";
import { hostilesNear } from "./combat.ts";
import { applyWeaponDamage } from "./damage.ts";
import { spawnPickup } from "./mining.ts";
import type { EntityId, IncidentStage, SimEvent } from "./types.ts";
import type { World } from "./world.ts";

/**
 * The encounter director: instead of fixed timers it reads how hot things are around the
 * player (hostiles near, damage traded, kills) as an intensity from 0 to 1, lets a peak
 * cool off for a while, and only drops an incident into a calm stretch. Incidents are
 * things that happen on screen: a distress call (sometimes a trap), a micrometeor storm,
 * a solar flare that strips shields from ships out of cover, a wreck about to blow.
 *
 * Incidents belong to the sector the player is in; they are not saved and end on a jump.
 */
export type DirectorPhase = "calm" | "build" | "peak" | "relax";

export interface Incident {
  id: number;
  kind: IncidentKind;
  /** `warning` runs before the incident proper (storm, flare); the rest start `active`. */
  stage: "warning" | "active";
  /** Where it is: the call, the wreck, or (storm and flare) the player when announced. */
  position: { x: number; y: number };
  /** Tick the current stage ends. */
  endTick: number;
  /** Storm flow, or the direction the flare comes from. */
  direction: { x: number; y: number };
  /** A distress call that is really pirates waiting. */
  trap: boolean;
  /** Salvage the wreck spilled, gone if still there when it blows. */
  pickups: EntityId[];
  /** Fractional rocks owed by the storm. */
  owed: number;
}

export interface Director {
  intensity: number;
  phase: DirectorPhase;
  /** Tick the breathing room after a peak ends. */
  relaxUntil: number;
  /** Calm seconds since the last incident ended. */
  calm: number;
  /** Calm seconds the next incident waits for. */
  gap: number;
  incident: Incident | null;
  nextId: number;
  /** Ships the flare caught out of cover, refreshed while it burns. */
  exposed: EntityId[];
}

export const createDirector = (
  rules: DirectorRules = DIRECTOR_RULES,
): Director => ({
  intensity: 0,
  phase: "calm",
  relaxUntil: 0,
  calm: 0,
  gap: rules.pacing.firstIncident,
  incident: null,
  nextId: 1,
  exposed: [],
});

function emit(
  world: World,
  incident: Incident,
  stage: IncidentStage,
  credits = 0,
): void {
  world.events.push({
    type: "incident",
    id: incident.id,
    kind: incident.kind,
    stage,
    position: { ...incident.position },
    credits,
  });
}

/** The player's ship in open space, or null while docked, dead or absent. */
function flying(world: World, playerId: EntityId) {
  const ship = world.ships.get(playerId);
  const body = world.bodies.get(playerId);
  if (!ship || !body || ship.destroyed || ship.docked !== null) return null;
  return body;
}

/** Rises with the fight around the player, falls when it is over. */
function updateIntensity(
  world: World,
  director: Director,
  playerId: EntityId,
  events: SimEvent[],
  dt: number,
  rules: DirectorRules,
): void {
  const r = rules.intensity;
  let rise = 0;
  for (const event of events) {
    if (event.type === "hit" && event.target === playerId)
      rise += (event.shieldDamage + event.hullDamage) * r.damageTaken;
    else if (
      event.type === "hit" &&
      event.attacker === playerId &&
      world.ships.has(event.target)
    )
      rise += (event.shieldDamage + event.hullDamage) * r.damageDealt;
    else if (
      event.type === "shipDestroyed" &&
      event.by === playerId &&
      event.id !== playerId
    )
      rise += r.kill;
  }
  const near = flying(world, playerId)
    ? Math.min(
        r.maxHostiles,
        hostilesNear(world, playerId, r.hostileRange).length,
      )
    : 0;
  rise += near * r.hostilePerSecond * dt;
  const fall = near === 0 ? r.decayPerSecond * dt : 0;
  director.intensity = Math.max(
    0,
    Math.min(1, director.intensity + rise - fall),
  );
}

function updatePhase(
  world: World,
  director: Director,
  dt: number,
  rules: DirectorRules,
): void {
  const p = rules.pacing;
  const level = director.intensity;
  if (level >= p.peakAbove) director.phase = "peak";
  else if (director.phase === "peak" && level < p.calmBelow) {
    director.phase = "relax";
    director.relaxUntil = world.tick + Math.round(p.relaxSeconds / dt);
  } else if (director.phase === "relax") {
    if (level >= p.calmBelow) director.phase = "build";
    else if (world.tick >= director.relaxUntil) director.phase = "calm";
  } else if (director.phase !== "peak")
    director.phase = level < p.calmBelow ? "calm" : "build";
}

/** The kind of incident a sector throws next, by its weights; null where there are none. */
function pickKind(world: World, rules: DirectorRules): IncidentKind | null {
  const sector = rules.sectors[world.sectorId];
  if (!sector) return null;
  const total = INCIDENT_KINDS.reduce(
    (sum, kind) => sum + (sector.weights[kind] ?? 0),
    0,
  );
  if (total <= 0) return null;
  let roll = world.rng.next() * total;
  for (const kind of INCIDENT_KINDS) {
    roll -= sector.weights[kind] ?? 0;
    if (roll < 0) return kind;
  }
  return null;
}

/** A point `distance` from `from` clear of rocks and stations, or the last try if none is. */
function openPoint(
  world: World,
  from: { x: number; y: number },
  range: readonly [number, number],
): { x: number; y: number } {
  let point = from;
  for (let attempt = 0; attempt < 8; attempt++) {
    const angle = world.rng.next() * TAU;
    const distance = world.rng.range(range[0], range[1]);
    point = {
      x: from.x + cos(angle) * distance,
      y: from.y + sin(angle) * distance,
    };
    let clear = true;
    for (const [id, collider] of world.colliders) {
      if (world.ships.has(id)) continue;
      const p = world.bodies.get(id)?.position;
      if (!p) continue;
      const margin = collider.bound + (world.stations.has(id) ? 250 : 60);
      if ((p.x - point.x) ** 2 + (p.y - point.y) ** 2 < margin * margin) {
        clear = false;
        break;
      }
    }
    if (clear) break;
  }
  return point;
}

/** Starts an incident of `kind` around the player now. Returns null when the player is not in flight. */
export function startIncident(
  world: World,
  playerId: EntityId,
  kind: IncidentKind,
  dt: number,
  rules: DirectorRules = DIRECTOR_RULES,
): Incident | null {
  const body = flying(world, playerId);
  const director = world.director;
  if (!body || director.incident) return null;
  const angle = world.rng.next() * TAU;
  const incident: Incident = {
    id: director.nextId++,
    kind,
    stage: "active",
    position: { ...body.position },
    endTick: world.tick,
    direction: { x: cos(angle), y: sin(angle) },
    trap: false,
    pickups: [],
    owed: 0,
  };
  const ticks = (seconds: number) => Math.round(seconds / dt);
  if (kind === "distress") {
    const r = rules.distress;
    incident.position = openPoint(world, body.position, r.distance);
    incident.trap =
      world.rng.next() < (rules.sectors[world.sectorId]?.danger ?? 0);
    incident.endTick = world.tick + ticks(r.lifetime);
  } else if (kind === "unstableWreck") {
    const r = rules.unstableWreck;
    incident.position = openPoint(world, body.position, r.distance);
    for (let i = 0; i < r.pickups; i++) {
      const a = world.rng.next() * TAU;
      const d = world.rng.next() * r.scatter;
      const at = {
        x: incident.position.x + cos(a) * d,
        y: incident.position.y + sin(a) * d,
      };
      incident.pickups.push(
        spawnPickup(world, r.resource, r.units, at, {
          x: cos(a) * 2,
          y: sin(a) * 2,
        }),
      );
    }
    incident.endTick = world.tick + ticks(r.fuse);
  } else {
    const warning =
      kind === "meteorStorm"
        ? rules.meteorStorm.warning
        : rules.solarFlare.warning;
    incident.stage = "warning";
    incident.endTick = world.tick + ticks(warning);
  }
  director.incident = incident;
  emit(world, incident, incident.stage === "warning" ? "warning" : "started");
  return incident;
}

function finish(
  world: World,
  director: Director,
  stage: IncidentStage,
  credits = 0,
): void {
  const incident = director.incident!;
  emit(world, incident, stage, credits);
  director.incident = null;
  director.exposed = [];
  director.calm = 0;
}

/** Whether a rock or station sunward of `at` shades it from a flare coming from `sun`. */
export function inShadow(
  world: World,
  at: { x: number; y: number },
  sun: { x: number; y: number },
  rules: DirectorRules = DIRECTOR_RULES,
): boolean {
  const r = rules.solarFlare;
  const blocks = (centre: { x: number; y: number }, radius: number) => {
    const dx = centre.x - at.x;
    const dy = centre.y - at.y;
    const along = dx * sun.x + dy * sun.y;
    if (along <= 0 || along > r.coverRange) return false;
    const across = Math.abs(dx * sun.y - dy * sun.x);
    return across < radius;
  };
  for (const [id, rock] of world.asteroids) {
    if (rock.radius < r.minCoverRadius) continue;
    const p = world.bodies.get(id)?.position;
    if (p && blocks(p, rock.radius)) return true;
  }
  for (const id of world.stations.keys()) {
    const p = world.bodies.get(id)?.position;
    const collider = world.colliders.get(id);
    if (p && collider && blocks(p, collider.bound)) return true;
  }
  return false;
}

function exposedShips(
  world: World,
  sun: { x: number; y: number },
  rules: DirectorRules,
): EntityId[] {
  const out: EntityId[] = [];
  for (const [id, ship] of world.ships) {
    if (ship.destroyed || ship.docked !== null) continue;
    const p = world.bodies.get(id)?.position;
    if (p && !inShadow(world, p, sun, rules)) out.push(id);
  }
  return out;
}

function runIncident(
  world: World,
  director: Director,
  playerId: EntityId,
  dt: number,
  rules: DirectorRules,
): void {
  const incident = director.incident!;
  const body = world.bodies.get(playerId);
  const ticks = (seconds: number) => Math.round(seconds / dt);
  if (incident.stage === "warning") {
    if (world.tick < incident.endTick) return;
    incident.stage = "active";
    incident.endTick =
      world.tick +
      ticks(
        incident.kind === "meteorStorm"
          ? rules.meteorStorm.duration
          : rules.solarFlare.duration,
      );
    if (body) incident.position = { ...body.position };
    if (incident.kind === "solarFlare")
      director.exposed = exposedShips(world, incident.direction, rules);
    emit(world, incident, "started");
  }

  if (incident.kind === "distress") {
    const r = rules.distress;
    const me = flying(world, playerId);
    if (
      me &&
      (me.position.x - incident.position.x) ** 2 +
        (me.position.y - incident.position.y) ** 2 <=
        r.reachRadius * r.reachRadius
    ) {
      if (incident.trap) {
        // The "survivors" were bait: a pirate pack lights up around the beacon.
        const a = world.rng.next() * TAU;
        const at = {
          x: me.position.x + cos(a) * r.ambush.distance,
          y: me.position.y + sin(a) * r.ambush.distance,
        };
        const members = spawnEncounter(world, {
          id: `ambush_${incident.id}`,
          ship: r.ambush.ship,
          faction: "pirate",
          count: r.ambush.count,
          spawn: at,
          patrol: [[at.x, at.y]],
          respawnDelay: 1e6,
        });
        for (const id of members) {
          const pilot = world.pilots.get(id);
          if (pilot) {
            pilot.target = playerId;
            pilot.mode = "engage";
          }
        }
        finish(world, director, "ambush");
      } else {
        world.credits += r.credits;
        if (r.units > 0)
          spawnPickup(world, r.resource, r.units, incident.position, {
            x: 0,
            y: 0,
          });
        finish(world, director, "resolved", r.credits);
      }
      return;
    }
    if (world.tick >= incident.endTick) finish(world, director, "expired");
    return;
  }

  if (incident.kind === "unstableWreck") {
    if (world.tick < incident.endTick) return;
    const r = rules.unstableWreck;
    for (const [id, ship] of world.ships) {
      if (ship.destroyed || ship.docked !== null) continue;
      const p = world.bodies.get(id)!.position;
      const dx = p.x - incident.position.x;
      const dy = p.y - incident.position.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d >= r.blastRadius) continue;
      const falloff = 1 - d / r.blastRadius;
      applyWeaponDamage(
        world,
        id,
        -1,
        r.blastDamage * falloff,
        { shield: 1, hull: 1 },
        { ...incident.position },
        false,
      );
    }
    for (const id of incident.pickups) world.pickups.delete(id);
    finish(world, director, "detonated");
    return;
  }

  if (incident.kind === "meteorStorm") {
    const r = rules.meteorStorm;
    if (body) {
      const flow = incident.direction;
      incident.owed += r.perSecond * dt;
      while (incident.owed >= 1) {
        incident.owed -= 1;
        const across = world.rng.range(-r.width / 2, r.width / 2);
        const speed = world.rng.range(r.speed[0], r.speed[1]);
        // The stream is laid across the player's own motion, so it crosses them however fast they fly.
        const position = {
          x: body.position.x - flow.x * r.upstream - flow.y * across,
          y: body.position.y - flow.y * r.upstream + flow.x * across,
        };
        world.projectiles.set(world.createEntity(), {
          owner: -1,
          position,
          velocity: {
            x: flow.x * speed + body.velocity.x,
            y: flow.y * speed + body.velocity.y,
          },
          life: (r.upstream * 2) / speed,
          damage: r.damage,
          multipliers: { ...r.multipliers },
          meteor: true,
        });
      }
    }
    if (world.tick >= incident.endTick) finish(world, director, "ended");
    return;
  }

  // Solar flare: shields of every ship out of cover are stripped while it burns.
  if (world.tick % 15 === 0)
    director.exposed = exposedShips(world, incident.direction, rules);
  for (const id of director.exposed) {
    const ship = world.ships.get(id);
    if (ship && !ship.destroyed && ship.docked === null) ship.shield = 0;
  }
  if (world.tick >= incident.endTick) finish(world, director, "ended");
}

/**
 * Runs after the fight systems each step. `events` are the ones this step produced.
 * Held hostiles (the guided first sortie) hold the director too.
 */
export function directorSystem(
  world: World,
  playerId: EntityId,
  events: SimEvent[],
  dt: number,
  rules: DirectorRules = DIRECTOR_RULES,
): void {
  const director = world.director;
  updateIntensity(world, director, playerId, events, dt, rules);
  updatePhase(world, director, dt, rules);
  if (director.incident) {
    runIncident(world, director, playerId, dt, rules);
    return;
  }
  if (
    world.hostilesHeld ||
    director.phase !== "calm" ||
    !flying(world, playerId)
  )
    return;
  director.calm += dt;
  if (director.calm < director.gap) return;
  const kind = pickKind(world, rules);
  director.calm = 0;
  director.gap = world.rng.range(rules.pacing.gap[0], rules.pacing.gap[1]);
  if (kind) startIncident(world, playerId, kind, dt, rules);
}
