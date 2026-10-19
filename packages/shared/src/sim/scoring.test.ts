import { describe, expect, it } from 'vitest';
import { destroyTrain } from './combat.ts';
import { BOSS_INTERVAL } from './constants.ts';
import { emptyWorld, run } from './testing.ts';
import { compareRank, noteScore, scoreOf } from './train.ts';
import type { PickupKind, TrainState } from './types.ts';
import type { World } from './world.ts';

const ARMOR: PickupKind[] = ['armor'];

function grow(world: World, t: TrainState, n: number): void {
  for (let i = 0; i < n; i++) world.addCarriage(t.id, ARMOR[0] as PickupKind);
}

describe('live score and round best', () => {
  it('is 1 for a starter train', () => {
    const world = emptyWorld();
    const t = world.addTrain();
    expect(scoreOf(t)).toBe(1);
    expect(t.roundBest).toBe(1);
  });

  it('goes up by one per pickup and tracks the best', () => {
    const world = emptyWorld();
    const t = world.addTrain({ carriages: Array<PickupKind>(7).fill('armor') });
    expect(scoreOf(t)).toBe(7);
    world.spawnTrailer(t.x, t.y, 'mg');
    world.step();
    expect(scoreOf(t)).toBe(8);
    expect(t.roundBest).toBe(8);
  });

  it('is not raised by kills', () => {
    const world = emptyWorld();
    const a = world.addTrain({ protectedFor: 0 });
    const b = world.addTrain({ protectedFor: 0 });
    destroyTrain(world, b, 'weapon', { kind: 'train', id: a.id });
    expect(a.kills).toBe(1);
    expect(scoreOf(a)).toBe(1);
    expect(a.roundBest).toBe(1);
  });

  it('does not rise when the carriage limit refuses the pickup', () => {
    const world = emptyWorld({ maxCarriages: 10 });
    const t = world.addTrain({ carriages: Array<PickupKind>(9).fill('armor') });
    expect(t.roundBest).toBe(9);
    expect(world.addCarriage(t.id, 'mg')).toBe(false);
    expect(t.roundBest).toBe(9);
  });

  it('resets the live score on respawn but keeps the best', () => {
    const world = emptyWorld();
    const t = world.addTrain({ carriages: Array<PickupKind>(40).fill('armor') });
    expect(t.roundBest).toBe(40);
    destroyTrain(world, t, 'enemy', null);
    world.respawnTrain(t.id);
    const fresh = world.getTrain(t.id)!;
    expect(scoreOf(fresh)).toBe(1);
    expect(fresh.roundBest).toBe(40);
  });

  it('records the tick at which the best was first reached', () => {
    const world = emptyWorld();
    const t = world.addTrain();
    run(world, 5);
    grow(world, t, 1);
    expect(t.roundBest).toBe(2);
    expect(t.roundBestTick).toBe(5);
    run(world, 5);
    noteScore(t, world.state.tick);
    expect(t.roundBestTick).toBe(5);
  });
});

describe('ranking', () => {
  it('ranks a high peak above a higher final length', () => {
    const world = emptyWorld();
    const a = world.addTrain({ carriages: Array<PickupKind>(40).fill('armor') });
    const b = world.addTrain({ carriages: Array<PickupKind>(18).fill('armor') });
    destroyTrain(world, a, 'enemy', null);
    world.respawnTrain(a.id);
    grow(world, a, 5);
    expect(scoreOf(a)).toBe(6);
    expect(scoreOf(b)).toBe(18);
    const ranked = [b, a].sort(compareRank);
    expect(ranked.map((t) => t.id)).toEqual([a.id, b.id]);
    expect(ranked[0]?.roundBest).toBe(40);
  });

  it('breaks ties by who reached the best first, then by id', () => {
    const world = emptyWorld();
    const early = world.addTrain();
    const late = world.addTrain();
    run(world, 3);
    grow(world, late, 24);
    run(world, 3);
    grow(world, early, 24);
    // Both at 25 now; `late` got there on tick 3, `early` on tick 6.
    expect(early.roundBest).toBe(25);
    expect(late.roundBest).toBe(25);
    expect([early, late].sort(compareRank).map((t) => t.id)).toEqual([late.id, early.id]);

    const x = { id: 1, roundBest: 5, roundBestTick: 9 };
    const y = { id: 2, roundBest: 5, roundBestTick: 9 };
    expect(compareRank(x, y)).toBeLessThan(0);
  });
});

describe('resetForRound', () => {
  it('starts everyone fresh', () => {
    const world = emptyWorld();
    const t = world.addTrain({ carriages: Array<PickupKind>(60).fill('armor') });
    const bot = world.addTrain({ controller: 'bot' });
    t.kills = 3;
    run(world, 10);
    const oldSeq = t.spawnSeq;
    world.spawnDrop(100, 100);
    world.spawnEnemy('hunter');
    world.state.bossTimer = 1;
    world.state.bossId = 99;
    destroyTrain(world, bot, 'enemy', null);

    world.resetForRound(42);

    expect(t.carriages.map((c) => c.kind)).toEqual(['locomotive', 'mg']);
    expect(t.roundBest).toBe(1);
    expect(t.kills).toBe(0);
    expect(t.spawnSeq).toBe(oldSeq + 1);
    expect(t.protectedFor).toBeGreaterThan(0);
    expect(bot.alive).toBe(true);
    expect(bot.roundBest).toBe(1);
    expect(world.state.drops).toHaveLength(0);
    expect(world.state.projectiles).toHaveLength(0);
    expect(world.state.enemies).toHaveLength(world.options.initialEnemies);
    expect(world.state.trailers).toHaveLength(world.options.initialTrailers);
    expect(world.state.bossId).toBeNull();
    expect(world.state.bossTimer).toBe(BOSS_INTERVAL);
  });

  it('regenerates trailers and enemies and clears the boss', () => {
    const world = emptyWorld({ initialTrailers: 8, initialEnemies: 3, maxTrailers: 8 });
    expect(world.state.trailers).toHaveLength(8);
    world.spawnBoss();
    expect(world.state.bossId).not.toBeNull();
    world.resetForRound(7);
    expect(world.state.trailers).toHaveLength(8);
    expect(world.state.enemies).toHaveLength(3);
    expect(world.state.enemies.some((e) => e.kind === 'boss')).toBe(false);
    expect(world.state.bossId).toBeNull();
  });

  it('removes every heart and dose, then regenerates the map hearts', () => {
    const world = emptyWorld({ maxSlowHearts: 6, maxFullHearts: 1 });
    const t = world.addTrain({ protectedFor: 0 });
    const before = world.state.hearts.map((h) => h.id);
    expect(before).toHaveLength(7);
    world.spawnHeart('slow', 100, 100, true);
    t.healDoses = [5];
    world.resetForRound(5);
    expect(t.healDoses).toEqual([]);
    expect(world.state.hearts.some((h) => h.dropped)).toBe(false);
    expect(world.state.hearts.filter((h) => h.kind === 'slow')).toHaveLength(6);
    expect(world.state.hearts.filter((h) => h.kind === 'full')).toHaveLength(1);
    expect(world.state.hearts.some((h) => before.includes(h.id))).toBe(false);
  });

  it('is reproducible from the seed', () => {
    const a = emptyWorld({ initialTrailers: 8, initialEnemies: 3 });
    const b = emptyWorld({ initialTrailers: 8, initialEnemies: 3 });
    a.addTrain();
    b.addTrain();
    run(a, 7);
    a.resetForRound(99);
    b.resetForRound(99);
    // Same seed, but different histories: positions of the regenerated pickups still match
    // relative to a fresh draw from the seed.
    expect(a.state.trailers.map((p) => [p.x, p.y])).toEqual(
      b.state.trailers.map((p) => [p.x, p.y]),
    );
  });
});
