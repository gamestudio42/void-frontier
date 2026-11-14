import type { TutorialRules } from '@void-frontier/content';
import type { FlightTelemetry } from '@void-frontier/simulation';
import type { MessageKey } from './i18n.ts';

type TipRules = TutorialRules['tips'];

/** What the coach reads each frame; the game measures it, the rules here stay pure. */
export interface TipContext {
  /** Game clock, seconds. */
  now: number;
  telemetry: FlightTelemetry;
  /** The brake is held. */
  braking: boolean;
  /** Seconds since the player last touched a flight control. */
  idle: number;
  /** Seconds until the ship hits what lies along its motion, or null when clear. */
  impactIn: number | null;
  cruising: boolean;
  /** Seconds the player has been flying by hand under thrust. */
  manualFor: number;
  /** Metres to a place the autopilot can fly to that lies ahead on the course, or null. */
  destinationAhead: number | null;
  /** Seconds since the player's ship last took a hit. */
  sinceHit: number;
  /** A hostile is hunting the player. */
  hunted: boolean;
  targetLocked: boolean;
}

export interface Tip {
  id: string;
  text: MessageKey;
  /** The moment the tip is for. */
  when(ctx: TipContext, rules: TipRules): boolean;
  /** The player did what the tip asks: it goes away at once. */
  solved?(ctx: TipContext): boolean;
  /** Danger: shows past the gap between tips and pushes aside a calmer one. */
  urgent?: boolean;
}

const share = (value: number, max: number) => (max > 0 ? value / max : 1);

/** In priority order: what can kill the ship comes first. */
export const TIPS: Tip[] = [
  {
    id: 'brake',
    text: 'tip.brake',
    urgent: true,
    when: (c, r) => !c.telemetry.docked && c.telemetry.speed > r.impactSpeed && c.impactIn !== null && c.impactIn < r.impactSeconds && !c.braking,
    solved: (c) => c.braking,
  },
  {
    id: 'shield',
    text: 'tip.shield',
    when: (c, r) => share(c.telemetry.shield, c.telemetry.shieldMax) < r.shieldLow && c.sinceHit < 2 && !c.telemetry.destroyed,
  },
  { id: 'target', text: 'tip.target', when: (c) => c.hunted && !c.targetLocked && !c.telemetry.docked, solved: (c) => c.targetLocked },
  { id: 'heat', text: 'tip.heat', when: (c) => c.telemetry.weapons.some((w) => w.overheated) },
  {
    id: 'spin',
    text: 'tip.spin',
    when: (c, r) => c.telemetry.mode === 'newtonian' && Math.abs(c.telemetry.turnRate) > r.spinRate && !c.cruising,
    solved: (c) => c.telemetry.mode === 'assisted',
  },
  {
    id: 'drift',
    text: 'tip.drift',
    when: (c, r) => c.telemetry.mode === 'newtonian' && c.telemetry.speed > r.driftSpeed && c.idle > r.driftIdle && !c.cruising && !c.telemetry.docked,
    solved: (c) => c.braking || c.idle === 0,
  },
  { id: 'fuel', text: 'tip.fuel', when: (c, r) => !c.telemetry.docked && share(c.telemetry.fuel, c.telemetry.fuelCapacity) < r.lowFuel },
  {
    id: 'hold',
    text: 'tip.hold',
    when: (c, r) => !c.telemetry.docked && Math.max(share(c.telemetry.holdMass, c.telemetry.holdMaxMass), share(c.telemetry.holdVolume, c.telemetry.holdMaxVolume)) >= r.holdFull,
  },
  {
    id: 'cruise',
    text: 'tip.cruise',
    when: (c, r) => !c.cruising && c.manualFor > r.cruiseManual && c.destinationAhead !== null && c.destinationAhead > r.cruiseDistance,
    solved: (c) => c.cruising,
  },
];

/** Times each tip has shown, kept between sessions so a seasoned pilot is left alone. */
export type TipHistory = Record<string, number>;

/**
 * Shows one tip at a time, at the moment it applies. A tip stays up at least `minShow`
 * seconds unless the player does what it says; tips keep `minGap` apart, the same one
 * waits `cooldown` before coming back, and after `maxShows` it retires for good.
 */
export class TipCoach {
  private current: { tip: Tip; since: number; clearSince: number | null } | null = null;
  private lastEnd = -Infinity;
  private readonly lastShown = new Map<string, number>();

  constructor(
    private readonly rules: TipRules,
    readonly history: TipHistory = {},
    private readonly tips: Tip[] = TIPS,
  ) {}

  /** The tip to show this frame, or null. `shown` is called when a new one appears. */
  update(ctx: TipContext, shown?: (id: string) => void): Tip | null {
    const r = this.rules;
    if (this.current && !this.current.tip.urgent) {
      const urgent = this.tips.find((tip) => tip.urgent && tip !== this.current!.tip && this.eligible(tip, ctx));
      if (urgent) return this.start(urgent, ctx, shown);
    }
    if (this.current) {
      const { tip, since } = this.current;
      if (tip.solved?.(ctx)) return this.end(ctx.now);
      if (tip.when(ctx, r)) this.current.clearSince = null;
      else this.current.clearSince ??= ctx.now;
      const cleared = this.current.clearSince !== null && ctx.now - this.current.clearSince >= 1;
      if (cleared && ctx.now - since >= r.minShow) return this.end(ctx.now);
      return tip;
    }
    const gap = ctx.now - this.lastEnd >= r.minGap;
    const next = this.tips.find((tip) => (gap || tip.urgent) && this.eligible(tip, ctx));
    return next ? this.start(next, ctx, shown) : null;
  }

  private eligible(tip: Tip, ctx: TipContext): boolean {
    if ((this.history[tip.id] ?? 0) >= this.rules.maxShows) return false;
    if (ctx.now - (this.lastShown.get(tip.id) ?? -Infinity) < this.rules.cooldown) return false;
    return tip.when(ctx, this.rules);
  }

  private start(tip: Tip, ctx: TipContext, shown?: (id: string) => void): Tip {
    this.current = { tip, since: ctx.now, clearSince: null };
    this.lastShown.set(tip.id, ctx.now);
    this.history[tip.id] = (this.history[tip.id] ?? 0) + 1;
    shown?.(tip.id);
    return tip;
  }

  /** Drops the tip on screen (a menu opened, a new game started). */
  clear(now: number): void {
    if (this.current) this.end(now);
  }

  private end(now: number): null {
    this.current = null;
    this.lastEnd = now;
    return null;
  }
}
