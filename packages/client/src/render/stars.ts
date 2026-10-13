import type { DrawEnv } from './canvas.ts';

export interface Star {
  x: number;
  y: number;
  size: number;
  brightness: number;
  twinkle: number;
  twinkleSpeed: number;
  color: string;
  parallax: number;
}

/**
 * Side length of the square the stars are scattered over. The reference spread 500 stars over
 * 9600 units without repeating, which leaves only a dozen on screen; tiling them over a smaller
 * square keeps the intended parallax starfield visibly populated.
 */
export const STAR_TILE = 3000;

/** Cosmetic only, so it draws from `Math.random` and never touches the simulation's rng. */
export function generateStars(count = 500): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: Math.random() * STAR_TILE,
      y: Math.random() * STAR_TILE,
      size: Math.random() * 1.4 + 0.3,
      brightness: Math.random() * 0.7 + 0.3,
      twinkle: Math.random() * Math.PI * 2,
      twinkleSpeed: Math.random() * 2 + 0.5,
      color: Math.random() < 0.1 ? '#88aaff' : Math.random() < 0.05 ? '#ffcc88' : '#ffffff',
      parallax: 0.2 + Math.random() * 0.4,
    });
  }
  return stars;
}

function mod(v: number, m: number): number {
  const r = v % m;
  return r < 0 ? r + m : r;
}

/** Draws the parallax stars and the world grid. `dt` advances the twinkle. */
export function drawBackdrop(env: DrawEnv, stars: Star[], dt: number): void {
  const { ctx, width, height, camera } = env;
  ctx.fillStyle = '#04041a';
  ctx.fillRect(0, 0, width, height);

  const left = camera.travelX - width / 2;
  const top = camera.travelY - height / 2;
  for (const s of stars) {
    s.twinkle += s.twinkleSpeed * dt;
    const a = (Math.sin(s.twinkle) * 0.4 + 0.6) * s.brightness;
    ctx.globalAlpha = a * 0.7;
    ctx.fillStyle = s.color;
    const baseX = mod(s.x - left * s.parallax, STAR_TILE);
    const baseY = mod(s.y - top * s.parallax, STAR_TILE);
    for (let sx = baseX; sx <= width + 10; sx += STAR_TILE) {
      for (let sy = baseY; sy <= height + 10; sy += STAR_TILE) {
        ctx.beginPath();
        ctx.arc(sx, sy, s.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.globalAlpha = 1;

  // The grid lines sit at multiples of 100 and 500 world units; both divide the map size, so
  // they line up across the seam without special handling.
  const camLeft = camera.x - width / 2;
  const camTop = camera.y - height / 2;
  drawGrid(env, camLeft, camTop, 100, 'rgba(80, 100, 180, 0.08)');
  drawGrid(env, camLeft, camTop, 500, 'rgba(100, 150, 220, 0.12)');
}

function drawGrid(
  env: DrawEnv,
  camLeft: number,
  camTop: number,
  step: number,
  style: string,
): void {
  const { ctx, width, height } = env;
  ctx.strokeStyle = style;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = Math.floor(camLeft / step) * step; x < camLeft + width + step; x += step) {
    ctx.moveTo(x - camLeft, 0);
    ctx.lineTo(x - camLeft, height);
  }
  for (let y = Math.floor(camTop / step) * step; y < camTop + height + step; y += step) {
    ctx.moveTo(0, y - camTop);
    ctx.lineTo(width, y - camTop);
  }
  ctx.stroke();
}
