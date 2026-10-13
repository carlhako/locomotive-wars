import type { WorldView } from '@lw/shared';
import type { DamageNumbers } from '../fx/damageNumbers.ts';
import type { HitFlash } from '../fx/hitFlash.ts';
import type { ParticleSystem } from '../fx/particles.ts';
import { drawBridge } from './bridge.ts';
import type { BridgeAnimator } from './bridge.ts';
import type { DrawEnv } from './canvas.ts';
import { drawEnemies } from './enemies.ts';
import { drawDrops, drawTrailers } from './pickups.ts';
import { drawProjectiles } from './projectiles.ts';
import { drawBackdrop } from './stars.ts';
import type { Star } from './stars.ts';
import { drawTrain } from './train.ts';

/** Presentation state the scene reads; owned by the game loop. */
export interface SceneFx {
  stars: Star[];
  particles: ParticleSystem;
  damageNumbers: DamageNumbers;
  hitFlash: HitFlash;
  bridges: BridgeAnimator;
}

/** Input-driven overlays: they depend on the player's controls, not the world. */
export interface SceneOverlay {
  /** World-space aim angle for the local turrets, or null to point along the track. */
  aim: number | null;
  /** Mouse position in CSS pixels, or null when unknown. */
  mouse: { x: number; y: number } | null;
  boosting: boolean;
  /** Screen shake offset in pixels. */
  shake: { x: number; y: number };
}

/**
 * Draws one frame from a `WorldView` and the presentation state. Nothing here reads simulation
 * internals; draw order follows the reference (reference render(), lines 1648-2074).
 */
export function renderScene(
  env: DrawEnv,
  view: WorldView,
  fx: SceneFx,
  overlay: SceneOverlay,
  dt: number,
): void {
  const { ctx } = env;
  ctx.save();
  ctx.translate(overlay.shake.x, overlay.shake.y);
  drawBackdrop(env, fx.stars, dt);

  drawTrailers(env, view.trailers);
  drawDrops(env, view.drops);
  drawEnemies(env, view.enemies, (id) => fx.hitFlash.isFlashing(id), view.time);

  const local = view.trains.find((t) => t.id === view.localId);
  const localHead = local?.alive ? { x: local.x, y: local.y } : null;
  // Longer trains are drawn on top of shorter ones.
  const living = view.trains
    .filter((t) => t.alive)
    .sort((a, b) => a.carriages.length - b.carriages.length);
  for (const t of living) {
    const isLocal = t.id === view.localId;
    drawTrain(env, t, {
      isLocal,
      localHead,
      aim: isLocal ? overlay.aim : null,
      flashing: fx.hitFlash.isFlashing(t.id),
    });
  }

  drawProjectiles(env, view.projectiles);
  fx.particles.draw(env);
  fx.damageNumbers.draw(env);

  // Bridges are drawn last among world objects for maximum visibility.
  for (const t of living) drawBridge(env, t, fx.bridges.lengthOf(t.id));

  if (local?.alive && overlay.boosting)
    drawSpeedLines(env, local.angle, local.fuel / local.fuelMax);
  if (local?.alive && overlay.mouse) drawAimCursor(env, overlay.mouse.x, overlay.mouse.y);

  ctx.restore();
}

function drawSpeedLines(env: DrawEnv, angle: number, fuelFraction: number): void {
  const { ctx, width, height } = env;
  const intensity = Math.min(1, Math.max(0, fuelFraction));
  ctx.globalAlpha = 0.3 + intensity * 0.3;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 18; i++) {
    const sx = Math.random() * width;
    const sy = Math.random() * height;
    const len = 60 + Math.random() * 80;
    ctx.beginPath();
    ctx.moveTo(sx - Math.cos(angle) * len, sy - Math.sin(angle) * len);
    ctx.lineTo(sx, sy);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawAimCursor(env: DrawEnv, mx: number, my: number): void {
  const { ctx } = env;
  ctx.strokeStyle = 'rgba(255, 100, 100, 0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(mx, my, 14, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(mx - 22, my);
  ctx.lineTo(mx - 10, my);
  ctx.moveTo(mx + 10, my);
  ctx.lineTo(mx + 22, my);
  ctx.moveTo(mx, my - 22);
  ctx.lineTo(mx, my - 10);
  ctx.moveTo(mx, my + 10);
  ctx.lineTo(mx, my + 22);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 100, 100, 0.4)';
  ctx.beginPath();
  ctx.arc(mx, my, 2, 0, Math.PI * 2);
  ctx.fill();
}
