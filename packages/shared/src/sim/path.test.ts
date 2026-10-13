import { describe, expect, it } from 'vitest';
import { wrapDist } from './math.ts';
import { createPath, pushPath, sampleBehind, trimPath } from './path.ts';

const SIZE = 6000;
const SPACING = 18;

/** Lays out carriage positions `count` spacings behind the head. */
function carriagePositions(path: ReturnType<typeof createPath>, count: number) {
  return Array.from({ length: count }, (_, i) => sampleBehind(path, (i + 1) * SPACING, SIZE));
}

function expectEvenSpacing(path: ReturnType<typeof createPath>, count: number, tolerance: number) {
  const pts = carriagePositions(path, count);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    expect(Math.abs(wrapDist(a.x, a.y, b.x, b.y, SIZE) - SPACING)).toBeLessThan(tolerance);
  }
}

describe('path buffer', () => {
  it('places carriages 18 units apart on a straight path', () => {
    const path = createPath(1000, 1000, 0);
    for (let i = 1; i <= 100; i++) pushPath(path, 1000 + i * 6.3, 1000, 0, SIZE);
    expectEvenSpacing(path, 20, 1e-6);
    const first = sampleBehind(path, SPACING, SIZE);
    expect(first.x).toBeCloseTo(1000 + 100 * 6.3 - SPACING);
    expect(first.angle).toBeCloseTo(0);
  });

  it('keeps spacing even around a curve (within chord error)', () => {
    const path = createPath(3000 + 100, 3000, Math.PI / 2);
    const radius = 100;
    const step = 0.05;
    for (let a = step; a < 6; a += step) {
      const x = 3000 + Math.cos(a) * radius;
      const y = 3000 + Math.sin(a) * radius;
      pushPath(path, x, y, a + Math.PI / 2, SIZE);
    }
    // Spacing is arc length, so the straight-line gap between carriages is a slightly
    // shorter chord on a 100-unit-radius circle.
    const chord = 2 * radius * Math.sin(SPACING / (2 * radius));
    const pts = carriagePositions(path, 15);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      expect(wrapDist(a.x, a.y, b.x, b.y, SIZE)).toBeCloseTo(chord, 1);
    }
  });

  it('keeps spacing even across the map seam', () => {
    const path = createPath(5950, 200, 0);
    for (let i = 1; i <= 40; i++) {
      pushPath(path, (5950 + i * 6 + SIZE) % SIZE, 200, 0, SIZE);
    }
    // Head is now at x=190; carriages straddle the seam.
    const pts = carriagePositions(path, 12);
    expect(pts.some((p) => p.x > 5000)).toBe(true);
    expect(pts.some((p) => p.x < 1000)).toBe(true);
    expectEvenSpacing(path, 12, 1e-6);
  });

  it('is independent of how finely the path is sampled', () => {
    const coarse = createPath(1000, 500, 0);
    const fine = createPath(1000, 500, 0);
    for (let i = 1; i <= 30; i++) pushPath(coarse, 1000 + i * 12, 500, 0, SIZE);
    for (let i = 1; i <= 60; i++) pushPath(fine, 1000 + i * 6, 500, 0, SIZE);
    const a = carriagePositions(coarse, 10);
    const b = carriagePositions(fine, 10);
    a.forEach((p, i) => {
      expect(p.x).toBeCloseTo((b[i] as { x: number }).x, 6);
    });
  });

  it('extends straight behind the start for a fresh train', () => {
    const path = createPath(2000, 2000, Math.PI / 2);
    const p = sampleBehind(path, 3 * SPACING, SIZE);
    expect(p.x).toBeCloseTo(2000);
    expect(p.y).toBeCloseTo(2000 - 3 * SPACING);
    expect(p.angle).toBeCloseTo(Math.PI / 2);
  });

  it('trims old samples while keeping the requested length available', () => {
    const path = createPath(0, 100, 0);
    for (let i = 1; i <= 1000; i++) pushPath(path, i * 5, 100, 0, 1e9);
    trimPath(path, 200);
    expect(path.length).toBeLessThan(60);
    const head = path[path.length - 1]!;
    const tail = path[0]!;
    expect(head.s - tail.s).toBeGreaterThanOrEqual(200);
    // Still interpolates at the full requested distance.
    const p = sampleBehind(path, 200, 1e9);
    expect(p.x).toBeCloseTo(head.x - 200);
  });

  it('never trims below two samples', () => {
    const path = createPath(0, 0, 0);
    pushPath(path, 5, 0, 0, SIZE);
    trimPath(path, 0);
    expect(path.length).toBe(2);
  });
});
