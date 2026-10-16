import { describe, expect, it } from 'vitest';
import type { TrainMeta } from '@lw/shared';
import { SnapshotBuffer } from './buffer.ts';
import { makeMeta, makeOwn, makeSnapshot } from './testing.ts';
import { deriveCarriageAngles } from './view.ts';

const SIZE = 6000;
const LOCAL = 1;
const meta = new Map<number, TrainMeta>([
  [1, makeMeta(1, ['locomotive'])],
  [7, makeMeta(7, ['locomotive', 'mg', 'drones'])],
]);

function row(id: number, x: number, y: number, a = 0, coords: number[] = []) {
  return [id, x, y, a, 50, 100, 0, ...coords] as [number, ...number[]] as never;
}

describe('SnapshotBuffer', () => {
  it('returns null before any snapshot', () => {
    expect(new SnapshotBuffer(SIZE).sample(0, meta)).toBeNull();
  });

  it('interpolates a remote train between two snapshots', () => {
    const buf = new SnapshotBuffer(SIZE);
    buf.push(makeSnapshot({ st: 1000, tr: [row(7, 100, 200)] }), LOCAL, meta);
    buf.push(makeSnapshot({ st: 1100, tr: [row(7, 200, 300)] }), LOCAL, meta);
    const view = buf.sample(1050, meta);
    const t = view?.trains.find((x) => x.id === 7);
    expect(t?.x).toBeCloseTo(150, 6);
    expect(t?.y).toBeCloseTo(250, 6);
  });

  it('moves a train across the map seam smoothly, never sweeping across the map', () => {
    const buf = new SnapshotBuffer(SIZE);
    buf.push(makeSnapshot({ st: 1000, tr: [row(7, 5990, 3000)] }), LOCAL, meta);
    buf.push(makeSnapshot({ st: 1100, tr: [row(7, 10, 3000)] }), LOCAL, meta);
    const xs: number[] = [];
    for (let t = 1000; t <= 1100; t += 10) {
      xs.push(buf.sample(t, meta)?.trains.find((x) => x.id === 7)?.x ?? NaN);
    }
    // Every sample stays within 10 units of the seam, on one side or the other.
    for (const x of xs) {
      expect(x >= 5990 || x <= 10).toBe(true);
    }
    // And the motion is steady: consecutive samples differ by 2 units across the wrap.
    for (let i = 1; i < xs.length; i++) {
      const step = (((xs[i] as number) - (xs[i - 1] as number) + SIZE * 1.5) % SIZE) - SIZE / 2;
      expect(step).toBeCloseTo(2, 6);
    }
    expect(xs[5]).toBeCloseTo(0, 6);
  });

  it('interpolates angles by the short way round', () => {
    const buf = new SnapshotBuffer(SIZE);
    buf.push(makeSnapshot({ st: 0, tr: [row(7, 100, 100, 3.0)] }), LOCAL, meta);
    buf.push(makeSnapshot({ st: 100, tr: [row(7, 100, 100, -3.0)] }), LOCAL, meta);
    const a = buf.sample(50, meta)?.trains.find((x) => x.id === 7)?.angle ?? 0;
    // Halfway between 3.0 and -3.0 going through ±π is π, not 0.
    expect(Math.abs(Math.cos(a) + 1)).toBeLessThan(1e-9);
  });

  it('holds the newest view past the end, and the oldest before the start', () => {
    const buf = new SnapshotBuffer(SIZE);
    buf.push(makeSnapshot({ st: 1000, tr: [row(7, 100, 100)] }), LOCAL, meta);
    buf.push(makeSnapshot({ st: 1100, tr: [row(7, 200, 100)] }), LOCAL, meta);
    expect(buf.sample(5000, meta)?.trains.find((x) => x.id === 7)?.x).toBe(200);
    expect(buf.sample(0, meta)?.trains.find((x) => x.id === 7)?.x).toBe(100);
  });

  it('ignores stale and duplicate snapshots', () => {
    const buf = new SnapshotBuffer(SIZE);
    buf.push(makeSnapshot({ st: 1000 }), LOCAL, meta);
    buf.push(makeSnapshot({ st: 1000 }), LOCAL, meta);
    buf.push(makeSnapshot({ st: 900 }), LOCAL, meta);
    expect(buf.length).toBe(1);
  });

  it('drops the oldest snapshots to stay bounded', () => {
    const buf = new SnapshotBuffer(SIZE);
    for (let i = 0; i < 100; i++) buf.push(makeSnapshot({ st: i * 66 }), LOCAL, meta);
    expect(buf.length).toBeLessThanOrEqual(32);
    expect(buf.newest).toBe(99 * 66);
  });

  it('builds trains from meta and derives carriage angles', () => {
    const buf = new SnapshotBuffer(SIZE);
    // Head at (100, 100) heading +x, carriages trailing behind along the x axis.
    buf.push(
      makeSnapshot({ st: 0, tr: [row(7, 100, 100, 0, [82, 100, 64, 100, 46, 100])] }),
      LOCAL,
      meta,
    );
    const t = buf.sample(0, meta)?.trains.find((x) => x.id === 7);
    expect(t?.name).toBe('Train 7');
    expect(t?.carriages.map((c) => c.kind)).toEqual(['locomotive', 'mg', 'drones']);
    for (const c of t?.carriages ?? []) expect(c.angle).toBeCloseTo(0, 9);
    expect(t?.drones).toHaveLength(1);
  });

  it('includes the own train from the full state and keeps it out of the remote rows', () => {
    const buf = new SnapshotBuffer(SIZE);
    buf.push(
      makeSnapshot({ st: 0, me: makeOwn({ x: 50, y: 60, cs: [32, 60], f: 40, fm: 100 }) }),
      LOCAL,
      meta,
    );
    const view = buf.sample(0, meta);
    expect(view?.localId).toBe(LOCAL);
    const me = view?.trains.find((t) => t.id === LOCAL);
    expect(me).toMatchObject({ x: 50, y: 60, fuel: 40, fuelMax: 100 });
    expect(me?.carriages).toHaveLength(1);
  });

  it('decodes enemies, pickups, and projectiles by kind index', () => {
    const buf = new SnapshotBuffer(SIZE);
    buf.push(
      makeSnapshot({
        st: 0,
        en: [
          [3, 3, 10, 20, 0.5, 900, 1200, 'Dread Maw'],
          [4, 0, 30, 40, 0, 10, 20],
        ],
        tl: [[9, 1, 5, 6]],
        dr: [[10, 8, 7, 8, 2.5]],
        pr: [[11, 4, 1, 2, 3, 4]],
      }),
      LOCAL,
      meta,
    );
    const v = buf.sample(0, meta);
    expect(v?.enemies[0]).toMatchObject({ kind: 'boss', name: 'Dread Maw', hp: 900 });
    expect(v?.enemies[1]).toMatchObject({ kind: 'drone' });
    expect(v?.enemies[1]).not.toHaveProperty('name');
    expect(v?.trailers[0]).toMatchObject({ id: 9, kind: 'missile' });
    expect(v?.drops[0]).toMatchObject({ kind: 'fuel', age: 2.5 });
    expect(v?.projectiles[0]).toMatchObject({ kind: 'enemy', vx: 3, vy: 4 });
  });
});

describe('deriveCarriageAngles', () => {
  it('points each carriage toward the one ahead of it', () => {
    const angles = deriveCarriageAngles(100, 100, 0, [82, 100, 64, 100], SIZE);
    expect(angles).toEqual([0, 0]);
  });

  it('follows a bend and works across the seam', () => {
    // Heading +y from (5, 5995 wrapped to 5995): head at y=2, carriages at 5984, 5966 (wrapped).
    const angles = deriveCarriageAngles(10, 2, Math.PI / 2, [10, 5984, 10, 5966], SIZE);
    for (const a of angles) expect(a).toBeCloseTo(Math.PI / 2, 9);
  });

  it('falls back to the head angle when positions coincide', () => {
    expect(deriveCarriageAngles(5, 5, 1.25, [5, 5], SIZE)).toEqual([1.25]);
  });
});
