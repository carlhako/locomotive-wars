import { DROP_LIFETIME } from '@lw/shared';
import type { DropView, TrailerView } from '@lw/shared';
import type { DrawEnv } from './canvas.ts';
import { onScreen, screenX, screenY } from './canvas.ts';
import { CARRIAGE_TYPES } from './palette.ts';

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Pulsing trailers waiting on the map (reference lines 1702-1730). */
export function drawTrailers(env: DrawEnv, trailers: readonly TrailerView[]): void {
  const { ctx } = env;
  for (const t of trailers) {
    const px = screenX(env, t.x);
    const py = screenY(env, t.y);
    if (!onScreen(env, px, py, 50)) continue;
    const style = CARRIAGE_TYPES[t.kind];
    // Each trailer pulses out of phase with the next, derived from its id so it is stable.
    const pulse = Math.sin(env.time * 2.5 + t.id * 1.7) * 0.15 + 0.85;
    const grd = ctx.createRadialGradient(px, py, 0, px, py, 22);
    grd.addColorStop(0, style.color);
    grd.addColorStop(0.4, style.color + '88');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.globalAlpha = pulse * 0.5;
    ctx.beginPath();
    ctx.arc(px, py, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = style.color;
    ctx.beginPath();
    ctx.arc(px, py, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(style.icon, px, py);
  }
}

/** Pickups dropped by destroyed trains and enemies, fading as they age (reference 1731-1761). */
export function drawDrops(env: DrawEnv, drops: readonly DropView[]): void {
  const { ctx } = env;
  for (const p of drops) {
    const px = screenX(env, p.x);
    const py = screenY(env, p.y);
    if (!onScreen(env, px, py, 30)) continue;
    const style = CARRIAGE_TYPES[p.kind];
    const fade = clamp(1 - p.age / DROP_LIFETIME, 0.3, 1);
    const pulse = Math.sin(p.age * 4) * 0.1 + 0.9;
    const grd = ctx.createRadialGradient(px, py, 0, px, py, 18);
    grd.addColorStop(0, style.color);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.globalAlpha = fade * 0.5;
    ctx.beginPath();
    ctx.arc(px, py, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = fade;
    ctx.fillStyle = style.color;
    ctx.beginPath();
    ctx.arc(px, py, 9 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(style.icon, px, py);
    ctx.globalAlpha = 1;
  }
}
