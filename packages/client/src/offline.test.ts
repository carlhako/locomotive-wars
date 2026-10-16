import { describe, expect, it } from 'vitest';
import type { TrainInput } from '@lw/shared';
import { OFFLINE_BOTS, OfflineSession } from './offline.ts';

const IDLE: TrainInput = { turn: 0, boost: false, brake: false, aim: 0 };

describe('OfflineSession', () => {
  it('starts a world with the player and six bots', () => {
    const session = new OfflineSession({ seed: 7 });
    const view = session.view();

    expect(view.trains).toHaveLength(1 + OFFLINE_BOTS);
    expect(view.trains.filter((t) => t.controller === 'human')).toHaveLength(1);
    expect(view.trains.filter((t) => t.controller === 'bot')).toHaveLength(OFFLINE_BOTS);
    expect(view.localId).toBe(session.playerId);
    expect(view.minimap.filter((m) => m.isLocal)).toHaveLength(1);
    // The player starts as the standard starter train: locomotive and MG, protected.
    const me = view.trains.find((t) => t.id === view.localId)!;
    expect(me.carriages.map((c) => c.kind)).toEqual(['locomotive', 'mg']);
    expect(me.protected).toBe(true);
  });

  it('steps the simulation at 30 ticks per second regardless of frame size', () => {
    const a = new OfflineSession({ seed: 7 });
    const b = new OfflineSession({ seed: 7 });

    for (let i = 0; i < 60; i++) a.advance(1 / 60, IDLE);
    for (let i = 0; i < 10; i++) b.advance(0.1, IDLE);

    expect(a.currentWorld.state.tick).toBe(30);
    expect(b.currentWorld.state.tick).toBe(30);
  });

  it('is deterministic for a seed and input sequence', () => {
    const run = (): string => {
      const s = new OfflineSession({ seed: 99 });
      for (let i = 0; i < 120; i++) s.advance(1 / 60, { ...IDLE, turn: 1, boost: i % 40 < 10 });
      const me = s.view().trains.find((t) => t.id === s.playerId)!;
      return JSON.stringify([me.x, me.y, me.angle, s.currentWorld.state.tick]);
    };
    expect(run()).toBe(run());
  });

  it('interpolates the view between ticks', () => {
    const session = new OfflineSession({ seed: 7 });
    const dt = session.currentWorld.dt;
    session.advance(dt, IDLE);
    const atTick = session.view().trains.find((t) => t.id === session.playerId)!;
    session.advance(dt * 0.5, IDLE);
    const between = session.view().trains.find((t) => t.id === session.playerId)!;
    session.advance(dt * 0.5, IDLE);
    const next = session.view().trains.find((t) => t.id === session.playerId)!;

    expect(Math.hypot(between.x - atTick.x, between.y - atTick.y)).toBeGreaterThan(0);
    const half = Math.hypot(between.x - atTick.x, between.y - atTick.y);
    const full = Math.hypot(next.x - atTick.x, next.y - atTick.y);
    expect(half).toBeCloseTo(full / 2, 1);
  });

  it('respawns the local train in place after it is destroyed, without restarting', () => {
    const session = new OfflineSession({ seed: 7 });
    const oldId = session.playerId;
    const oldGeneration = session.generation;
    const world = session.currentWorld;
    const me = world.getTrain(oldId)!;
    me.protectedFor = 0;
    for (const kind of ['armor', 'speed', 'shield'] as const) world.addCarriage(oldId, kind);
    const [oldX, oldY] = [me.x, me.y];
    // A heavy enemy shot at the head ends the train on the next tick.
    world.state.projectiles.push({
      id: 900001,
      kind: 'bullet',
      x: me.x,
      y: me.y,
      vx: 0,
      vy: 0,
      damage: 10000,
      life: 1,
      splash: 0,
      ownerKind: 'enemy',
      ownerId: 900002,
    });

    const events = session.advance(world.dt, IDLE);
    expect(events.some((e) => e.type === 'trainDestroyed' && e.victimId === oldId)).toBe(true);
    expect(session.view().trains.find((t) => t.id === oldId)?.alive).toBe(false);

    // The very next tick brings the player back: same world, same id, a fresh starter train.
    session.advance(world.dt, IDLE);
    expect(session.currentWorld).toBe(world);
    expect(session.generation).toBe(oldGeneration);
    expect(session.playerId).toBe(oldId);
    const back = session.view().trains.find((t) => t.id === oldId)!;
    expect(back.alive).toBe(true);
    expect(back.carriages.map((c) => c.kind)).toEqual(['locomotive', 'mg']);
    expect(back.protected).toBe(true);
    expect(back.spawnSeq).toBe(1);
    expect(Math.hypot(back.x - oldX, back.y - oldY)).toBeGreaterThan(0);
    expect(back.hp).toBe(back.maxHp);
  });

  it('draws a respawned train at its new position, not sliding in from the old one', () => {
    const session = new OfflineSession({ seed: 7 });
    const world = session.currentWorld;
    const me = world.getTrain(session.playerId)!;
    me.alive = false;
    session.advance(world.dt * 0.5, IDLE);
    session.advance(world.dt * 0.5, IDLE);
    const spawn = world.getTrain(session.playerId)!;
    expect(spawn.spawnSeq).toBe(1);
    // Part-way through the next tick the view must still be at the spawn point's neighbourhood.
    session.advance(world.dt * 0.5, IDLE);
    const drawn = session.view().trains.find((t) => t.id === session.playerId)!;
    expect(Math.hypot(drawn.x - spawn.x, drawn.y - spawn.y)).toBeLessThan(20);
  });

  it('respawns destroyed bots as starter trains too', () => {
    const session = new OfflineSession({ seed: 7 });
    const world = session.currentWorld;
    const bot = world.state.trains.find((t) => t.controller === 'bot')!;
    bot.alive = false;
    session.advance(world.dt * 1.5, IDLE);
    expect(bot.alive).toBe(true);
    expect(bot.carriages.map((c) => c.kind)).toEqual(['locomotive', 'mg']);
  });
});
