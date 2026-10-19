import { describe, expect, it } from 'vitest';
import { destroyTrain } from './combat.ts';
import { MINE_ARM_TIME } from './constants.ts';
import { emptyWorld, ofType, run } from './testing.ts';
import type { Mine } from './types.ts';
import type { World } from './world.ts';

function plant(world: World, over: Partial<Mine> & { ownerId: number }): Mine {
  const mine: Mine = { id: world.newId(), x: 3000, y: 3000, age: 1, ...over };
  world.state.mines.push(mine);
  return mine;
}

describe('mine laying', () => {
  it('drops a mine at the last carriage every 2 seconds', () => {
    const world = emptyWorld();
    const a = world.addTrain({
      protectedFor: 0,
      x: 1000,
      y: 1000,
      angle: 0,
      carriages: ['mg', 'mines', 'armor'],
    });
    world.step();
    expect(world.state.mines).toHaveLength(1);
    const tail = a.carriages.at(-1)!;
    expect(world.state.mines[0]).toMatchObject({ ownerId: a.id, x: tail.x, y: tail.y });
    run(world, 57);
    expect(world.state.mines).toHaveLength(1);
    run(world, 3);
    expect(world.state.mines).toHaveLength(2);
    run(world, 57);
    expect(world.state.mines).toHaveLength(2);
    run(world, 3);
    expect(world.state.mines).toHaveLength(3);
  });

  it('stops at 6 live mines per mine layer', () => {
    const world = emptyWorld();
    world.addTrain({ protectedFor: 0, x: 1000, y: 1000, angle: 0, carriages: ['mines'] });
    // Nine drops would fit in 16 seconds, and none has expired yet.
    run(world, 30 * 16);
    expect(world.state.mines).toHaveLength(6);
  });

  it('allows 6 more per extra layer, up to 24 in total', () => {
    const world = emptyWorld();
    const a = world.addTrain({
      protectedFor: 0,
      x: 1000,
      y: 1000,
      angle: 0,
      carriages: Array(5).fill('mines'),
    });
    run(world, 30 * 16);
    expect(world.state.mines.filter((m) => m.ownerId === a.id)).toHaveLength(24);
  });

  it('drops again once a mine expires', () => {
    const world = emptyWorld();
    world.addTrain({ protectedFor: 0, x: 1000, y: 1000, angle: 0, carriages: ['mines'] });
    run(world, 30 * 19);
    const before = world.state.mines.map((m) => m.id);
    expect(before).toHaveLength(6);
    // The first mine expires 20 s after it was dropped, and a new one takes its place.
    run(world, 30 * 2);
    const after = world.state.mines.map((m) => m.id);
    expect(after).toHaveLength(6);
    expect(after).not.toContain(before[0]);
  });

  it('holds during spawn protection', () => {
    const world = emptyWorld();
    world.addTrain({ protectedFor: 2, x: 1000, y: 1000, angle: 0, carriages: ['mines'] });
    run(world, 30);
    expect(world.state.mines).toHaveLength(0);
  });
});

describe('mine explosions', () => {
  it('blows up a chaser, crediting the owner', () => {
    const world = emptyWorld();
    const a = world.addTrain({ protectedFor: 0, x: 1000, y: 1000, angle: 0, carriages: [] });
    const b = world.addTrain({ protectedFor: 0, x: 2960, y: 3000, angle: 0, carriages: [] });
    const mine = plant(world, { ownerId: a.id });
    const events = run(world, 5);
    expect(ofType(events, 'mineExploded')).toEqual([
      { type: 'mineExploded', mineId: mine.id, ownerId: a.id, x: 3000, y: 3000 },
    ]);
    const hit = ofType(events, 'hit').find((h) => h.victimId === b.id);
    expect(hit).toMatchObject({ attackerKind: 'train', attackerId: a.id, amount: 40 });
    expect(world.state.mines).toHaveLength(0);
  });

  it('credits a kill to the owner as a weapon kill', () => {
    const world = emptyWorld();
    const a = world.addTrain({ protectedFor: 0, x: 1000, y: 1000, angle: 0, carriages: [] });
    const b = world.addTrain({ protectedFor: 0, x: 2960, y: 3000, angle: 0, carriages: [] });
    b.hull = 30;
    plant(world, { ownerId: a.id });
    const destroyed = ofType(run(world, 5), 'trainDestroyed');
    expect(destroyed).toEqual([
      expect.objectContaining({ victimId: b.id, cause: 'weapon', killerTrainId: a.id }),
    ]);
  });

  it('damages every enemy and other head in the blast', () => {
    const world = emptyWorld();
    const a = world.addTrain({ protectedFor: 0, x: 1000, y: 1000, angle: 0, carriages: [] });
    const trigger = world.spawnEnemy('sentry', 3010, 3000);
    const near = world.spawnEnemy('sentry', 3000, 3050);
    const far = world.spawnEnemy('sentry', 3000, 3070);
    plant(world, { ownerId: a.id });
    world.step();
    expect(trigger.hull).toBe(180 - 40);
    expect(near.hull).toBe(180 - 40);
    expect(far.hull).toBe(180);
  });

  it("is safe for its owner: driving over it doesn't set it off", () => {
    const world = emptyWorld();
    const a = world.addTrain({ protectedFor: 0, x: 2960, y: 3000, angle: 0, carriages: [] });
    plant(world, { ownerId: a.id });
    const events = run(world, 20);
    expect(ofType(events, 'mineExploded')).toHaveLength(0);
    expect(a.hull).toBe(a.maxHull);
    expect(world.state.mines).toHaveLength(1);
  });

  it('never damages its owner when another train sets it off', () => {
    const world = emptyWorld();
    const a = world.addTrain({
      protectedFor: 0,
      x: 3000,
      y: 3030,
      angle: Math.PI / 2,
      carriages: [],
    });
    world.spawnEnemy('sentry', 3010, 3000);
    plant(world, { ownerId: a.id });
    expect(ofType(world.step(), 'mineExploded')).toHaveLength(1);
    expect(a.hull).toBe(a.maxHull);
  });

  it('does not go off before it is armed', () => {
    const world = emptyWorld();
    const a = world.addTrain({ protectedFor: 0, x: 1000, y: 1000, angle: 0, carriages: [] });
    // Dropped 0.3 s ago once this tick has aged it.
    plant(world, { ownerId: a.id, age: 0.3 - world.dt });
    world.spawnEnemy('sentry', 3005, 3000);
    expect(ofType(world.step(), 'mineExploded')).toHaveLength(0);
    const ticksToArm = Math.ceil((MINE_ARM_TIME - 0.3) / world.dt) + 1;
    expect(ofType(run(world, ticksToArm), 'mineExploded')).toHaveLength(1);
  });

  it('is not set off by a protected train', () => {
    const world = emptyWorld();
    const a = world.addTrain({ protectedFor: 0, x: 1000, y: 1000, angle: 0, carriages: [] });
    world.addTrain({ protectedFor: 5, x: 2960, y: 3000, angle: 0, carriages: [] });
    plant(world, { ownerId: a.id });
    expect(ofType(run(world, 20), 'mineExploded')).toHaveLength(0);
  });
});

describe('mine lifecycle', () => {
  it('stays in the world after its owner is destroyed', () => {
    const world = emptyWorld();
    const a = world.addTrain({ protectedFor: 0, x: 1000, y: 1000, angle: 0, carriages: [] });
    for (let i = 0; i < 3; i++) plant(world, { ownerId: a.id, x: 3000 + i * 200 });
    destroyTrain(world, a, 'enemy', null);
    run(world, 30);
    expect(world.state.mines).toHaveLength(3);
    // And still goes off for its dead owner.
    const b = world.addTrain({ protectedFor: 0, x: 2960, y: 3000, angle: 0, carriages: [] });
    const hit = ofType(run(world, 5), 'hit').find((h) => h.victimId === b.id);
    expect(hit?.attackerId).toBe(a.id);
  });

  it('expires 20 seconds after it was dropped', () => {
    const world = emptyWorld();
    const a = world.addTrain({ protectedFor: 0, x: 1000, y: 1000, angle: 0, carriages: [] });
    plant(world, { ownerId: a.id, age: 19.9 });
    run(world, 2);
    expect(world.state.mines).toHaveLength(1);
    run(world, 2);
    expect(world.state.mines).toHaveLength(0);
  });

  it('is removed when its owner leaves the world', () => {
    const world = emptyWorld();
    const a = world.addTrain({ protectedFor: 0, x: 1000, y: 1000, angle: 0, carriages: [] });
    const b = world.addTrain({ protectedFor: 0, x: 4000, y: 4000, angle: 0, carriages: [] });
    plant(world, { ownerId: a.id });
    const kept = plant(world, { ownerId: b.id, x: 2000 });
    world.removeTrain(a.id);
    expect(world.state.mines).toEqual([kept]);
  });

  it('is cleared when a new round starts', () => {
    const world = emptyWorld();
    world.addTrain({ protectedFor: 0, x: 1000, y: 1000, angle: 0, carriages: ['mines'] });
    run(world, 30 * 5);
    expect(world.state.mines.length).toBeGreaterThan(0);
    world.resetForRound(99);
    expect(world.state.mines).toHaveLength(0);
  });
});
