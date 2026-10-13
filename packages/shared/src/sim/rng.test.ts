import { describe, expect, it } from 'vitest';
import { Rng } from './rng.ts';

describe('Rng', () => {
  it('repeats the same sequence for the same seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('produces different sequences for different seeds', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it('keeps next() within [0, 1)', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 10_000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('keeps range() within [min, max)', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 10_000; i++) {
      const v = rng.range(-5, 12);
      expect(v).toBeGreaterThanOrEqual(-5);
      expect(v).toBeLessThan(12);
    }
  });

  it('returns integers in [min, max) from int()', () => {
    const rng = new Rng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = rng.int(2, 6);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThan(6);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([2, 3, 4, 5]);
  });

  it('resumes from a saved state', () => {
    const rng = new Rng(99);
    rng.next();
    rng.next();
    const resumed = new Rng(0);
    resumed.state = rng.state;
    expect(resumed.next()).toBe(rng.next());
  });

  it('picks every element of an array eventually and rejects empty arrays', () => {
    const rng = new Rng(3);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(rng.pick(['a', 'b', 'c']));
    expect(seen.size).toBe(3);
    expect(() => rng.pick([])).toThrow();
  });

  it('draws weighted items in proportion to their weights', () => {
    const rng = new Rng(11);
    const items = [
      { id: 'heavy', w: 9 },
      { id: 'light', w: 1 },
      { id: 'never', w: 0 },
    ];
    const counts: Record<string, number> = { heavy: 0, light: 0, never: 0 };
    for (let i = 0; i < 5000; i++) {
      const picked = rng.weighted(items, (item) => item.w);
      counts[picked.id] = (counts[picked.id] ?? 0) + 1;
    }
    expect(counts.never).toBe(0);
    const heavy = counts.heavy ?? 0;
    expect(heavy / 5000).toBeGreaterThan(0.85);
    expect(heavy / 5000).toBeLessThan(0.95);
  });
});
