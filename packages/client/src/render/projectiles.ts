import type { ProjectileView } from '@lw/shared';
import type { DrawEnv } from './canvas.ts';
import { onScreen, screenX, screenY } from './canvas.ts';

function trail(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  p: ProjectileView,
  k: number,
): void {
  ctx.beginPath();
  ctx.moveTo(px - p.vx * k, py - p.vy * k);
  ctx.lineTo(px, py);
  ctx.stroke();
}

function dot(ctx: CanvasRenderingContext2D, px: number, py: number, r: number, fill: string): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.fill();
}

/** Projectiles by type (reference lines 1905-1982). */
export function drawProjectiles(env: DrawEnv, projectiles: readonly ProjectileView[]): void {
  const { ctx } = env;
  for (const p of projectiles) {
    const px = screenX(env, p.x);
    const py = screenY(env, p.y);
    if (!onScreen(env, px, py, 20)) continue;
    switch (p.kind) {
      case 'missile':
        ctx.strokeStyle = '#ffaa44';
        ctx.lineWidth = 4;
        ctx.globalAlpha = 0.5;
        trail(ctx, px, py, p, 0.025);
        ctx.globalAlpha = 1;
        dot(ctx, px, py, 4.5, '#ff4444');
        dot(ctx, px, py, 2, '#ffeb3b');
        break;
      case 'laser':
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = '#ff0044';
        ctx.lineWidth = 3;
        trail(ctx, px, py, p, 0.02);
        ctx.strokeStyle = '#ffeeaa';
        ctx.lineWidth = 1.5;
        trail(ctx, px, py, p, 0.02);
        ctx.globalAlpha = 1;
        dot(ctx, px, py, 2.5, '#ffeeaa');
        break;
      case 'bullet':
        ctx.strokeStyle = '#ffff44';
        ctx.lineWidth = 2.5;
        trail(ctx, px, py, p, 0.015);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        trail(ctx, px, py, p, 0.015);
        dot(ctx, px, py, 2, '#ffffaa');
        break;
      case 'drone':
        dot(ctx, px, py, 2.5, '#66ffff');
        dot(ctx, px, py, 1, '#fff');
        break;
      default:
        dot(ctx, px, py, 3.5, '#ff2222');
        dot(ctx, px, py, 1.8, '#ffaa66');
        break;
    }
  }
}
