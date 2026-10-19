import { describe, expect, it } from 'vitest';
import { collideTrains } from './combat.ts';
import { SPAWN_PROTECTION } from './constants.ts';
import { wrapDist } from './math.ts';
import { Rng } from './rng.ts';
import { emptyWorld, ofType, run } from './testing.ts';
import type { PickupKind, Projectile, TrainState } from './types.ts';
import type { World } from './world.ts';

/** Armor carriages: they lengthen a train without adding weapons or drones. */
const BODY: PickupKind[] = Array(9).fill('armor');

/** An unprotected train; pass `protectedFor` to override. */
function train(world: World, opts: Parameters<World['addTrain']>[0] = {}): TrainState {
  return world.addTrain({ protectedFor: 0, carriages: [], ...opts });
}

function shot(over: Partial<Projectile>): Projectile {
  return {
    id: 9000,
    kind: 'bullet',
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    damage: 7,
    life: 1,
    splash: 0,
    pierce: 1,
    hitIds: [],
    ownerKind: 'train',
    ownerId: 9999,
    ...over,
  };
}

describe('kill attribution', () => {
  it('credits a weapon kill to the projectile owner and counts it', () => {
    const world = emptyWorld();
    const a = train(world, { x: 1000, y: 1000, angle: 0 });
    const b = train(world, { x: 2000, y: 2000, angle: Math.PI / 2 });
    b.hull = 5;
    world.state.projectiles.push(shot({ x: 1980, y: 2000, vx: 600, damage: 10, ownerId: a.id }));
    const destroyed = ofType(world.step(), 'trainDestroyed');
    expect(destroyed).toHaveLength(1);
    expect(destroyed[0]).toMatchObject({ victimId: b.id, cause: 'weapon', killerTrainId: a.id });
    expect(destroyed[0]?.killerEnemyId).toBeUndefined();
    expect(a.kills).toBe(1);
    expect(b.kills).toBe(0);
  });

  it('names the enemy, with no train killer, for an enemy kill', () => {
    const world = emptyWorld();
    const victim = train(world, { x: 3000, y: 3000 });
    victim.hull = 1;
    const sentry = world.spawnEnemy('sentry', 3004, 3000);
    world.state.projectiles.push(
      shot({ x: 2990, y: 3000, vx: 600, damage: 10, ownerKind: 'enemy', ownerId: sentry.id }),
    );
    const destroyed = ofType(world.step(), 'trainDestroyed');
    expect(destroyed).toHaveLength(1);
    expect(destroyed[0]).toMatchObject({ victimId: victim.id, cause: 'enemy' });
    expect(destroyed[0]?.killerTrainId).toBeUndefined();
    expect(destroyed[0]?.killerEnemyId).toBe(sentry.id);
  });

  it('reports the boss as the cause when it lands the kill', () => {
    const world = emptyWorld();
    const victim = train(world, { x: 3000, y: 3000 });
    victim.hull = 1;
    const boss = world.spawnBoss();
    world.state.projectiles.push(
      shot({ x: 2990, y: 3000, vx: 600, damage: 10, ownerKind: 'enemy', ownerId: boss.id }),
    );
    const destroyed = ofType(world.step(), 'trainDestroyed');
    expect(destroyed[0]).toMatchObject({ cause: 'boss', killerEnemyId: boss.id });
  });
});

describe('spawn protection', () => {
  it('consumes a projectile that strikes a protected train without harming it', () => {
    const world = emptyWorld();
    const target = world.addTrain({ x: 2000, y: 2000, angle: Math.PI / 2 });
    expect(target.protectedFor).toBe(SPAWN_PROTECTION);
    const hull = target.hull;
    world.state.projectiles.push(shot({ x: 1980, y: 2000, vx: 600, damage: 50 }));
    const events = world.step();
    expect(target.hull).toBe(hull);
    expect(target.alive).toBe(true);
    expect(ofType(events, 'hit')).toHaveLength(0);
    expect(world.state.projectiles).toHaveLength(0);
  });

  it('expires after 3.5 seconds, after which the train can be damaged', () => {
    const world = emptyWorld();
    const target = world.addTrain({ x: 2000, y: 2000, angle: Math.PI / 2 });
    run(world, 104);
    expect(target.protectedFor).toBeGreaterThan(0);
    run(world, 1);
    expect(target.protectedFor).toBe(0);
    target.x = 2000;
    target.y = 2000;
    world.state.projectiles.push(shot({ x: target.x - 20, y: target.y, vx: 600, damage: 10 }));
    world.step();
    expect(target.hull).toBeLessThan(target.maxHull);
  });

  it('holds the weapons of a protected train until protection ends', () => {
    const world = emptyWorld();
    const a = world.addTrain({ x: 1000, y: 1000, angle: 0, carriages: ['mg'] });
    train(world, { x: 1300, y: 1000, angle: Math.PI });
    world.setInput(a.id, { aimX: 1000, aimY: 0, fire: true });
    expect(ofType(run(world, 30), 'fired')).toHaveLength(0);
    a.protectedFor = 0;
    expect(ofType(run(world, 5), 'fired').length).toBeGreaterThan(0);
  });

  it('lets a human fire toward a protected train without harming it', () => {
    const world = emptyWorld();
    const shooter = train(world, { x: 1000, y: 1000, angle: 0, carriages: ['mg'] });
    const target = world.addTrain({ x: 1300, y: 1000, angle: Math.PI, carriages: [] });
    world.setInput(shooter.id, { aimX: 1000, aimY: 0, fire: true });
    const events = run(world, 20);
    expect(ofType(events, 'fired').filter((f) => f.ownerId === shooter.id).length).toBeGreaterThan(
      0,
    );
    expect(target.hull).toBe(target.maxHull);
  });

  it('keeps bots from targeting or aiming at a protected train', () => {
    const world = emptyWorld();
    const bot = train(world, {
      controller: 'bot',
      x: 3000,
      y: 3000,
      angle: 0,
      carriages: Array(8).fill('mg'),
    });
    const prey = world.addTrain({ x: 3000, y: 3200, angle: 0, carriages: [] });
    world.step();
    expect(bot.ai.mode).not.toBe('attack');
    expect(bot.ai.targetTrainId).toBeNull();
    prey.protectedFor = 0;
    bot.ai.decisionTimer = 0;
    world.step();
    expect(bot.ai.mode).toBe('attack');
    expect(bot.ai.targetTrainId).toBe(prey.id);
  });
});

describe('body collisions', () => {
  it("destroys a human who rams another human's body and credits the owner", () => {
    const world = emptyWorld();
    const owner = train(world, { x: 3000, y: 3000, angle: 0, carriages: BODY });
    // Carriage 5 sits near x=2898 after this tick's move.
    const rammer = train(world, { x: 2898, y: 2990, angle: Math.PI / 2 });
    const destroyed = ofType(world.step(), 'trainDestroyed');
    expect(destroyed).toHaveLength(1);
    expect(destroyed[0]).toMatchObject({
      victimId: rammer.id,
      cause: 'ram',
      killerTrainId: owner.id,
    });
    expect(rammer.alive).toBe(false);
    expect(owner.alive).toBe(true);
    expect(owner.kills).toBe(1);
  });

  it('applies the same rule to bots', () => {
    const world = emptyWorld();
    const owner = train(world, { controller: 'bot', x: 3000, y: 3000, angle: 0, carriages: BODY });
    const rammer = train(world, { controller: 'bot', x: 2898, y: 2990, angle: Math.PI / 2 });
    const destroyed = ofType(world.step(), 'trainDestroyed');
    expect(destroyed).toHaveLength(1);
    expect(destroyed[0]).toMatchObject({
      victimId: rammer.id,
      cause: 'ram',
      killerTrainId: owner.id,
    });
  });

  it('lets two heads pass through each other, and the two carriages behind them', () => {
    const world = emptyWorld();
    const a = train(world, { x: 3000, y: 3000, angle: 0, carriages: ['armor'] });
    const b = train(world, { x: 3012, y: 3000, angle: Math.PI, carriages: ['armor'] });
    expect(a.carriages).toHaveLength(2);
    expect(ofType(run(world, 3), 'trainDestroyed')).toHaveLength(0);
    expect(a.alive && b.alive).toBe(true);
  });

  it('destroys a head that touches the carriage at index 2', () => {
    const world = emptyWorld();
    const owner = train(world, { x: 3000, y: 3000, angle: 0, carriages: BODY });
    // After this tick's move the head is at x=3006 and carriage 2 at 3006 - 3 * 18 = 2952.
    const rammer = train(world, { x: 2952, y: 2990, angle: Math.PI / 2 });
    const destroyed = ofType(world.step(), 'trainDestroyed');
    expect(owner.carriages[2]!.x).toBeCloseTo(2952);
    expect(destroyed).toHaveLength(1);
    expect(destroyed[0]).toMatchObject({ victimId: rammer.id, killerTrainId: owner.id });
  });

  it('spares a head that touches the carriage at index 1', () => {
    const world = emptyWorld();
    const owner = train(world, { x: 3000, y: 3000, angle: 0, carriages: BODY });
    const rammer = train(world, { x: 2970, y: 2990, angle: Math.PI / 2 });
    expect(ofType(world.step(), 'trainDestroyed')).toHaveLength(0);
    expect(owner.carriages[1]!.x).toBeCloseTo(2970);
    expect(rammer.alive && owner.alive).toBe(true);
  });

  it('gives a starter train no lethal body', () => {
    const world = emptyWorld();
    const starter = train(world, { x: 3000, y: 3000, angle: 0, carriages: ['mg'] });
    const rammer = train(world, { x: 1000, y: 1000, angle: 0 });
    for (const target of [starter, ...starter.carriages]) {
      rammer.x = target.x;
      rammer.y = target.y;
      collideTrains(world);
      expect(rammer.alive && starter.alive).toBe(true);
    }
  });

  it('destroys both trains, each credited to the other, on a mutual ram', () => {
    const world = emptyWorld();
    const a = train(world, { x: 2000, y: 2000, angle: 0, carriages: BODY });
    const b = train(world, { x: 1904, y: 2000, angle: Math.PI, carriages: BODY });
    const destroyed = ofType(world.step(), 'trainDestroyed');
    expect(destroyed).toHaveLength(2);
    expect(destroyed.find((e) => e.victimId === a.id)).toMatchObject({ killerTrainId: b.id });
    expect(destroyed.find((e) => e.victimId === b.id)).toMatchObject({ killerTrainId: a.id });
    expect(a.kills).toBe(1);
    expect(b.kills).toBe(1);
  });

  it('is symmetric: swapping the trains swaps the outcome, not the rule', () => {
    const world = emptyWorld();
    const a = train(world, { x: 1904, y: 2000, angle: Math.PI, carriages: BODY });
    const b = train(world, { x: 2000, y: 2000, angle: 0, carriages: BODY });
    expect(ofType(world.step(), 'trainDestroyed')).toHaveLength(2);
    expect(a.alive || b.alive).toBe(false);
  });

  it('does not let a protected train die on, or kill with, its body', () => {
    const world = emptyWorld();
    const owner = world.addTrain({
      x: 3000,
      y: 3000,
      angle: 0,
      carriages: BODY,
      protectedFor: 3,
    });
    const other = train(world, { x: 2898, y: 2990, angle: Math.PI / 2 });
    expect(ofType(run(world, 2), 'trainDestroyed')).toHaveLength(0);
    expect(owner.alive && other.alive).toBe(true);
  });

  it('does not destroy a protected head that touches an unprotected body', () => {
    const world = emptyWorld();
    train(world, { x: 3000, y: 3000, angle: 0, carriages: BODY });
    const rammer = world.addTrain({ x: 2898, y: 2990, angle: Math.PI / 2, carriages: [] });
    expect(ofType(world.step(), 'trainDestroyed')).toHaveLength(0);
    expect(rammer.alive).toBe(true);
  });

  it('never destroys a train on its own body', () => {
    const world = emptyWorld();
    const loop = train(world, { x: 3000, y: 3000, angle: 0, carriages: Array(20).fill('armor') });
    world.setInput(loop.id, { turn: 1 });
    expect(ofType(run(world, 120), 'trainDestroyed')).toHaveLength(0);
  });

  it('destroys a train that crosses a long body at a shallow angle at full boost', () => {
    const world = emptyWorld();
    const owner = train(world, {
      x: 2600,
      y: 2000,
      angle: 0,
      carriages: Array(40).fill('armor'),
    });
    const rammer = train(world, { x: 1800, y: 1960, angle: 0.2 });
    world.setInput(rammer.id, {
      boost: true,
      aimX: Math.cos(0.2) * 200,
      aimY: Math.sin(0.2) * 200,
    });
    const destroyed = ofType(run(world, 60), 'trainDestroyed');
    expect(destroyed).toHaveLength(1);
    expect(destroyed[0]).toMatchObject({
      victimId: rammer.id,
      cause: 'ram',
      killerTrainId: owner.id,
    });
  });

  it('runs before projectiles, so a ram victim cannot also take weapon credit', () => {
    const world = emptyWorld();
    const owner = train(world, { x: 3000, y: 3000, angle: 0, carriages: BODY });
    const rammer = train(world, { x: 2898, y: 2990, angle: Math.PI / 2 });
    rammer.hull = 1;
    world.state.projectiles.push(shot({ x: 2880, y: 2996, vx: 600, damage: 50, ownerId: 9999 }));
    const destroyed = ofType(world.step(), 'trainDestroyed');
    expect(destroyed).toHaveLength(1);
    expect(destroyed[0]).toMatchObject({
      victimId: rammer.id,
      cause: 'ram',
      killerTrainId: owner.id,
    });
  });

  it('collides across the map seam', () => {
    const world = emptyWorld();
    train(world, { x: 100, y: 3000, angle: 0, carriages: BODY });
    // Carriage 5 is near x=-2 -> 5998 once wrapped.
    const rammer = train(world, { x: 5996, y: 2990, angle: Math.PI / 2 });
    expect(ofType(world.step(), 'trainDestroyed')).toHaveLength(1);
    expect(rammer.alive).toBe(false);
  });

  it('exposes the pass as collideTrains for direct use', () => {
    const world = emptyWorld();
    train(world, { x: 3000, y: 3000, angle: 0, carriages: BODY });
    const rammer = train(world, { x: 2892, y: 3000, angle: 0 });
    collideTrains(world);
    expect(rammer.alive).toBe(false);
  });
});

describe('spawn placement', () => {
  function spread(world: World): void {
    for (let i = 0; i < 10; i++) {
      train(world, { x: 600 + (i % 5) * 1200, y: 1500 + Math.floor(i / 5) * 3000, angle: 0 });
    }
  }

  it('spawns at least 800 units from every other head and 300 from every enemy', () => {
    const world = emptyWorld({ seed: 7 });
    spread(world);
    for (let i = 0; i < 6; i++) world.spawnEnemy('sentry');
    for (let i = 0; i < 20; i++) {
      const pos = world.findSpawnPosition();
      for (const t of world.state.trains) {
        expect(wrapDist(pos.x, pos.y, t.x, t.y, world.rules.size)).toBeGreaterThanOrEqual(800);
      }
      for (const e of world.state.enemies) {
        expect(wrapDist(pos.x, pos.y, e.x, e.y, world.rules.size)).toBeGreaterThanOrEqual(300);
      }
    }
  });

  it('falls back to the attempted position farthest from other heads in a crowded world', () => {
    const world = emptyWorld({ seed: 3 });
    for (let x = 300; x < 6000; x += 600) {
      for (let y = 300; y < 6000; y += 600) train(world, { x, y });
    }
    const size = world.rules.size;
    const replay = new Rng(world.rng.state);
    let best = -1;
    for (let i = 0; i < 20; i++) {
      const p = { x: replay.range(100, size - 100), y: replay.range(100, size - 100) };
      let nearest = Infinity;
      for (const t of world.state.trains) {
        nearest = Math.min(nearest, wrapDist(p.x, p.y, t.x, t.y, size));
      }
      best = Math.max(best, nearest);
    }
    expect(best).toBeLessThan(800);
    const pos = world.findSpawnPosition();
    let nearest = Infinity;
    for (const t of world.state.trains) {
      nearest = Math.min(nearest, wrapDist(pos.x, pos.y, t.x, t.y, size));
    }
    expect(nearest).toBeCloseTo(best, 6);
  });
});

describe('respawn', () => {
  it('resets a destroyed train in place to a protected starter at a new position', () => {
    const world = emptyWorld({ seed: 5 });
    const t = train(world, { x: 3000, y: 3000, angle: 0, carriages: Array(30).fill('armor') });
    const id = t.id;
    const name = t.name;
    t.hull = 0;
    t.alive = false;
    t.fuel = 3;
    t.kills = 4;
    const [oldX, oldY] = [t.x, t.y];

    expect(world.respawnTrain(id)).toBe(true);
    const fresh = world.getTrain(id)!;
    expect(world.state.trains.filter((x) => x.id === id)).toHaveLength(1);
    expect(fresh.name).toBe(name);
    expect(fresh.alive).toBe(true);
    expect(fresh.carriages.map((c) => c.kind)).toEqual(['locomotive', 'mg']);
    expect(fresh.hull).toBe(fresh.maxHull);
    expect(fresh.fuel).toBe(100);
    expect(fresh.kills).toBe(0);
    expect(fresh.protectedFor).toBe(SPAWN_PROTECTION);
    expect(fresh.spawnSeq).toBe(1);
    expect(wrapDist(fresh.x, fresh.y, oldX, oldY, world.rules.size)).toBeGreaterThan(0);
    // The trail is rebuilt, so the carriages sit right behind the new head.
    for (const c of fresh.carriages) {
      expect(wrapDist(c.x, c.y, fresh.x, fresh.y, world.rules.size)).toBeLessThan(40);
    }
    world.respawnTrain(id);
    expect(world.getTrain(id)?.spawnSeq).toBe(2);
  });

  it('does not carry upgrades over', () => {
    const world = emptyWorld();
    const kinds: PickupKind[] = [
      ...Array<PickupKind>(5).fill('armor'),
      ...Array<PickupKind>(3).fill('speed'),
      'shield',
      'drones',
      'fuel',
      'magnet',
      'repair',
      'cowcatcher',
      'cloak',
    ];
    const t = train(world, { carriages: kinds });
    t.alive = false;
    world.respawnTrain(t.id);
    const fresh = world.getTrain(t.id)!;
    expect(fresh.maxHull).toBe(80 + 35);
    expect(fresh.armorBonus + fresh.speedBonus + fresh.fuelBonus + fresh.magnetBonus).toBe(0);
    expect(fresh.damageReduction).toBe(0);
    expect(fresh.repairBonus + fresh.ramBonus + fresh.ramReduction + fresh.cloaks).toBe(0);
    expect(fresh.drones).toHaveLength(0);
    world.setInput(t.id, { boost: false });
    const x0 = fresh.x;
    const y0 = fresh.y;
    world.step();
    expect(wrapDist(x0, y0, fresh.x, fresh.y, world.rules.size)).toBeCloseTo(6, 1);
  });

  it('returns false for an unknown train', () => {
    expect(emptyWorld().respawnTrain(12345)).toBe(false);
  });

  it('spawns new trains as protected starters by default', () => {
    const world = emptyWorld();
    const t = world.addTrain();
    expect(t.carriages.map((c) => c.kind)).toEqual(['locomotive', 'mg']);
    expect(t.hull).toBe(t.maxHull);
    expect(t.protectedFor).toBe(SPAWN_PROTECTION);
  });

  it('keeps the owner controls across a respawn', () => {
    const world = emptyWorld();
    const t = train(world);
    world.setInput(t.id, { turn: 0.5, boost: true });
    t.alive = false;
    world.respawnTrain(t.id);
    expect(world.getTrain(t.id)?.input).toMatchObject({ turn: 0.5, boost: true });
  });
});
