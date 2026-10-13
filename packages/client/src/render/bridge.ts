import type { TrainView } from '@lw/shared';
import type { DrawEnv } from './canvas.ts';
import { screenX, screenY } from './canvas.ts';

/** Length of the bridge field once active (reference line 683). */
export const BRIDGE_LENGTH = 42;
const BRIDGE_WIDTH = 26;

/**
 * Per-train eased bridge length. The simulation only reports whether a bridge is active; the
 * reference snapped the field to full length on contact and let it shrink away afterwards, which
 * is reproduced here so the effect fades instead of vanishing.
 */
export class BridgeAnimator {
  private readonly lengths = new Map<number, number>();

  /** Advances every train's bridge length and forgets trains that are gone. */
  update(trains: readonly TrainView[], dt: number): void {
    const seen = new Set<number>();
    // The reference shrank to 78% per 1/60 s frame.
    const decay = Math.pow(0.78, Math.max(0, dt) * 60);
    for (const t of trains) {
      seen.add(t.id);
      const prev = this.lengths.get(t.id) ?? 0;
      if (t.alive && t.bridge) {
        this.lengths.set(t.id, BRIDGE_LENGTH);
      } else {
        const next = prev * decay;
        if (next < 0.5) this.lengths.delete(t.id);
        else this.lengths.set(t.id, next);
      }
    }
    for (const id of this.lengths.keys()) {
      if (!seen.has(id)) this.lengths.delete(id);
    }
  }

  lengthOf(id: number): number {
    return this.lengths.get(id) ?? 0;
  }
}

/**
 * Draws the glowing bridge at a train's head (reference drawBridge, lines 2077-2181): a circular
 * aura while active plus a field projecting forward over the trail being crossed.
 */
export function drawBridge(env: DrawEnv, train: TrainView, length: number): void {
  if (length <= 0.5) return;
  const { ctx } = env;
  const px = screenX(env, train.x);
  const py = screenY(env, train.y);
  const wid = BRIDGE_WIDTH;
  const t = env.time;
  const shimmer = 0.75 + Math.sin(t * 7) * 0.25;
  const pulse = 0.85 + Math.sin(t * 4) * 0.15;

  ctx.save();
  ctx.translate(px, py);

  if (train.bridge) {
    const auraR = 30;
    const auraAlpha = 0.55 + Math.sin(t * 6) * 0.15;
    const auraGrd = ctx.createRadialGradient(0, 0, 4, 0, 0, auraR);
    auraGrd.addColorStop(0, 'rgba(0, 220, 255, 0.0)');
    auraGrd.addColorStop(0.55, `rgba(0, 220, 255, ${0.22 * pulse})`);
    auraGrd.addColorStop(1.0, 'rgba(0, 220, 255, 0)');
    ctx.fillStyle = auraGrd;
    ctx.beginPath();
    ctx.arc(0, 0, auraR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(120, 255, 255, ${auraAlpha})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, auraR, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.rotate(train.angle);

  ctx.fillStyle = 'rgba(0, 220, 255, 0.18)';
  ctx.beginPath();
  ctx.ellipse(length / 2 + 2, 2, length / 2 + 2, wid / 2 + 2, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowColor = '#00ffff';
  ctx.shadowBlur = 18 * shimmer;

  const grd = ctx.createLinearGradient(0, -wid / 2, 0, wid / 2);
  grd.addColorStop(0, 'rgba(0, 200, 255, 0.28)');
  grd.addColorStop(0.5, 'rgba(120, 240, 255, 0.18)');
  grd.addColorStop(1, 'rgba(0, 200, 255, 0.28)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, -wid / 2, length, wid);

  const grd2 = ctx.createLinearGradient(0, 0, length, 0);
  grd2.addColorStop(0, 'rgba(255,255,255,0.05)');
  grd2.addColorStop(0.5, 'rgba(255,255,255,0.18)');
  grd2.addColorStop(1, 'rgba(255,255,255,0.05)');
  ctx.fillStyle = grd2;
  ctx.globalAlpha = pulse;
  ctx.fillRect(2, -wid / 2 + 3, length - 4, wid - 6);
  ctx.globalAlpha = 1;

  ctx.strokeStyle = 'rgba(180, 255, 255, 0.95)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(2, -wid / 2 + 1);
  ctx.lineTo(length - 2, -wid / 2 + 1);
  ctx.moveTo(2, wid / 2 - 1);
  ctx.lineTo(length - 2, wid / 2 - 1);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(120, 230, 255, 0.55)';
  ctx.lineWidth = 1;
  for (let i = 1; i <= 5; i++) {
    const x = (length / 6) * i;
    ctx.beginPath();
    ctx.moveTo(x, -wid / 2 + 3);
    ctx.lineTo(x, wid / 2 - 3);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.beginPath();
  ctx.moveTo(length, 0);
  ctx.lineTo(length - 8, -6);
  ctx.lineTo(length - 8, 6);
  ctx.closePath();
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(0, 255, 255, 0.9)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(0, -wid / 2, length, wid);

  ctx.restore();
}
