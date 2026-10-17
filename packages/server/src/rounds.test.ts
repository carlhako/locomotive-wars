import { describe, expect, it } from 'vitest';
import { RoundClock } from './rounds.ts';

describe('RoundClock', () => {
  it('starts idle', () => {
    const c = new RoundClock(3, 2);
    expect(c.phase).toBe('idle');
    expect(c.tick()).toBeNull();
    expect(c.roundId).toBe(0);
  });

  it('plays for the round length, then intermission, then asks for a new round', () => {
    const c = new RoundClock(3, 2);
    c.start();
    expect(c.phase).toBe('playing');
    expect(c.roundId).toBe(1);
    expect([c.tick(), c.tick(), c.tick()]).toEqual([null, null, 'intermission']);
    expect(c.phase).toBe('intermission');
    expect([c.tick(), c.tick()]).toEqual([null, 'playing']);
    c.start();
    expect(c.roundId).toBe(2);
    expect(c.ticksLeft).toBe(3);
  });

  it('goes idle on stop and starts a full round again', () => {
    const c = new RoundClock(10, 2);
    c.start();
    for (let i = 0; i < 6; i++) c.tick();
    expect(c.ticksLeft).toBe(4);
    c.stop();
    expect(c.phase).toBe('idle');
    expect(c.tick()).toBeNull();
    c.start();
    expect(c.ticksLeft).toBe(10);
  });
});
