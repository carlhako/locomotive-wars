import { describe, expect, it } from 'vitest';
import { MAP_SIZE } from '@lw/shared';
import type { TrainView, WorldView } from '@lw/shared';
import { interpolateView } from './interpolate.ts';

function train(over: Partial<TrainView> = {}): TrainView {
  return {
    id: 1,
    name: 'T',
    color: '#fff',
    controller: 'human',
    alive: true,
    x: 100,
    y: 100,
    angle: 0,
    hp: 80,
    maxHp: 80,
    fuel: 100,
    fuelMax: 100,
    bridge: false,
    boosting: false,
    protected: false,
    spawnSeq: 0,
    roundBest: 0,
    carriages: [{ kind: 'locomotive', x: 90, y: 100, angle: 0 }],
    drones: [],
    ...over,
  };
}

function view(t: TrainView, time = 0): WorldView {
  return {
    tick: 0,
    time,
    localId: 1,
    trains: [t],
    enemies: [],
    trailers: [],
    drops: [],
    projectiles: [],
    mines: [],
    hearts: [],
    localDoses: 0,
    minimap: [{ id: t.id, x: t.x, y: t.y, color: t.color, isLocal: true }],
  };
}

describe('interpolateView', () => {
  it('returns the endpoints at alpha 0 and 1', () => {
    const a = view(train({ x: 100 }));
    const b = view(train({ x: 110 }));
    expect(interpolateView(a, b, 1, MAP_SIZE)).toBe(b);
    expect(interpolateView(a, b, 0, MAP_SIZE).trains[0]?.x).toBe(100);
  });

  it('blends head, carriages, and minimap halfway', () => {
    const a = view(train({ x: 100, carriages: [{ kind: 'locomotive', x: 90, y: 100, angle: 0 }] }));
    const b = view(
      train({ x: 110, carriages: [{ kind: 'locomotive', x: 100, y: 100, angle: 0 }] }),
    );
    const mid = interpolateView(a, b, 0.5, MAP_SIZE);
    expect(mid.trains[0]?.x).toBeCloseTo(105);
    expect(mid.trains[0]?.carriages[0]?.x).toBeCloseTo(95);
    expect(mid.minimap[0]?.x).toBeCloseTo(105);
  });

  it('moves the short way across the map seam', () => {
    const a = view(train({ x: 5995 }));
    const b = view(train({ x: 5 }));
    const mid = interpolateView(a, b, 0.5, MAP_SIZE);
    // Halfway through a 10-unit hop over the seam is exactly on it, never near x=3000.
    const x = mid.trains[0]!.x;
    expect(Math.min(x, MAP_SIZE - x)).toBeLessThan(1);
  });

  it('turns the short way round the angle wrap', () => {
    const a = view(train({ angle: Math.PI - 0.1 }));
    const b = view(train({ angle: -Math.PI + 0.1 }));
    const mid = interpolateView(a, b, 0.5, MAP_SIZE);
    expect(Math.cos(mid.trains[0]!.angle)).toBeCloseTo(-1, 3);
  });

  it('does not blend from a dead or newly spawned train', () => {
    const dead = view(train({ alive: false, x: 10 }));
    const alive = view(train({ alive: true, x: 3000 }));
    expect(interpolateView(dead, alive, 0.5, MAP_SIZE).trains[0]?.x).toBe(3000);
    const none: WorldView = { ...alive, trains: [], minimap: [] };
    expect(interpolateView(none, alive, 0.5, MAP_SIZE).trains[0]?.x).toBe(3000);
  });

  it('blends the clock', () => {
    const a = view(train(), 1);
    const b = view(train({ x: 101 }), 2);
    expect(interpolateView(a, b, 0.25, MAP_SIZE).time).toBeCloseTo(1.25);
  });
});
