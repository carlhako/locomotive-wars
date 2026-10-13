import { describe, expect, it } from 'vitest';
import {
  clamp,
  lerp,
  segmentCircleHit,
  shortAngle,
  wrapAngle,
  wrapDelta,
  wrapDist,
  wrapPos,
} from './math.ts';

const SIZE = 6000;

describe('clamp and lerp', () => {
  it('clamps to the bounds', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });

  it('interpolates linearly', () => {
    expect(lerp(10, 20, 0)).toBe(10);
    expect(lerp(10, 20, 0.5)).toBe(15);
    expect(lerp(10, 20, 1)).toBe(20);
  });
});

describe('shortAngle', () => {
  it('leaves small angles alone', () => {
    expect(shortAngle(0.5)).toBeCloseTo(0.5);
    expect(shortAngle(-0.5)).toBeCloseTo(-0.5);
  });

  it('normalizes large angles to the shortest rotation', () => {
    expect(shortAngle(Math.PI * 2 + 0.25)).toBeCloseTo(0.25);
    expect(shortAngle(-Math.PI * 4 - 0.25)).toBeCloseTo(-0.25);
    expect(shortAngle(3.5)).toBeCloseTo(3.5 - Math.PI * 2);
  });
});

describe('wrapPos', () => {
  it('wraps coordinates into [0, size)', () => {
    expect(wrapPos(5, SIZE)).toBe(5);
    expect(wrapPos(SIZE + 5, SIZE)).toBe(5);
    expect(wrapPos(-5, SIZE)).toBe(SIZE - 5);
    expect(wrapPos(SIZE, SIZE)).toBe(0);
  });
});

describe('wrapDelta and wrapDist', () => {
  it('returns the shortest signed offset', () => {
    expect(wrapDelta(100, SIZE)).toBe(100);
    expect(wrapDelta(-100, SIZE)).toBe(-100);
    expect(wrapDelta(5994, SIZE)).toBe(-6);
    expect(wrapDelta(-5994, SIZE)).toBe(6);
  });

  it('measures across the seam: x=5997 and x=3 are 6 units apart', () => {
    expect(wrapDist(5997, 100, 3, 100, SIZE)).toBe(6);
    expect(wrapDist(3, 100, 5997, 100, SIZE)).toBe(6);
  });

  it('wraps both axes at once', () => {
    expect(wrapDist(5997, 5996, 3, 4, SIZE)).toBeCloseTo(Math.hypot(6, 8));
  });

  it('gives bearings along the shortest route', () => {
    expect(wrapAngle(5990, 100, 10, 100, SIZE)).toBeCloseTo(0);
    expect(wrapAngle(10, 100, 5990, 100, SIZE)).toBeCloseTo(Math.PI);
  });
});

describe('segmentCircleHit', () => {
  it('hits a circle in the path', () => {
    const t = segmentCircleHit(0, 0, 100, 0, 50, 0, 10, SIZE);
    expect(t).toBeCloseTo(0.4);
  });

  it('misses a circle off to the side', () => {
    expect(segmentCircleHit(0, 0, 100, 0, 50, 30, 10, SIZE)).toBeNull();
  });

  it('misses a circle behind the start or past the end', () => {
    expect(segmentCircleHit(0, 0, 100, 0, -50, 0, 10, SIZE)).toBeNull();
    expect(segmentCircleHit(0, 0, 100, 0, 200, 0, 10, SIZE)).toBeNull();
  });

  it('returns 0 when the segment starts inside the circle', () => {
    expect(segmentCircleHit(0, 0, 10, 0, 3, 0, 14, SIZE)).toBe(0);
  });

  it('catches a fast step that jumps clean over a small circle', () => {
    // Both endpoints are outside the 14-unit circle but the segment crosses it.
    expect(segmentCircleHit(100 - 15, 200, 100 + 15, 200, 100, 200, 14, SIZE)).not.toBeNull();
  });

  it('hits across the seam', () => {
    // Start 15 units before the seam heading right (past 6000); circle sits at x=5, so its
    // near edge is 6 units into the 30-unit step.
    const t = segmentCircleHit(5985, 100, 6015, 100, 5, 100, 14, SIZE);
    expect(t).toBeCloseTo(0.2);
  });
});
