import { afterEach, describe, expect, it, vi } from 'vitest';
import { FixedStepLoop } from './loop.ts';

afterEach(() => {
  vi.useRealTimers();
});

describe('FixedStepLoop', () => {
  it('runs 1800 steps in 60 seconds at 30 Hz', () => {
    vi.useFakeTimers();
    let count = 0;
    const loop = new FixedStepLoop({ tickRate: 30, step: () => count++ });
    loop.start();
    vi.advanceTimersByTime(60_000);
    loop.stop();
    expect(count).toBe(1800);
    expect(loop.steps).toBe(1800);
  });

  it('catches up after a short stall without losing ticks', () => {
    let clock = 0;
    let count = 0;
    const loop = new FixedStepLoop({ tickRate: 30, step: () => count++, now: () => clock });
    loop.start();
    clock = 100; // three ticks due at once
    loop.pump();
    expect(count).toBe(3);
  });

  it('runs at most five catch-up ticks, then skips the backlog and reports it', () => {
    let clock = 0;
    let count = 0;
    const overruns: number[] = [];
    const loop = new FixedStepLoop({
      tickRate: 30,
      step: () => count++,
      now: () => clock,
      onOverrun: (n) => overruns.push(n),
    });
    loop.start();
    clock = 1000; // 30 ticks due
    loop.pump();
    expect(count).toBe(5);
    expect(overruns).toEqual([25]);
    // The backlog is gone: the next tick is one step interval after the stall, not 25 behind.
    clock = 1000 + 1000 / 30;
    loop.pump();
    expect(count).toBe(6);
    expect(overruns).toHaveLength(1);
  });

  it('reports time since the last tick was due', () => {
    let clock = 0;
    const loop = new FixedStepLoop({ tickRate: 30, step: () => undefined, now: () => clock });
    loop.start();
    clock = 50;
    loop.pump();
    expect(loop.sinceLastStepMs()).toBeCloseTo(50 - 1000 / 30, 6);
  });

  it('stops stepping after stop()', () => {
    vi.useFakeTimers();
    let count = 0;
    const loop = new FixedStepLoop({ tickRate: 30, step: () => count++ });
    loop.start();
    vi.advanceTimersByTime(1000);
    loop.stop();
    const at = count;
    vi.advanceTimersByTime(1000);
    expect(count).toBe(at);
    expect(loop.running).toBe(false);
  });
});
