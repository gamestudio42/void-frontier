import type { FlightTelemetry, SimEvent } from '@void-frontier/simulation';
import type { MessageKey } from './i18n.ts';

/** What the tutorial can observe each frame. */
export interface TutorialContext {
  telemetry: FlightTelemetry;
  events: SimEvent[];
  playerId: number;
  /** Seconds since the step started. */
  stepTime: number;
  /** Values remembered when the step started. */
  start: { heading: number; credits: number };
}

interface Step {
  id: string;
  title: MessageKey;
  hint: MessageKey;
  done(ctx: TutorialContext): boolean;
}

const ore = (t: FlightTelemetry) => t.hold.filter((h) => h.resource.endsWith('_ore')).reduce((sum, h) => sum + h.units, 0);

/**
 * The first flight, one verb at a time: each step checks the live simulation, so the
 * player learns by doing it rather than by reading about it.
 */
export const TUTORIAL: Step[] = [
  { id: 'undock', title: 'tutorial.undock.title', hint: 'tutorial.undock.hint', done: (c) => !c.telemetry.docked },
  { id: 'thrust', title: 'tutorial.thrust.title', hint: 'tutorial.thrust.hint', done: (c) => c.telemetry.speed > 20 },
  { id: 'coast', title: 'tutorial.coast.title', hint: 'tutorial.coast.hint', done: (c) => c.stepTime > 2.5 && c.telemetry.speed > 10 && c.telemetry.output.main < 0.05 },
  {
    id: 'turn',
    title: 'tutorial.turn.title',
    hint: 'tutorial.turn.hint',
    done: (c) => Math.abs(((c.telemetry.heading - c.start.heading + 540) % 360) - 180) > 90,
  },
  { id: 'brake', title: 'tutorial.brake.title', hint: 'tutorial.brake.hint', done: (c) => c.telemetry.speed < 1 },
  { id: 'assist', title: 'tutorial.assist.title', hint: 'tutorial.assist.hint', done: (c) => c.telemetry.mode === 'assisted' },
  { id: 'scan', title: 'tutorial.scan.title', hint: 'tutorial.scan.hint', done: (c) => c.events.some((e) => e.type === 'scan' && e.owner === c.playerId) },
  { id: 'mine', title: 'tutorial.mine.title', hint: 'tutorial.mine.hint', done: (c) => ore(c.telemetry) >= 8 },
  { id: 'dock', title: 'tutorial.dock.title', hint: 'tutorial.dock.hint', done: (c) => c.telemetry.docked },
  { id: 'sell', title: 'tutorial.sell.title', hint: 'tutorial.sell.hint', done: (c) => c.telemetry.credits > c.start.credits },
];
