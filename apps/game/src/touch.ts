/** Pixels of stick travel that still count as centred. */
export const STICK_DEAD = 10;
/** Pixels of travel that mean full deflection. */
export const STICK_RADIUS = 48;

/**
 * A virtual stick. Up on the screen (negative dy) is +y, the same way the
 * flight stick reads: +y forward, +x to the right. Inside the dead zone the
 * stick is centred, so a resting finger does not thrust.
 */
export function stickAxes(dx: number, dy: number, radius = STICK_RADIUS): { x: number; y: number } {
  const scale = Math.hypot(dx, dy);
  if (scale < STICK_DEAD) return { x: 0, y: 0 };
  const power = Math.min(1, scale / radius);
  return { x: (dx / scale) * power, y: (-dy / scale) * power };
}

/** A phone or tablet: the primary pointer is a finger, not a mouse. */
export function coarsePointer(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}
