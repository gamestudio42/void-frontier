import { describe, expect, it } from 'vitest';
import { PAD, active, pressed, radial, readPad, trigger, type PadSnapshot } from '../src/gamepad.ts';

/** A standard-mapping pad at rest, with overrides. */
function pad(axes: number[] = [0, 0, 0, 0], down: Partial<Record<keyof typeof PAD, number>> = {}): PadSnapshot {
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
  for (const [name, value] of Object.entries(down)) buttons[PAD[name as keyof typeof PAD]] = { pressed: value > 0.5, value };
  return { axes, buttons };
}

describe('gamepad reading', () => {
  it('ignores a stick inside the dead zone and rescales past it', () => {
    expect(radial(0.1, 0.1)).toEqual({ x: 0, y: 0 });
    const full = radial(1, 0);
    expect(full.x).toBeCloseTo(1);
    const half = radial(0.6, 0);
    expect(half.x).toBeGreaterThan(0);
    expect(half.x).toBeLessThan(0.6);
  });

  it('keeps the stick direction and caps a corner at full deflection', () => {
    const corner = radial(1, 1);
    expect(Math.hypot(corner.x, corner.y)).toBeCloseTo(1);
    expect(corner.x).toBeCloseTo(corner.y);
  });

  it('reads stick up as forward thrust and the right stick as an aim', () => {
    const state = readPad(pad([0, -1, 0.8, 0]));
    expect(state.move.y).toBeCloseTo(1);
    expect(state.aim?.x).toBeGreaterThan(0);
    expect(readPad(pad()).aim).toBeNull();
  });

  it('fires from a trigger only past its rest travel', () => {
    expect(trigger(0.05)).toBe(0);
    expect(trigger(1)).toBe(1);
    expect(readPad(pad(undefined, { rt: 0.08 })).held.has('rt')).toBe(false);
    expect(readPad(pad(undefined, { rt: 0.9 })).held.has('rt')).toBe(true);
  });

  it('reports a button once when it goes down, not while it is held', () => {
    const first = readPad(pad(undefined, { a: 1 }));
    expect(pressed(null, first)).toEqual(['a']);
    expect(pressed(first, readPad(pad(undefined, { a: 1 })))).toEqual([]);
    expect(pressed(first, readPad(pad(undefined, { a: 1, y: 1 })))).toEqual(['y']);
  });

  it('counts only deliberate input as using the pad', () => {
    expect(active(readPad(pad([0.05, 0.05, 0, 0])))).toBe(false);
    expect(active(readPad(pad([0, 0, 0, 0], { b: 1 })))).toBe(true);
  });
});
