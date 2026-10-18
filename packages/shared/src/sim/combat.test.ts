import { describe, expect, it } from 'vitest';
import { MAX_TRAIN_PROJECTILES } from './constants.ts';
import type { Projectile } from './types.ts';
import { emptyWorld, ofType, run } from './testing.ts';
import type { World } from './world.ts';

function shot(over: Partial<Projectile>): Projectile {
  return {
    id: 9000,
    kind: 'laser',
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    damage: 14,
    life: 1,
    splash: 0,
    ownerKind: 'train',
    ownerId: 9999,
    ...over,
  };
}

function inject(world: World, p: Projectile): void {
  world.state.projectiles.push(p);
}

describe('weapon fire along aim', () => {
  it("fires an MG along the aim angle at another train's head", () => {
    const world = emptyWorld();
    const a = world.addTrain({ protectedFor: 0, x: 1000, y: 1000, angle: 0, carriages: ['mg'] });
    world.addTrain({ protectedFor: 0, carriages: [], x: 1300, y: 1000, angle: Math.PI });
    world.setInput(a.id, { aim: 0.1, fire: true });
    const events = world.step();
    const fired = ofType(events, 'fired');
    expect(fired).toHaveLength(1);
    expect(fired[0]).toMatchObject({ weapon: 'bullet', ownerKind: 'train', ownerId: a.id });
    expect(fired[0]?.angle).toBeCloseTo(0.1);
    const p = world.state.projectiles.find((q) => q.ownerId === a.id);
    expect(p).toBeDefined();
    expect(Math.atan2(p!.vy, p!.vx)).toBeCloseTo(0.1);
  });

  it('fires with no target in range', () => {
    const world = emptyWorld();
    const a = world.addTrain({
      protectedFor: 0,
      x: 1000,
      y: 1000,
      angle: 0,
      carriages: ['mg', 'laser', 'missile'],
    });
    world.setInput(a.id, { aim: 0, fire: true });
    const fired = ofType(world.step(), 'fired').filter((f) => f.ownerId === a.id);
    expect(fired.map((f) => f.weapon).sort()).toEqual(['bullet', 'laser', 'missile']);
  });

  it('fires behind the train', () => {
    const world = emptyWorld();
    const a = world.addTrain({ protectedFor: 0, x: 1000, y: 1000, angle: 0, carriages: ['mg'] });
    world.setInput(a.id, { aim: Math.PI, fire: true });
    const fired = ofType(world.step(), 'fired');
    expect(fired).toHaveLength(1);
    expect(Math.cos(fired[0]!.angle)).toBeCloseTo(-1);
  });

  it('does not fire while fire is released, even with a target close by', () => {
    const world = emptyWorld();
    const a = world.addTrain({ protectedFor: 0, x: 1000, y: 1000, angle: 0, carriages: ['mg'] });
    world.spawnEnemy('sentry', 1200, 1000);
    world.setInput(a.id, { aim: 0, fire: false });
    const events = run(world, 10);
    expect(ofType(events, 'fired').filter((f) => f.ownerId === a.id)).toHaveLength(0);
  });

  it('keeps firing on held fire with no new input', () => {
    const world = emptyWorld();
    const a = world.addTrain({ protectedFor: 0, x: 1000, y: 1000, angle: 0, carriages: ['mg'] });
    world.setInput(a.id, { aim: 0, fire: true });
    const events = run(world, 10);
    expect(ofType(events, 'fired').filter((f) => f.ownerId === a.id).length).toBeGreaterThan(1);
  });

  it('respects fire rate: about 7 MG shots per second', () => {
    const world = emptyWorld();
    const a = world.addTrain({ protectedFor: 0, x: 1000, y: 1000, angle: 0, carriages: ['mg'] });
    world.setInput(a.id, { aim: 0, fire: true });
    const shots = ofType(run(world, 30), 'fired').filter((f) => f.ownerId === a.id);
    expect(shots.length).toBeGreaterThanOrEqual(6);
    expect(shots.length).toBeLessThanOrEqual(8);
  });

  it('fires counter-drones at enemies in range', () => {
    const world = emptyWorld();
    world.addTrain({ protectedFor: 0, x: 1000, y: 1000, angle: 0, carriages: ['drones'] });
    world.spawnEnemy('sentry', 1150, 1000);
    const events = run(world, 3);
    expect(ofType(events, 'fired').some((f) => f.weapon === 'drone')).toBe(true);
  });
});

describe('weapon projectile budget', () => {
  function bigTrain(world: World) {
    const a = world.addTrain({
      protectedFor: 0,
      x: 1000,
      y: 1000,
      angle: 0,
      carriages: Array.from({ length: 40 }, () => 'mg' as const),
    });
    world.setInput(a.id, { aim: 0, fire: true });
    return a;
  }
  const liveOf = (world: World, id: number) =>
    world.state.projectiles.filter((p) => p.ownerId === id).length;

  it('never lets one train have more than 120 weapon projectiles in flight', () => {
    const world = emptyWorld();
    const a = bigTrain(world);
    let peak = 0;
    for (let i = 0; i < 30 * 5; i++) {
      world.step();
      peak = Math.max(peak, liveOf(world, a.id));
    }
    expect(peak).toBe(MAX_TRAIN_PROJECTILES);
  });

  it('fires again as its projectiles expire', () => {
    const world = emptyWorld();
    const a = bigTrain(world);
    run(world, 30 * 3);
    expect(liveOf(world, a.id)).toBe(MAX_TRAIN_PROJECTILES);
    const later = ofType(run(world, 30), 'fired').filter((f) => f.ownerId === a.id);
    expect(later.length).toBeGreaterThan(0);
    expect(liveOf(world, a.id)).toBeLessThanOrEqual(MAX_TRAIN_PROJECTILES);
  });

  it('does not bank shots while waiting at the limit', () => {
    const world = emptyWorld();
    const a = bigTrain(world);
    run(world, 30 * 3);
    for (const t of a.fireTimers) expect(t).toBeGreaterThanOrEqual(-world.dt - 1e-9);
  });

  it('does not count counter-drone shots', () => {
    const world = emptyWorld();
    const a = world.addTrain({ protectedFor: 0, x: 1000, y: 1000, angle: 0, carriages: ['mg'] });
    for (let i = 0; i < MAX_TRAIN_PROJECTILES; i++) {
      inject(
        world,
        shot({ id: 20000 + i, kind: 'drone', x: 4000, y: 4000, life: 5, ownerId: a.id }),
      );
    }
    world.setInput(a.id, { aim: 0, fire: true });
    expect(ofType(world.step(), 'fired').filter((f) => f.weapon === 'bullet')).toHaveLength(1);
  });
});

describe('projectile hits', () => {
  it('does not let a fast laser tunnel through a train head', () => {
    const world = emptyWorld();
    const train = world.addTrain({ protectedFor: 0, carriages: [], x: 2000, y: 2000, angle: 0 });
    // The head will be at x=2006 after its move; the laser steps 1991 -> 2021, with both
    // endpoints outside the 14-unit hit radius.
    inject(world, shot({ x: 1991, y: 2000, vx: 900 }));
    const hull = train.hull;
    const events = world.step();
    expect(train.hull).toBeLessThan(hull);
    expect(ofType(events, 'hit')).toHaveLength(1);
    expect(world.state.projectiles).toHaveLength(0);
  });

  it('never damages its owner', () => {
    const world = emptyWorld();
    const train = world.addTrain({ protectedFor: 0, carriages: [], x: 2000, y: 2000, angle: 0 });
    inject(world, shot({ x: 2004, y: 2000, vx: 100, ownerId: train.id }));
    const events = world.step();
    expect(ofType(events, 'hit')).toHaveLength(0);
    expect(train.hull).toBeCloseTo(train.maxHull);
  });

  it('hits across the map seam', () => {
    const world = emptyWorld();
    const train = world.addTrain({
      protectedFor: 0,
      carriages: [],
      x: 5,
      y: 3000,
      angle: Math.PI / 2,
    });
    inject(world, shot({ x: 5990, y: 3003, vx: 900 }));
    world.step();
    expect(train.hull).toBeLessThan(train.maxHull - 1);
  });

  it('applies the earliest hit when several targets are in the path', () => {
    const world = emptyWorld();
    const near = world.addTrain({
      protectedFor: 0,
      carriages: [],
      x: 2020,
      y: 2000,
      angle: Math.PI / 2,
    });
    const far = world.addTrain({
      protectedFor: 0,
      carriages: [],
      x: 2030,
      y: 2000,
      angle: Math.PI / 2,
    });
    inject(world, shot({ x: 2000, y: 2000, vx: 900, damage: 20 }));
    world.step();
    expect(near.hull).toBeLessThan(near.maxHull - 10);
    expect(far.hull).toBeCloseTo(far.maxHull, 0);
  });

  it('removes projectiles when their lifetime runs out', () => {
    const world = emptyWorld();
    inject(world, shot({ x: 100, y: 100, vx: 10, life: 0.2 }));
    run(world, 5);
    expect(world.state.projectiles).toHaveLength(1);
    run(world, 3);
    expect(world.state.projectiles).toHaveLength(0);
  });

  it('wraps flying projectiles around the map', () => {
    const world = emptyWorld();
    inject(world, shot({ x: 5995, y: 100, vx: 600, life: 1 }));
    world.step();
    const p = world.state.projectiles[0]!;
    expect(p.x).toBeCloseTo(15);
  });

  it('gives missiles 60% splash damage to nearby enemies', () => {
    const world = emptyWorld();
    const a = world.spawnEnemy('sentry', 3000, 3000);
    const b = world.spawnEnemy('sentry', 3020, 3000);
    const far = world.spawnEnemy('sentry', 3000, 3200);
    inject(world, shot({ kind: 'missile', x: 2980, y: 3000, vx: 280, damage: 28, splash: 50 }));
    world.step();
    expect(a.hull).toBe(180 - 28);
    expect(b.hull).toBeCloseTo(180 - 28 * 0.6);
    expect(far.hull).toBe(180);
  });

  it('shots from one train can hit another train', () => {
    const world = emptyWorld();
    const victim = world.addTrain({
      protectedFor: 0,
      carriages: [],
      x: 2000,
      y: 2000,
      angle: Math.PI / 2,
    });
    inject(world, shot({ x: 1980, y: 2000, vx: 600, damage: 7, kind: 'bullet' }));
    const events = world.step();
    const hit = ofType(events, 'hit')[0];
    expect(hit).toMatchObject({
      victimKind: 'train',
      victimId: victim.id,
      attackerKind: 'train',
      attackerId: 9999,
      amount: 7,
    });
    expect(hit?.x).toBeGreaterThan(1980);
    expect(hit?.y).toBeCloseTo(2000, 0);
  });

  it('reports the amount actually dealt after shield reduction', () => {
    const world = emptyWorld();
    const victim = world.addTrain({
      protectedFor: 0,
      x: 2000,
      y: 2000,
      angle: Math.PI / 2,
      carriages: ['shield', 'shield'],
    });
    inject(world, shot({ x: 1980, y: 2000, vx: 600, damage: 10, kind: 'bullet' }));
    const hit = ofType(world.step(), 'hit')[0];
    expect(hit?.amount).toBeCloseTo(10 * (1 - 0.16));
    expect(victim.hull).toBeLessThan(victim.maxHull);
  });
});
