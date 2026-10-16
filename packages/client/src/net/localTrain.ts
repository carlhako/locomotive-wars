import {
  BASE_SPEED,
  BOOST_SPEED,
  BRAKE_FACTOR,
  DRONE_ORBIT_SPEED,
  SPEED_BONUS,
  TICK_RATE,
  TRAIN_FLAG_DEAD,
  TURN_RATE,
  wrapDelta,
  wrapPos,
} from '@lw/shared';
import type { OwnTrain, TrainInput } from '@lw/shared';

/** Milliseconds over which a correction (new snapshot disagreeing with the prediction) fades. */
export const CORRECTION_MS = 100;
/** The prediction never runs further ahead of the newest snapshot than this. */
export const MAX_EXTRAPOLATION_MS = 250;
/** A correction larger than this (a respawn, a long stall) is applied at once, not blended. */
const SNAP_DISTANCE = 200;

export interface Point {
  x: number;
  y: number;
}

/** Where the local train is drawn: head, heading, carriage positions, and drone angles. */
export interface LocalPose {
  x: number;
  y: number;
  angle: number;
  /** Carriage positions from the locomotive back. */
  carriages: Point[];
  drones: number[];
}

interface Base {
  /** Server time of the snapshot. */
  st: number;
  me: OwnTrain;
  /** Speed multiplier from speed carriages. */
  speedMult: number;
}

/** Fraction of a carriage-less shift: positions along the old trail, moved to the new head. */
function shiftCarriages(base: OwnTrain, head: Point, size: number): Point[] {
  const n = base.cs.length / 2;
  const pts: Point[] = [{ x: base.x, y: base.y }];
  for (let i = 0; i < n; i++)
    pts.push({ x: base.cs[i * 2] as number, y: base.cs[i * 2 + 1] as number });
  // Arc length of the old trail from the old head to each carriage.
  const arc: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1] as Point;
    const b = pts[i] as Point;
    arc.push(
      (arc[i - 1] as number) + Math.hypot(wrapDelta(b.x - a.x, size), wrapDelta(b.y - a.y, size)),
    );
  }
  const ahead = Math.hypot(wrapDelta(head.x - base.x, size), wrapDelta(head.y - base.y, size));

  const out: Point[] = [];
  let seg = 0;
  for (let i = 1; i < pts.length; i++) {
    // The carriage keeps its distance from the head, so it now sits `ahead` closer along the old
    // trail than it did: arc position s measured from the old head.
    const s = (arc[i] as number) - ahead;
    if (s <= 0) {
      // Between the old head and the new one.
      const t = ahead === 0 ? 0 : -s / ahead;
      out.push({
        x: wrapPos(base.x + wrapDelta(head.x - base.x, size) * t, size),
        y: wrapPos(base.y + wrapDelta(head.y - base.y, size) * t, size),
      });
      continue;
    }
    while (seg < pts.length - 2 && (arc[seg + 1] as number) < s) seg++;
    const a = pts[seg] as Point;
    const b = pts[seg + 1] as Point;
    const span = (arc[seg + 1] as number) - (arc[seg] as number);
    const t = span === 0 ? 0 : Math.min(1, (s - (arc[seg] as number)) / span);
    out.push({
      x: wrapPos(a.x + wrapDelta(b.x - a.x, size) * t, size),
      y: wrapPos(a.y + wrapDelta(b.y - a.y, size) * t, size),
    });
  }
  return out;
}

/**
 * The player's own train, drawn from the newest snapshot rather than from the interpolation
 * buffer. The newest state is run forward by the time since it was made, using the same turning
 * and speed rules as the server and the player's current controls, so steering shows at once.
 * When the next snapshot lands, any disagreement with what was being drawn fades out over
 * `CORRECTION_MS` instead of jumping.
 */
export class LocalTrain {
  private base: Base | null = null;
  private corrX = 0;
  private corrY = 0;
  private corrA = 0;
  private corrAt = 0;

  constructor(private readonly size: number) {}

  clear(): void {
    this.base = null;
    this.corrX = this.corrY = this.corrA = 0;
  }

  get hasState(): boolean {
    return this.base !== null;
  }

  /**
   * Takes a new snapshot of the own train. `serverNow`, `now`, and `input` describe the moment of
   * arrival, so the pose being drawn just before can be compared with the one just after.
   */
  onSnapshot(
    me: OwnTrain,
    st: number,
    speedCarriages: number,
    serverNow: number,
    now: number,
    input: TrainInput,
  ): void {
    const respawned = this.base !== null && this.base.me.sq !== me.sq;
    const before = this.base && !respawned ? this.sample(serverNow, now, input) : null;
    this.base = { st, me, speedMult: 1 + SPEED_BONUS * speedCarriages };
    if (!before) {
      // A new train has nothing to blend from: show it where the server put it.
      this.corrX = this.corrY = this.corrA = 0;
      return;
    }
    const after = this.predict(serverNow, input);
    const dx = wrapDelta(before.x - after.x, this.size);
    const dy = wrapDelta(before.y - after.y, this.size);
    if (Math.hypot(dx, dy) > SNAP_DISTANCE) {
      this.corrX = this.corrY = this.corrA = 0;
      return;
    }
    this.corrX = dx;
    this.corrY = dy;
    this.corrA = before.angle - after.angle;
    this.corrAt = now;
  }

  /** The pose to draw at the given times, or null before the first snapshot. */
  sample(serverNow: number, now: number, input: TrainInput): LocalPose | null {
    if (!this.base) return null;
    const pose = this.predict(serverNow, input);
    const k = Math.max(0, 1 - (now - this.corrAt) / CORRECTION_MS);
    if (k <= 0 || (this.corrX === 0 && this.corrY === 0 && this.corrA === 0)) return pose;
    const cx = this.corrX * k;
    const cy = this.corrY * k;
    return {
      x: wrapPos(pose.x + cx, this.size),
      y: wrapPos(pose.y + cy, this.size),
      angle: pose.angle + this.corrA * k,
      carriages: pose.carriages.map((c) => ({
        x: wrapPos(c.x + cx, this.size),
        y: wrapPos(c.y + cy, this.size),
      })),
      drones: pose.drones,
    };
  }

  /** The newest snapshot run forward to `serverNow`, with no correction applied. */
  private predict(serverNow: number, input: TrainInput): LocalPose {
    const { st, me, speedMult } = this.base as Base;
    const elapsed = Math.min(Math.max(serverNow - st, 0), MAX_EXTRAPOLATION_MS) / 1000;
    const dead = (me.fl & TRAIN_FLAG_DEAD) !== 0;
    if (dead || elapsed === 0) {
      return {
        x: me.x,
        y: me.y,
        angle: me.a,
        carriages: shiftCarriages(me, me, this.size),
        drones: me.dn,
      };
    }

    let speed = (input.boost && me.f > 0 ? BOOST_SPEED : BASE_SPEED) * speedMult;
    if (input.brake) speed *= BRAKE_FACTOR;
    const turn = Math.max(-1, Math.min(1, input.turn));

    // Step like the server does so a curve is followed the way it will be.
    let x = me.x;
    let y = me.y;
    let angle = me.a;
    const stepSeconds = 1 / TICK_RATE;
    for (let left = elapsed; left > 1e-9; left -= stepSeconds) {
      const h = Math.min(left, stepSeconds);
      angle += turn * TURN_RATE * h;
      x = wrapPos(x + Math.cos(angle) * speed * h, this.size);
      y = wrapPos(y + Math.sin(angle) * speed * h, this.size);
    }
    const head = { x, y };
    return {
      x,
      y,
      angle,
      carriages: shiftCarriages(me, head, this.size),
      drones: me.dn.map((a) => a + DRONE_ORBIT_SPEED * elapsed),
    };
  }
}
