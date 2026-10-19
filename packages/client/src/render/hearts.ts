import type { HeartView } from '@lw/shared';
import type { DrawEnv } from './canvas.ts';
import { onScreen, screenX, screenY } from './canvas.ts';
import { HEART_COLORS } from './palette.ts';

/** Half-width in pixels of each kind of heart; the full heart is drawn larger. */
export const HEART_SIZE = { slow: 8, full: 12 } as const;

/** Adds a heart shape centred on (x, y), `size` pixels from the centre to each side, as a path. */
export function traceHeart(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
): void {
  const s = size;
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.9);
  ctx.bezierCurveTo(x - s * 1.4, y - s * 0.1, x - s * 0.6, y - s * 1.2, x, y - s * 0.45);
  ctx.bezierCurveTo(x + s * 0.6, y - s * 1.2, x + s * 1.4, y - s * 0.1, x, y + s * 0.9);
  ctx.closePath();
}

/**
 * Hearts on the map: slow hearts pink and pulsing, full hearts larger, red, and glowing. Each
 * pulses out of phase with the next, derived from its id so it is stable between frames.
 */
export function drawHearts(env: DrawEnv, hearts: readonly HeartView[]): void {
  const { ctx } = env;
  for (const h of hearts) {
    const px = screenX(env, h.x);
    const py = screenY(env, h.y);
    if (!onScreen(env, px, py, 40)) continue;
    const color = HEART_COLORS[h.kind];
    const pulse = Math.sin(env.time * 4 + h.id * 1.3) * 0.12 + 1;
    const size = HEART_SIZE[h.kind] * pulse;
    if (h.kind === 'full') {
      const glow = size * 2.6;
      const grd = ctx.createRadialGradient(px, py, 0, px, py, glow);
      grd.addColorStop(0, color);
      grd.addColorStop(0.45, color + '66');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grd;
      ctx.globalAlpha = 0.55 + 0.25 * (pulse - 0.88) * 4;
      ctx.beginPath();
      ctx.arc(px, py, glow, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = color;
    traceHeart(ctx, px, py, size);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = h.kind === 'full' ? 2 : 1.25;
    ctx.stroke();
  }
}
