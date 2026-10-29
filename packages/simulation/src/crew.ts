import { CREW_RULES, STATION_PLACEMENTS, getStation } from '@void-frontier/content';
import { Rng } from '@void-frontier/kernel';
import { isParkedAt, type Fleet, type FleetNote, type Pilot, type PilotSkills } from './fleet.ts';
import { dockedStationKey } from './missions.ts';
import type { Simulation } from './simulation.ts';
import type { World } from './world.ts';

/** Wage per pay cycle for a set of skills. */
export const wageFor = (skills: PilotSkills): number => Math.round(CREW_RULES.wage.base + CREW_RULES.wage.perSkill * (skills.piloting + skills.mining + skills.combat));

/** One-off fee to sign a pilot. */
export const hireFee = (pilot: Pilot): number => Math.round(pilot.wage * CREW_RULES.hireCycles);

/** Every pilot on the payroll: aboard ships or waiting at a station. */
export function payroll(fleet: Fleet): Pilot[] {
  return [...fleet.ships.flatMap((s) => (s.pilot ? [s.pilot] : [])), ...fleet.crew.map((c) => c.pilot)];
}

/** Stations with a crew board: every lawful station with a shipyard. */
const crewStations = (): string[] => [...STATION_PLACEMENTS].filter(([, p]) => getStation(p.definition).shipyard.length > 0).map(([key]) => key);

export function note(world: World, fleet: Fleet, item: Omit<FleetNote, 'tick'>): void {
  const full = { tick: world.tick, ...item };
  fleet.log.unshift(full);
  fleet.log.length = Math.min(fleet.log.length, 20);
  world.events.push({ type: 'fleet', note: full });
}

/**
 * New faces at every crew board. Each board is drawn from its own seed (the refresh
 * count and the station), so the shared gameplay RNG is left alone.
 */
function refreshOffers(world: World, fleet: Fleet): void {
  const round = Math.floor(world.tick / (CREW_RULES.refreshSeconds * 60));
  const taken = new Set(payroll(fleet).map((p) => p.name));
  crewStations().forEach((key, index) => {
    const rng = new Rng((round + 1) * 7919 + index * 104729);
    const offers: Pilot[] = [];
    for (let i = 0; i < CREW_RULES.offersPerStation; i++) {
      const free = CREW_RULES.names.filter((n) => !taken.has(n));
      if (free.length === 0) break;
      const name = free[Math.floor(rng.next() * free.length)];
      taken.add(name);
      // One strength, the rest average or weaker.
      const skills = { piloting: 1 + Math.floor(rng.next() * 3), mining: 1 + Math.floor(rng.next() * 3), combat: 1 + Math.floor(rng.next() * 3) };
      const best = (['piloting', 'mining', 'combat'] as const)[Math.floor(rng.next() * 3)];
      skills[best] = Math.min(5, skills[best] + 1 + Math.floor(rng.next() * 2));
      offers.push({ id: fleet.nextPilotId++, name, skills, wage: wageFor(skills), trips: 0, unpaid: false });
    }
    fleet.offers[key] = offers;
  });
  fleet.offersTick = (round + 1) * CREW_RULES.refreshSeconds * 60;
}

/** Wages every cycle. A pilot who goes unpaid leaves at the next station. */
function payday(world: World, fleet: Fleet): void {
  for (const owned of fleet.ships) {
    const pilot = owned.pilot;
    if (!pilot) continue;
    if (world.credits >= pilot.wage) {
      world.credits -= pilot.wage;
      owned.earned -= pilot.wage;
      pilot.unpaid = false;
    } else if (!pilot.unpaid) {
      pilot.unpaid = true;
      note(world, fleet, { kind: 'unpaid', ship: owned.state.ship, pilot: pilot.name, credits: pilot.wage });
    }
  }
  for (const waiting of [...fleet.crew]) {
    if (world.credits >= waiting.pilot.wage) {
      world.credits -= waiting.pilot.wage;
      continue;
    }
    fleet.crew = fleet.crew.filter((c) => c !== waiting);
    note(world, fleet, { kind: 'quit', ship: null, pilot: waiting.pilot.name, station: waiting.station });
  }
  fleet.payTick = world.tick + CREW_RULES.cycleSeconds * 60;
}

/** Crew boards and the payroll; runs every step, acts on its own schedule. */
export function crewSystem(world: World, fleet: Fleet): void {
  if (world.tick >= fleet.offersTick) refreshOffers(world, fleet);
  if (fleet.payTick === 0) fleet.payTick = world.tick + CREW_RULES.cycleSeconds * 60;
  else if (world.tick >= fleet.payTick) payday(world, fleet);
}

export type CrewResult = { ok: true } | { ok: false; reason: 'notDocked' | 'unknown' | 'noCredits' | 'tooMany' | 'elsewhere' | 'hasPilot' };

/** Pilots for hire at the station the player is docked at. */
export function crewOffers(sim: Simulation): Pilot[] {
  const key = dockedStationKey(sim.world, sim.playerId);
  return key ? (sim.fleet.offers[key] ?? []) : [];
}

/** Signs a pilot from this station's board; they wait here until given a ship. */
export function hirePilot(sim: Simulation, pilotId: number): CrewResult {
  const key = dockedStationKey(sim.world, sim.playerId);
  if (!key) return { ok: false, reason: 'notDocked' };
  const pilot = sim.fleet.offers[key]?.find((p) => p.id === pilotId);
  if (!pilot) return { ok: false, reason: 'unknown' };
  if (payroll(sim.fleet).length >= CREW_RULES.maxPilots) return { ok: false, reason: 'tooMany' };
  if (sim.world.credits < hireFee(pilot)) return { ok: false, reason: 'noCredits' };
  sim.world.credits -= hireFee(pilot);
  sim.fleet.offers[key] = sim.fleet.offers[key].filter((p) => p !== pilot);
  sim.fleet.crew.push({ pilot, station: key });
  note(sim.world, sim.fleet, { kind: 'hired', ship: null, pilot: pilot.name, station: key, credits: hireFee(pilot) });
  return { ok: true };
}

/** Puts a pilot waiting here aboard a ship parked here (swapping out any pilot already aboard). */
export function assignPilot(sim: Simulation, pilotId: number, ownedId: number): CrewResult {
  const key = dockedStationKey(sim.world, sim.playerId);
  if (!key) return { ok: false, reason: 'notDocked' };
  const waiting = sim.fleet.crew.find((c) => c.pilot.id === pilotId);
  const owned = sim.fleet.ships.find((s) => s.id === ownedId);
  if (!waiting || !owned) return { ok: false, reason: 'unknown' };
  if (waiting.station !== key || !isParkedAt(owned, key)) return { ok: false, reason: 'elsewhere' };
  sim.fleet.crew = sim.fleet.crew.filter((c) => c !== waiting);
  if (owned.pilot) sim.fleet.crew.push({ pilot: owned.pilot, station: key });
  owned.pilot = waiting.pilot;
  return { ok: true };
}

/** Lets a pilot go: one waiting here, or one aboard a ship parked here (its order ends). */
export function dismissPilot(sim: Simulation, pilotId: number): CrewResult {
  const key = dockedStationKey(sim.world, sim.playerId);
  if (!key) return { ok: false, reason: 'notDocked' };
  const waiting = sim.fleet.crew.find((c) => c.pilot.id === pilotId);
  if (waiting) {
    if (waiting.station !== key) return { ok: false, reason: 'elsewhere' };
    sim.fleet.crew = sim.fleet.crew.filter((c) => c !== waiting);
    return { ok: true };
  }
  const owned = sim.fleet.ships.find((s) => s.pilot?.id === pilotId);
  if (!owned) return { ok: false, reason: 'unknown' };
  if (!isParkedAt(owned, key)) return { ok: false, reason: 'elsewhere' };
  owned.pilot = null;
  owned.order = null;
  owned.run = null;
  return { ok: true };
}
