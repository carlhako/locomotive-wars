import { wrapDelta, wrapPos } from '@lw/shared';

/**
 * Camera and projection helpers. The world wraps on both axes, so every entity is drawn at its
 * nearest wrapped position to the camera; that is what makes the map seam invisible.
 */

/** Fraction of the remaining distance the camera closes per 1/60 s frame (the reference's 0.15). */
export const CAMERA_SMOOTHING = 0.15;

export interface Camera {
  /** World position at the centre of the screen, kept inside [0, size). */
  x: number;
  y: number;
  /**
   * The same position without wrapping, so effects that scroll with the camera (the starfield's
   * parallax) do not jump when the camera crosses the seam.
   */
  travelX: number;
  travelY: number;
}

export function createCamera(x = 0, y = 0): Camera {
  return { x, y, travelX: x, travelY: y };
}

/** Moves the camera towards a world point along the shortest wrapped route, smoothed over time. */
export function followCamera(
  camera: Camera,
  targetX: number,
  targetY: number,
  size: number,
  dt: number,
  snap = false,
): void {
  const k = snap ? 1 : 1 - Math.pow(1 - CAMERA_SMOOTHING, Math.max(0, dt) * 60);
  const dx = wrapDelta(targetX - camera.x, size) * k;
  const dy = wrapDelta(targetY - camera.y, size) * k;
  camera.x = wrapPos(camera.x + dx, size);
  camera.y = wrapPos(camera.y + dy, size);
  camera.travelX += dx;
  camera.travelY += dy;
}

/** Everything a draw function needs to place and paint one frame. */
export interface DrawEnv {
  ctx: CanvasRenderingContext2D;
  /** Viewport size in CSS pixels. */
  width: number;
  height: number;
  camera: Camera;
  /** World side length. */
  size: number;
  /** Wall-clock seconds, for cosmetic animation only. */
  time: number;
}

/** Screen x of a world x, using the nearest wrapped copy to the camera. */
export function screenX(env: DrawEnv, worldX: number): number {
  return env.width / 2 + wrapDelta(worldX - env.camera.x, env.size);
}

/** Screen y of a world y, using the nearest wrapped copy to the camera. */
export function screenY(env: DrawEnv, worldY: number): number {
  return env.height / 2 + wrapDelta(worldY - env.camera.y, env.size);
}

/** True when a screen point is within `margin` pixels of the viewport. */
export function onScreen(env: DrawEnv, sx: number, sy: number, margin: number): boolean {
  return sx >= -margin && sx <= env.width + margin && sy >= -margin && sy <= env.height + margin;
}

export interface CanvasSurface {
  ctx: CanvasRenderingContext2D;
  /** Current viewport size in CSS pixels. */
  readonly width: number;
  readonly height: number;
  /** Applies the device-pixel-ratio transform; call at the start of every frame. */
  begin(): void;
}

/** Sizes a canvas to the window (device-pixel aware) and keeps it sized on resize. */
export function setupCanvas(canvas: HTMLCanvasElement): CanvasSurface {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  let width = window.innerWidth;
  let height = window.innerHeight;
  let dpr = window.devicePixelRatio || 1;
  const resize = (): void => {
    width = window.innerWidth;
    height = window.innerHeight;
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
  };
  window.addEventListener('resize', resize);
  resize();
  return {
    ctx,
    get width() {
      return width;
    },
    get height() {
      return height;
    },
    begin() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    },
  };
}
