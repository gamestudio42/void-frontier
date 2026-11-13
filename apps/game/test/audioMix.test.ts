import { describe, expect, it } from 'vitest';
import { PRIORITY, VoiceBudget, duckDepth, musicIntensity, nextVariant, pitchJitter, smoothIntensity, spatial, stemLevels, type MusicInput } from '../src/audioMix.ts';

const calm: MusicInput = { docked: false, destroyed: false, hostilesNear: 0, hunting: 0, boss: false, sinceAction: 60, hull: 1 };

describe('music intensity', () => {
  it('rises from drifting alone, to danger near, to a fight, to a boss', () => {
    const alone = musicIntensity(calm);
    const near = musicIntensity({ ...calm, hostilesNear: 2 });
    const hunted = musicIntensity({ ...calm, hostilesNear: 2, hunting: 1 });
    const firing = musicIntensity({ ...calm, hostilesNear: 2, hunting: 1, sinceAction: 0 });
    const boss = musicIntensity({ ...calm, hostilesNear: 1, hunting: 1, boss: true });
    expect(alone).toBeLessThan(near);
    expect(near).toBeLessThan(hunted);
    expect(hunted).toBeLessThan(firing);
    expect(boss).toBe(1);
  });

  it('is silent of tension when docked or destroyed', () => {
    expect(musicIntensity({ ...calm, docked: true, hunting: 3 })).toBe(0);
    expect(musicIntensity({ ...calm, destroyed: true, hunting: 3 })).toBe(0);
  });

  it('settles after the guns stop, and low hull adds urgency', () => {
    expect(musicIntensity({ ...calm, sinceAction: 1 })).toBeGreaterThan(musicIntensity({ ...calm, sinceAction: 7 }));
    expect(musicIntensity({ ...calm, hunting: 1, hull: 0.2 })).toBeGreaterThan(musicIntensity({ ...calm, hunting: 1 }));
  });

  it('rises faster than it falls', () => {
    const up = smoothIntensity(0, 1, 0.5);
    const down = 1 - smoothIntensity(1, 0, 0.5);
    expect(up).toBeGreaterThan(down * 3);
  });
});

describe('stems', () => {
  it('bring in pulse, drums and brass in order as intensity climbs', () => {
    const low = stemLevels(0.15, false);
    const mid = stemLevels(0.5, false);
    const high = stemLevels(0.8, false);
    const peak = stemLevels(1, false);
    expect(low).toMatchObject({ pulse: 0, drums: 0, brass: 0 });
    expect(mid.pulse).toBeGreaterThan(0);
    expect(mid.drums).toBe(0);
    expect(high.drums).toBeGreaterThan(0.9);
    expect(high.brass).toBe(0);
    expect(peak.brass).toBe(1);
    expect(peak.pad).toBeLessThan(low.pad);
    expect(low.drone).toBeGreaterThan(0);
  });

  it('keeps the station calm', () => {
    expect(stemLevels(1, true)).toMatchObject({ pulse: 0, drums: 0, brass: 0 });
  });
});

describe('spatial', () => {
  it('fades and darkens with distance and pans to the side the sound is on', () => {
    const near = spatial(10, 0);
    const far = spatial(2000, 0);
    expect(near.gain).toBeCloseTo(1);
    expect(far.gain).toBeLessThan(0.1);
    expect(far.cutoff).toBeLessThan(near.cutoff);
    expect(spatial(-300, 0).pan).toBeLessThan(0);
    expect(Math.abs(spatial(1e6, 0).pan)).toBeLessThanOrEqual(0.9);
  });
});

describe('voice budget', () => {
  it('drops the weakest lower-priority voice when full, never a critical one for a weapon', () => {
    const budget = new VoiceBudget(3, 0);
    expect(budget.admit({ priority: PRIORITY.weapon, gain: 0.2, duration: 5, kind: 'a' }, 0)).toBe(true);
    expect(budget.admit({ priority: PRIORITY.weapon, gain: 0.5, duration: 5, kind: 'b' }, 0)).toBe(true);
    expect(budget.admit({ priority: PRIORITY.critical, gain: 0.5, duration: 5, kind: 'c' }, 0)).toBe(true);
    // Full: a louder critical sound steals the weakest weapon voice.
    expect(budget.admit({ priority: PRIORITY.critical, gain: 0.9, duration: 5, kind: 'd' }, 0)).toBe(true);
    expect(budget.count).toBe(3);
    // A distant shot cannot push out anything stronger.
    expect(budget.admit({ priority: PRIORITY.distant, gain: 1, duration: 5, kind: 'e' }, 0)).toBe(false);
  });

  it('frees voices that finished and merges the same kind fired too close together', () => {
    const budget = new VoiceBudget(1, 0.05);
    expect(budget.admit({ priority: PRIORITY.weapon, gain: 0.5, duration: 0.1, kind: 'shot' }, 0)).toBe(true);
    expect(budget.admit({ priority: PRIORITY.player, gain: 0.5, duration: 0.1, kind: 'shot' }, 0.01)).toBe(false);
    expect(budget.admit({ priority: PRIORITY.weapon, gain: 0.5, duration: 0.1, kind: 'shot' }, 0.2)).toBe(true);
  });
});

describe('variation', () => {
  it('never repeats the previous variant and stays in range', () => {
    let v = 0;
    for (let i = 0; i < 50; i++) {
      const next = nextVariant(v, 3, (i * 0.37) % 1);
      expect(next).not.toBe(v);
      expect(next).toBeGreaterThanOrEqual(0);
      expect(next).toBeLessThan(3);
      v = next;
    }
    expect(nextVariant(0, 1, 0.5)).toBe(0);
  });

  it('keeps pitch within the cents asked for and ducking under 75%', () => {
    expect(pitchJitter(0, 100)).toBeCloseTo(2 ** (-100 / 1200));
    expect(pitchJitter(1, 100)).toBeCloseTo(2 ** (100 / 1200));
    expect(duckDepth(5)).toBe(0.75);
    expect(duckDepth(0)).toBe(0);
  });
});
