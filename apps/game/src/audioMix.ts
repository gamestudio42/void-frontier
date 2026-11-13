/**
 * The pure half of the audio engine: how intense the moment is, which music stems play
 * at what level, how far a sound carries, and which one-shots get a voice when too many
 * fire at once. No Web Audio here, so the rules are tested in Node.
 */

/** What the score reads from the game each frame. */
export interface MusicInput {
  docked: boolean;
  destroyed: boolean;
  /** Hostiles inside 900 m. */
  hostilesNear: number;
  /** Hostiles whose pilot is hunting the player. */
  hunting: number;
  /** A boss is alive in the sector. */
  boss: boolean;
  /** Seconds since the player last fired or was hit. */
  sinceAction: number;
  /** Hull share left, 0..1. */
  hull: number;
}

/**
 * How tense the moment is, 0 (drifting alone, docked) to 1 (boss fight). Combat lifts
 * it at once; it settles over several seconds after the last shot.
 */
export function musicIntensity(input: MusicInput): number {
  if (input.docked || input.destroyed) return 0;
  let level = 0.15;
  if (input.hostilesNear > 0) level = 0.4;
  if (input.hunting > 0) level = 0.6 + Math.min(0.2, (input.hunting - 1) * 0.07);
  // Fresh fire keeps the fight at full pitch; it fades over 8 s once the guns stop.
  if (input.sinceAction < 8) level = Math.max(level, 0.85 - (input.sinceAction / 8) * 0.35);
  if (input.boss && (input.hunting > 0 || input.hostilesNear > 0)) level = 1;
  // Low hull adds urgency on top.
  if (input.hull < 0.35 && level >= 0.4) level = Math.min(1, level + 0.1);
  return Math.max(0, Math.min(1, level));
}

/** Rises fast, falls slowly, so a fight starts with a hit and ends with a breath. */
export function smoothIntensity(current: number, target: number, dt: number): number {
  const tau = target > current ? 0.6 : 5;
  return current + (target - current) * (1 - Math.exp(-dt / tau));
}

export type Stem = 'drone' | 'pad' | 'pulse' | 'drums' | 'brass';

/**
 * Level of each stem for an intensity, 0..1. The drone always plays in flight; the pad
 * carries exploration and thins out as the fight builds; the pulse comes in with
 * danger, drums with the fight, brass only at the peak.
 */
export function stemLevels(intensity: number, docked: boolean): Record<Stem, number> {
  const ramp = (from: number, to: number) => Math.max(0, Math.min(1, (intensity - from) / (to - from)));
  if (docked) return { drone: 0.4, pad: 0.8, pulse: 0, drums: 0, brass: 0 };
  return {
    drone: 0.7 + 0.3 * ramp(0.3, 0.8),
    pad: 1 - 0.6 * ramp(0.4, 0.9),
    pulse: ramp(0.3, 0.55),
    drums: ramp(0.55, 0.8),
    brass: ramp(0.9, 1),
  };
}

/**
 * Gain and pan of a sound `dx, dy` metres from the player. Close sounds are full,
 * far ones fade with an inverse curve and lose their highs (the low-pass cutoff).
 */
export function spatial(dx: number, dy: number): { gain: number; pan: number; cutoff: number } {
  const d = Math.sqrt(dx * dx + dy * dy);
  const gain = 1 / (1 + Math.max(0, d - 30) / 140);
  const pan = Math.max(-0.9, Math.min(0.9, dx / 350));
  const cutoff = Math.max(900, 18000 / (1 + d / 250));
  return { gain, pan, cutoff };
}

/** Priority classes: when voices run out, lower classes give way first. */
export const PRIORITY = { ambient: 0, distant: 1, weapon: 2, impact: 3, player: 4, critical: 5 } as const;
export type Priority = (typeof PRIORITY)[keyof typeof PRIORITY];

export interface VoiceRequest {
  priority: Priority;
  /** Loudness at the listener, 0..1, the tie-break inside a class. */
  gain: number;
  /** Seconds the sound lasts. */
  duration: number;
  /** Sounds of the same kind closer together than `spacing` merge into one. */
  kind: string;
}

/**
 * Keeps the number of one-shots playing under a budget. A request that fits plays; one
 * over budget steals the weakest playing voice of a lower or equal rank, or is dropped.
 * The same kind repeated within its spacing is dropped, so a burst of rounds hitting
 * the same rock does not phase into a buzz.
 */
export class VoiceBudget {
  private readonly playing: { priority: number; gain: number; ends: number }[] = [];
  private readonly lastOf = new Map<string, number>();

  constructor(
    readonly max = 24,
    readonly spacing = 0.03,
  ) {}

  /** True when the sound should play now. */
  admit(request: VoiceRequest, now: number): boolean {
    for (let i = this.playing.length - 1; i >= 0; i--) if (this.playing[i].ends <= now) this.playing.splice(i, 1);
    const last = this.lastOf.get(request.kind);
    if (last !== undefined && now - last < this.spacing && request.priority < PRIORITY.critical) return false;
    if (this.playing.length >= this.max) {
      let weakest = -1;
      for (let i = 0; i < this.playing.length; i++) {
        const v = this.playing[i];
        if (v.priority > request.priority) continue;
        if (v.priority === request.priority && v.gain >= request.gain) continue;
        if (weakest < 0 || v.priority < this.playing[weakest].priority || (v.priority === this.playing[weakest].priority && v.gain < this.playing[weakest].gain)) weakest = i;
      }
      if (weakest < 0) return false;
      this.playing.splice(weakest, 1);
    }
    this.playing.push({ priority: request.priority, gain: request.gain, ends: now + request.duration });
    this.lastOf.set(request.kind, now);
    return true;
  }

  get count(): number {
    return this.playing.length;
  }
}

/**
 * Cycles through `count` variants without repeating the last one, from a seed the
 * caller advances (round robin with a shuffle, so no two shots in a row match).
 */
export function nextVariant(previous: number, count: number, roll: number): number {
  if (count <= 1) return 0;
  const step = 1 + Math.floor(roll * (count - 1));
  return (previous + step) % count;
}

/** A pitch multiplier within ±`cents`, from a 0..1 roll. */
export function pitchJitter(roll: number, cents = 60): number {
  return 2 ** (((roll * 2 - 1) * cents) / 1200);
}

/** How much the music and ambience dip under an event of this weight, 0..1. */
export function duckDepth(weight: number): number {
  return Math.max(0, Math.min(0.75, weight * 0.75));
}
