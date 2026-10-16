import { describe, expect, it } from 'vitest';
import { ClockSync } from './clock.ts';

/** A pong as a server whose clock is `offset` ms ahead would send it, for a given one-way delay. */
function exchange(
  clock: ClockSync,
  sentAt: number,
  offset: number,
  out: number,
  back: number,
): void {
  const serverAtReceipt = sentAt + out + offset;
  clock.addSample(sentAt, sentAt + out + back, serverAtReceipt);
}

describe('ClockSync', () => {
  it('is unsynced until it has a sample or a seed', () => {
    const clock = new ClockSync();
    expect(clock.synced).toBe(false);
    clock.addSample(100, 140, 5120);
    expect(clock.synced).toBe(true);
  });

  it('recovers the offset from symmetric exchanges', () => {
    const clock = new ClockSync();
    for (let i = 0; i < 5; i++) exchange(clock, 1000 + i * 2000, 5000, 30, 30);
    expect(clock.serverTime(10_000)).toBeCloseTo(15_000, 6);
    expect(clock.rtt).toBe(60);
  });

  it('takes the median offset of the five lowest-RTT samples', () => {
    const clock = new ClockSync();
    // Five good samples (rtt 40) with slightly different offsets: median 5003.
    for (const [i, off] of [5001, 5002, 5003, 5004, 5005].entries()) {
      exchange(clock, i * 1000, off, 20, 20);
    }
    // Slow, lopsided exchanges (rtt 400, offset estimate 200 ms off) must not move it.
    for (let i = 0; i < 10; i++) exchange(clock, 10_000 + i * 1000, 5003, 380, 20);
    expect(clock.serverTime(0)).toBe(5003);
  });

  it('averages the two middle offsets when fewer than five samples have even count', () => {
    const clock = new ClockSync();
    exchange(clock, 0, 100, 10, 10);
    exchange(clock, 1000, 110, 10, 10);
    expect(clock.serverTime(0)).toBe(105);
  });

  it('forgets old samples beyond its window', () => {
    const clock = new ClockSync();
    // 20 samples at the old offset with the best RTT, then 20 at a new offset with worse RTT.
    for (let i = 0; i < 20; i++) exchange(clock, i * 1000, 100, 10, 10);
    for (let i = 0; i < 20; i++) exchange(clock, 30_000 + i * 1000, 500, 15, 15);
    expect(clock.serverTime(0)).toBe(500);
  });

  it('uses a seed only until a real sample arrives', () => {
    const clock = new ClockSync();
    clock.seed(5000, 1000);
    expect(clock.serverTime(2000)).toBe(6000);
    exchange(clock, 0, 7000, 10, 10);
    clock.seed(1, 1);
    expect(clock.serverTime(0)).toBe(7000);
  });

  it('ignores impossible samples', () => {
    const clock = new ClockSync();
    clock.addSample(100, 50, 1000);
    clock.addSample(0, 10, Number.NaN);
    expect(clock.synced).toBe(false);
  });
});
