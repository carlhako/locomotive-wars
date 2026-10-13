import { GAME_TITLE } from '@lw/shared';

const canvas = document.getElementById('game');
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('Missing #game canvas');
}
const ctx = canvas.getContext('2d');
if (!ctx) {
  throw new Error('2D canvas context unavailable');
}

const draw = (): void => {
  const dpr = window.devicePixelRatio || 1;
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.fillStyle = '#0b0f14';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#e8eef5';
  ctx.font = '32px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(GAME_TITLE, width / 2, height / 2);
};

window.addEventListener('resize', draw);
draw();
