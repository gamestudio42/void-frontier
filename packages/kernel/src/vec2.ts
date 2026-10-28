/** Plain 2D vector. The simulation plane is X right, Y up; the renderer maps Y to -Z. */
export interface Vec2 {
  x: number;
  y: number;
}

export const vec2 = (x = 0, y = 0): Vec2 => ({ x, y });
export const copy = (v: Vec2): Vec2 => ({ x: v.x, y: v.y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (v: Vec2, s: number): Vec2 => ({ x: v.x * s, y: v.y * s });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
/** Z component of the 3D cross product; positive when b is counter-clockwise from a. */
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
export const lengthSq = (v: Vec2): number => v.x * v.x + v.y * v.y;
export const length = (v: Vec2): number => Math.sqrt(v.x * v.x + v.y * v.y);

/** Rotate a ship-local vector (x forward, y right) into the world for a ship facing `forward`. */
export function localToWorld(forward: Vec2, local: Vec2): Vec2 {
  // Right of forward (fx, fy) is (fy, -fx).
  return {
    x: forward.x * local.x + forward.y * local.y,
    y: forward.y * local.x - forward.x * local.y,
  };
}

/** Express a world vector in ship-local axes (x forward, y right). */
export function worldToLocal(forward: Vec2, world: Vec2): Vec2 {
  return {
    x: forward.x * world.x + forward.y * world.y,
    y: forward.y * world.x - forward.x * world.y,
  };
}

export const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;
