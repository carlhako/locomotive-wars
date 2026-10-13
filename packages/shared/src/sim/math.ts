/** Geometry helpers for a square world that wraps on both axes. */

export const TWO_PI = Math.PI * 2;

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Normalizes an angle difference to [-PI, PI]. */
export function shortAngle(d: number): number {
  return d - TWO_PI * Math.round(d / TWO_PI);
}

/** Wraps a coordinate into [0, size). */
export function wrapPos(v: number, size: number): number {
  const r = v % size;
  return r < 0 ? r + size : r;
}

/** Wraps a coordinate difference into [-size/2, size/2): the shortest signed offset. */
export function wrapDelta(d: number, size: number): number {
  const half = size / 2;
  return wrapPos(d + half, size) - half;
}

/** Shortest distance between two points on the wrapped world. */
export function wrapDist(ax: number, ay: number, bx: number, by: number, size: number): number {
  return Math.hypot(wrapDelta(bx - ax, size), wrapDelta(by - ay, size));
}

/** Bearing from (ax, ay) to (bx, by) along the shortest wrapped route. */
export function wrapAngle(ax: number, ay: number, bx: number, by: number, size: number): number {
  return Math.atan2(wrapDelta(by - ay, size), wrapDelta(bx - ax, size));
}

/**
 * Earliest point along the segment (x0, y0) to (x1, y1) that touches the circle at (cx, cy),
 * as a fraction in [0, 1], or null when it never does. The segment is the actual step travelled
 * (it may extend past the map edge); the circle is found by the shortest wrapped route, so hits
 * register across the seam. A segment that starts inside the circle returns 0.
 */
export function segmentCircleHit(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  cx: number,
  cy: number,
  r: number,
  size: number,
): number | null {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const fx = wrapDelta(x0 - cx, size);
  const fy = wrapDelta(y0 - cy, size);
  const c = fx * fx + fy * fy - r * r;
  if (c <= 0) return 0;
  const a = dx * dx + dy * dy;
  if (a === 0) return null;
  const b = 2 * (fx * dx + fy * dy);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}
