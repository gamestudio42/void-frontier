import type { OwnedShip } from "./fleet.ts";
import { fleetEntities } from "./orders.ts";
import type { Simulation } from "./simulation.ts";
import type { EntityId, SimEvent } from "./types.ts";

/**
 * Hired pilots remember what they lived through with the player: being pulled out of a
 * fight, a boss going down, an elite they helped kill. The radio brings these back ("I
 * still owe you one for Ember Reach"), so a fleet grows its own stories.
 *
 * Memories live on the pilot, so they travel with the fleet through jumps and saves.
 */
export type MemoryKind = "saved" | "boss" | "elite";

export interface Memory {
  kind: MemoryKind;
  sector: string;
  tick: number;
}

/** Most memories a pilot keeps; the oldest goes first. */
export const MAX_MEMORIES = 5;
/** Seconds a hit on a fleet ship still counts as "it was in trouble". */
const TROUBLE_SECONDS = 10;
/** Metres within which a fleet ship was part of a fight. */
const PRESENT = 2000;

/**
 * Reads this step's events for the moments a pilot would remember. Runs after the fleet
 * system; `events` are the ones this step produced.
 */
export function memorySystem(sim: Simulation, events: SimEvent[]): void {
  const world = sim.world;
  let fleet: Map<EntityId, OwnedShip> | null = null;
  const crew = () => (fleet ??= fleetEntities(sim));

  const remember = (shipId: EntityId, kind: MemoryKind) => {
    const owned = crew().get(shipId);
    const pilot = owned?.pilot;
    if (!pilot) return;
    const memories = (pilot.memories ??= []);
    // One memory of a kind per sector visit is enough.
    const last = memories.at(-1);
    if (
      last &&
      last.kind === kind &&
      last.sector === world.sectorId &&
      world.tick - last.tick < 60 * 60
    )
      return;
    memories.push({ kind, sector: world.sectorId, tick: world.tick });
    if (memories.length > MAX_MEMORIES) memories.shift();
    world.events.push({
      type: "memory",
      ship: shipId,
      pilot: pilot.name,
      kind,
      sector: world.sectorId,
    });
  };

  const near = (at: { x: number; y: number }) => {
    const out: EntityId[] = [];
    for (const id of crew().keys()) {
      const p = world.bodies.get(id)?.position;
      if (p && (p.x - at.x) ** 2 + (p.y - at.y) ** 2 <= PRESENT * PRESENT)
        out.push(id);
    }
    return out;
  };

  for (const event of events) {
    if (event.type === "shipDestroyed" && event.by === sim.playerId) {
      // A pirate the player shot down while it had a fleet ship in its sights, recently hurt.
      const target = world.pilots.get(event.id)?.target;
      const ship =
        target !== null && target !== undefined
          ? world.ships.get(target)
          : undefined;
      if (
        target !== null &&
        target !== undefined &&
        ship &&
        crew().has(target) &&
        (world.tick - ship.lastDamageTick) * sim.dt <= TROUBLE_SECONDS
      ) {
        remember(target, "saved");
      }
    } else if (
      event.type === "boss" &&
      event.stage === "defeated" &&
      event.credits > 0
    ) {
      const at = world.bodies.get(event.ship)?.position;
      if (at) for (const id of near(at)) remember(id, "boss");
    } else if (event.type === "eliteDown" && event.credits > 0) {
      for (const id of near(event.position)) remember(id, "elite");
    }
  }
}
