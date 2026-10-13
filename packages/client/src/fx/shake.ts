export interface ShakeSink {
  add(intensity: number, duration: number): void;
}

/** Screen shake (reference addShake, lines 1007-1010, and its offset at lines 1651-1656). */
export class ScreenShake implements ShakeSink {
  intensity = 0;
  /** Seconds of shaking left. */
  time = 0;

  add(intensity: number, duration: number): void {
    if (intensity > this.intensity) this.intensity = intensity;
    this.time = Math.max(this.time, duration);
  }

  update(dt: number): void {
    if (this.time <= 0) return;
    this.time -= dt;
    if (this.time <= 0) {
      this.time = 0;
      this.intensity = 0;
    }
  }

  /** A random offset in pixels for this frame, zero when idle. Capped at 10 px per axis. */
  offset(rand: () => number = Math.random): { x: number; y: number } {
    if (this.time <= 0) return { x: 0, y: 0 };
    const magnitude = Math.min(20, this.intensity * (this.time / 0.5) * 2);
    return { x: (rand() - 0.5) * magnitude, y: (rand() - 0.5) * magnitude };
  }
}
