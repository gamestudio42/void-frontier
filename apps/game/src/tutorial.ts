import type { FlightTelemetry, SimEvent } from '@void-frontier/simulation';
import type { MessageKey } from './i18n.ts';

/** What the tutorial can observe each frame. */
export interface TutorialContext {
  telemetry: FlightTelemetry;
  events: SimEvent[];
  playerId: number;
  /** Seconds since the step started. */
  stepTime: number;
  fleetOpen: boolean;
  /** Values remembered when the step started. */
  start: { heading: number; credits: number };
}

interface Step {
  id: string;
  title: MessageKey;
  hint: MessageKey;
  done(ctx: TutorialContext): boolean;
  /**
   * A verb that counts even when the player does it ahead of its step. Checked every frame
   * for later steps; when it holds, that step is skipped when its turn comes.
   */
  early?(ctx: TutorialContext): boolean;
}

const ore = (t: FlightTelemetry) => t.hold.filter((h) => h.resource.endsWith('_ore')).reduce((sum, h) => sum + h.units, 0);

const scanned = (c: TutorialContext) => c.events.some((e) => e.type === 'scan' && e.owner === c.playerId);
const docked = (c: TutorialContext) => c.events.some((e) => e.type === 'docked' && e.ship === c.playerId);
const fought = (c: TutorialContext) => c.events.some((e) => e.type === 'hit' && e.attacker === c.playerId && e.shieldDamage + e.hullDamage > 0);

/**
 * The first flight, one verb at a time: each step checks the live simulation, so the
 * player learns by doing it rather than by reading about it. New pilots launch with flight
 * assist on, so the flight lesson switches it off to feel inertia and back on at the end.
 * Verbs done early (scanning, mining, docking, fighting, the fleet panel) are not asked twice.
 */
export const TUTORIAL: Step[] = [
  { id: 'undock', title: 'tutorial.undock.title', hint: 'tutorial.undock.hint', done: (c) => !c.telemetry.docked },
  { id: 'thrust', title: 'tutorial.thrust.title', hint: 'tutorial.thrust.hint', done: (c) => c.telemetry.speed > 20 },
  { id: 'newtonian', title: 'tutorial.newtonian.title', hint: 'tutorial.newtonian.hint', done: (c) => c.telemetry.mode === 'newtonian' },
  {
    id: 'coast',
    title: 'tutorial.coast.title',
    hint: 'tutorial.coast.hint',
    done: (c) => c.stepTime > 2.5 && c.telemetry.mode === 'newtonian' && c.telemetry.speed > 10 && c.telemetry.output.main < 0.05,
  },
  {
    id: 'turn',
    title: 'tutorial.turn.title',
    hint: 'tutorial.turn.hint',
    done: (c) => Math.abs(((c.telemetry.heading - c.start.heading + 540) % 360) - 180) > 90,
  },
  { id: 'brake', title: 'tutorial.brake.title', hint: 'tutorial.brake.hint', done: (c) => c.telemetry.speed < 1 },
  { id: 'assist', title: 'tutorial.assist.title', hint: 'tutorial.assist.hint', done: (c) => c.telemetry.mode === 'assisted' },
  { id: 'scan', title: 'tutorial.scan.title', hint: 'tutorial.scan.hint', done: scanned, early: scanned },
  { id: 'mine', title: 'tutorial.mine.title', hint: 'tutorial.mine.hint', done: (c) => ore(c.telemetry) >= 8, early: (c) => ore(c.telemetry) >= 8 },
  { id: 'dock', title: 'tutorial.dock.title', hint: 'tutorial.dock.hint', done: (c) => c.telemetry.docked, early: docked },
  { id: 'sell', title: 'tutorial.sell.title', hint: 'tutorial.sell.hint', done: (c) => c.telemetry.credits > c.start.credits },
  { id: 'fight', title: 'tutorial.fight.title', hint: 'tutorial.fight.hint', done: fought, early: fought },
  { id: 'fleet', title: 'tutorial.fleet.title', hint: 'tutorial.fleet.hint', done: (c) => c.fleetOpen, early: (c) => c.fleetOpen },
];
