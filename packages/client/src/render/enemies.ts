import type { EnemyView } from '@lw/shared';
import type { DrawEnv } from './canvas.ts';
import { onScreen, screenX, screenY } from './canvas.ts';

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** Boss shield pulse speed in radians per second (reference line 1255). */
const SHIELD_PHASE_RATE = 3;

/**
 * Draws PvE enemies and the boss (reference lines 1762-1901). `flashing` says whether an enemy
 * was just hit, `time` is the simulation clock that drives the boss's shield pulse.
 */
export function drawEnemies(
  env: DrawEnv,
  enemies: readonly EnemyView[],
  flashing: (id: number) => boolean,
  simTime: number,
): void {
  const { ctx } = env;
  for (const e of enemies) {
    const px = screenX(env, e.x);
    const py = screenY(env, e.y);
    if (!onScreen(env, px, py, e.kind === 'boss' ? 80 : 60)) continue;
    const flash = flashing(e.id);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(e.angle);
    if (e.kind === 'boss') drawBoss(ctx, flash, simTime * SHIELD_PHASE_RATE);
    else drawBasic(ctx, e, flash);
    ctx.restore();

    if (e.kind === 'boss') {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(px - 30, py - 35, 60, 5);
      ctx.fillStyle = e.hp > e.maxHp * 0.3 ? '#ff88ff' : '#ff4444';
      ctx.fillRect(px - 30, py - 35, 60 * clamp(e.hp / e.maxHp, 0, 1), 5);
      ctx.fillStyle = '#ff88ff';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      const name = e.name ?? 'BOSS';
      ctx.strokeText(name, px, py - 40);
      ctx.fillText(name, px, py - 40);
    } else if (e.hp < e.maxHp) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(px - 14, py - 22, 28, 4);
      ctx.fillStyle = e.hp > e.maxHp * 0.3 ? '#44ff44' : '#ff4444';
      ctx.fillRect(px - 14, py - 22, 28 * clamp(e.hp / e.maxHp, 0, 1), 4);
    }
  }
}

/** Boss body in its local frame: pulsing shield rings, hull, cab, and glowing core. */
function drawBoss(ctx: CanvasRenderingContext2D, flash: boolean, shieldPhase: number): void {
  const shieldR = 40;
  ctx.strokeStyle = `rgba(255, 100, 255, ${0.4 + Math.sin(shieldPhase) * 0.3})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, shieldR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 200, 255, 0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, shieldR + 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = flash ? '#ffffff' : '#660066';
  ctx.beginPath();
  ctx.moveTo(20, 0);
  ctx.lineTo(8, -16);
  ctx.lineTo(-20, -16);
  ctx.lineTo(-20, 16);
  ctx.lineTo(8, 16);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#ff00ff';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#ff00ff';
  ctx.fillRect(-18, -14, 12, 28);
  ctx.fillStyle = '#ff88ff';
  ctx.fillRect(-16, -12, 8, 24);
  ctx.fillStyle = '#000';
  ctx.fillRect(-18, -14, 12, 28);
  ctx.strokeRect(-18, -14, 12, 28);
  ctx.fillStyle = '#88ccff';
  ctx.fillRect(-15, -10, 4, 20);
  ctx.fillStyle = '#222';
  ctx.fillRect(-2, -20, 5, 6);
  ctx.fillRect(-2, 14, 5, 6);
  ctx.strokeStyle = '#ff00ff';
  ctx.lineWidth = 1;
  ctx.strokeRect(-2, -20, 5, 6);
  ctx.strokeRect(-2, 14, 5, 6);
  ctx.fillStyle = '#ff00ff';
  circle(ctx, 14, 0, 4);
  ctx.fillStyle = '#fff';
  circle(ctx, 14, 0, 2);
  ctx.fillStyle = 'rgba(255, 100, 255, 0.5)';
  circle(ctx, 14, 0, 8);
}

/** Drone, sentry, and hunter bodies in their local frame. */
function drawBasic(ctx: CanvasRenderingContext2D, e: EnemyView, flash: boolean): void {
  if (flash) {
    ctx.fillStyle = '#ffffff';
  } else {
    ctx.fillStyle = e.kind === 'sentry' ? '#aa2222' : e.kind === 'hunter' ? '#cc0000' : '#ff4444';
  }
  if (e.kind === 'drone') {
    ctx.beginPath();
    ctx.moveTo(11, 0);
    ctx.lineTo(-7, -8);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-7, 8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#ffaa44';
    circle(ctx, 0, 0, 3);
  } else if (e.kind === 'sentry') {
    ctx.fillRect(-14, -14, 28, 28);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.strokeRect(-14, -14, 28, 28);
    ctx.fillStyle = flash ? '#fff' : '#ff4444';
    circle(ctx, 0, 0, 7);
    ctx.fillStyle = '#444';
    ctx.fillRect(0, -3, 16, 6);
    ctx.strokeStyle = '#000';
    ctx.strokeRect(0, -3, 16, 6);
  } else if (e.kind === 'hunter') {
    ctx.beginPath();
    ctx.moveTo(15, 0);
    ctx.lineTo(0, -11);
    ctx.lineTo(-13, -9);
    ctx.lineTo(-13, 9);
    ctx.lineTo(0, 11);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = flash ? '#fff' : '#ff6600';
    circle(ctx, 0, 0, 4);
  }
}
