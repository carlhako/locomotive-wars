import { shortAngle } from '@lw/shared';
import type { TrainInput } from '@lw/shared';

/** An aim change larger than this many radians counts as activity. */
export const AIM_ACTIVITY = 0.05;

/** True when connecting another human would exceed the limit. */
export function isFull(humans: number, maxPlayers: number): boolean {
  return humans >= maxPlayers;
}

export type IdleAction = 'warn' | 'kick' | null;

/**
 * Tracks how long a session has gone without a meaningful input change. Identical heartbeats are
 * not activity. The reference is the last input that counted, so a slow steady mouse movement,
 * though each message differs only a little from the previous one, still registers.
 */
export class IdleTracker {
  /** Ticks of play since the last meaningful input. */
  idleTicks = 0;
  warned = false;
  private base: TrainInput;

  constructor(initial: TrainInput) {
    this.base = { ...initial };
  }

  /** Feeds an applied input. Returns true when it was activity, which resets the idle time. */
  observe(input: TrainInput): boolean {
    const b = this.base;
    const meaningful =
      input.turn !== b.turn ||
      input.boost !== b.boost ||
      input.brake !== b.brake ||
      input.fire !== b.fire ||
      Math.abs(shortAngle(input.aim - b.aim)) > AIM_ACTIVITY;
    if (!meaningful) return false;
    this.base = { ...input };
    this.idleTicks = 0;
    return true;
  }

  /** Clears a standing warning; true if there was one. */
  clearWarning(): boolean {
    const was = this.warned;
    this.warned = false;
    return was;
  }

  /** Counts one tick of play. `kickTicks` of 0 disables the kick. */
  tick(warnTicks: number, kickTicks: number): IdleAction {
    if (kickTicks <= 0) return null;
    this.idleTicks += 1;
    if (this.idleTicks >= kickTicks) return 'kick';
    if (!this.warned && this.idleTicks >= warnTicks) {
      this.warned = true;
      return 'warn';
    }
    return null;
  }
}
