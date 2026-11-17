import { describe, expect, it } from "vitest";
import { OUTPOST_ALPHA, PIRATE_RULES, getShip } from "@void-frontier/content";
import {
  Simulation,
  destroyShip,
  eliteDefinition,
  makeElite,
  moraleSystem,
  promoteLeader,
  rollElite,
  spawnEncounter,
  type SimEvent,
} from "../src/index.ts";

const rules = PIRATE_RULES.elites;
const affix = (id: string) => rules.affixes.find((a) => a.id === id)!;

/** Outpost Alpha out in open space, with one jackal `distance` metres east of the player. */
function duel(distance = 600) {
  const sim = Simulation.fromSector(OUTPOST_ALPHA);
  sim.holdHostiles(true);
  sim.undock(sim.playerId);
  const me = sim.world.bodies.get(sim.playerId)!;
  me.position = { x: 3000, y: 3000 };
  me.previousPosition = { ...me.position };
  me.velocity = { x: 0, y: 0 };
  const at = { x: 3000 + distance, y: 3000 };
  const [id] = spawnEncounter(sim.world, {
    id: "test",
    ship: "jackal",
    faction: "pirate",
    count: 1,
    spawn: at,
    patrol: [[at.x, at.y]],
    respawnDelay: 1e6,
  });
  sim.drainEvents();
  return { sim, id };
}

describe("elite rolls", () => {
  it("never happen in Outpost Alpha, and match each sector's chance elsewhere", () => {
    const sim = Simulation.fromSector(OUTPOST_ALPHA);
    for (let i = 0; i < 200; i++)
      expect(rollElite(sim.world, `g${i}`)).toEqual([]);
    for (const [sector, odds] of Object.entries(rules.sectors)) {
      if (odds.chance === 0) continue;
      sim.world.sectorId = sector;
      let hits = 0;
      for (let i = 0; i < 2000; i++) {
        sim.world.tick = i * 37;
        const rolled = rollElite(sim.world, "group");
        if (rolled.length === 0) continue;
        hits++;
        expect(rolled).toHaveLength(odds.affixes);
        expect(new Set(rolled).size).toBe(rolled.length);
      }
      expect(hits / 2000).toBeGreaterThan(odds.chance - 0.05);
      expect(hits / 2000).toBeLessThan(odds.chance + 0.05);
    }
  });

  it("are the same for the same sector, group and tick, and use no world randomness", () => {
    const sim = Simulation.fromSector(OUTPOST_ALPHA);
    sim.world.sectorId = "ember_reach";
    const before = sim.world.rng.getState();
    const first = Array.from({ length: 50 }, (_, i) =>
      rollElite(sim.world, `g${i}`),
    );
    expect(
      Array.from({ length: 50 }, (_, i) => rollElite(sim.world, `g${i}`)),
    ).toEqual(first);
    expect(sim.world.rng.getState()).toEqual(before);
  });

  it("promote the leader of a group, never the boss", () => {
    const { sim, id } = duel();
    sim.world.sectorId = "ember_reach";
    let promoted: number | null = null;
    for (let tick = 0; tick < 200 && promoted === null; tick++) {
      sim.world.tick = tick;
      promoted = promoteLeader(sim.world, [id], "group");
    }
    expect(promoted).toBe(id);
    expect(sim.world.ships.get(id)!.elite!.affixes).toHaveLength(
      rules.sectors.ember_reach.affixes,
    );

    const at = { x: 0, y: 0 };
    const [boss] = spawnEncounter(sim.world, {
      id: "boss",
      ship: "dreadmaw",
      faction: "pirate",
      count: 1,
      spawn: at,
      patrol: [[0, 0]],
      respawnDelay: 1e6,
      archetype: "boss",
    });
    for (let tick = 0; tick < 200; tick++) {
      sim.world.tick = tick;
      expect(promoteLeader(sim.world, [boss], "boss")).toBeNull();
    }
  });
});

describe("elite affixes", () => {
  it("change the hull's stats", () => {
    const base = getShip("jackal");
    const armored = eliteDefinition(base, [affix("armored")]);
    expect(armored.hull.integrity).toBeCloseTo(
      base.hull.integrity * affix("armored").hull!,
    );
    expect(armored.hull.armor).toBeCloseTo(
      base.hull.armor + affix("armored").armor!,
    );
    expect(armored.hull.dryMass).toBeGreaterThan(base.hull.dryMass);
    const swift = eliteDefinition(base, [affix("swift")]);
    expect(swift.movement.mainThrust).toBeCloseTo(
      base.movement.mainThrust * affix("swift").thrust!,
    );
    const regen = eliteDefinition(base, [affix("regenerating")]);
    expect(regen.shield.rechargeRate).toBeGreaterThan(base.shield.rechargeRate);
    expect(regen.shield.rechargeDelay).toBeLessThan(base.shield.rechargeDelay);
    // The shared definition is left alone.
    expect(getShip("jackal").hull.integrity).toBe(base.hull.integrity);
  });

  it("an overcharged elite hits harder, and spawns at full strength", () => {
    const { sim, id } = duel();
    const ship = sim.world.ships.get(id)!;
    const damage =
      ship.weapons[0].definition.kind === "projectile"
        ? ship.weapons[0].definition.damage
        : 0;
    makeElite(sim.world, id, ["overcharged", "armored"]);
    const gun = ship.weapons[0].definition;
    expect(gun.kind === "projectile" && gun.damage).toBeCloseTo(
      damage * affix("overcharged").damage!,
    );
    expect(ship.hull).toBe(ship.definition.hull.integrity);
    expect(ship.hull).toBeGreaterThan(getShip("jackal").hull.integrity);
  });

  it("a relentless elite never breaks", () => {
    const { sim, id } = duel();
    makeElite(sim.world, id, ["relentless"]);
    const pilot = sim.world.pilots.get(id)!;
    const ship = sim.world.ships.get(id)!;
    pilot.morale = 0;
    ship.hull = 1;
    moraleSystem(sim.world, sim.dt);
    expect(pilot.mode).not.toBe("flee");
    expect(ship.surrendered).toBeFalsy();
  });

  it("a volatile elite blows up and hurts whoever is close", () => {
    const blast = affix("volatile").blast!;
    const { sim, id } = duel(blast.radius / 2);
    makeElite(sim.world, id, ["volatile"]);
    const me = sim.world.ships.get(sim.playerId)!;
    const before = me.shield + me.hull;
    destroyShip(sim.world, id, null);
    expect(me.shield + me.hull).toBeLessThan(before);
    const far = duel(blast.radius + 50);
    makeElite(far.sim.world, far.id, ["volatile"]);
    const safe = far.sim.world.ships.get(far.sim.playerId)!;
    const untouched = safe.shield + safe.hull;
    destroyShip(far.sim.world, far.id, null);
    expect(safe.shield + safe.hull).toBe(untouched);
  });
});

describe("elite rewards", () => {
  it("pay a bounty per affix, merit and extra salvage to the player's side only", () => {
    const { sim, id } = duel();
    makeElite(sim.world, id, ["armored", "swift"]);
    const credits = sim.world.credits;
    const merit = sim.world.career.merit;
    destroyShip(sim.world, id, sim.playerId);
    const events: SimEvent[] = sim.drainEvents();
    const paid = rules.reward.creditsPerAffix * 2;
    expect(events.find((e) => e.type === "eliteDown")).toMatchObject({
      ship: id,
      affixes: ["armored", "swift"],
      credits: paid,
    });
    // The pirate kill's own merit and standing still count; the elite adds its share on top.
    expect(sim.world.credits).toBe(credits + paid);
    expect(sim.world.career.merit).toBe(merit + rules.reward.merit + 3);
    expect(
      [...sim.world.pickups.values()].filter((p) => p.resource === "salvage")
        .length,
    ).toBeGreaterThanOrEqual(1 + rules.reward.salvageDrops);

    const other = duel();
    makeElite(other.sim.world, other.id, ["armored"]);
    const kept = other.sim.world.credits;
    destroyShip(other.sim.world, other.id, null);
    expect(other.sim.world.credits).toBe(kept);
    expect(
      other.sim.drainEvents().find((e) => e.type === "eliteDown"),
    ).toMatchObject({ credits: 0 });
  });
});
