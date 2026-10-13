import { describe, expect, it } from 'vitest';
import type { TrainInput } from '@lw/shared';
import { OFFLINE_BOTS, OfflineSession, RESTART_DELAY } from './offline.ts';

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
    // The player starts with a weapon and a shield behind the locomotive.
    const me = view.trains.find((t) => t.id === view.localId)!;
    expect(me.carriages.map((c) => c.kind)).toEqual(['locomotive', 'mg', 'shield']);
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

  it('restarts with a fresh world after the local train is destroyed', () => {
    const session = new OfflineSession({ seed: 7, restartDelay: 0.5 });
    const oldId = session.playerId;
    const oldGeneration = session.generation;
    const world = session.currentWorld;
    const me = world.getTrain(oldId)!;
    // A heavy enemy shot at the head ends the run on the next tick.
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
    expect(session.playerId).toBe(oldId);

    // Time keeps running at the normal rate while the death plays out: no slow motion.
    const tickBefore = world.state.tick;
    session.advance(0.25, IDLE);
    const ticks = world.state.tick - tickBefore;
    expect(ticks).toBeGreaterThanOrEqual(7);
    expect(ticks).toBeLessThanOrEqual(8);

    // A single frame is capped at 0.25 s of simulation, so step the remainder in two.
    session.advance(0.25, IDLE);
    session.advance(0.25, IDLE);
    // Ids are assigned in creation order, so the new player may reuse the old id; the
    // generation is what tells consumers the world was replaced.
    expect(session.generation).toBe(oldGeneration + 1);
    expect(session.currentWorld).not.toBe(world);
    const view = session.view();
    expect(view.trains.find((t) => t.id === session.playerId)?.alive).toBe(true);
    expect(view.trains).toHaveLength(1 + OFFLINE_BOTS);
  });

  it('keeps the default restart delay short', () => {
    expect(RESTART_DELAY).toBeLessThan(3);
  });
});
