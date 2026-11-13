/**
 * Gamepad reading for the standard mapping (Xbox layout names). Pure functions over a
 * snapshot of `navigator.getGamepads()`, so the mapping can be tested without a browser.
 */

/** Button indices of the W3C standard gamepad mapping. */
export const PAD = {
  a: 0,
  b: 1,
  x: 2,
  y: 3,
  lb: 4,
  rb: 5,
  lt: 6,
  rt: 7,
  view: 8,
  menu: 9,
  ls: 10,
  rs: 11,
  up: 12,
  down: 13,
  left: 14,
  right: 15,
} as const;

export type PadButton = keyof typeof PAD;

/** Labels shown in prompts and the controls panel. */
export const PAD_GLYPHS: Record<PadButton, string> = {
  a: 'Ⓐ',
  b: 'Ⓑ',
  x: 'Ⓧ',
  y: 'Ⓨ',
  lb: 'LB',
  rb: 'RB',
  lt: 'LT',
  rt: 'RT',
  view: '⧉',
  menu: '☰',
  ls: 'L3',
  rs: 'R3',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
};

export interface PadSnapshot {
  axes: readonly number[];
  buttons: readonly { pressed: boolean; value: number }[];
}

export interface PadState {
  /** Left stick after the dead zone: x right, y up (pushing forward is +y). */
  move: { x: number; y: number };
  /** Right stick after the dead zone, or null when centred. x right, y up. */
  aim: { x: number; y: number } | null;
  /** Analogue triggers, 0..1 after their dead zone. */
  lt: number;
  rt: number;
  /** Buttons held this frame. */
  held: Set<PadButton>;
}

/** Stick dead zone, as a share of full deflection. */
export const STICK_DEAD_ZONE = 0.2;
/** Trigger travel ignored at the top, so a resting finger does not fire. */
export const TRIGGER_DEAD_ZONE = 0.12;

/**
 * Radial dead zone, rescaled so the response starts at 0 just past the dead zone and
 * reaches 1 at full deflection, without the square corners of per-axis dead zones.
 */
export function radial(x: number, y: number, dead = STICK_DEAD_ZONE): { x: number; y: number } {
  const magnitude = Math.hypot(x, y);
  if (magnitude <= dead) return { x: 0, y: 0 };
  const scaled = Math.min(1, (magnitude - dead) / (1 - dead));
  return { x: (x / magnitude) * scaled, y: (y / magnitude) * scaled };
}

export function trigger(value: number, dead = TRIGGER_DEAD_ZONE): number {
  return value <= dead ? 0 : Math.min(1, (value - dead) / (1 - dead));
}

/** Reads one pad. The browser's stick y is + downward; here + is up. */
export function readPad(pad: PadSnapshot): PadState {
  const axis = (i: number) => pad.axes[i] ?? 0;
  const button = (i: number) => pad.buttons[i] ?? { pressed: false, value: 0 };
  const left = radial(axis(0), -axis(1));
  const right = radial(axis(2), -axis(3));
  const held = new Set<PadButton>();
  for (const name of Object.keys(PAD) as PadButton[]) {
    const b = button(PAD[name]);
    if (name === 'lt' || name === 'rt') {
      if (trigger(b.value) > 0) held.add(name);
    } else if (b.pressed) held.add(name);
  }
  return {
    move: left,
    aim: right.x === 0 && right.y === 0 ? null : right,
    lt: trigger(button(PAD.lt).value),
    rt: trigger(button(PAD.rt).value),
    held,
  };
}

/** Buttons that went down between two frames. */
export function pressed(previous: PadState | null, next: PadState): PadButton[] {
  return [...next.held].filter((b) => !previous?.held.has(b));
}

/** Whether a frame has any deliberate input, to tell which device the player is using. */
export function active(state: PadState): boolean {
  return state.held.size > 0 || state.aim !== null || state.move.x !== 0 || state.move.y !== 0;
}

/** The first connected pad with the standard mapping, or any pad if none declares it. */
export function firstPad(pads: readonly (Gamepad | null)[]): Gamepad | null {
  const connected = pads.filter((p): p is Gamepad => !!p && p.connected);
  return connected.find((p) => p.mapping === 'standard') ?? connected[0] ?? null;
}
