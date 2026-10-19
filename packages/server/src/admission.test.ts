import { describe, expect, it } from 'vitest';
import type { TrainInput } from '@lw/shared';
import { AIM_ACTIVITY, IdleTracker, isFull } from './admission.ts';

const IDLE: TrainInput = {
  turn: 0,
  boost: false,
  brake: false,
  fire: false,
  aimX: 200,
  aimY: 0,
};

describe('isFull', () => {
  it('is full at the limit', () => {
    expect(isFull(15, 16)).toBe(false);
    expect(isFull(16, 16)).toBe(true);
  });
});

describe('IdleTracker.observe', () => {
  it('ignores identical heartbeats', () => {
    const t = new IdleTracker(IDLE);
    expect(t.observe({ ...IDLE })).toBe(false);
  });

  it('counts a change of turn, boost, or brake', () => {
    expect(new IdleTracker(IDLE).observe({ ...IDLE, turn: 1 })).toBe(true);
    expect(new IdleTracker(IDLE).observe({ ...IDLE, boost: true })).toBe(true);
    expect(new IdleTracker(IDLE).observe({ ...IDLE, brake: true })).toBe(true);
  });

  it('counts pressing or releasing fire', () => {
    const t = new IdleTracker(IDLE);
    expect(t.observe({ ...IDLE, fire: true })).toBe(true);
    expect(t.observe({ ...IDLE, fire: true })).toBe(false);
    expect(t.observe({ ...IDLE })).toBe(true);
  });

  it('resets idle time when fire is pressed', () => {
    const t = new IdleTracker(IDLE);
    for (let i = 0; i < 40 * 30; i++) t.tick(1e9, 1e9);
    expect(t.idleTicks).toBe(40 * 30);
    t.observe({ ...IDLE, fire: true });
    expect(t.idleTicks).toBe(0);
  });

  /** An aim offset `len` units long at `angle` radians. */
  const aim = (angle: number, len = 200) => ({
    aimX: Math.cos(angle) * len,
    aimY: Math.sin(angle) * len,
  });

  it('counts an aim turn beyond 0.05 rad, measured the short way round', () => {
    expect(new IdleTracker(IDLE).observe({ ...IDLE, ...aim(AIM_ACTIVITY * 0.9) })).toBe(false);
    expect(new IdleTracker(IDLE).observe({ ...IDLE, ...aim(AIM_ACTIVITY * 1.1) })).toBe(true);
    const wrap = new IdleTracker({ ...IDLE, ...aim(Math.PI - 0.01) });
    expect(wrap.observe({ ...IDLE, ...aim(-Math.PI + 0.01) })).toBe(false);
  });

  it('counts an aim offset growing or shrinking by more than 50 units', () => {
    expect(new IdleTracker(IDLE).observe({ ...IDLE, ...aim(0, 240) })).toBe(false);
    expect(new IdleTracker(IDLE).observe({ ...IDLE, ...aim(0, 260) })).toBe(true);
    expect(new IdleTracker(IDLE).observe({ ...IDLE, ...aim(0, 140) })).toBe(true);
  });

  it('ignores small mouse jitter but not a sweep', () => {
    const t = new IdleTracker(IDLE);
    expect(t.observe({ ...IDLE, aimX: 203, aimY: -4 })).toBe(false);
    expect(t.observe({ ...IDLE, aimX: 197, aimY: 5 })).toBe(false);
    expect(t.observe({ ...IDLE, aimX: 120, aimY: 160 })).toBe(true);
  });

  it('measures slow drift from the last counted input, not the previous message', () => {
    const t = new IdleTracker(IDLE);
    expect(t.observe({ ...IDLE, ...aim(0.03) })).toBe(false);
    expect(t.observe({ ...IDLE, ...aim(0.06) })).toBe(true);
  });
});

describe('IdleTracker.tick', () => {
  it('warns once, then kicks', () => {
    const t = new IdleTracker(IDLE);
    const actions: Array<string | null> = [];
    for (let i = 0; i < 6; i++) actions.push(t.tick(3, 6));
    expect(actions).toEqual([null, null, 'warn', null, null, 'kick']);
  });

  it('resets on activity and lets the warning be cleared', () => {
    const t = new IdleTracker(IDLE);
    for (let i = 0; i < 3; i++) t.tick(3, 6);
    expect(t.warned).toBe(true);
    expect(t.observe({ ...IDLE, turn: 1 })).toBe(true);
    expect(t.clearWarning()).toBe(true);
    expect(t.clearWarning()).toBe(false);
    expect(t.idleTicks).toBe(0);
  });

  it('never acts when the kick is disabled', () => {
    const t = new IdleTracker(IDLE);
    for (let i = 0; i < 100; i++) expect(t.tick(0, 0)).toBeNull();
    expect(t.idleTicks).toBe(0);
  });
});
