/**
 * The round clock: which phase the game is in and how long is left, counted in server ticks so a
 * stalled loop cannot skip a round end.
 *
 *   idle --start()--> playing --(roundTicks)--> intermission --(intermissionTicks)--> playing
 *   any phase --stop()--> idle
 */
export type Phase = 'idle' | 'playing' | 'intermission';

export class RoundClock {
  phase: Phase = 'idle';
  /** Increases by one each time a round starts; 0 before the first. */
  roundId = 0;
  private remaining = 0;

  constructor(
    private readonly roundTicks: number,
    private readonly intermissionTicks: number,
  ) {}

  /** Ticks left in the current phase; 0 while idle. */
  get ticksLeft(): number {
    return this.phase === 'idle' ? 0 : this.remaining;
  }

  /** Begins a new round with its full length. */
  start(): void {
    this.phase = 'playing';
    this.roundId += 1;
    this.remaining = this.roundTicks;
  }

  /** Stops the clock; the next `start()` begins a full round. */
  stop(): void {
    this.phase = 'idle';
    this.remaining = 0;
  }

  /**
   * Counts one tick. Returns `'intermission'` when the round just ended, `'playing'` when the
   * intermission just ended (the caller then resets the world and calls `start()`), else null.
   */
  tick(): 'intermission' | 'playing' | null {
    if (this.phase === 'idle') return null;
    this.remaining -= 1;
    if (this.remaining > 0) return null;
    if (this.phase === 'playing') {
      this.phase = 'intermission';
      this.remaining = this.intermissionTicks;
      return 'intermission';
    }
    return 'playing';
  }
}
