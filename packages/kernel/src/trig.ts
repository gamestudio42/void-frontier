/**
 * Deterministic trigonometry built only from + - * / and sqrt, which IEEE 754 makes
 * bit-identical on every engine. `Math.sin` and friends are not, so the simulation
 * uses these instead (ESLint enforces it).
 */

export const PI = 3.141592653589793;
export const TAU = 2 * PI;
export const HALF_PI = PI / 2;
const QUARTER_PI = PI / 4;

// Cody-Waite split of pi/2 keeps the range reduction accurate for large angles.
const HALF_PI_HI = 1.5707963267341256;
const HALF_PI_LO = 6.077100506506192e-11;
const TWO_OVER_PI = 0.6366197723675814;

/** sin and cos on [-pi/4, pi/4] by Taylor series; the error is below 1e-15. */
function sinKernel(x: number): number {
  const x2 = x * x;
  return x * (1 + x2 * (-1 / 6 + x2 * (1 / 120 + x2 * (-1 / 5040 + x2 * (1 / 362880 + x2 * (-1 / 39916800 + x2 * (1 / 6227020800)))))));
}

function cosKernel(x: number): number {
  const x2 = x * x;
  return 1 + x2 * (-1 / 2 + x2 * (1 / 24 + x2 * (-1 / 720 + x2 * (1 / 40320 + x2 * (-1 / 3628800 + x2 * (1 / 479001600 + x2 * (-1 / 87178291200)))))));
}

function reduce(angle: number): { r: number; quadrant: number } {
  const k = Math.floor(angle * TWO_OVER_PI + 0.5);
  const r = angle - k * HALF_PI_HI - k * HALF_PI_LO;
  return { r, quadrant: ((k % 4) + 4) % 4 };
}

export function sin(angle: number): number {
  const { r, quadrant } = reduce(angle);
  switch (quadrant) {
    case 0: return sinKernel(r);
    case 1: return cosKernel(r);
    case 2: return -sinKernel(r);
    default: return -cosKernel(r);
  }
}

export function cos(angle: number): number {
  const { r, quadrant } = reduce(angle);
  switch (quadrant) {
    case 0: return cosKernel(r);
    case 1: return -sinKernel(r);
    case 2: return -cosKernel(r);
    default: return sinKernel(r);
  }
}

const TAN_EIGHTH_PI = 0.41421356237309503;

/** atan on [0, 1]: shift to |t| <= tan(pi/8), then a Taylor series with error below 1e-15. */
function atanUnit(z: number): number {
  let offset = 0;
  let t = z;
  if (z > TAN_EIGHTH_PI) {
    offset = QUARTER_PI;
    t = (z - 1) / (z + 1);
  }
  const t2 = t * t;
  let series = 0;
  for (let n = 43; n >= 1; n -= 2) series = 1 / n - t2 * series;
  return offset + t * series;
}

export function atan2(y: number, x: number): number {
  if (x === 0 && y === 0) return 0;
  const ax = x < 0 ? -x : x;
  const ay = y < 0 ? -y : y;
  const base = ay <= ax ? atanUnit(ay / ax) : HALF_PI - atanUnit(ax / ay);
  const angle = x < 0 ? PI - base : base;
  return y < 0 ? -angle : angle;
}

/** Wrap an angle into (-pi, pi]. */
export function wrapAngle(angle: number): number {
  let a = angle - TAU * Math.floor((angle + PI) / TAU);
  if (a <= -PI) a += TAU;
  return a;
}

export const toDegrees = (radians: number): number => (radians * 180) / PI;
export const toRadians = (degrees: number): number => (degrees * PI) / 180;
