/** Real time to simulation ticks: a fixed-step loop that catches up after short stalls. */

export interface LoopOptions {
  /** Ticks per second. */
  tickRate: number;
  /** Runs one simulation tick. */
  step: () => void;
  /** Most ticks run in a single pass; more than this behind and the rest is skipped. Default 5. */
  maxCatchUp?: number;
  /** Called with the number of ticks skipped when the loop could not keep up. */
  onOverrun?: (skippedTicks: number) => void;
  /** Millisecond clock. Default `performance.now`. */
  now?: () => number;
}

export class FixedStepLoop {
  /** Ticks run since `start()`. */
  steps = 0;
  private readonly stepMs: number;
  private readonly maxCatchUp: number;
  private readonly now: () => number;
  private origin = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly opts: LoopOptions) {
    this.stepMs = 1000 / opts.tickRate;
    this.maxCatchUp = opts.maxCatchUp ?? 5;
    this.now = opts.now ?? (() => performance.now());
  }

  get running(): boolean {
    return this.timer !== null;
  }

  start(): void {
    if (this.timer) return;
    this.origin = this.now();
    this.steps = 0;
    // Poll faster than the tick so a tick runs at most a few milliseconds late.
    this.timer = setInterval(() => this.pump(), Math.max(1, Math.floor(this.stepMs / 4)));
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Real milliseconds elapsed since the most recent tick was due. */
  sinceLastStepMs(): number {
    return Math.max(0, this.now() - this.origin - this.steps * this.stepMs);
  }

  /** Runs every tick that has come due, up to the catch-up limit. Public for tests. */
  pump(): void {
    // Ticks due are counted from the origin, not accumulated, so rounding cannot drift.
    const due = Math.floor(((this.now() - this.origin) * this.opts.tickRate) / 1000 + 1e-9);
    let behind = due - this.steps;
    for (let ran = 0; behind > 0 && ran < this.maxCatchUp; ran++) {
      this.opts.step();
      this.steps += 1;
      behind -= 1;
    }
    if (behind > 0) {
      // Too far behind: drop the backlog by moving the origin, keeping the clock continuous.
      this.origin += behind * this.stepMs;
      this.opts.onOverrun?.(behind);
    }
  }
}
