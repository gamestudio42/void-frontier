import { describe, expect, it } from "vitest";
import { getSector } from "@void-frontier/content";
import {
  MAX_MEMORIES,
  Simulation,
  destroyShip,
  memorySystem,
  fleetEntities,
  makeElite,
  restore,
  serialize,
  spawnEncounter,
  type OwnedShip,
  type SimEvent,
} from "../src/index.ts";

/** Out of the bay at Outpost Alpha with one hired wingman flying escort, pirates held. */
function flying() {
  const sim = Simulation.fromSector(getSector("outpost_alpha"), undefined, {
    startDocked: true,
  });
  sim.world.credits = 80_000;
  sim.step();
  sim.missions!.reputation.ferrum_combine = 0;
  const bought = sim.buyShip("kestrel");
  if (!bought.ok) throw new Error(bought.reason);
  const pilot = sim.crewOffers()[0];
  expect(sim.hirePilot(pilot.id)).toEqual({ ok: true });
  expect(sim.assignPilot(pilot.id, bought.id)).toEqual({ ok: true });
  expect(sim.setOrder(bought.id, { kind: "wingman" })).toEqual({ ok: true });
  const owned: OwnedShip = sim.fleet.ships.find((s) => s.id === bought.id)!;
  sim.holdHostiles(true);
  sim.undock(sim.playerId);
  sim.run(5);
  const [wingId] = [...fleetEntities(sim).keys()];
  sim.drainEvents();
  return { sim, owned, wingId };
}

function pirateNear(sim: Simulation, id: number) {
  const at = sim.world.bodies.get(id)!.position;
  const [pirate] = spawnEncounter(sim.world, {
    id: "test",
    ship: "jackal",
    faction: "pirate",
    count: 1,
    spawn: { x: at.x + 300, y: at.y },
    patrol: [[at.x + 300, at.y]],
    respawnDelay: 1e6,
  });
  return pirate;
}

describe("pilot memories", () => {
  it("a pilot remembers being saved from a pirate that was hurting them", () => {
    const { sim, owned, wingId } = flying();
    const pirate = pirateNear(sim, wingId);
    sim.world.pilots.get(pirate)!.target = wingId;
    sim.world.ships.get(wingId)!.lastDamageTick = sim.world.tick;
    destroyShip(sim.world, pirate, sim.playerId);
    memorySystem(sim, sim.drainEvents());
    const events: SimEvent[] = sim.drainEvents();
    expect(owned.pilot!.memories).toEqual([
      { kind: "saved", sector: "outpost_alpha", tick: expect.any(Number) },
    ]);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "memory",
        kind: "saved",
        pilot: owned.pilot!.name,
      }),
    );
  });

  it("nothing to remember when the pirate was not after them, or they were not in trouble", () => {
    const { sim, owned, wingId } = flying();
    const idle = pirateNear(sim, wingId);
    destroyShip(sim.world, idle, sim.playerId);
    memorySystem(sim, sim.drainEvents());
    const calm = pirateNear(sim, wingId);
    sim.world.pilots.get(calm)!.target = wingId;
    sim.world.ships.get(wingId)!.lastDamageTick = sim.world.tick - 60 * 60;
    destroyShip(sim.world, calm, sim.playerId);
    memorySystem(sim, sim.drainEvents());
    expect(owned.pilot!.memories ?? []).toEqual([]);
  });

  it("an elite brought down nearby is remembered, once per stretch, and memories are capped", () => {
    const { sim, owned, wingId } = flying();
    for (let i = 0; i < 2; i++) {
      const elite = pirateNear(sim, wingId);
      makeElite(sim.world, elite, ["armored"]);
      destroyShip(sim.world, elite, sim.playerId);
      memorySystem(sim, sim.drainEvents());
    }
    expect(owned.pilot!.memories!.map((m) => m.kind)).toEqual(["elite"]);
    owned.pilot!.memories = Array.from({ length: MAX_MEMORIES }, (_, i) => ({
      kind: "saved" as const,
      sector: "graveyard",
      tick: i,
    }));
    const elite = pirateNear(sim, wingId);
    makeElite(sim.world, elite, ["swift"]);
    destroyShip(sim.world, elite, sim.playerId);
    memorySystem(sim, sim.drainEvents());
    expect(owned.pilot!.memories).toHaveLength(MAX_MEMORIES);
    expect(owned.pilot!.memories!.at(-1)!.kind).toBe("elite");
    expect(owned.pilot!.memories![0].tick).toBe(1);
  });

  it("memories travel with the pilot through a save", () => {
    const { sim, owned } = flying();
    owned.pilot!.memories = [{ kind: "boss", sector: "ember_reach", tick: 42 }];
    const back = restore(serialize({ sim, memory: {}, discovered: new Set() }));
    const pilot = back.sim.fleet.ships.find((s) => s.id === owned.id)!.pilot!;
    expect(pilot.memories).toEqual([
      { kind: "boss", sector: "ember_reach", tick: 42 },
    ]);
  });
});
