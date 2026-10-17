import { describe, expect, it } from 'vitest';
import { viewFromWorld, World } from '@lw/shared';
import { formatTimer, hudModel, idleWarningText, timerModel } from './hud.ts';

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
    expect(m.length).toBe(2);
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

  it('shows Length and Round best after a death: best survives, length restarts', () => {
    const w = world();
    const me = w.addTrain({ carriages: Array(40).fill('armor') });
    expect(hudModel(viewFromWorld(w, me.id))).toMatchObject({ length: 40, roundBest: 40 });
    me.alive = false;
    w.respawnTrain(me.id);
    w.addCarriage(me.id, 'mg');
    w.addCarriage(me.id, 'mg');
    expect(hudModel(viewFromWorld(w, me.id))).toMatchObject({ length: 3, roundBest: 40 });
  });

  it('never shows a round best below the current length', () => {
    const w = world();
    const me = w.addTrain({ carriages: ['mg', 'mg', 'mg'] });
    const view = viewFromWorld(w, me.id);
    // A network view can lag: the server's best has not caught up with the live length.
    view.trains[0]!.roundBest = 1;
    expect(hudModel(view)).toMatchObject({ length: 3, roundBest: 3 });
  });

  it('handles a view with no local train', () => {
    const w = world();
    w.addTrain();
    const m = hudModel(viewFromWorld(w, 9999));
    expect(m.hasLocal).toBe(false);
  });
});

describe('round timer', () => {
  it('formats minutes and seconds', () => {
    expect(formatTimer(600)).toBe('10:00');
    expect(formatTimer(75.2)).toBe('1:16');
    expect(formatTimer(9)).toBe('0:09');
    expect(formatTimer(0)).toBe('0:00');
    expect(formatTimer(-3)).toBe('0:00');
  });

  it('is highlighted in the final 10 seconds only', () => {
    const at = (secondsLeft: number) => timerModel({ phase: 'playing', roundId: 1, secondsLeft });
    expect(at(9)).toEqual({ text: '0:09', urgent: true });
    expect(at(10)).toEqual({ text: '0:10', urgent: true });
    expect(at(10.5)).toEqual({ text: '0:11', urgent: false });
    expect(at(120)).toEqual({ text: '2:00', urgent: false });
  });

  it('is absent without rounds and between them', () => {
    expect(timerModel(null)).toBeNull();
    expect(timerModel(undefined)).toBeNull();
    expect(timerModel({ phase: 'intermission', roundId: 1, secondsLeft: 5 })).toBeNull();
  });

  it('reaches the HUD model', () => {
    const w = world();
    const me = w.addTrain();
    const m = hudModel(viewFromWorld(w, me.id), { phase: 'playing', roundId: 2, secondsLeft: 9 });
    expect(m.timer).toEqual({ text: '0:09', urgent: true });
  });
});

describe('idle warning', () => {
  it('counts down in seconds', () => {
    expect(idleWarningText(7)).toContain('7s');
  });
});
