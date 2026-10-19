export interface TurretSink {
  /** A turret on train `trainId`'s carriage `carriage` just fired along `angle`. */
  aim(trainId: number, carriage: number, angle: number): void;
}

/** Seconds a tail gunner turret keeps pointing at what it last shot at. */
export const TURRET_HOLD = 0.5;

/**
 * Where auto turrets were pointing when they last fired, so a tail gunner can be drawn aimed at
 * its target for a moment and backward otherwise.
 */
export class TurretMemory implements TurretSink {
  private readonly turrets = new Map<string, { angle: number; left: number }>();

  aim(trainId: number, carriage: number, angle: number): void {
    this.turrets.set(`${trainId}:${carriage}`, { angle, left: TURRET_HOLD });
  }

  /** The remembered angle, or null when the turret has not fired lately. */
  angleOf(trainId: number, carriage: number): number | null {
    return this.turrets.get(`${trainId}:${carriage}`)?.angle ?? null;
  }

  update(dt: number): void {
    for (const [key, t] of this.turrets) {
      t.left -= dt;
      if (t.left <= 0) this.turrets.delete(key);
    }
  }

  clear(): void {
    this.turrets.clear();
  }
}
