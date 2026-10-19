import {
  AIM_CLOSE_RANGE,
  BODY_COLLISION_MIN_INDEX,
  DRONE_ORBIT_RADIUS,
  wrapAngle,
  wrapDelta,
  wrapDist,
} from '@lw/shared';
import type { CarriageView, TrainView } from '@lw/shared';
import type { DrawEnv } from './canvas.ts';
import { onScreen, screenX, screenY } from './canvas.ts';
import { CARRIAGE_TYPES, carriageColors, isWeaponCarriage, LOCAL_COLOR } from './palette.ts';

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Radius in pixels of the spawn-protection ring. */
const SHIELD_RING_RADIUS = 24;

/** Other trains' names and details show only within this distance of the local head. */
const NAME_RANGE = 400;

/** Opacity of carriages that cannot kill on contact. */
export const SAFE_CAR_ALPHA = 0.55;

/**
 * True when a carriage cannot destroy a head that touches it: the ones before the simulation's
 * lethal index, or any carriage of a protected train.
 */
export function isSafeCarriage(train: Pick<TrainView, 'protected'>, index: number): boolean {
  return train.protected || index < BODY_COLLISION_MIN_INDEX;
}

/**
 * The bearing a manual weapon's barrel points along, matching the simulation's firing rule: from
 * the carriage to the aim point, or the head's bearing to it when the point is on top of the
 * carriage.
 */
export function barrelAngle(
  train: Pick<TrainView, 'x' | 'y'>,
  c: Pick<CarriageView, 'x' | 'y'>,
  aim: { x: number; y: number },
  size: number,
): number {
  if (wrapDist(c.x, c.y, aim.x, aim.y, size) < AIM_CLOSE_RANGE) {
    return wrapAngle(train.x, train.y, aim.x, aim.y, size);
  }
  return wrapAngle(c.x, c.y, aim.x, aim.y, size);
}

export interface TrainDrawOptions {
  isLocal: boolean;
  /** The local head's world position, for the "near the player" name rule. */
  localHead: { x: number; y: number } | null;
  /** World aim point for turret barrels; trains without one point their turrets along the track. */
  aim: { x: number; y: number } | null;
  /** True for a moment after the train was hit. */
  flashing: boolean;
  /** Where an auto turret (a tail gunner) at a carriage index last fired, or null. */
  turretAngle?: (carriage: number) => number | null;
}

/**
 * Draws one train (reference drawTrain, lines 2183-2423): couplings, carriages from the tail to
 * the front, counter-drones, then the locomotive head, name, hull bar and carriage count.
 * Carriage positions come straight from the view; each is projected to its nearest wrapped copy
 * so a train crossing the seam is drawn whole. Carriages that are safe to touch (`isSafeCarriage`)
 * are drawn faded, with the couplings between them.
 */
export function drawTrain(env: DrawEnv, train: TrainView, opts: TrainDrawOptions): void {
  const { ctx } = env;
  const cars = train.carriages;

  if (cars.length > 1) {
    ctx.lineWidth = 3;
    for (let i = 0; i < cars.length - 1; i++) {
      const c1 = cars[i] as CarriageView;
      const c2 = cars[i + 1] as CarriageView;
      const dx = wrapDelta(c2.x - c1.x, env.size);
      const dy = wrapDelta(c2.y - c1.y, env.size);
      if (Math.hypot(dx, dy) > 25) continue;
      const px1 = screenX(env, c1.x);
      const py1 = screenY(env, c1.y);
      if (!onScreen(env, px1, py1, 40)) continue;
      const px2 = px1 + dx;
      const py2 = py1 + dy;
      ctx.globalAlpha = isSafeCarriage(train, i + 1) ? SAFE_CAR_ALPHA : 1;
      const perpA = c1.angle + Math.PI / 2;
      const ox = Math.cos(perpA) * 5;
      const oy = Math.sin(perpA) * 5;
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(px1 + ox, py1 + oy);
      ctx.lineTo(px2 + ox, py2 + oy);
      ctx.moveTo(px1 - ox, py1 - oy);
      ctx.lineTo(px2 - ox, py2 - oy);
      ctx.stroke();
      ctx.strokeStyle = '#777';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px1, py1);
      ctx.lineTo(px2, py2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  for (let i = cars.length - 1; i >= 0; i--) {
    const c = cars[i] as CarriageView;
    const px = screenX(env, c.x);
    const py = screenY(env, c.y);
    if (!onScreen(env, px, py, 30)) continue;
    const aim = opts.aim ? barrelAngle(train, c, opts.aim, env.size) : null;
    ctx.globalAlpha = isSafeCarriage(train, i) ? SAFE_CAR_ALPHA : 1;
    drawCarriage(ctx, c, px, py, aim, opts.turretAngle?.(i) ?? null);
  }
  ctx.globalAlpha = 1;

  for (const angle of train.drones) {
    const dx = screenX(env, train.x) + Math.cos(angle) * DRONE_ORBIT_RADIUS;
    const dy = screenY(env, train.y) + Math.sin(angle) * DRONE_ORBIT_RADIUS;
    if (!onScreen(env, dx, dy, 40)) continue;
    ctx.fillStyle = '#66ffff';
    ctx.beginPath();
    ctx.arc(dx, dy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(dx, dy, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  const px = screenX(env, train.x);
  const py = screenY(env, train.y);
  drawHead(ctx, train, px, py, opts.flashing);
  if (train.protected) drawShieldRing(env, px, py);

  const showName =
    opts.isLocal ||
    (opts.localHead !== null &&
      wrapDist(train.x, train.y, opts.localHead.x, opts.localHead.y, env.size) < NAME_RANGE);
  if (showName) {
    ctx.fillStyle = opts.isLocal ? LOCAL_COLOR : '#ffffff';
    ctx.font = opts.isLocal ? 'bold 13px sans-serif' : '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineWidth = 3;
    ctx.strokeText(train.name, px, py - 22);
    ctx.fillText(train.name, px, py - 22);
  }

  if (!opts.isLocal) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(px - 18, py - 32, 36, 4);
    ctx.fillStyle = train.hp > train.maxHp * 0.3 ? '#44ff44' : '#ff4444';
    ctx.fillRect(px - 18, py - 32, 36 * clamp(train.hp / train.maxHp, 0, 1), 4);
    ctx.fillStyle = '#fff';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${cars.length} cars`, px, py - 12);
  }
}

/** Spawn protection: a pulsing ring around the head. */
function drawShieldRing(env: DrawEnv, px: number, py: number): void {
  const { ctx } = env;
  const pulse = 0.5 + 0.5 * Math.sin(env.time * 8);
  ctx.save();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = `rgba(102, 255, 255, ${0.55 + 0.35 * pulse})`;
  ctx.fillStyle = `rgba(102, 255, 255, ${0.08 + 0.06 * pulse})`;
  ctx.beginPath();
  ctx.arc(px, py, SHIELD_RING_RADIUS + pulse * 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Repair cars carry a red cross. */
const REPAIR_ICON_COLOR = '#e02020';

function drawCarriage(
  ctx: CanvasRenderingContext2D,
  c: CarriageView,
  px: number,
  py: number,
  aim: number | null,
  turret: number | null,
): void {
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(c.angle);
  const colors = carriageColors(c.kind);
  ctx.fillStyle = colors.body;
  ctx.fillRect(-8, -6, 16, 12);
  ctx.fillStyle = colors.light;
  ctx.fillRect(-8, -6, 16, 3);
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.strokeRect(-8, -6, 16, 12);
  ctx.fillStyle = '#222';
  ctx.fillRect(-6, -6, 2, 1);
  ctx.fillRect(-6, 5, 2, 1);
  ctx.fillRect(4, -6, 2, 1);
  ctx.fillRect(4, 5, 2, 1);

  if (isWeaponCarriage(c.kind) || c.kind === 'tailgun') {
    ctx.fillStyle = colors.light;
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(0, 0, 1.5, 0, Math.PI * 2);
    ctx.fill();
    // Manual weapons follow the aim; a tail gunner looks backward until it fires.
    const facing = c.kind === 'tailgun' ? (turret ?? c.angle + Math.PI) : (aim ?? c.angle);
    ctx.rotate(facing - c.angle);
    ctx.fillStyle = colors.light;
    if (c.kind === 'mg') {
      ctx.fillRect(0, -1, 6, 2);
    } else if (c.kind === 'missile') {
      ctx.fillRect(0, -1.5, 7, 3);
    } else if (c.kind === 'flak') {
      // Short and wide, like a scattergun.
      ctx.fillRect(0, -2.5, 5, 5);
      ctx.fillStyle = '#000';
      ctx.fillRect(4, -1.5, 1, 3);
    } else if (c.kind === 'tailgun') {
      ctx.fillRect(0, -1, 7, 2);
      ctx.fillStyle = '#000';
      ctx.fillRect(6, -0.5, 1, 1);
    } else {
      ctx.fillRect(0, -1, 8, 2);
      ctx.fillStyle = '#ffee88';
      ctx.fillRect(0, -0.5, 8, 1);
    }
  } else if (c.kind !== 'locomotive') {
    if (c.kind === 'cowcatcher') {
      // A wedge on the leading edge, inside the body: the carriage ahead covers anything beyond.
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(4, -5);
      ctx.lineTo(7.5, 0);
      ctx.lineTo(4, 5);
      ctx.stroke();
    } else if (c.kind === 'tesla') {
      ctx.strokeStyle = colors.light;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Other carriages carry their type's icon, kept upright whatever the heading.
    ctx.rotate(-c.angle);
    ctx.fillStyle = c.kind === 'repair' ? REPAIR_ICON_COLOR : 'rgba(0, 0, 0, 0.75)';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(CARRIAGE_TYPES[c.kind].icon, 0, 0.5);
  }
  ctx.restore();
}

function drawHead(
  ctx: CanvasRenderingContext2D,
  train: TrainView,
  px: number,
  py: number,
  flashing: boolean,
): void {
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(train.angle);

  // Headlight cone
  ctx.save();
  ctx.globalAlpha = 0.3;
  const headlightGrd = ctx.createLinearGradient(8, 0, 80, 0);
  headlightGrd.addColorStop(0, 'rgba(255, 235, 100, 0.8)');
  headlightGrd.addColorStop(1, 'rgba(255, 235, 100, 0)');
  ctx.fillStyle = headlightGrd;
  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.lineTo(80, -25);
  ctx.lineTo(80, 25);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Locomotive body
  ctx.fillStyle = flashing ? '#ffffff' : train.color;
  ctx.beginPath();
  ctx.moveTo(14, 0);
  ctx.lineTo(5, -9);
  ctx.lineTo(-13, -9);
  ctx.lineTo(-13, 9);
  ctx.lineTo(5, 9);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = train.color;
  ctx.fillRect(-13, -9, 6, 18);
  ctx.fillStyle = '#000';
  ctx.fillRect(-13, -9, 6, 18);
  ctx.stroke();
  ctx.fillStyle = '#88ccff';
  ctx.fillRect(-11, -6, 3, 12);
  ctx.fillStyle = '#222';
  ctx.fillRect(-4, -12, 4, 5);
  ctx.fillRect(-4, 7, 4, 5);
  ctx.strokeStyle = '#000';
  ctx.strokeRect(-4, -12, 4, 5);
  ctx.strokeRect(-4, 7, 4, 5);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(10, 0, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffeb3b';
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.arc(10, 0, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(0, 8);
  ctx.stroke();
  ctx.restore();
}
