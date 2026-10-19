import { describe, expect, it } from 'vitest';
import {
  ATTRACT_BOTS,
  ATTRACT_MIN_CARRIAGES,
  ATTRACT_WEAPONS,
  AttractWorld,
  pickLeader,
} from './world.ts';
import type { LeaderCandidate } from './world.ts';

const train = (id: number, length: number, alive = true): LeaderCandidate => ({
  id,
  alive,
  carriages: Array.from({ length: length + 1 }),
});

describe('AttractWorld', () => {
  it('starts eight long, weapon-heavy, unprotected bots and no player', () => {
    const attract = new AttractWorld({ seed: 7 });
    const view = attract.view();

    expect(view.trains).toHaveLength(ATTRACT_BOTS);
    expect(view.trains.every((t) => t.controller === 'bot')).toBe(true);
    expect(view.trains.some((t) => t.id === view.localId)).toBe(false);
    for (const t of view.trains) {
      const behind = t.carriages.slice(1).map((c) => c.kind);
      expect(behind.length).toBeGreaterThanOrEqual(ATTRACT_MIN_CARRIAGES);
      const weapons = behind.filter((k) => k !== 'locomotive' && ATTRACT_WEAPONS.has(k));
      expect(weapons.length * 2).toBeGreaterThan(behind.length);
      expect(t.protected).toBe(false);
    }
  });

  it('steps at 30 ticks per second regardless of frame size', () => {
    const a = new AttractWorld({ seed: 7 });
    const b = new AttractWorld({ seed: 7 });
    for (let i = 0; i < 60; i++) a.advance(1 / 60);
    for (let i = 0; i < 10; i++) b.advance(0.1);
    expect(a.world.state.tick).toBe(30);
    expect(b.world.state.tick).toBe(30);
  });

  it('is deterministic for a seed', () => {
    const run = (): string => {
      const attract = new AttractWorld({ seed: 99 });
      for (let i = 0; i < 120; i++) attract.advance(1 / 60);
      return JSON.stringify(attract.view().trains.map((t) => [t.id, t.x, t.y]));
    };
    expect(run()).toBe(run());
  });

  it('fills the air with projectiles', () => {
    const attract = new AttractWorld({ seed: 7 });
    let fired = 0;
    for (let i = 0; i < 300; i++) {
      fired += attract.advance(1 / 30).filter((e) => e.type === 'fired').length;
    }
    expect(fired).toBeGreaterThan(0);
    expect(attract.view().projectiles.length).toBeGreaterThan(0);
  });

  it('brings a destroyed bot back long under the same identity', () => {
    const attract = new AttractWorld({ seed: 7 });
    const bot = attract.world.state.trains[0]!;
    const { id, name, color } = bot;
    bot.alive = false;
    attract.advance(attract.world.dt);

    const back = attract.view().trains.find((t) => t.id === id)!;
    expect(back.alive).toBe(true);
    expect(back.name).toBe(name);
    expect(back.color).toBe(color);
    expect(back.carriages.length - 1).toBeGreaterThanOrEqual(ATTRACT_MIN_CARRIAGES);
    expect(back.protected).toBe(true);
  });

  it('moves the leader off a train that dies', () => {
    const attract = new AttractWorld({ seed: 7 });
    attract.advance(attract.world.dt);
    const leader = attract.leaderId!;
    expect(leader).not.toBeNull();
    // Kill it during the tick, after the revive pass, as combat would.
    const step = attract.world.step.bind(attract.world);
    attract.world.step = () => {
      attract.world.getTrain(leader)!.alive = false;
      return step();
    };
    attract.advance(attract.world.dt);
    expect(attract.leaderId).not.toBe(leader);
  });
});

describe('pickLeader', () => {
  it('takes the longest living train when the current one is dead', () => {
    expect(pickLeader([train(1, 30, false), train(2, 22), train(3, 25)], 1)).toBe(3);
  });

  it('takes the longest living train when the current one is missing', () => {
    expect(pickLeader([train(2, 22), train(3, 25)], 9)).toBe(3);
  });

  it('keeps the current train against one only 2 longer', () => {
    expect(pickLeader([train(1, 20), train(2, 22)], 1)).toBe(1);
  });

  it('switches to a train 3 longer', () => {
    expect(pickLeader([train(1, 20), train(2, 23)], 1)).toBe(2);
  });

  it('breaks a tie by the lowest id', () => {
    expect(pickLeader([train(4, 25), train(2, 25), train(3, 20)], null)).toBe(2);
  });

  it('is null when nothing is alive', () => {
    expect(pickLeader([train(1, 20, false)], 1)).toBeNull();
  });
});
