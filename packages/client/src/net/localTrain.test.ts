import { describe, expect, it } from 'vitest';
import { BASE_SPEED, TURN_RATE, TRAIN_FLAG_DEAD, wrapDelta } from '@lw/shared';
import type { TrainInput } from '@lw/shared';
import { CORRECTION_MS, LocalTrain, MAX_EXTRAPOLATION_MS } from './localTrain.ts';
import { makeOwn } from './testing.ts';

const SIZE = 6000;
const STRAIGHT: TrainInput = { turn: 0, boost: false, brake: false, aim: 0 };
const SNAP_MS = 1000 / 15;

describe('LocalTrain', () => {
  it('has nothing to draw before the first snapshot', () => {
    expect(new LocalTrain(SIZE).sample(0, 0, STRAIGHT)).toBeNull();
  });

  it('draws the train within one snapshot interval of the server position, not 133 ms behind', () => {
    const train = new LocalTrain(SIZE);
    const latency = 40;
    const perSnapshot = (BASE_SPEED * SNAP_MS) / 1000;
    const truth = (t: number): number => 1000 + (BASE_SPEED * (t - 1000)) / 1000;
    let worst = 0;
    let nextSnap = 0;
    // Clock t is server time. Snapshot k is made at 1000 + k * SNAP_MS and arrives `latency` later.
    for (let t = 1000; t < 4000; t += 8) {
      while (1000 + nextSnap * SNAP_MS + latency <= t) {
        const st = 1000 + nextSnap * SNAP_MS;
        train.onSnapshot(makeOwn({ x: Math.round(truth(st)), cs: [] }), st, 0, t, t, STRAIGHT);
        nextSnap++;
      }
      const pose = train.sample(t, t, STRAIGHT);
      if (!pose) continue;
      worst = Math.max(worst, Math.abs(pose.x - truth(t)));
    }
    expect(worst).toBeLessThan(perSnapshot);
    // In fact the prediction is far tighter than the spec's bound.
    expect(worst).toBeLessThan(2);
    // A train drawn 133 ms late would be off by about 24 units.
    expect(worst).toBeLessThan((BASE_SPEED * 133) / 1000 / 4);
  });

  it('turns at once when the player steers, before the server has heard', () => {
    const train = new LocalTrain(SIZE);
    train.onSnapshot(makeOwn({ a: 0 }), 1000, 0, 1000, 1000, STRAIGHT);
    const pose = train.sample(1100, 1100, { ...STRAIGHT, turn: 1 });
    expect(pose?.angle).toBeCloseTo(TURN_RATE * 0.1, 9);
    const straight = train.sample(1100, 1100, STRAIGHT);
    expect(straight?.angle).toBe(0);
  });

  it('runs faster when boosting with fuel and slower when braking', () => {
    const train = new LocalTrain(SIZE);
    train.onSnapshot(makeOwn({ x: 1000, f: 50 }), 1000, 0, 1000, 1000, STRAIGHT);
    const plain = train.sample(1100, 1100, STRAIGHT)?.x ?? 0;
    const boost = train.sample(1100, 1100, { ...STRAIGHT, boost: true })?.x ?? 0;
    const brake = train.sample(1100, 1100, { ...STRAIGHT, brake: true })?.x ?? 0;
    expect(boost).toBeGreaterThan(plain);
    expect(brake).toBeLessThan(plain);
    // No fuel, no boost.
    train.onSnapshot(makeOwn({ x: 1000, f: 0 }), 2000, 0, 2000, 2000, STRAIGHT);
    expect(train.sample(2100, 2100, { ...STRAIGHT, boost: true })?.x).toBeCloseTo(plain, 6);
  });

  it('speed carriages raise the extrapolated speed', () => {
    const train = new LocalTrain(SIZE);
    train.onSnapshot(makeOwn({ x: 1000 }), 1000, 3, 1000, 1000, STRAIGHT);
    const x = train.sample(1100, 1100, STRAIGHT)?.x ?? 0;
    expect(x - 1000).toBeCloseTo(BASE_SPEED * 0.1 * 1.21, 6);
  });

  it('moves carriages along the trail behind the extrapolated head', () => {
    const train = new LocalTrain(SIZE);
    // Head at 1000 heading +x; carriages 18 and 36 units behind.
    train.onSnapshot(
      makeOwn({ x: 1000, y: 500, cs: [982, 500, 964, 500] }),
      1000,
      0,
      1000,
      1000,
      STRAIGHT,
    );
    const pose = train.sample(1100, 1100, STRAIGHT);
    // 0.1 s at 180 u/s is 18 units: each carriage takes the place of the one ahead of it.
    expect(pose?.x).toBeCloseTo(1018, 6);
    expect(pose?.carriages[0]?.x).toBeCloseTo(1000, 6);
    expect(pose?.carriages[1]?.x).toBeCloseTo(982, 6);
    expect(pose?.carriages[0]?.y).toBeCloseTo(500, 6);
  });

  it('keeps the carriages on the old trail around a bend', () => {
    const train = new LocalTrain(SIZE);
    // An L-shaped trail: head heading +y, carriage 18 behind, next 18 further back along -x.
    train.onSnapshot(
      makeOwn({ x: 1000, y: 1000, a: Math.PI / 2, cs: [1000, 982, 982, 982] }),
      0,
      0,
      0,
      0,
      STRAIGHT,
    );
    const pose = train.sample(50, 50, STRAIGHT);
    // 9 units ahead: carriage 0 is 9 units up its first leg, carriage 1 is 9 units along the corner.
    expect(pose?.carriages[0]?.x).toBeCloseTo(1000, 6);
    expect(pose?.carriages[0]?.y).toBeCloseTo(991, 6);
    expect(pose?.carriages[1]?.y).toBeCloseTo(982, 6);
    expect(pose?.carriages[1]?.x).toBeCloseTo(991, 6);
  });

  it('wraps across the map seam', () => {
    const train = new LocalTrain(SIZE);
    train.onSnapshot(makeOwn({ x: 5990, y: 100, cs: [5972, 100] }), 0, 0, 0, 0, STRAIGHT);
    const pose = train.sample(100, 100, STRAIGHT);
    expect(wrapDelta((pose?.x ?? 0) - 8, SIZE)).toBeCloseTo(0, 6);
    expect(pose?.x).toBeLessThan(100);
    expect(pose?.carriages[0]?.x).toBeCloseTo(5990, 6);
  });

  it('does not run ahead of the newest snapshot beyond the cap', () => {
    const train = new LocalTrain(SIZE);
    train.onSnapshot(makeOwn({ x: 1000 }), 0, 0, 0, 0, STRAIGHT);
    const far = train.sample(10_000, 10_000, STRAIGHT)?.x ?? 0;
    expect(far - 1000).toBeCloseTo((BASE_SPEED * MAX_EXTRAPOLATION_MS) / 1000, 6);
  });

  it('holds a destroyed train in place', () => {
    const train = new LocalTrain(SIZE);
    train.onSnapshot(makeOwn({ x: 1000, fl: TRAIN_FLAG_DEAD }), 0, 0, 0, 0, STRAIGHT);
    expect(train.sample(200, 200, STRAIGHT)?.x).toBe(1000);
  });

  describe('corrections', () => {
    function settled(): LocalTrain {
      const train = new LocalTrain(SIZE);
      train.onSnapshot(makeOwn({ x: 1000 }), 0, 0, 0, 0, STRAIGHT);
      return train;
    }

    it('does not jump when a snapshot disagrees, then converges on the new state', () => {
      const train = settled();
      const before = train.sample(100, 100, STRAIGHT)?.x ?? 0; // 1018
      // The next snapshot says the train is 30 units further on than predicted.
      train.onSnapshot(makeOwn({ x: 1000 + 0.18 * 66.67 + 30 }), 66.67, 0, 100, 100, STRAIGHT);
      const atArrival = train.sample(100, 100, STRAIGHT)?.x ?? 0;
      expect(atArrival).toBeCloseTo(before, 6);
      const target = (t: number): number => 1000 + 0.18 * 66.67 + 30 + 0.18 * (t - 66.67);
      // Halfway through the blend it is halfway between where it was and where it is heading.
      const midT = 100 + CORRECTION_MS / 2;
      const mid = train.sample(midT, midT, STRAIGHT)?.x ?? 0;
      const start = before + 0.18 * (CORRECTION_MS / 2);
      expect(mid).toBeCloseTo((start + target(midT)) / 2, 0);
      // After the blend it sits exactly on the prediction from the new snapshot.
      const endT = 100 + CORRECTION_MS;
      expect(train.sample(endT, endT, STRAIGHT)?.x).toBeCloseTo(target(endT), 6);
    });

    it('snaps at once when the error is large, such as after a respawn', () => {
      const train = settled();
      train.onSnapshot(makeOwn({ x: 3000 }), 66.67, 0, 100, 100, STRAIGHT);
      const pose = train.sample(100, 100, STRAIGHT)?.x ?? 0;
      expect(pose).toBeCloseTo(3000 + 0.18 * (100 - 66.67), 6);
    });

    it('blends the heading too', () => {
      const train = settled();
      train.onSnapshot(makeOwn({ x: 1012, a: 0.3 }), 66.67, 0, 100, 100, STRAIGHT);
      const angle = train.sample(100, 100, STRAIGHT)?.angle ?? NaN;
      // At arrival the drawn heading is still the old one (0), then eases to 0.3.
      expect(angle).toBeCloseTo(0, 6);
      const endT = 100 + CORRECTION_MS;
      expect(train.sample(endT, endT, STRAIGHT)?.angle).toBeCloseTo(0.3, 6);
    });
  });
});
