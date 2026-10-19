import { wrapDelta } from '@lw/shared';
import type { DrawEnv } from '../render/canvas.ts';
import { onScreen, screenX, screenY } from '../render/canvas.ts';
import type { Rand } from './particles.ts';

export interface ZapSink {
  /** A tesla chain: the coil, then each target in turn, in world coordinates. */
  add(points: ReadonlyArray<readonly [number, number]>): void;
}

/** Seconds an arc stays on screen, fading out. */
export const ZAP_LIFE = 0.3;
/** Most arcs kept at once; the oldest go first. */
export const MAX_ZAPS = 64;
const ZAP_COLOR = '48, 208, 176';
/** Kinks per leg of the arc and how far they stray from the straight line, in pixels. */
const ZAP_KINKS = 6;
const ZAP_JITTER = 6;

interface Zap {
  points: Array<readonly [number, number]>;
  age: number;
}

/** Tesla arcs: jittered teal polylines along each chain, redrawn with fresh jitter each frame. */
export class Zaps implements ZapSink {
  readonly zaps: Zap[] = [];

  constructor(private readonly rand: Rand = Math.random) {}

  add(points: ReadonlyArray<readonly [number, number]>): void {
    if (points.length < 2) return;
    if (this.zaps.length >= MAX_ZAPS) this.zaps.shift();
    this.zaps.push({ points: [...points], age: 0 });
  }

  update(dt: number): void {
    for (const z of this.zaps) z.age += dt;
    let w = 0;
    for (const z of this.zaps) if (z.age < ZAP_LIFE) this.zaps[w++] = z;
    this.zaps.length = w;
  }

  clear(): void {
    this.zaps.length = 0;
  }

  draw(env: DrawEnv): void {
    const { ctx } = env;
    for (const z of this.zaps) {
      const [x0, y0] = z.points[0] as readonly [number, number];
      const sx = screenX(env, x0);
      const sy = screenY(env, y0);
      if (!onScreen(env, sx, sy, 300)) continue;
      const fade = 1 - z.age / ZAP_LIFE;
      // Every point is placed relative to the first, so a chain across the map seam stays whole.
      const pts = z.points.map(([x, y]) => [
        sx + wrapDelta(x - x0, env.size),
        sy + wrapDelta(y - y0, env.size),
      ]);
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const [width, alpha] of [
        [5, 0.25],
        [1.8, 0.95],
      ] as const) {
        ctx.strokeStyle = `rgba(${ZAP_COLOR}, ${alpha * fade})`;
        ctx.lineWidth = width;
        ctx.beginPath();
        this.trace(ctx, pts);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  private trace(ctx: CanvasRenderingContext2D, pts: number[][]): void {
    const first = pts[0] as number[];
    ctx.moveTo(first[0] as number, first[1] as number);
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1] as [number, number];
      const [bx, by] = pts[i] as [number, number];
      const len = Math.hypot(bx - ax, by - ay) || 1;
      const nx = -(by - ay) / len;
      const ny = (bx - ax) / len;
      for (let k = 1; k < ZAP_KINKS; k++) {
        const t = k / ZAP_KINKS;
        const off = (this.rand() * 2 - 1) * ZAP_JITTER;
        ctx.lineTo(ax + (bx - ax) * t + nx * off, ay + (by - ay) * t + ny * off);
      }
      ctx.lineTo(bx, by);
    }
  }
}
