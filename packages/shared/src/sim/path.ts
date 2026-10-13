import { wrapDelta, wrapPos } from './math.ts';
import type { PathSample } from './types.ts';

/**
 * The trail traced by a train's head. Each sample carries the cumulative arc length at that
 * point, so carriages can be placed a fixed distance behind the head regardless of tick rate
 * or speed. The buffer is only appended to at the head and trimmed at the tail.
 */

export interface PathPoint {
  x: number;
  y: number;
  angle: number;
}

/** A trail holding only the starting point. */
export function createPath(x: number, y: number, angle: number): PathSample[] {
  return [{ x, y, angle, s: 0 }];
}

/** Appends the head's new position, extending the cumulative length by the wrapped step. */
export function pushPath(
  path: PathSample[],
  x: number,
  y: number,
  angle: number,
  size: number,
): void {
  const last = path[path.length - 1];
  if (!last) {
    path.push({ x, y, angle, s: 0 });
    return;
  }
  const step = Math.hypot(wrapDelta(x - last.x, size), wrapDelta(y - last.y, size));
  path.push({ x, y, angle, s: last.s + step });
}

/**
 * Drops samples older than `keepLength` units behind the head, keeping the one sample at or
 * before that boundary so positions up to `keepLength` back can still be interpolated.
 */
export function trimPath(path: PathSample[], keepLength: number): void {
  const last = path[path.length - 1];
  if (!last) return;
  const boundary = last.s - keepLength;
  let drop = 0;
  while (drop + 1 < path.length - 1 && (path[drop + 1] as PathSample).s <= boundary) drop++;
  if (drop > 0) path.splice(0, drop);
}

/**
 * Position and travel direction `distance` units of arc length behind the head. Beyond the
 * start of the recorded trail the path is extended straight back from the first sample, so a
 * freshly spawned train lays its carriages out in a line behind the head.
 */
export function sampleBehind(path: PathSample[], distance: number, size: number): PathPoint {
  const last = path[path.length - 1];
  const first = path[0];
  if (!last || !first) return { x: 0, y: 0, angle: 0 };
  const target = last.s - distance;
  if (target <= first.s) {
    const extra = first.s - target;
    return {
      x: wrapPos(first.x - Math.cos(first.angle) * extra, size),
      y: wrapPos(first.y - Math.sin(first.angle) * extra, size),
      angle: first.angle,
    };
  }
  // path[lo].s < target <= path[hi].s
  let lo = 0;
  let hi = path.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((path[mid] as PathSample).s >= target) hi = mid;
    else lo = mid;
  }
  const a = path[lo] as PathSample;
  const b = path[hi] as PathSample;
  const span = b.s - a.s;
  const t = span > 0 ? (target - a.s) / span : 0;
  const dx = wrapDelta(b.x - a.x, size);
  const dy = wrapDelta(b.y - a.y, size);
  return {
    x: wrapPos(a.x + dx * t, size),
    y: wrapPos(a.y + dy * t, size),
    angle: span > 0 ? Math.atan2(dy, dx) : b.angle,
  };
}
