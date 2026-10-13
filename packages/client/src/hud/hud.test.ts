import { describe, expect, it } from 'vitest';
import { viewFromWorld, World } from '@lw/shared';
import { hudModel } from './hud.ts';

function world() {
  return new World({
    seed: 5,
    initialTrailers: 0,
    initialEnemies: 0,
    maxTrailers: 0,
    maxEnemies: 0,
    boss: false,
  });
}

describe('hudModel', () => {
  it('shows the hull bar at 40% when the view hull is at 40%', () => {
    const w = world();
    const me = w.addTrain({ carriages: ['armor', 'mg'] });
    me.hull = me.maxHull * 0.4;

    const m = hudModel(viewFromWorld(w, me.id));

    expect(m.hullPct).toBeCloseTo(40);
    expect(Math.floor(m.hullPct)).toBe(40);
    expect(m.carriages).toBe(3);
  });

  it('reports fuel against the tank size including fuel carriages', () => {
    const w = world();
    const me = w.addTrain({ carriages: ['fuel'] });
    me.fuel = 50;

    const m = hudModel(viewFromWorld(w, me.id));

    // Capacity is 100 * (1 + 0.3 * 0.5) = 115.
    expect(m.fuelPct).toBeCloseTo((50 / 115) * 100);
  });

  it('flags the bridge only while the local train is alive', () => {
    const w = world();
    const me = w.addTrain();
    me.bridgeActive = true;
    expect(hudModel(viewFromWorld(w, me.id)).bridge).toBe(true);
    me.alive = false;
    expect(hudModel(viewFromWorld(w, me.id)).bridge).toBe(false);
  });

  it('describes the boss while one is alive', () => {
    const w = world();
    const me = w.addTrain();
    expect(hudModel(viewFromWorld(w, me.id)).boss).toBeNull();
    const boss = w.spawnBoss();
    boss.hull = boss.maxHull / 2;

    const m = hudModel(viewFromWorld(w, me.id));

    expect(m.boss?.name).toBe(boss.name);
    expect(m.boss?.pct).toBeCloseTo(50);
  });

  it('handles a view with no local train', () => {
    const w = world();
    w.addTrain();
    const m = hudModel(viewFromWorld(w, 9999));
    expect(m.hasLocal).toBe(false);
  });
});
