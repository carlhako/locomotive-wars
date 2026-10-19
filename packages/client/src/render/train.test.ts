import { describe, expect, it } from 'vitest';
import { MAP_SIZE } from '@lw/shared';
import type { CarriageKind, TrainView } from '@lw/shared';
import type { DrawEnv } from './canvas.ts';
import { createCamera } from './canvas.ts';
import { barrelAngle, drawTrain, isSafeCarriage, SAFE_CAR_ALPHA } from './train.ts';

interface Recorded {
  /** Opacity each carriage body was drawn with, in draw order (tail first). */
  bodies: number[];
  /** Total rotation each MG barrel was drawn at, in draw order. */
  mgBarrels: number[];
}

/**
 * A 2D context that tracks rotation and opacity through save/restore and records carriage
 * bodies and MG barrels as they are filled. Every other call is a no-op.
 */
function recordingContext(): { ctx: CanvasRenderingContext2D; rec: Recorded } {
  const rec: Recorded = { bodies: [], mgBarrels: [] };
  const stack: Array<{ rot: number; alpha: number }> = [];
  const state = { rot: 0, globalAlpha: 1 };
  const methods: Record<string, (...args: number[]) => unknown> = {
    save: () => stack.push({ rot: state.rot, alpha: state.globalAlpha }),
    restore: () => {
      const top = stack.pop();
      if (top) {
        state.rot = top.rot;
        state.globalAlpha = top.alpha;
      }
    },
    rotate: (a) => {
      state.rot += a ?? 0;
    },
    fillRect: (x, y, w, h) => {
      if (x === -8 && y === -6 && w === 16 && h === 12) rec.bodies.push(state.globalAlpha);
      if (x === 0 && y === -1 && w === 6 && h === 2) rec.mgBarrels.push(state.rot);
    },
    createLinearGradient: () => ({ addColorStop: () => undefined }),
  };
  const ctx = new Proxy(state, {
    get: (target, key: string) =>
      key in methods ? methods[key] : key in target ? target[key as 'rot'] : () => undefined,
    set: (target, key: string, value) => {
      if (key === 'globalAlpha') target.globalAlpha = value as number;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, rec };
}

function envWith(ctx: CanvasRenderingContext2D, x: number, y: number): DrawEnv {
  return { ctx, width: 1000, height: 800, camera: createCamera(x, y), size: MAP_SIZE, time: 0 };
}

/** A train heading east with its head at (3000, 3000) and carriages every 18 units behind. */
function trainOf(kinds: CarriageKind[], protectedTrain = false): TrainView {
  return {
    id: 1,
    name: 'Me',
    color: '#f66',
    controller: 'human',
    alive: true,
    x: 3000,
    y: 3000,
    angle: 0,
    hp: 100,
    maxHp: 100,
    fuel: 100,
    fuelMax: 100,
    bridge: false,
    boosting: false,
    protected: protectedTrain,
    spawnSeq: 0,
    roundBest: kinds.length - 1,
    carriages: kinds.map((kind, i) => ({ kind, x: 3000 - 18 * (i + 1), y: 3000, angle: 0 })),
    drones: [],
  };
}

const draw = (train: TrainView, aim: { x: number; y: number } | null) => {
  const { ctx, rec } = recordingContext();
  drawTrain(envWith(ctx, train.x, train.y), train, {
    isLocal: true,
    localHead: { x: train.x, y: train.y },
    aim,
    flashing: false,
  });
  return rec;
};

describe('turret barrels', () => {
  it('point each MG at the aim point, each at its own angle', () => {
    const train = trainOf(['locomotive', 'mg', 'mg', 'mg']);
    const mouse = { x: 3000, y: 2800 };
    const rec = draw(train, mouse);
    expect(rec.mgBarrels).toHaveLength(3);
    // Drawn tail first: carriages 3, 2, 1.
    const want = [3, 2, 1].map((i) => {
      const c = train.carriages[i]!;
      return Math.atan2(mouse.y - c.y, mouse.x - c.x);
    });
    rec.mgBarrels.forEach((a, k) => expect(a).toBeCloseTo(want[k]!, 9));
    expect(new Set(rec.mgBarrels.map((a) => a.toFixed(4))).size).toBe(3);
  });

  it('point along the track without an aim point', () => {
    const rec = draw(trainOf(['locomotive', 'mg', 'mg']), null);
    expect(rec.mgBarrels).toEqual([0, 0]);
  });

  it('use the head bearing when the aim point is on top of the carriage', () => {
    const train = trainOf(['locomotive', 'mg']);
    const aim = { x: 2964, y: 2990 };
    expect(barrelAngle(train, train.carriages[1]!, aim, MAP_SIZE)).toBeCloseTo(
      Math.atan2(-10, -36),
    );
  });
});

describe('safe carriages', () => {
  const eight: CarriageKind[] = ['locomotive', 'mg', 'armor', 'armor', 'mg', 'armor', 'fuel', 'mg'];

  it('fades the locomotive and the car behind it on an unprotected train', () => {
    const rec = draw(trainOf(eight), null);
    // Tail first: indices 7..0.
    expect(rec.bodies).toEqual([1, 1, 1, 1, 1, 1, SAFE_CAR_ALPHA, SAFE_CAR_ALPHA]);
    expect([0, 1, 2].map((i) => isSafeCarriage({ protected: false }, i))).toEqual([
      true,
      true,
      false,
    ]);
  });

  it('fades every carriage of a protected train, and none once protection ends', () => {
    expect(draw(trainOf(eight, true), null).bodies).toEqual(Array(8).fill(SAFE_CAR_ALPHA));
    expect(draw(trainOf(eight, false), null).bodies.slice(0, 6)).toEqual(Array(6).fill(1));
  });
});
