import { describe, expect, it } from 'vitest';
import { OUTPOST_ALPHA, TUTORIAL_RULES } from '@void-frontier/content';
import { Simulation, readTelemetry } from '@void-frontier/simulation';
import { TipCoach, type TipContext } from '../src/tips.ts';

const rules = TUTORIAL_RULES.tips;
const sim = Simulation.fromSector(OUTPOST_ALPHA);
sim.undock(sim.playerId);
const flying = readTelemetry(sim.world, sim.playerId)!;

/** A calm moment in open space; each test changes what it needs. */
function ctx(now: number, patch: Partial<TipContext> = {}, telemetry: Partial<typeof flying> = {}): TipContext {
  return {
    now,
    telemetry: { ...flying, mode: 'assisted', speed: 30, ...telemetry },
    braking: false,
    idle: 0,
    impactIn: null,
    cruising: false,
    manualFor: 0,
    destinationAhead: null,
    sinceHit: 100,
    hunted: false,
    targetLocked: false,
    ...patch,
  };
}

const danger = { impactIn: 2 };
const fast = { speed: 80 };

describe('contextual tips', () => {
  it('says nothing in a calm moment', () => {
    expect(new TipCoach(rules, {}).update(ctx(0))).toBeNull();
  });

  it('tells a pilot closing fast on a rock to brake, and goes away once they do', () => {
    const coach = new TipCoach(rules, {});
    expect(coach.update(ctx(0, danger, fast))?.id).toBe('brake');
    expect(coach.update(ctx(0.2, danger, fast))?.id).toBe('brake');
    expect(coach.update(ctx(0.4, { ...danger, braking: true }, fast))).toBeNull();
  });

  it('keeps a slow approach quiet', () => {
    expect(new TipCoach(rules, {}).update(ctx(0, danger, { speed: 10 }))).toBeNull();
  });

  it('holds a tip at least minShow seconds, then leaves a gap before the next', () => {
    const coach = new TipCoach(rules, {});
    const drifting = { idle: rules.driftIdle + 1 };
    const newtonian = { mode: 'newtonian' as const, speed: rules.driftSpeed + 10 };
    expect(coach.update(ctx(0, drifting, newtonian))?.id).toBe('drift');
    // The moment passes, but the tip stays readable.
    expect(coach.update(ctx(1, { idle: 0.5 }, newtonian))?.id).toBe('drift');
    expect(coach.update(ctx(rules.minShow + 1.5, { idle: 0.5 }, newtonian))).toBeNull();
    // Out of fuel right away: it waits for the gap.
    const low = { fuel: flying.fuelCapacity * 0.05 };
    expect(coach.update(ctx(rules.minShow + 2, {}, low))).toBeNull();
    expect(coach.update(ctx(rules.minShow + 2 + rules.minGap, {}, low))?.id).toBe('fuel');
  });

  it('lets danger push a calmer tip aside', () => {
    const coach = new TipCoach(rules, {});
    expect(coach.update(ctx(0, {}, { fuel: flying.fuelCapacity * 0.05 }))?.id).toBe('fuel');
    expect(coach.update(ctx(0.5, danger, { ...fast, fuel: flying.fuelCapacity * 0.05 }))?.id).toBe('brake');
  });

  it('retires a tip after maxShows and remembers it across sessions', () => {
    const history = {};
    const coach = new TipCoach(rules, history);
    let now = 0;
    const shown: string[] = [];
    for (let i = 0; i < rules.maxShows + 2; i++) {
      coach.update(ctx(now, danger, fast), (id) => shown.push(id));
      coach.update(ctx(now + 0.1, { ...danger, braking: true }, fast));
      now += rules.cooldown + 1;
    }
    expect(shown).toEqual(Array(rules.maxShows).fill('brake'));
    expect(new TipCoach(rules, { ...history }).update(ctx(now, danger, fast))).toBeNull();
  });

  it('suggests the autopilot for a long trip flown by hand', () => {
    const coach = new TipCoach(rules, {});
    const trip = { manualFor: rules.cruiseManual + 1, destinationAhead: rules.cruiseDistance + 500 };
    expect(coach.update(ctx(0, trip))?.id).toBe('cruise');
    expect(coach.update(ctx(0.5, { ...trip, cruising: true }))).toBeNull();
  });

  it('asks to lock on when something hunts the player', () => {
    const coach = new TipCoach(rules, {});
    expect(coach.update(ctx(0, { hunted: true }))?.id).toBe('target');
    expect(coach.update(ctx(0.3, { hunted: true, targetLocked: true }))).toBeNull();
  });
});
