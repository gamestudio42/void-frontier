import { describe, expect, it } from "vitest";
import {
  BOSS_RULES,
  OUTPOST_ALPHA,
  getSector,
  getShip,
} from "@void-frontier/content";
import {
  Simulation,
  applyWeaponDamage,
  destroyShip,
  getBoss,
  moraleSystem,
  restore,
  serialize,
  type SimEvent,
} from "../src/index.ts";

const rules = BOSS_RULES;
const HOUR = 60 * 3600;

/** A sector with its pirate groups cleared, stepped once so the lair fills. */
function lair(sector: string) {
  const sim = Simulation.fromSector(getSector(sector));
  const world = sim.world;
  for (const encounter of world.encounters)
    for (const id of encounter.members) world.destroyEntity(id);
  world.encounters.length = 0;
  sim.step();
  const state = world.bosses[0];
  return {
    sim,
    world,
    state,
    ship: state ? world.ships.get(state.ship)! : undefined,
  };
}

function steps(sim: Simulation, seconds: number, into?: SimEvent[]) {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    sim.step();
    into?.push(...sim.drainEvents());
  }
}

const place = (
  sim: Simulation,
  id: number,
  at: { x: number; y: number },
  velocity = { x: 0, y: 0 },
) => {
  const body = sim.world.bodies.get(id)!;
  body.position = { ...at };
  body.previousPosition = { ...at };
  body.velocity = { ...velocity };
};

describe("boss lairs", () => {
  it("hold one boss in each sector but the first and Pirate Territory, made tougher", () => {
    for (const definition of rules.bosses) {
      const { world, state, ship } = lair(definition.sector);
      expect(state?.id).toBe(definition.id);
      expect(ship!.boss).toEqual({ id: definition.id, open: false });
      expect(ship!.definition.hull.integrity).toBeCloseTo(
        getShip(definition.ship).hull.integrity * (definition.stats.hull ?? 1),
      );
      expect(ship!.hull).toBe(ship!.definition.hull.integrity);
      expect(world.bodies.get(state.ship)!.position).toMatchObject({
        x: expect.closeTo(definition.x, -1),
        y: expect.closeTo(definition.y, -1),
      });
    }
    expect(lair("outpost_alpha").state).toBeUndefined();
    expect(lair("pirate_territory").state).toBeUndefined();
  });

  it("turn most weapon damage away while guarded, and take it all while open", () => {
    const { sim, world, state, ship } = lair("ember_reach");
    ship!.shield = 0;
    const hull = ship!.hull;
    applyWeaponDamage(
      world,
      state.ship,
      sim.playerId,
      100,
      { shield: 1, hull: 1 },
      { x: 0, y: 0 },
      false,
    );
    const guarded = hull - ship!.hull;
    expect(guarded).toBeCloseTo(
      100 * rules.guardedShare * (1 - ship!.definition.hull.armor),
    );
    ship!.boss!.open = true;
    applyWeaponDamage(
      world,
      state.ship,
      sim.playerId,
      100,
      { shield: 1, hull: 1 },
      { x: 0, y: 0 },
      false,
    );
    expect(hull - guarded - ship!.hull).toBeCloseTo(
      100 * (1 - ship!.definition.hull.armor),
    );
  });

  it("never run or surrender", () => {
    const { world, state, ship } = lair("industrial_belt");
    const pilot = world.pilots.get(state.ship)!;
    pilot.morale = 0;
    ship!.hull = 1;
    moraleSystem(world, 1 / 60);
    expect(pilot.mode).not.toBe("flee");
    expect(ship!.surrendered).toBeFalsy();
  });
});

describe("boss openings", () => {
  it("the Scrap Leviathan opens once its whole guard is down", () => {
    const { sim, world, state, ship } = lair("graveyard");
    const trigger = getBoss("scrap_leviathan").trigger;
    expect(trigger.kind === "guard" && state.guard.length).toBe(
      trigger.kind === "guard" ? trigger.count : 0,
    );
    steps(sim, 0.1);
    expect(ship!.boss!.open).toBe(false);
    for (const id of state.guard.slice(1)) destroyShip(world, id, sim.playerId);
    steps(sim, 0.1);
    expect(ship!.boss!.open).toBe(false);
    destroyShip(world, state.guard[0], sim.playerId);
    const events: SimEvent[] = [];
    steps(sim, 0.1, events);
    expect(ship!.boss!.open).toBe(true);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "boss",
        stage: "open",
        boss: "scrap_leviathan",
      }),
    );
  });

  it("the Quarry Ram opens after slamming a rock, and shrugs off most of the crash", () => {
    const { sim, world, state, ship } = lair("industrial_belt");
    const trigger = getBoss("quarry_ram").trigger;
    if (trigger.kind !== "impact") throw new Error("expected an impact boss");
    const [rockId, rock] = [...world.asteroids.entries()].sort(
      (a, b) => b[1].radius - a[1].radius,
    )[0];
    const at = world.bodies.get(rockId)!.position;
    world.pilots.delete(state.ship); // fly it by hand into the rock
    place(
      sim,
      state.ship,
      { x: at.x - rock.radius - 40, y: at.y },
      { x: trigger.speed * 2.5, y: 0 },
    );
    const hull = ship!.hull + ship!.shield;
    const events: SimEvent[] = [];
    steps(sim, 2, events);
    const crash = events.find(
      (e) =>
        e.type === "collision" && (e.a === state.ship || e.b === state.ship),
    );
    if (crash?.type !== "collision") throw new Error("it missed the rock");
    expect(ship!.boss!.open).toBe(true);
    expect(hull - ship!.hull - ship!.shield).toBeLessThan(
      crash.damage * rules.collisionShare + 1,
    );
    steps(sim, trigger.seconds);
    expect(ship!.boss!.open).toBe(false);
  });

  it("the Gravewell Hound opens near the well's core, and closes away from it", () => {
    const { sim, world, state, ship } = lair("anomaly_zone");
    const trigger = getBoss("gravewell_hound").trigger;
    if (trigger.kind !== "well") throw new Error("expected a well boss");
    const well = world.anomalies[0];
    world.pilots.delete(state.ship);
    place(sim, state.ship, {
      x: well.position.x + well.coreRadius + trigger.margin * 0.5,
      y: well.position.y,
    });
    steps(sim, 0.1);
    expect(ship!.boss!.open).toBe(true);
    place(sim, state.ship, { x: well.position.x + 2500, y: well.position.y });
    steps(sim, trigger.seconds + 0.2);
    expect(ship!.boss!.open).toBe(false);
  });

  it("the Furnace opens while a gun is locked out by heat, and a moment after", () => {
    const { sim, ship } = lair("ember_reach");
    const trigger = getBoss("furnace").trigger;
    if (trigger.kind !== "overheat")
      throw new Error("expected an overheat boss");
    ship!.weapons[0].overheated = true;
    ship!.weapons[0].heat = ship!.weapons[0].definition.maxHeat;
    steps(sim, 0.1);
    expect(ship!.boss!.open).toBe(true);
    ship!.weapons[0].overheated = false;
    ship!.weapons[0].heat = 0;
    steps(sim, trigger.seconds + 0.2);
    expect(ship!.boss!.open).toBe(false);
  });
});

describe("boss phases and defeat", () => {
  it("call in help at each hull threshold; a guard boss's new escorts close it again", () => {
    const { sim, world, state, ship } = lair("graveyard");
    const definition = getBoss("scrap_leviathan");
    for (const id of state.guard) destroyShip(world, id, sim.playerId);
    steps(sim, 0.1);
    expect(ship!.boss!.open).toBe(true);
    const pirates = () =>
      [...world.ships.values()].filter(
        (s) => s.faction === "pirate" && !s.destroyed,
      ).length;
    const before = pirates();
    ship!.hull =
      ship!.definition.hull.integrity * (definition.phases[0].below - 0.01);
    const events: SimEvent[] = [];
    steps(sim, 0.1, events);
    expect(state.phase).toBe(1);
    expect(events).toContainEqual(
      expect.objectContaining({ type: "boss", stage: "phase", phase: 1 }),
    );
    expect(pirates()).toBe(before + definition.phases[0].summon!.count);
    expect(ship!.boss!.open).toBe(false);
  });

  it("pays the player's side, is logged, and is back in its lair after the respawn time", () => {
    const { sim, world, state } = lair("ember_reach");
    const definition = getBoss("furnace");
    // Already at the top rank, so no promotion bonus lands in the same purse.
    world.career.merit = 10_000;
    world.career.rank = 5;
    const credits = world.credits;
    const merit = world.career.merit;
    destroyShip(world, state.ship, sim.playerId);
    const events = sim.drainEvents();
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "boss",
        stage: "defeated",
        credits: definition.reward.credits,
      }),
    );
    expect(world.credits).toBe(credits + definition.reward.credits);
    expect(world.career.merit).toBeGreaterThanOrEqual(
      merit + definition.reward.merit,
    );
    expect(world.bossLog.furnace).toBe(world.tick);
    expect(sim.missions!.bosses.furnace).toBe(world.tick);
    sim.step();
    expect(world.bosses).toHaveLength(0);
    world.tick += rules.respawnHours * HOUR - 10;
    sim.step();
    expect(world.bosses).toHaveLength(0);
    world.tick += 20;
    sim.step();
    expect(world.bosses.map((b) => b.id)).toEqual(["furnace"]);
  });

  it("the log of beaten bosses survives a save", () => {
    const sim = Simulation.fromSector(OUTPOST_ALPHA);
    sim.missions!.bosses.quarry_ram = 1234;
    const back = restore(serialize({ sim, memory: {}, discovered: new Set() }));
    expect(back.sim.world.bossLog).toEqual({ quarry_ram: 1234 });
    expect(back.sim.world.bossLog).toBe(back.sim.missions!.bosses);
  });
});
