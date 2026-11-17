import {
  BOSS_RULES,
  getShip,
  type BossDefinition,
  type BossRules,
  type ShipDefinition,
} from "@void-frontier/content";
import { spawnEncounter } from "./ai.ts";
import { earnMerit } from "./career.ts";
import { dropSalvage } from "./mining.ts";
import type { EntityId, SimEvent } from "./types.ts";
import type { World } from "./world.ts";

/**
 * Sector bosses. Each sector but the first has a lair with one boss. A boss is a hull made
 * much tougher whose guard turns most weapon damage away; the fight is finding the moment
 * it opens up, and that moment comes from the physics of its sector:
 *
 * - `impact`: it charges and cannot steer around rocks; dodge so it slams one at speed.
 * - `well`: its shield projector fails near a gravity well's core; draw it in.
 * - `guard`: escorts feed its shield; while they are all down it is open.
 * - `overheat`: its guns run hot; while one is locked out to cool it is open.
 *
 * At hull thresholds it calls in help and pushes harder. Beating it pays well; it is back
 * in its lair some game hours later. The log of beaten bosses lives on the contract board
 * like standing, so it survives jumps and saves.
 */
export interface BossState {
  id: string;
  ship: EntityId;
  /** Phases already reached (0: none). */
  phase: number;
  /** Tick the current opening ends. */
  openUntil: number;
  /** Escorts feeding a `guard` boss's shield. */
  guard: EntityId[];
}

const TICKS_PER_HOUR = 60 * 3600;

export const getBoss = (
  id: string,
  rules: BossRules = BOSS_RULES,
): BossDefinition => {
  const boss = rules.bosses.find((b) => b.id === id);
  if (!boss) throw new Error(`Unknown boss ${id}`);
  return boss;
};

/** The boss whose lair is in `sector`, if any. */
export const sectorBoss = (
  sector: string,
  rules: BossRules = BOSS_RULES,
): BossDefinition | null =>
  rules.bosses.find((b) => b.sector === sector) ?? null;

type Stats = BossDefinition["stats"];

function scaled(base: ShipDefinition, stats: Stats): ShipDefinition {
  const d = structuredClone(base);
  d.hull.integrity *= stats.hull ?? 1;
  d.hull.dryMass *= stats.mass ?? 1;
  d.shield.capacity *= stats.shield ?? 1;
  d.movement.mainThrust *= stats.thrust ?? 1;
  d.movement.reverseThrust *= stats.thrust ?? 1;
  d.movement.lateralThrust *= stats.thrust ?? 1;
  return d;
}

function hitHarder(world: World, shipId: EntityId, damage: number): void {
  if (damage === 1) return;
  for (const mount of world.ships.get(shipId)?.weapons ?? []) {
    const weapon = mount.definition;
    if (weapon.kind === "projectile" || weapon.kind === "missile")
      mount.definition = { ...weapon, damage: weapon.damage * damage };
    else if (weapon.kind === "beam")
      mount.definition = {
        ...weapon,
        damagePerSecond: weapon.damagePerSecond * damage,
      };
  }
}

/** Pirates called in by the boss, already hunting `target`. */
function summon(
  world: World,
  boss: BossState,
  ship: string,
  count: number,
  target: EntityId | null,
  tag: string,
): EntityId[] {
  const at = world.bodies.get(boss.ship)?.position;
  if (!at) return [];
  const spot = { x: at.x + 260, y: at.y - 160 };
  const members = spawnEncounter(world, {
    id: `${boss.id}_${tag}`,
    ship: getShip(ship).id,
    faction: "pirate",
    count,
    spawn: spot,
    patrol: [[spot.x, spot.y]],
    respawnDelay: 1e6,
  });
  for (const id of members) {
    const pilot = world.pilots.get(id);
    if (pilot && target !== null && world.ships.has(target)) {
      pilot.target = target;
      pilot.mode = "engage";
    }
  }
  return members;
}

/** Puts the boss of `definition` in its lair now. */
export function spawnBoss(world: World, definition: BossDefinition): BossState {
  const { x, y } = definition;
  const [id] = spawnEncounter(world, {
    id: `boss_${definition.id}`,
    ship: definition.ship,
    faction: "pirate",
    count: 1,
    spawn: { x, y },
    // It prowls a short beat around its lair.
    patrol: [
      [x, y],
      [x + 350, y],
      [x + 350, y + 350],
      [x, y + 350],
    ],
    respawnDelay: 1e6,
    archetype: definition.archetype,
    loadout: definition.loadout,
  });
  const ship = world.ships.get(id)!;
  ship.definition = scaled(ship.definition, definition.stats);
  hitHarder(world, id, definition.stats.damage ?? 1);
  ship.hull = ship.definition.hull.integrity;
  ship.shield = ship.definition.shield.capacity;
  ship.boss = { id: definition.id, open: false };
  const pilot = world.pilots.get(id)!;
  if (definition.reckless) pilot.reckless = true;
  const state: BossState = {
    id: definition.id,
    ship: id,
    phase: 0,
    openUntil: 0,
    guard: [],
  };
  if (definition.trigger.kind === "guard")
    state.guard = summon(
      world,
      state,
      definition.trigger.ship,
      definition.trigger.count,
      null,
      "guard",
    );
  world.bosses.push(state);
  world.events.push({
    type: "boss",
    boss: definition.id,
    ship: id,
    stage: "spawned",
    phase: 0,
    credits: 0,
  });
  return state;
}

/** Whether a beaten boss is back: never beaten, or beaten long enough ago. */
export function bossReady(
  world: World,
  definition: BossDefinition,
  rules: BossRules = BOSS_RULES,
): boolean {
  const beaten = world.bossLog[definition.id];
  return (
    beaten === undefined ||
    world.tick - beaten >= rules.respawnHours * TICKS_PER_HOUR
  );
}

const alive = (world: World, id: EntityId) => {
  const ship = world.ships.get(id);
  return !!ship && !ship.destroyed && !ship.surrendered;
};

/** Whether the boss's own trick has it open this step. */
function opening(
  world: World,
  state: BossState,
  definition: BossDefinition,
  events: SimEvent[],
  dt: number,
): boolean {
  const trigger = definition.trigger;
  const body = world.bodies.get(state.ship);
  const ship = world.ships.get(state.ship);
  if (!body || !ship) return false;
  const hold = (seconds: number) => {
    state.openUntil = Math.max(
      state.openUntil,
      world.tick + Math.round(seconds / dt),
    );
  };
  if (trigger.kind === "guard")
    return !state.guard.some((id) => alive(world, id));
  if (trigger.kind === "impact") {
    for (const event of events) {
      if (event.type !== "collision" || event.speed < trigger.speed) continue;
      const other =
        event.a === state.ship
          ? event.b
          : event.b === state.ship
            ? event.a
            : null;
      if (other !== null && world.asteroids.has(other)) hold(trigger.seconds);
    }
  } else if (trigger.kind === "well") {
    for (const well of world.anomalies) {
      const dx = body.position.x - well.position.x;
      const dy = body.position.y - well.position.y;
      const reach = well.coreRadius + trigger.margin;
      if (dx * dx + dy * dy <= reach * reach) hold(trigger.seconds);
    }
  } else if (ship.weapons.some((w) => w.overheated)) hold(trigger.seconds);
  return world.tick < state.openUntil;
}

/**
 * Spawns the sector's boss when its lair is due, opens and closes its guard, and moves it
 * through its phases. Runs after the fight systems; `events` are this step's.
 */
export function bossSystem(
  world: World,
  playerId: EntityId,
  events: SimEvent[],
  dt: number,
  rules: BossRules = BOSS_RULES,
): void {
  const lair = sectorBoss(world.sectorId, rules);
  if (
    lair &&
    !world.hostilesHeld &&
    !world.bosses.some((b) => b.id === lair.id) &&
    bossReady(world, lair, rules)
  )
    spawnBoss(world, lair);

  for (let i = world.bosses.length - 1; i >= 0; i--) {
    const state = world.bosses[i];
    const ship = world.ships.get(state.ship);
    if (!ship || ship.destroyed) {
      world.bosses.splice(i, 1);
      continue;
    }
    const definition = getBoss(state.id, rules);
    const open = opening(world, state, definition, events, dt);
    if (open !== ship.boss!.open) {
      ship.boss!.open = open;
      world.events.push({
        type: "boss",
        boss: state.id,
        ship: state.ship,
        stage: open ? "open" : "guarded",
        phase: state.phase,
        credits: 0,
      });
    }
    const share = ship.hull / ship.definition.hull.integrity;
    const next = definition.phases[state.phase];
    if (next && share < next.below) {
      state.phase++;
      ship.definition = scaled(ship.definition, {
        thrust: next.thrust,
        shield: next.shield,
        mass: next.mass,
      });
      hitHarder(world, state.ship, next.damage ?? 1);
      if (next.summon) {
        const hunter = world.pilots.get(state.ship)?.target ?? playerId;
        const called = summon(
          world,
          state,
          next.summon.ship,
          next.summon.count,
          hunter,
          `phase${state.phase}`,
        );
        // A guard boss's new escorts close its shield again.
        if (definition.trigger.kind === "guard") state.guard = called;
      }
      world.events.push({
        type: "boss",
        boss: state.id,
        ship: state.ship,
        stage: "phase",
        phase: state.phase,
        credits: 0,
      });
    }
  }
}

/** A boss going down: logged for its respawn, and the player's side is paid. Called by `destroyShip`. */
export function bossDefeated(
  world: World,
  id: EntityId,
  byPlayer: boolean,
  rules: BossRules = BOSS_RULES,
): void {
  const ship = world.ships.get(id);
  const body = world.bodies.get(id);
  if (!ship?.boss || !body) return;
  const definition = getBoss(ship.boss.id, rules);
  world.bossLog[definition.id] = world.tick;
  let credits = 0;
  if (byPlayer) {
    credits = definition.reward.credits;
    world.credits += credits;
    earnMerit(world, definition.reward.merit);
    for (let i = 0; i < definition.reward.salvage; i++)
      dropSalvage(world, body.position, body.velocity);
  }
  const state = world.bosses.find((b) => b.ship === id);
  world.events.push({
    type: "boss",
    boss: definition.id,
    ship: id,
    stage: "defeated",
    phase: state?.phase ?? 0,
    credits,
  });
}

/** Weapon damage a boss lets through: all of it while open, a sliver while guarded. */
export const bossDamageShare = (
  world: World,
  id: EntityId,
  rules: BossRules = BOSS_RULES,
): number => {
  const boss = world.ships.get(id)?.boss;
  return !boss || boss.open ? 1 : rules.guardedShare;
};
