import {
  PIRATE_RULES,
  type PirateRules,
  type ShipDefinition,
} from "@void-frontier/content";
import { applyWeaponDamage } from "./damage.ts";
import type { EntityId } from "./types.ts";
import type { World } from "./world.ts";

type EliteRules = PirateRules["elites"];
type Affix = EliteRules["affixes"][number];

/**
 * Elite pirates: when a group spawns, its leader may roll affixes for the sector it is in.
 * Each affix changes the hull's effective stats (tougher, faster, quicker shields,
 * harder-hitting guns), makes the crew fight to the end, or rigs the core to blow. An
 * elite pays a bounty, merit and extra salvage when the player's side brings it down.
 *
 * The roll is a hash of the sector, the group and the tick rather than a draw from the
 * world RNG, so adding elites leaves every other random sequence as it was.
 */
export interface Elite {
  affixes: string[];
  /** never flees or surrenders */
  fearless: boolean;
}

/** FNV-1a over a string, as a fraction in [0, 1). */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  }
  // A final avalanche so nearby keys land far apart; `>>> 0` keeps it unsigned.
  h = Math.imul((h ^ (h >>> 16)) >>> 0, 0x85ebca6b) >>> 0;
  h = Math.imul((h ^ (h >>> 13)) >>> 0, 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

/** The affixes a group spawning now in this sector rolls, or none. */
export function rollElite(
  world: World,
  groupId: string,
  rules: EliteRules = PIRATE_RULES.elites,
): string[] {
  const sector = rules.sectors[world.sectorId];
  if (!sector || sector.chance <= 0) return [];
  const key = `${world.sectorId}:${groupId}:${world.tick}`;
  if (hash(key) >= sector.chance) return [];
  const pool = rules.affixes.map((a) => a.id);
  const picked: string[] = [];
  for (let i = 0; i < sector.affixes && pool.length > 0; i++) {
    const index = Math.floor(hash(`${key}:${i}`) * pool.length);
    picked.push(pool.splice(index, 1)[0]);
  }
  return picked;
}

/** The hull's stats with every affix applied. */
export function eliteDefinition(
  base: ShipDefinition,
  affixes: Affix[],
): ShipDefinition {
  const d = structuredClone(base);
  for (const a of affixes) {
    d.hull.integrity *= a.hull ?? 1;
    d.hull.armor = Math.min(0.8, d.hull.armor + (a.armor ?? 0));
    d.hull.dryMass *= a.mass ?? 1;
    d.movement.mainThrust *= a.thrust ?? 1;
    d.movement.reverseThrust *= a.thrust ?? 1;
    d.movement.lateralThrust *= a.thrust ?? 1;
    d.movement.rotationalTorque *= a.turn ?? 1;
    d.movement.maxAngularVelocity *= a.turn ?? 1;
    d.shield.capacity *= a.shield ?? 1;
    d.shield.rechargeRate *= a.shieldRecharge ?? 1;
    d.shield.rechargeDelay *= a.shieldDelay ?? 1;
  }
  return d;
}

/** Turns a spawned pirate into an elite with `affixes`. */
export function makeElite(
  world: World,
  shipId: EntityId,
  affixIds: string[],
  rules: EliteRules = PIRATE_RULES.elites,
): void {
  const ship = world.ships.get(shipId);
  if (!ship || affixIds.length === 0) return;
  const affixes = affixIds.map((id) => {
    const affix = rules.affixes.find((a) => a.id === id);
    if (!affix) throw new Error(`Unknown elite affix ${id}`);
    return affix;
  });
  ship.definition = eliteDefinition(ship.definition, affixes);
  for (const mount of ship.weapons) {
    let weapon = mount.definition;
    for (const a of affixes) {
      const damage = a.damage ?? 1;
      const heat = a.heat ?? 1;
      if (weapon.kind === "projectile" || weapon.kind === "missile")
        weapon = {
          ...weapon,
          damage: weapon.damage * damage,
          heatPerShot: weapon.heatPerShot * heat,
        };
      else if (weapon.kind === "beam")
        weapon = {
          ...weapon,
          damagePerSecond: weapon.damagePerSecond * damage,
        };
    }
    mount.definition = weapon;
  }
  ship.hull = ship.definition.hull.integrity;
  ship.shield = ship.definition.shield.capacity;
  ship.elite = {
    affixes: [...affixIds],
    fearless: affixes.some((a) => a.fearless),
  };
}

/** Rolls for the leader of a freshly spawned pirate group, and promotes it if it hits. */
export function promoteLeader(
  world: World,
  members: EntityId[],
  groupId: string,
  rules: EliteRules = PIRATE_RULES.elites,
): EntityId | null {
  const leader = members[0];
  const ship = leader !== undefined ? world.ships.get(leader) : undefined;
  if (!ship || ship.faction !== "pirate") return null;
  // The boss is its own kind of danger.
  if (world.pilots.get(leader)?.archetype === "boss") return null;
  const affixes = rollElite(world, groupId, rules);
  if (affixes.length === 0) return null;
  makeElite(world, leader, affixes, rules);
  return leader;
}

/** An elite going down: its core may blow, and the player's side is paid for it. Called by `destroyShip`. */
export function eliteDestroyed(
  world: World,
  id: EntityId,
  byPlayer: boolean,
  rules: EliteRules = PIRATE_RULES.elites,
): number {
  const ship = world.ships.get(id);
  const body = world.bodies.get(id);
  if (!ship?.elite || !body) return 0;
  for (const affixId of ship.elite.affixes) {
    const blast = rules.affixes.find((a) => a.id === affixId)?.blast;
    if (!blast) continue;
    for (const [otherId, other] of world.ships) {
      if (otherId === id || other.destroyed || other.docked !== null) continue;
      const p = world.bodies.get(otherId)!.position;
      const dx = p.x - body.position.x;
      const dy = p.y - body.position.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d >= blast.radius) continue;
      applyWeaponDamage(
        world,
        otherId,
        -1,
        blast.damage * (1 - d / blast.radius),
        { shield: 1, hull: 1 },
        { ...body.position },
        false,
      );
    }
  }
  return byPlayer
    ? rules.reward.creditsPerAffix * ship.elite.affixes.length
    : 0;
}
