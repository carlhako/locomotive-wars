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
    pierce: 1,
    hitIds: [],
    ownerKind: 'train',
    ownerId: 9999,
    ...over,
  };
}

function inject(world: World, p: Projectile): void {
  world.state.projectiles.push(p);
}

describe('weapon fire along aim', () => {
  it("fires an MG from its own position at another train's head", () => {
    const world = emptyWorld();
    const a = world.addTrain({ protectedFor: 0, x: 1000, y: 1000, angle: 0, carriages: ['mg'] });
    world.addTrain({ protectedFor: 0, carriages: [], x: 1300, y: 1030, angle: Math.PI });
    world.setInput(a.id, { aimX: 300, aimY: 30, fire: true });
    const events = world.step();
    const fired = ofType(events, 'fired');
    expect(fired).toHaveLength(1);
    expect(fired[0]).toMatchObject({ weapon: 'bullet', ownerKind: 'train', ownerId: a.id });
    // The MG sits behind the head, so its bearing to the aim point is shallower than the head's.
    const mg = a.carriages[1]!;
    const want = Math.atan2(a.y + 30 - mg.y, a.x + 300 - mg.x);
    expect(fired[0]?.angle).toBeCloseTo(want);
    expect(fired[0]?.angle).toBeLessThan(Math.atan2(30, 300));
    const p = world.state.projectiles.find((q) => q.ownerId === a.id);
    expect(p).toBeDefined();
    expect(Math.atan2(p!.vy, p!.vx)).toBeCloseTo(want);
  });

  it('converges every gun on the aim point', () => {
    const world = emptyWorld();
    const a = world.addTrain({
      protectedFor: 0,
      x: 1000,
      y: 1000,
      angle: 0,
      carriages: ['mg', 'mg', 'mg'],
    });
    world.setInput(a.id, { aimX: 0, aimY: -200, fire: true });
    const fired = ofType(world.step(), 'fired').filter((f) => f.ownerId === a.id);
    expect(fired).toHaveLength(3);
    const tx = a.x;
    const ty = a.y - 200;
    const angles = new Set<number>();
    fired.forEach((f, k) => {
      const c = a.carriages[k + 1]!;
      expect(f.angle).toBeCloseTo(Math.atan2(ty - c.y, tx - c.x), 9);
      // The shot's path from its muzzle passes through the aim point.
      const cross = Math.cos(f.angle) * (ty - f.y) - Math.sin(f.angle) * (tx - f.x);
      expect(Math.abs(cross)).toBeLessThan(1e-6);
      angles.add(Math.round(f.angle * 1000));
    });
    expect(angles.size).toBe(3);
  });

  it('falls back to the head bearing when the aim point is on top of a carriage', () => {
    const world = emptyWorld();
    const a = world.addTrain({ protectedFor: 0, x: 1000, y: 1000, angle: 0, carriages: ['mg'] });
    // After this tick's move the head is at x=1006 and the MG at 970: aim 10 units above it.
    world.setInput(a.id, { aimX: -36, aimY: -10, fire: true });
    const fired = ofType(world.step(), 'fired').filter((f) => f.ownerId === a.id);
    expect(a.carriages[1]!.x).toBeCloseTo(a.x - 36);
    expect(fired).toHaveLength(1);
    expect(fired[0]!.angle).toBeCloseTo(Math.atan2(-10, -36));
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
    world.setInput(a.id, { aimX: 1000, aimY: 0, fire: true });
    const fired = ofType(world.step(), 'fired').filter((f) => f.ownerId === a.id);
    expect(fired.map((f) => f.weapon).sort()).toEqual(['bullet', 'laser', 'missile']);
  });

  it('fires behind the train', () => {
    const world = emptyWorld();
    const a = world.addTrain({ protectedFor: 0, x: 1000, y: 1000, angle: 0, carriages: ['mg'] });
    world.setInput(a.id, { aimX: -300, aimY: 0, fire: true });
    const fired = ofType(world.step(), 'fired');
    expect(fired).toHaveLength(1);
    expect(Math.cos(fired[0]!.angle)).toBeCloseTo(-1);
  });

  it('does not fire while fire is released, even with a target close by', () => {
    const world = emptyWorld();
    const a = world.addTrain({ protectedFor: 0, x: 1000, y: 1000, angle: 0, carriages: ['mg'] });
    world.spawnEnemy('sentry', 1200, 1000);
    world.setInput(a.id, { aimX: 1000, aimY: 0, fire: false });
    const events = run(world, 10);
    expect(ofType(events, 'fired').filter((f) => f.ownerId === a.id)).toHaveLength(0);
  });

  it('keeps firing on held fire with no new input', () => {
    const world = emptyWorld();
    const a = world.addTrain({ protectedFor: 0, x: 1000, y: 1000, angle: 0, carriages: ['mg'] });
    world.setInput(a.id, { aimX: 1000, aimY: 0, fire: true });
    const events = run(world, 10);
    expect(ofType(events, 'fired').filter((f) => f.ownerId === a.id).length).toBeGreaterThan(1);
  });

  it('respects fire rate: about 7 MG shots per second', () => {
    const world = emptyWorld();
    const a = world.addTrain({ protectedFor: 0, x: 1000, y: 1000, angle: 0, carriages: ['mg'] });
    world.setInput(a.id, { aimX: 1000, aimY: 0, fire: true });
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

describe('flak', () => {
  it('fires 5 pellets spread evenly across ±15°', () => {
    const world = emptyWorld();
    const a = world.addTrain({ protectedFor: 0, x: 1000, y: 1000, angle: 0, carriages: ['flak'] });
    world.setInput(a.id, { aimX: 1000, aimY: 0, fire: true });
    const fired = ofType(world.step(), 'fired').filter((f) => f.ownerId === a.id);
    expect(fired.map((f) => f.weapon)).toEqual(Array(5).fill('flak'));
    const deg = fired.map((f) => (f.angle * 180) / Math.PI);
    [-15, -7.5, 0, 7.5, 15].forEach((want, i) => expect(deg[i]).toBeCloseTo(want, 6));
    expect(world.state.projectiles.filter((p) => p.ownerId === a.id)).toHaveLength(5);
  });

  it('expires before a pellet has travelled 260 units', () => {
    const world = emptyWorld();
    const a = world.addTrain({ protectedFor: 0, x: 1000, y: 1000, angle: 0, carriages: ['flak'] });
    world.setInput(a.id, { aimX: 1000, aimY: 0, fire: true });
    world.step();
    world.setInput(a.id, { fire: false });
    // 600 units/s is 20 units a tick: 240 units after 12 ticks, 260 after 13.
    run(world, 11);
    expect(world.state.projectiles.filter((p) => p.kind === 'flak')).toHaveLength(5);
    world.step();
    expect(world.state.projectiles.filter((p) => p.kind === 'flak')).toHaveLength(0);
  });

  it('cuts a volley short at the projectile budget', () => {
    const world = emptyWorld();
    const a = world.addTrain({ protectedFor: 0, x: 1000, y: 1000, angle: 0, carriages: ['flak'] });
    for (let i = 0; i < MAX_TRAIN_PROJECTILES - 2; i++) {
      inject(
        world,
        shot({ id: 20000 + i, kind: 'bullet', x: 4000, y: 4000, life: 5, ownerId: a.id }),
      );
    }
    world.setInput(a.id, { aimX: 1000, aimY: 0, fire: true });
    const fired = ofType(world.step(), 'fired').filter((f) => f.weapon === 'flak');
    expect(fired).toHaveLength(2);
  });
});

describe('tail gunner', () => {
  // Both trains head east at the same speed, so the gap holds while they move.
  function pair(otherX: number, protectedFor = 0) {
    const world = emptyWorld();
    const a = world.addTrain({ protectedFor, x: 2000, y: 2000, angle: 0, carriages: ['tailgun'] });
    const gun = a.carriages[1]!;
    const b = world.addTrain({
      protectedFor: 0,
      x: gun.x + otherX,
      y: 2000,
      angle: 0,
      carriages: [],
    });
    return { world, a, b };
  }

  it('fires at a chaser behind it without fire input', () => {
    const { world, a } = pair(-300);
    expect(a.input.fire).toBe(false);
    const fired = ofType(world.step(), 'fired').filter((f) => f.ownerId === a.id);
    expect(fired).toHaveLength(1);
    expect(fired[0]).toMatchObject({ weapon: 'bullet', carriage: 1 });
    expect(Math.cos(fired[0]!.angle)).toBeCloseTo(-1, 3);
  });

  it('fires about 3 shots a second', () => {
    const { world, a } = pair(-300);
    const fired = ofType(run(world, 30), 'fired').filter((f) => f.ownerId === a.id);
    expect(fired.length).toBeGreaterThanOrEqual(2);
    expect(fired.length).toBeLessThanOrEqual(4);
  });

  it('ignores a target ahead of it', () => {
    const { world, a } = pair(300);
    const fired = ofType(run(world, 30), 'fired').filter((f) => f.ownerId === a.id);
    expect(fired).toHaveLength(0);
  });

  it('holds during spawn protection', () => {
    const { world, a } = pair(-300, 5);
    expect(ofType(run(world, 30), 'fired').filter((f) => f.ownerId === a.id)).toHaveLength(0);
  });

  it('counts toward the projectile budget', () => {
    const { world, a } = pair(-300);
    for (let i = 0; i < MAX_TRAIN_PROJECTILES; i++) {
      inject(
        world,
        shot({ id: 20000 + i, kind: 'bullet', x: 4000, y: 4000, life: 5, ownerId: a.id }),
      );
    }
    expect(ofType(world.step(), 'fired').filter((f) => f.ownerId === a.id)).toHaveLength(0);
  });
});

describe('tesla coil', () => {
  /** A train heading east with one tesla coil; `coil` is where the coil is after one tick. */
  function coilTrain(protectedFor = 0) {
    const world = emptyWorld();
    const a = world.addTrain({ protectedFor, x: 2000, y: 2000, angle: 0, carriages: ['tesla'] });
    const c = a.carriages[1]!;
    return { world, a, coil: { x: c.x + 6, y: c.y } };
  }

  it('zaps the nearest hostile and chains to the next', () => {
    const { world, a, coil } = coilTrain();
    const near = world.spawnEnemy('drone', coil.x, coil.y + 150);
    const far = world.spawnEnemy('drone', coil.x, coil.y + 250);
    near.speed = far.speed = 0;
    const events = world.step();
    expect(near.hull).toBe(25 - 18);
    expect(far.hull).toBe(25 - 18);
    expect(world.state.projectiles.filter((p) => p.ownerId === a.id)).toHaveLength(0);
    const zap = ofType(events, 'zap');
    expect(zap).toHaveLength(1);
    expect(zap[0]!.ownerId).toBe(a.id);
    expect(zap[0]!.points).toHaveLength(3);
    expect(zap[0]!.points[1]).toEqual([near.x, near.y]);
    expect(zap[0]!.points[2]).toEqual([far.x, far.y]);
  });

  it('does nothing with no hostile in range, and is ready the moment one arrives', () => {
    const { world, coil } = coilTrain();
    const e = world.spawnEnemy('sentry', coil.x, coil.y + 200);
    const events = run(world, 30);
    expect(ofType(events, 'zap')).toHaveLength(0);
    expect(ofType(events, 'hit')).toHaveLength(0);
    // The coil has moved 180 units east; bring the sentry into range.
    e.x = coil.x + 180;
    e.y = coil.y + 100;
    expect(ofType(world.step(), 'zap')).toHaveLength(1);
    expect(e.hull).toBe(180 - 18);
  });

  it('zaps once a second', () => {
    const { world, coil } = coilTrain();
    // The coil passes the sentry, staying within range for the 2 seconds.
    const e = world.spawnEnemy('sentry', coil.x + 90, coil.y + 100);
    const zaps = ofType(run(world, 60), 'zap');
    expect(zaps.length).toBe(2);
    expect(e.hull).toBe(180 - 36);
  });

  it('holds during spawn protection', () => {
    const { world, coil } = coilTrain(5);
    world.spawnEnemy('sentry', coil.x, coil.y + 100);
    expect(ofType(run(world, 30), 'zap')).toHaveLength(0);
  });

  it("credits a kill to the coil's owner as a weapon kill", () => {
    const { world, a, coil } = coilTrain();
    const b = world.addTrain({
      protectedFor: 0,
      x: coil.x,
      y: coil.y + 160,
      angle: 0,
      carriages: [],
    });
    b.hull = 10;
    // b moves east with a, so the gap holds.
    const destroyed = ofType(world.step(), 'trainDestroyed');
    expect(destroyed).toEqual([
      expect.objectContaining({ victimId: b.id, cause: 'weapon', killerTrainId: a.id }),
    ]);
    expect(a.kills).toBe(1);
  });
});

describe('counter-drones against trains', () => {
  it("fire at an enemy train's head when no PvE enemy is nearer", () => {
    const world = emptyWorld();
    const a = world.addTrain({
      protectedFor: 0,
      x: 1000,
      y: 1000,
      angle: 0,
      carriages: ['drones'],
    });
    const b = world.addTrain({ protectedFor: 0, x: 1150, y: 1000, angle: 0, carriages: [] });
    // In drone range too, but farther from every point of the drone's orbit than b's head.
    world.spawnEnemy('sentry', 1000, 1240);
    const events = run(world, 3);
    const shot = ofType(events, 'fired').find((f) => f.weapon === 'drone' && f.ownerId === a.id);
    expect(shot).toBeDefined();
    // Aimed at b's head (to the east), not the far sentry (to the south).
    expect(Math.abs(Math.cos(shot!.angle))).toBeGreaterThan(0.9);
    expect(b.alive).toBe(true);
  });

  it('never fire at a protected train', () => {
    const world = emptyWorld();
    const a = world.addTrain({
      protectedFor: 0,
      x: 1000,
      y: 1000,
      angle: 0,
      carriages: ['drones'],
    });
    world.addTrain({ protectedFor: 10, x: 1200, y: 1000, angle: 0, carriages: [] });
    const events = run(world, 30);
    expect(ofType(events, 'fired').filter((f) => f.ownerId === a.id)).toHaveLength(0);
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
    world.setInput(a.id, { aimX: 1000, aimY: 0, fire: true });
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
    world.setInput(a.id, { aimX: 1000, aimY: 0, fire: true });
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

  it('lets a laser pierce three targets in a line and stop at the fourth', () => {
    const world = emptyWorld();
    const drones = [3000, 3040, 3080, 3120].map((x) => {
      const e = world.spawnEnemy('drone', x, 3000);
      e.speed = 0;
      return e;
    });
    inject(world, shot({ kind: 'laser', x: 2950, y: 3000, vx: 900, damage: 22, pierce: 3 }));
    run(world, 10);
    expect(drones.slice(0, 3).map((d) => d.hull)).toEqual([25 - 22, 25 - 22, 25 - 22]);
    expect(drones[3]!.hull).toBe(25);
    expect(world.state.projectiles).toHaveLength(0);
  });

  it('never hits the same target twice across ticks', () => {
    const world = emptyWorld();
    const sentry = world.spawnEnemy('sentry', 3000, 3000);
    // Slow enough to spend many ticks inside the sentry's hit radius.
    inject(
      world,
      shot({ kind: 'laser', x: 2975, y: 3000, vx: 60, damage: 22, pierce: 3, life: 2 }),
    );
    const hits = ofType(run(world, 30), 'hit').filter((h) => h.victimId === sentry.id);
    expect(hits).toHaveLength(1);
    expect(sentry.hull).toBe(180 - 22);
    expect(world.state.projectiles).toHaveLength(1);
  });

  it('fires the laser about twice a second', () => {
    const world = emptyWorld();
    const a = world.addTrain({ protectedFor: 0, x: 1000, y: 1000, angle: 0, carriages: ['laser'] });
    world.setInput(a.id, { aimX: 1000, aimY: 0, fire: true });
    const shots = ofType(run(world, 90), 'fired').filter((f) => f.ownerId === a.id);
    expect(shots.length).toBeGreaterThanOrEqual(5);
    expect(shots.length).toBeLessThanOrEqual(7);
    expect(world.state.projectiles.find((p) => p.ownerId === a.id)).toMatchObject({
      damage: 22,
      pierce: 3,
    });
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

  it("splashes other trains' heads but never the owner's", () => {
    const world = emptyWorld();
    // Heading along y, so each head stays within the splash radius after its first move.
    const a = world.addTrain({
      protectedFor: 0,
      carriages: [],
      x: 3000,
      y: 2980,
      angle: -Math.PI / 2,
    });
    const b = world.addTrain({
      protectedFor: 0,
      carriages: [],
      x: 3000,
      y: 3030,
      angle: Math.PI / 2,
    });
    const target = world.spawnEnemy('sentry', 3000, 3000);
    inject(
      world,
      shot({ kind: 'missile', x: 2980, y: 3000, vx: 280, damage: 28, splash: 50, ownerId: a.id }),
    );
    const hits = ofType(world.step(), 'hit');
    expect(target.hull).toBe(180 - 28);
    expect(b.hull).toBeCloseTo(b.maxHull - 28 * 0.6);
    expect(hits.find((h) => h.victimId === b.id)).toMatchObject({ attackerId: a.id });
    expect(a.hull).toBe(a.maxHull);
    expect(hits.some((h) => h.victimId === a.id)).toBe(false);
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
