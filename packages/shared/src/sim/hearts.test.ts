import { describe, expect, it } from 'vitest';
import { damageEnemy, destroyTrain } from './combat.ts';
import {
  DROP_LIFETIME,
  FULL_HEART_DROP_CHANCE,
  HULL_REGEN,
  MAX_HEAL_DOSES,
  SLOW_HEART_DROP_CHANCE,
} from './constants.ts';
import { emptyWorld, ofType, run } from './testing.ts';
import type { HeartKind, TrainState } from './types.ts';
import { World } from './world.ts';

/** An unprotected starter train heading east, with hull and max hull set as given. */
function trainAt(world: World, hull: number, maxHull: number): TrainState {
  const train = world.addTrain({ protectedFor: 0, x: 3000, y: 3000, angle: 0 });
  train.maxHull = maxHull;
  train.hull = hull;
  return train;
}

/** Puts a heart where the train's head will be after its next move (6 units east). */
function heartAhead(world: World, train: TrainState, kind: HeartKind) {
  return world.spawnHeart(kind, train.x + 6, train.y);
}

const ticks = (seconds: number) => Math.round(seconds * 30);

describe('heart collection', () => {
  it('is used up at full hull, without touching carriages or score', () => {
    const world = emptyWorld();
    const train = trainAt(world, 400, 400);
    const heart = heartAhead(world, train, 'slow');
    const kinds = train.carriages.map((c) => c.kind);
    const events = world.step();
    expect(world.state.hearts).toHaveLength(0);
    expect(ofType(events, 'heart')).toEqual([
      {
        type: 'heart',
        trainId: train.id,
        heartId: heart.id,
        kind: 'slow',
        amount: 60,
        x: heart.x,
        y: heart.y,
      },
    ]);
    expect(ofType(events, 'pickup')).toHaveLength(0);
    expect(train.carriages.map((c) => c.kind)).toEqual(kinds);
    expect(train.roundBest).toBe(1);
    expect(train.hull).toBe(400);
  });

  it('is widened by a magnet', () => {
    const plain = emptyWorld();
    const a = plain.addTrain({ protectedFor: 0, x: 3000, y: 3000, angle: 0 });
    plain.spawnHeart('slow', 3100, 3040);
    run(plain, 30);
    expect(plain.state.hearts).toHaveLength(1);

    const magnet = emptyWorld();
    const b = magnet.addTrain({
      protectedFor: 0,
      x: 3000,
      y: 3000,
      angle: 0,
      carriages: ['magnet'],
    });
    magnet.spawnHeart('slow', 3100, 3040);
    const events = run(magnet, 30);
    expect(magnet.state.hearts).toHaveLength(0);
    expect(ofType(events, 'heart')[0]?.trainId).toBe(b.id);
    expect(a.alive).toBe(true);
  });

  it('is not collected by a destroyed train', () => {
    const world = emptyWorld();
    const train = trainAt(world, 100, 400);
    destroyTrain(world, train, 'enemy', null);
    world.spawnHeart('full', train.x, train.y);
    expect(ofType(run(world, 3), 'heart')).toHaveLength(0);
    expect(world.state.hearts).toHaveLength(1);
  });

  it('restores the hull at once for a full heart, reporting what it restored', () => {
    const world = emptyWorld();
    const train = trainAt(world, 50, 300);
    heartAhead(world, train, 'full');
    const [event] = ofType(world.step(), 'heart');
    expect(train.hull).toBe(300);
    expect(event).toMatchObject({ kind: 'full', amount: 250 });
    expect(train.healDoses).toEqual([]);
  });

  it('reports a slow heart as its whole dose', () => {
    const world = emptyWorld();
    const train = trainAt(world, 100, 400);
    heartAhead(world, train, 'slow');
    expect(ofType(world.step(), 'heart')[0]).toMatchObject({
      trainId: train.id,
      kind: 'slow',
      amount: 60,
    });
    expect(train.healDoses).toHaveLength(1);
  });
});

describe('healing doses', () => {
  it('heals 15% of max hull over 8 seconds, on top of regeneration', () => {
    const world = emptyWorld();
    const train = trainAt(world, 100, 400);
    heartAhead(world, train, 'slow');
    world.step();
    const start = train.hull;
    run(world, ticks(8));
    expect(train.hull).toBeCloseTo(start + 60 + HULL_REGEN * 8, 6);
    expect(start).toBeCloseTo(100 + HULL_REGEN / 30, 6);
    expect(train.healDoses).toEqual([]);
    // Once the dose has run out, only regeneration remains.
    const after = train.hull;
    run(world, 30);
    expect(train.hull).toBeCloseTo(after + HULL_REGEN, 6);
  });

  it('stacks: three doses heal 22.5 hull per second', () => {
    const world = emptyWorld();
    const train = trainAt(world, 100, 400);
    for (let i = 0; i < 3; i++) heartAhead(world, train, 'slow');
    world.step();
    expect(train.healDoses).toHaveLength(3);
    const start = train.hull;
    run(world, 30);
    expect(train.hull - start).toBeCloseTo(22.5 + HULL_REGEN, 6);
  });

  it('keeps the hull at max and still runs out at full hull', () => {
    const world = emptyWorld();
    const train = trainAt(world, 400, 400);
    heartAhead(world, train, 'slow');
    world.step();
    run(world, ticks(4));
    expect(train.hull).toBe(400);
    expect(train.healDoses).toHaveLength(1);
    run(world, ticks(4));
    expect(train.healDoses).toEqual([]);
  });

  it('ends on destruction and does not come back on respawn', () => {
    const world = emptyWorld();
    const train = trainAt(world, 100, 400);
    heartAhead(world, train, 'slow');
    heartAhead(world, train, 'slow');
    world.step();
    expect(train.healDoses).toHaveLength(2);
    destroyTrain(world, train, 'enemy', null);
    expect(train.healDoses).toEqual([]);
    world.respawnTrain(train.id);
    expect(train.healDoses).toEqual([]);
  });

  it('replaces the dose with the least time left at the limit', () => {
    const world = emptyWorld();
    const train = trainAt(world, 100, 400);
    train.healDoses = Array.from({ length: MAX_HEAL_DOSES }, (_, i) => 2 + (i % 5));
    train.healDoses[7] = 0.5;
    heartAhead(world, train, 'slow');
    world.step();
    expect(train.healDoses).toHaveLength(MAX_HEAL_DOSES);
    expect(train.healDoses[7]).toBe(8);
    expect(Math.min(...train.healDoses)).toBeGreaterThan(1.9);
  });
});

describe('heart spawning and expiry', () => {
  /** A world with nothing in it but its own hearts. */
  const heartsOnly = (seed = 3) =>
    new World({
      seed,
      initialTrailers: 0,
      initialEnemies: 0,
      maxTrailers: 0,
      maxEnemies: 0,
      boss: false,
    });
  const count = (world: World, kind: HeartKind) =>
    world.state.hearts.filter((h) => h.kind === kind && !h.dropped).length;

  it('keeps 6 slow and 1 full world heart on the map', () => {
    const world = heartsOnly();
    expect(count(world, 'slow')).toBe(6);
    expect(count(world, 'full')).toBe(1);
    run(world, ticks(600));
    expect(count(world, 'slow')).toBe(6);
    expect(count(world, 'full')).toBe(1);
    expect(world.state.hearts).toHaveLength(7);
  });

  it('replaces a collected full heart later', () => {
    const world = heartsOnly();
    const full = world.state.hearts.find((h) => h.kind === 'full')!;
    const train = world.addTrain({ protectedFor: 0, x: full.x - 6, y: full.y, angle: 0 });
    expect(ofType(world.step(), 'heart')).toHaveLength(1);
    world.removeTrain(train.id);
    expect(count(world, 'full')).toBe(0);
    run(world, ticks(59));
    expect(count(world, 'full')).toBe(0);
    run(world, ticks(2));
    expect(count(world, 'full')).toBe(1);
    expect(world.state.hearts.find((h) => h.kind === 'full')!.id).not.toBe(full.id);
  });

  it('expires dropped hearts after 35 seconds, but never world hearts', () => {
    const world = emptyWorld();
    world.spawnHeart('slow', 1000, 1000, true);
    world.spawnHeart('full', 2000, 2000);
    run(world, ticks(DROP_LIFETIME) - 1);
    expect(world.state.hearts).toHaveLength(2);
    run(world, 2);
    expect(world.state.hearts.map((h) => h.dropped)).toEqual([false]);
    run(world, ticks(100));
    expect(world.state.hearts).toHaveLength(1);
  });

  it('drops 5 pickups and a full heart from the boss', () => {
    const world = emptyWorld();
    const boss = world.spawnBoss();
    damageEnemy(world, boss, 1e6, null);
    expect(world.state.drops).toHaveLength(5);
    expect(world.state.hearts).toEqual([
      expect.objectContaining({ kind: 'full', dropped: true, x: boss.x, y: boss.y }),
    ]);
  });

  it('drops hearts from about 3% (full) and 20% (slow) of enemies, never both', () => {
    const world = emptyWorld({ seed: 11 });
    const kills = 10_000;
    let full = 0;
    let slow = 0;
    for (let i = 0; i < kills; i++) {
      world.state.hearts = [];
      world.state.drops = [];
      const enemy = world.spawnEnemy('drone', 3000, 3000);
      damageEnemy(world, enemy, 1e6, null);
      world.state.enemies = [];
      expect(world.state.drops).toHaveLength(1);
      expect(world.state.hearts.length).toBeLessThanOrEqual(1);
      for (const h of world.state.hearts) {
        expect(h.dropped).toBe(true);
        if (h.kind === 'full') full++;
        else slow++;
      }
    }
    expect(Math.abs(full / kills - FULL_HEART_DROP_CHANCE)).toBeLessThan(0.01);
    expect(Math.abs(slow / kills - SLOW_HEART_DROP_CHANCE)).toBeLessThan(0.01);
  });
});
