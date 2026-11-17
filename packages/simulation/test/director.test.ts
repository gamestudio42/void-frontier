import { describe, expect, it } from "vitest";
import { DIRECTOR_RULES, OUTPOST_ALPHA } from "@void-frontier/content";
import { Simulation, inShadow, type SimEvent } from "../src/index.ts";

const rules = DIRECTOR_RULES;

/** Outpost Alpha with the player out in open space at rest, and no pirates in the sector. */
function open() {
  const sim = Simulation.fromSector(OUTPOST_ALPHA);
  const world = sim.world;
  for (const encounter of world.encounters)
    for (const id of encounter.members) world.destroyEntity(id);
  world.encounters.length = 0;
  sim.undock(sim.playerId);
  const body = world.bodies.get(sim.playerId)!;
  body.position = { x: 3000, y: 3000 };
  body.previousPosition = { ...body.position };
  body.velocity = { x: 0, y: 0 };
  sim.drainEvents();
  return sim;
}

function run(sim: Simulation, seconds: number, into?: SimEvent[]) {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    sim.step();
    const events = sim.drainEvents();
    into?.push(...events);
  }
}

const incidents = (events: SimEvent[]) =>
  events.filter(
    (e): e is Extract<SimEvent, { type: "incident" }> => e.type === "incident",
  );

function moveTo(sim: Simulation, at: { x: number; y: number }) {
  const body = sim.world.bodies.get(sim.playerId)!;
  body.position = { ...at };
  body.previousPosition = { ...at };
  body.velocity = { x: 0, y: 0 };
}

describe("encounter director pacing", () => {
  it("rises with a fight, lets the peak breathe, then calms", () => {
    const sim = open();
    const director = sim.world.director;
    const me = sim.world.bodies.get(sim.playerId)!.position;
    sim.spawnSparring("jackal", 400);
    sim.spawnSparring("jackal", 500);
    run(sim, 20);
    expect(director.intensity).toBeGreaterThan(rules.pacing.peakAbove);
    expect(director.phase).toBe("peak");
    // The fight ends: the pirates are gone, the level falls, and the director waits.
    for (const [id, ship] of sim.world.ships)
      if (ship.faction === "pirate") sim.world.destroyEntity(id);
    moveTo(sim, me);
    run(sim, (1 - rules.pacing.calmBelow) / rules.intensity.decayPerSecond + 1);
    expect(director.phase).toBe("relax");
    expect(director.incident).toBeNull();
    run(sim, rules.pacing.relaxSeconds);
    expect(director.phase).toBe("calm");
  });

  it("drops the first incident into a calm stretch in flight, never while docked or held", () => {
    const docked = Simulation.fromSector(OUTPOST_ALPHA);
    for (const e of docked.world.encounters)
      for (const id of e.members) docked.world.destroyEntity(id);
    docked.world.encounters.length = 0;
    run(docked, rules.pacing.firstIncident + 5);
    expect(docked.world.director.incident).toBeNull();

    const held = open();
    held.holdHostiles(true);
    run(held, rules.pacing.firstIncident + 5);
    expect(held.world.director.incident).toBeNull();

    const sim = open();
    const events: SimEvent[] = [];
    run(sim, rules.pacing.firstIncident - 1, events);
    expect(incidents(events)).toEqual([]);
    run(sim, 2, events);
    expect(incidents(events)).toHaveLength(1);
    expect(sim.world.director.incident).not.toBeNull();
  });

  it("plays out the same way for the same steps", () => {
    const trace = () => {
      const sim = open();
      const events: SimEvent[] = [];
      run(sim, rules.pacing.firstIncident + 40, events);
      return incidents(events).map(
        (e) => `${e.kind}:${e.stage}:${Math.round(e.position.x)}`,
      );
    };
    const first = trace();
    expect(first.length).toBeGreaterThan(0);
    expect(trace()).toEqual(first);
  });
});

describe("incidents", () => {
  it("a distress call pays and leaves cargo when reached", () => {
    const sim = open();
    sim.holdHostiles(true);
    const incident = sim.startIncident("distress")!;
    sim.drainEvents();
    expect(incident.trap).toBe(false); // Outpost Alpha is safe: its calls are real.
    const credits = sim.world.credits;
    const events: SimEvent[] = [];
    moveTo(sim, incident.position);
    run(sim, 0.1, events);
    expect(incidents(events)).toMatchObject([
      { kind: "distress", stage: "resolved", credits: rules.distress.credits },
    ]);
    expect(sim.world.credits).toBe(credits + rules.distress.credits);
    // The survivors' cargo is out there, or already in the tractor's hold.
    const hold =
      sim.world.ships.get(sim.playerId)!.cargo.get(rules.distress.resource) ??
      0;
    const floating = [...sim.world.pickups.values()].some(
      (p) => p.resource === rules.distress.resource,
    );
    expect(hold > 0 || floating).toBe(true);
  });

  it("a trap sets a pirate pack on the pilot who answers it", () => {
    const sim = open();
    sim.holdHostiles(true);
    const incident = sim.startIncident("distress")!;
    sim.drainEvents();
    incident.trap = true;
    const events: SimEvent[] = [];
    moveTo(sim, incident.position);
    run(sim, 0.1, events);
    expect(incidents(events)).toMatchObject([{ stage: "ambush", credits: 0 }]);
    const hunters = [...sim.world.pilots.entries()].filter(
      ([id, p]) =>
        sim.world.ships.get(id)?.faction === "pirate" &&
        p.target === sim.playerId,
    );
    expect(hunters).toHaveLength(rules.distress.ambush.count);
  });

  it("a call nobody answers goes silent", () => {
    const sim = open();
    sim.holdHostiles(true);
    sim.startIncident("distress");
    sim.drainEvents();
    const events: SimEvent[] = [];
    run(sim, rules.distress.lifetime + 1, events);
    expect(incidents(events).map((e) => e.stage)).toEqual(["expired"]);
  });

  it("a meteor storm is announced, then rakes the area and ends", () => {
    const sim = open();
    sim.holdHostiles(true);
    const ship = sim.world.ships.get(sim.playerId)!;
    const before = ship.shield + ship.hull;
    const events: SimEvent[] = [];
    sim.startIncident("meteorStorm");
    run(sim, rules.meteorStorm.warning - 1, events);
    expect([...sim.world.projectiles.values()].some((p) => p.meteor)).toBe(
      false,
    );
    run(sim, 2, events);
    expect(
      [...sim.world.projectiles.values()].some(
        (p) => p.meteor && p.owner === -1,
      ),
    ).toBe(true);
    run(sim, rules.meteorStorm.duration, events);
    expect(incidents(events).map((e) => e.stage)).toEqual([
      "warning",
      "started",
      "ended",
    ]);
    expect(
      events.some(
        (e) =>
          e.type === "hit" && e.target === sim.playerId && e.attacker === -1,
      ),
    ).toBe(true);
    expect(ship.shield + ship.hull).toBeLessThan(before);
    expect(ship.destroyed).toBe(false);
  });

  it("a solar flare strips shields in the open, not behind a big rock", () => {
    const sim = open();
    sim.holdHostiles(true);
    const incident = sim.startIncident("solarFlare")!;
    const sun = incident.direction;
    // A wingman-sized decoy: a second ship tucked behind the biggest rock, sunward of it.
    const [rockId, rock] = [...sim.world.asteroids.entries()].sort(
      (a, b) => b[1].radius - a[1].radius,
    )[0];
    expect(rock.radius).toBeGreaterThanOrEqual(rules.solarFlare.minCoverRadius);
    const centre = sim.world.bodies.get(rockId)!.position;
    const shade = {
      x: centre.x - sun.x * (rock.radius + 60),
      y: centre.y - sun.y * (rock.radius + 60),
    };
    expect(inShadow(sim.world, shade, sun)).toBe(true);
    expect(
      inShadow(
        sim.world,
        {
          x: shade.x - sun.y * (rock.radius + 200),
          y: shade.y + sun.x * (rock.radius + 200),
        },
        sun,
      ),
    ).toBe(false);

    const ship = sim.world.ships.get(sim.playerId)!;
    run(sim, rules.solarFlare.warning + 0.5);
    expect(ship.shield).toBe(0);
    // Out of the flare's reach once behind the rock: the shield comes back while it still burns.
    moveTo(sim, shade);
    run(sim, rules.solarFlare.duration - 2);
    expect(sim.world.director.incident?.kind).toBe("solarFlare");
    expect(ship.shield).toBeGreaterThan(0);
  });

  it("an unstable wreck spills salvage, then blows and takes what is left", () => {
    const sim = open();
    sim.holdHostiles(true);
    const incident = sim.startIncident("unstableWreck")!;
    sim.drainEvents();
    expect(incident.pickups).toHaveLength(rules.unstableWreck.pickups);
    const ship = sim.world.ships.get(sim.playerId)!;
    moveTo(sim, {
      x: incident.position.x + rules.unstableWreck.blastRadius * 0.5,
      y: incident.position.y,
    });
    ship.cargo.clear();
    // Hold the tractor off so the salvage is still there at the blast.
    for (const id of incident.pickups)
      sim.world.pickups.get(id)!.freeAfterTick = 1e9;
    const events: SimEvent[] = [];
    run(sim, rules.unstableWreck.fuse + 0.5, events);
    expect(incidents(events).map((e) => e.stage)).toEqual(["detonated"]);
    // Half way out, half the blast: shield first, then the hull through its armour.
    const blast = events.find(
      (e) => e.type === "hit" && e.target === sim.playerId && e.attacker === -1,
    );
    if (blast?.type !== "hit") throw new Error("the blast missed");
    const dealt =
      blast.shieldDamage + blast.hullDamage / (1 - ship.definition.hull.armor);
    expect(dealt).toBeCloseTo(rules.unstableWreck.blastDamage * 0.5, 0);
    for (const id of incident.pickups)
      expect(sim.world.pickups.has(id)).toBe(false);
  });
});
