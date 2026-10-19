import type { MineView } from '@lw/shared';
import type { DrawEnv } from './canvas.ts';
import { onScreen, screenX, screenY } from './canvas.ts';
import { LOCAL_COLOR } from './palette.ts';

const MINE_RADIUS = 6;
const UNARMED_LIGHT = '#8a8a8a';
const ARMED_LIGHT = '#ff3030';

/**
 * Mines: a dark disc with a light that is grey while the mine arms and blinks red once it is
 * live. The local player's own mines get a thin ring in the player's colour.
 */
export function drawMines(env: DrawEnv, mines: readonly MineView[], localId: number): void {
  const { ctx } = env;
  for (const m of mines) {
    const px = screenX(env, m.x);
    const py = screenY(env, m.y);
    if (!onScreen(env, px, py, 20)) continue;
    ctx.fillStyle = '#1e1e22';
    ctx.strokeStyle = '#555a60';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(px, py, MINE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Studs around the rim.
    ctx.fillStyle = '#555a60';
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + Math.PI / 4;
      ctx.fillRect(px + Math.cos(a) * MINE_RADIUS - 1, py + Math.sin(a) * MINE_RADIUS - 1, 2, 2);
    }
    if (m.armed) {
      // Out of phase from mine to mine, derived from the id so it is stable.
      const blink = 0.5 + 0.5 * Math.sin(env.time * 7 + m.id * 1.3);
      ctx.globalAlpha = 0.25 + blink * 0.35;
      ctx.fillStyle = ARMED_LIGHT;
      ctx.beginPath();
      ctx.arc(px, py, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.5 + blink * 0.5;
    }
    ctx.fillStyle = m.armed ? ARMED_LIGHT : UNARMED_LIGHT;
    ctx.beginPath();
    ctx.arc(px, py, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    if (m.ownerId === localId) {
      ctx.strokeStyle = LOCAL_COLOR;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(px, py, MINE_RADIUS + 3, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
