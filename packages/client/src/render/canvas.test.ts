import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAP_SIZE } from '@lw/shared';
import type { DrawEnv } from './canvas.ts';
import { createCamera, followCamera, screenX, screenY, setupCanvas } from './canvas.ts';

function envAt(cameraX: number, cameraY: number): DrawEnv {
  return {
    ctx: null as unknown as CanvasRenderingContext2D,
    width: 1000,
    height: 600,
    camera: createCamera(cameraX, cameraY),
    size: MAP_SIZE,
    time: 0,
  };
}

describe('wrapped projection', () => {
  it('draws x=20 thirty units to the right of a head at x=5990', () => {
    const env = envAt(5990, 3000);
    const head = screenX(env, 5990);
    const other = screenX(env, 20);
    expect(head).toBe(500);
    expect(other - head).toBe(30);
  });

  it('draws x=5990 to the left of a head at x=20', () => {
    const env = envAt(20, 3000);
    expect(screenX(env, 5990) - screenX(env, 20)).toBe(-30);
  });

  it('wraps vertically too', () => {
    const env = envAt(100, 10);
    expect(screenY(env, 5995) - screenY(env, 10)).toBe(-15);
  });

  it('does not move entities that are nowhere near the seam', () => {
    const env = envAt(3000, 3000);
    expect(screenX(env, 3100) - screenX(env, 3000)).toBe(100);
  });
});

describe('camera follow', () => {
  it('snaps onto the target', () => {
    const cam = createCamera(10, 10);
    followCamera(cam, 500, 700, MAP_SIZE, 0.016, true);
    expect(cam.x).toBe(500);
    expect(cam.y).toBe(700);
  });

  it('eases across the seam the short way round', () => {
    const cam = createCamera(5990, 3000);
    followCamera(cam, 10, 3000, MAP_SIZE, 1 / 60);
    // The target is 20 units away through the seam, so the first step moves right by 15%.
    expect(cam.x).toBeCloseTo(5993);
    for (let i = 0; i < 120; i++) followCamera(cam, 10, 3000, MAP_SIZE, 1 / 60);
    // It crossed the seam rather than sliding back across the map.
    expect(cam.x).toBeCloseTo(10, 1);
    expect(cam.travelX).toBeCloseTo(6010, 1);
  });

  it('closes 15% of the distance per 1/60 s by default, or the given fraction', () => {
    const def = createCamera(0, 0);
    followCamera(def, 1000, 0, MAP_SIZE, 1 / 60);
    expect(def.x).toBeCloseTo(150);
    const gentle = createCamera(0, 0);
    followCamera(gentle, 1000, 0, MAP_SIZE, 1 / 60, false, 0.05);
    expect(gentle.x).toBeCloseTo(50);
  });

  it('converges to the target', () => {
    const cam = createCamera(0, 0);
    for (let i = 0; i < 300; i++) followCamera(cam, 400, 250, MAP_SIZE, 1 / 60);
    expect(cam.x).toBeCloseTo(400, 1);
    expect(cam.y).toBeCloseTo(250, 1);
  });
});

describe('setupCanvas', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('removes its resize listener on dispose', () => {
    const add = vi.fn();
    const remove = vi.fn();
    vi.stubGlobal('window', {
      innerWidth: 800,
      innerHeight: 600,
      devicePixelRatio: 1,
      addEventListener: add,
      removeEventListener: remove,
    });
    const canvas = { width: 0, height: 0, getContext: () => ({}) };
    const surface = setupCanvas(canvas as unknown as HTMLCanvasElement);
    expect(add).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(canvas.width).toBe(800);

    surface.dispose();
    expect(remove).toHaveBeenCalledWith('resize', add.mock.calls[0]![1]);
  });
});
