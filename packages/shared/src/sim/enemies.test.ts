import { describe, expect, it } from 'vitest';
import { damageEnemy } from './combat.ts';
import { BOSS_INTERVAL } from './constants.ts';
import { emptyWorld, ofType, run } from './testing.ts';

describe('PvE enemies', () => {
  it('shoots the nearest train, not a particular one', () => {
    const world = emptyWorld();
    const bot = world.addTrain({
      protectedFor: 0,
      carriages: [],
      controller: 'bot',
      x: 3300,
      y: 3000,
      angle: 0,
    });
    const human = world.addTrain({
      protectedFor: 0,
      carriages: [],
      controller: 'human',
      x: 3000,
      y: 3450,
      angle: 0,
    });
    const sentry = world.spawnEnemy('sentry', 3000, 3000);
    world.step();
    const shots = world.state.projectiles.filter((p) => p.ownerId === sentry.id);
    expect(shots).toHaveLength(1);
    // Aimed along +x at the bot, not +y at the human.
    expect(shots[0]!.vx).toBeGreaterThan(300);
    expect(Math.abs(shots[0]!.vy)).toBeLessThan(20);
    expect(bot.id).not.toBe(human.id);
  });

  it('does not shoot trains out of range', () => {
    const world = emptyWorld();
    world.addTrain({ protectedFor: 0, carriages: [], x: 3700, y: 3000, angle: 0 });
    const sentry = world.spawnEnemy('sentry', 3000, 3000);
    run(world, 3);
    expect(world.state.projectiles.filter((p) => p.ownerId === sentry.id)).toHaveLength(0);
  });

  it('lets enemy fire hit any train, including bots', () => {
    const world = emptyWorld();
    const bot = world.addTrain({
      protectedFor: 0,
      carriages: [],
      controller: 'bot',
      x: 3100,
      y: 3000,
      angle: 0,
    });
    // Hold the bot on a straight run along the line of fire; shots are not led.
    bot.ai.decisionTimer = 1000;
    bot.ai.targetX = 5000;
    bot.ai.targetY = 3000;
    world.spawnEnemy('sentry', 3000, 3000);
    const events = run(world, 60);
    const hits = ofType(events, 'hit').filter((h) => h.victimId === bot.id);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.attackerKind).toBe('enemy');
  });

  it('rams for 40 to the train and 20 to the drone, for any train', () => {
    for (const controller of ['human', 'bot'] as const) {
      const world = emptyWorld();
      const train = world.addTrain({
        protectedFor: 0,
        carriages: [],
        controller,
        x: 3000,
        y: 3000,
        angle: 0,
      });
      const drone = world.spawnEnemy('drone', 3006, 3000);
      // Keep the drone from also shooting point-blank so only the ram is measured.
      drone.shootTimer = 10;
      world.step();
      expect(train.hull).toBeCloseTo(40, 0);
      expect(drone.hull).toBe(5);
    }
  });

  it('cowcatchers soften rams and hit harder', () => {
    const world = emptyWorld();
    const train = world.addTrain({
      protectedFor: 0,
      carriages: ['cowcatcher', 'cowcatcher'],
      x: 3000,
      y: 3000,
      angle: 0,
    });
    const drone = world.spawnEnemy('drone', 3006, 3000);
    drone.shootTimer = 10;
    const hits = ofType(world.step(), 'hit');
    expect(hits.find((h) => h.victimId === train.id)?.amount).toBeCloseTo(32);
    expect(hits.find((h) => h.victimId === drone.id)?.amount).toBe(60);
  });

  it('drops one pickup when destroyed and removes the enemy', () => {
    const world = emptyWorld();
    world.addTrain({ protectedFor: 0, carriages: [], x: 3000, y: 3000, angle: 0 });
    world.spawnEnemy('drone', 3006, 3000).hull = 10;
    const events = run(world, 1);
    expect(ofType(events, 'enemyDestroyed')).toHaveLength(1);
    expect(world.state.enemies).toHaveLength(0);
    expect(world.state.drops).toHaveLength(1);
  });

  it('does not ram the boss', () => {
    const world = emptyWorld();
    const train = world.addTrain({ protectedFor: 0, carriages: [], x: 3000, y: 3000, angle: 0 });
    const boss = world.spawnBoss();
    boss.x = 3000;
    boss.y = 3000;
    world.step();
    expect(boss.hull).toBe(boss.maxHull);
    expect(train.alive).toBe(true);
  });
});

describe('boss', () => {
  it('targets the nearest human, ignoring a nearer bot', () => {
    const world = emptyWorld();
    world.addTrain({
      protectedFor: 0,
      carriages: [],
      controller: 'human',
      x: 3800,
      y: 3000,
      angle: Math.PI,
    });
    world.addTrain({
      protectedFor: 0,
      carriages: [],
      controller: 'human',
      x: 4500,
      y: 3000,
      angle: Math.PI,
    });
    world.addTrain({
      protectedFor: 0,
      carriages: [],
      controller: 'bot',
      x: 3000,
      y: 2700,
      angle: 0,
    });
    const boss = world.spawnBoss();
    boss.x = 3000;
    boss.y = 3000;
    world.step();
    const shots = world.state.projectiles.filter((p) => p.ownerId === boss.id);
    expect(shots).toHaveLength(3);
    const bearings = shots.map((p) => Math.atan2(p.vy, p.vx)).sort((a, b) => a - b);
    expect(bearings[1]).toBeCloseTo(0, 1);
    expect(bearings[0]).toBeCloseTo(-0.25, 1);
    expect(bearings[2]).toBeCloseTo(0.25, 1);
  });

  it('falls back to the nearest train when no human is alive', () => {
    const world = emptyWorld();
    world.addTrain({
      protectedFor: 0,
      carriages: [],
      controller: 'bot',
      x: 3000,
      y: 2700,
      angle: 0,
    });
    world.addTrain({
      protectedFor: 0,
      carriages: [],
      controller: 'bot',
      x: 3800,
      y: 3000,
      angle: 0,
    });
    const boss = world.spawnBoss();
    boss.x = 3000;
    boss.y = 3000;
    world.step();
    const shots = world.state.projectiles.filter((p) => p.ownerId === boss.id);
    expect(shots).toHaveLength(3);
    const middle = shots.map((p) => Math.atan2(p.vy, p.vx)).sort((a, b) => a - b)[1]!;
    expect(middle).toBeCloseTo(-Math.PI / 2, 1);
  });

  it('spawns at 80 seconds, then 112.5 seconds after it is defeated', () => {
    const world = emptyWorld({ boss: true });
    const hz = 30;
    let ticks = 0;
    const spawnTicks: number[] = [];
    const downTicks: number[] = [];
    while (spawnTicks.length < 2 && ticks < hz * 400) {
      const events = world.step();
      ticks++;
      if (ofType(events, 'bossSpawn').length > 0) {
        spawnTicks.push(ticks);
        // Defeat it on the spot.
        const boss = world.getEnemy(world.state.bossId!)!;
        const down = (() => {
          damageEnemy(world, boss, 1e6, null);
          return ticks;
        })();
        downTicks.push(down);
      }
    }
    expect(spawnTicks).toHaveLength(2);
    expect(spawnTicks[0]! / hz).toBeGreaterThan(79.9);
    expect(spawnTicks[0]! / hz).toBeLessThan(80.2);
    expect((spawnTicks[1]! - downTicks[0]!) / hz).toBeGreaterThan(112.3);
    expect((spawnTicks[1]! - downTicks[0]!) / hz).toBeLessThan(112.7);
    expect(BOSS_INTERVAL * 1.5).toBe(112.5);
  });

  it('drops 5 pickups and announces the defeat', () => {
    const world = emptyWorld();
    const boss = world.spawnBoss();
    // Destroying it through a hit inside a step so the event is captured.
    boss.hull = 1;
    // The killer is somewhere else, so it does not scoop up the drops.
    const train = world.addTrain({
      protectedFor: 0,
      carriages: [],
      x: (boss.x + 2000) % 6000,
      y: boss.y,
      angle: 0,
    });
    world.state.projectiles.push({
      id: 9000,
      kind: 'laser',
      x: boss.x - 10,
      y: boss.y,
      vx: 600,
      vy: 0,
      damage: 14,
      life: 1,
      splash: 0,
      pierce: 1,
      hitIds: [],
      ownerKind: 'train',
      ownerId: train.id,
    });
    const events = world.step();
    const down = ofType(events, 'bossDown');
    expect(down).toHaveLength(1);
    expect(down[0]?.sourceId).toBe(train.id);
    expect(world.state.drops.length).toBe(5);
    expect(world.state.bossId).toBeNull();
  });

  it('does not spawn when disabled', () => {
    const world = emptyWorld({ boss: false });
    run(world, 30 * 100);
    expect(world.state.bossId).toBeNull();
  });
});
