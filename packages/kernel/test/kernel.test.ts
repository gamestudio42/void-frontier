import { describe, expect, it } from 'vitest';
import { FixedStepper, Rng, atan2, cos, localToWorld, sin, worldToLocal, wrapAngle } from '../src/index.ts';

describe('deterministic trig', () => {
  it('matches Math.sin and Math.cos across many turns', () => {
    for (let a = -50; a <= 50; a += 0.0137) {
      expect(sin(a)).toBeCloseTo(Math.sin(a), 12);
      expect(cos(a)).toBeCloseTo(Math.cos(a), 12);
    }
  });

  it('matches Math.atan2 in every quadrant', () => {
    for (let y = -3; y <= 3; y += 0.173) {
      for (let x = -3; x <= 3; x += 0.191) {
        expect(atan2(y, x)).toBeCloseTo(Math.atan2(y, x), 12);
      }
    }
    expect(atan2(0, 0)).toBe(0);
    expect(atan2(1, 0)).toBeCloseTo(Math.PI / 2, 15);
    expect(atan2(0, -1)).toBeCloseTo(Math.PI, 15);
  });

  it('wraps angles into (-pi, pi]', () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(wrapAngle(-Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(wrapAngle(0.5 + 8 * Math.PI)).toBeCloseTo(0.5, 12);
  });
});

describe('ship-local axes', () => {
  it('round-trips between local and world frames', () => {
    const forward = { x: cos(0.7), y: sin(0.7) };
    const world = localToWorld(forward, { x: 3, y: -2 });
    const back = worldToLocal(forward, world);
    expect(back.x).toBeCloseTo(3, 12);
    expect(back.y).toBeCloseTo(-2, 12);
  });

  it('puts local +y on the right of the nose', () => {
    const right = localToWorld({ x: 0, y: 1 }, { x: 0, y: 1 });
    expect(right.x).toBeCloseTo(1, 12);
    expect(right.y).toBeCloseTo(0, 12);
  });
});

describe('Rng', () => {
  it('repeats the same stream for the same seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
    expect(new Rng(1).next()).not.toBe(new Rng(2).next());
  });
});

describe('FixedStepper', () => {
  const options = { dt: 1 / 60, maxFrameTime: 0.25, maxStepsPerFrame: 8 };

  it('runs whole steps and carries the remainder', () => {
    const stepper = new FixedStepper(options);
    const first = stepper.advance(1 / 30 + 0.001);
    expect(first.steps).toBe(2);
    expect(first.alpha).toBeGreaterThan(0);
    const second = stepper.advance(1 / 60);
    expect(second.steps).toBe(1);
  });

  it('keeps total simulated time equal to real time under jittery frames', () => {
    const stepper = new FixedStepper(options);
    let steps = 0;
    const frames = [0.012, 0.02, 0.016, 0.034, 0.008, 0.017, 0.016, 0.025];
    let total = 0;
    for (let i = 0; i < 100; i++) {
      for (const frame of frames) {
        steps += stepper.advance(frame).steps;
        total += frame;
      }
    }
    expect(Math.abs(steps / 60 - total)).toBeLessThan(1 / 60);
  });

  it('drops time instead of spiralling after a long stall', () => {
    const stepper = new FixedStepper(options);
    const result = stepper.advance(5);
    expect(result.steps).toBe(8);
    expect(result.droppedTime).toBeGreaterThan(4.5);
    expect(stepper.advance(1 / 60).steps).toBeLessThanOrEqual(1);
  });
});
