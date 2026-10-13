import { describe, expect, it } from 'vitest';
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
    const a = world.addTrain({ x: 1000, y: 1000, angle: 0, carriages: ['mg'] });
    world.addTrain({ x: 1300, y: 1000, angle: Math.PI });
    world.setInput(a.id, { aim: 0.1 });
    const events = world.step();
    const fired = ofType(events, 'fired');
    expect(fired).toHaveLength(1);
    expect(fired[0]).toMatchObject({ weapon: 'bullet', ownerKind: 'train', ownerId: a.id });
    expect(fired[0]?.angle).toBeCloseTo(0.1);
    const p = world.state.projectiles.find((q) => q.ownerId === a.id);
    expect(p).toBeDefined();
    expect(Math.atan2(p!.vy, p!.vx)).toBeCloseTo(0.1);
  });

  it('does not fire without a hostile in range', () => {
    const world = emptyWorld();
    const a = world.addTrain({ x: 1000, y: 1000, angle: 0, carriages: ['mg', 'laser', 'missile'] });
    world.addTrain({ x: 2000, y: 1000, angle: 0 });
    const events = run(world, 5);
    expect(ofType(events, 'fired')).toHaveLength(0);
    expect(world.state.projectiles.filter((p) => p.ownerId === a.id)).toHaveLength(0);
  });

  it('does not fire when the aim is outside the carriage arc', () => {
    const world = emptyWorld();
    const a = world.addTrain({ x: 1000, y: 1000, angle: 0, carriages: ['mg'] });
    world.addTrain({ x: 1300, y: 1000, angle: Math.PI });
    world.setInput(a.id, { aim: Math.PI });
    expect(ofType(run(world, 5), 'fired')).toHaveLength(0);
  });

  it('respects fire rate: about 7 MG shots per second', () => {
    const world = emptyWorld();
    const a = world.addTrain({ x: 1000, y: 1000, angle: 0, carriages: ['mg'] });
    a.hull = a.maxHull = 1e9;
    // A stationary target so the shots keep flowing.
    world.spawnEnemy('sentry', 1300, 1000);
    world.state.enemies[0]!.hull = 1e9;
    world.setInput(a.id, { aim: 0, brake: true });
    const shots = ofType(run(world, 30 * 4), 'fired').filter((f) => f.ownerId === a.id);
    expect(shots.length).toBeGreaterThanOrEqual(26);
    expect(shots.length).toBeLessThanOrEqual(29);
  });

  it('fires counter-drones at enemies in range', () => {
    const world = emptyWorld();
    world.addTrain({ x: 1000, y: 1000, angle: 0, carriages: ['drones'] });
    world.spawnEnemy('sentry', 1150, 1000);
    const events = run(world, 3);
    expect(ofType(events, 'fired').some((f) => f.weapon === 'drone')).toBe(true);
  });
});

describe('projectile hits', () => {
  it('does not let a fast laser tunnel through a train head', () => {
    const world = emptyWorld();
    const train = world.addTrain({ x: 2000, y: 2000, angle: 0 });
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
    const train = world.addTrain({ x: 2000, y: 2000, angle: 0 });
    inject(world, shot({ x: 2004, y: 2000, vx: 100, ownerId: train.id }));
    const events = world.step();
    expect(ofType(events, 'hit')).toHaveLength(0);
    expect(train.hull).toBeCloseTo(train.maxHull);
  });

  it('hits across the map seam', () => {
    const world = emptyWorld();
    const train = world.addTrain({ x: 5, y: 3000, angle: Math.PI / 2 });
    inject(world, shot({ x: 5990, y: 3003, vx: 900 }));
    world.step();
    expect(train.hull).toBeLessThan(train.maxHull - 1);
  });

  it('applies the earliest hit when several targets are in the path', () => {
    const world = emptyWorld();
    const near = world.addTrain({ x: 2020, y: 2000, angle: Math.PI / 2 });
    const far = world.addTrain({ x: 2030, y: 2000, angle: Math.PI / 2 });
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
    const victim = world.addTrain({ x: 2000, y: 2000, angle: Math.PI / 2 });
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
