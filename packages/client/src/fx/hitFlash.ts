export interface HitFlashSink {
  add(entityId: number, duration: number): void;
}

/**
 * Which trains and enemies are white-flashing from a recent hit. Trains and enemies share one
 * id space, so a single map covers both.
 */
export class HitFlash implements HitFlashSink {
  private readonly remaining = new Map<number, number>();

  add(entityId: number, duration: number): void {
    this.remaining.set(entityId, Math.max(duration, this.remaining.get(entityId) ?? 0));
  }

  isFlashing(entityId: number): boolean {
    return (this.remaining.get(entityId) ?? 0) > 0;
  }

  update(dt: number): void {
    for (const [id, left] of this.remaining) {
      const next = left - dt;
      if (next <= 0) this.remaining.delete(id);
      else this.remaining.set(id, next);
    }
  }

  clear(): void {
    this.remaining.clear();
  }
}
