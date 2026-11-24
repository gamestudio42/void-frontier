import { describe, expect, it } from 'vitest';
import { translator } from '../src/i18n.ts';
import { STICK_DEAD, stickAxes } from '../src/touch.ts';

describe('touch stick', () => {
  it('stays centred inside the dead zone', () => {
    expect(stickAxes(0, 0)).toEqual({ x: 0, y: 0 });
    expect(stickAxes(STICK_DEAD - 1, 0)).toEqual({ x: 0, y: 0 });
  });

  it('maps a drag up to forward thrust and a drag right to strafe', () => {
    const forward = stickAxes(0, -48);
    expect(forward.x).toBeCloseTo(0);
    expect(forward.y).toBeCloseTo(1);
    const right = stickAxes(48, 0);
    expect(right.x).toBeCloseTo(1);
    expect(right.y).toBeCloseTo(0);
  });

  it('caps a corner at full deflection and keeps the direction', () => {
    const corner = stickAxes(80, -80);
    expect(Math.hypot(corner.x, corner.y)).toBeCloseTo(1);
    expect(corner.x).toBeCloseTo(corner.y);
  });
});

describe('touch prompts', () => {
  it('names the on-screen controls on a touch device and keeps the keyboard text otherwise', () => {
    const touch = translator('pt-BR', 'touch');
    const keys = translator('pt-BR', 'keyboard');
    expect(touch('tutorial.thrust.hint')).toContain('Acelerar');
    expect(touch('tutorial.thrust.hint')).not.toContain('W');
    expect(touch('tutorial.turn.hint')).toContain('Virar');
    expect(keys('tutorial.thrust.hint')).toContain('W');
    expect(translator('en', 'touch')('tutorial.brake.hint')).toContain('Brake');
    expect(translator('en', 'gamepad')('tutorial.thrust.hint')).toContain('left stick');
  });
});
