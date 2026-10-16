import { describe, expect, it } from 'vitest';
import { botInput } from './bot.ts';
import { emptyWorld, run } from './testing.ts';
import { World } from './world.ts';

describe('bot controller', () => {
  it('steers toward a trailer when nothing else is around', () => {
    const world = emptyWorld();
    const bot = world.addTrain({
      protectedFor: 0,
      carriages: [],
      controller: 'bot',
      x: 3000,
      y: 3000,
      angle: 0,
    });
    world.spawnTrailer(3000, 3500, 'mg');
    const input = botInput(world, bot.id, world.rng);
    expect(bot.ai.mode).toBe('seek');
    expect(input.turn).toBeGreaterThan(0.5);
    expect(input.boost).toBe(false);
  });

  it('steers the other way for a trailer on the other side', () => {
    const world = emptyWorld();
    const bot = world.addTrain({
      protectedFor: 0,
      carriages: [],
      controller: 'bot',
      x: 3000,
      y: 3000,
      angle: 0,
    });
    world.spawnTrailer(3000, 2500, 'mg');
    expect(botInput(world, bot.id, world.rng).turn).toBeLessThan(-0.5);
  });

  it('seeks across the map seam by the short way', () => {
    const world = emptyWorld();
    const bot = world.addTrain({
      protectedFor: 0,
      carriages: [],
      controller: 'bot',
      x: 5900,
      y: 3000,
      angle: 0,
    });
    world.spawnTrailer(300, 3000, 'mg');
    const input = botInput(world, bot.id, world.rng);
    expect(bot.ai.mode).toBe('seek');
    expect(Math.abs(input.turn)).toBeLessThan(0.05);
  });

  it('flees a much larger train and boosts', () => {
    const world = emptyWorld();
    const bot = world.addTrain({
      protectedFor: 0,
      carriages: [],
      controller: 'bot',
      x: 3000,
      y: 3000,
      angle: 0,
    });
    // The big train sits ahead of the bot, so fleeing means turning around.
    world.addTrain({ protectedFor: 0, x: 3150, y: 3000, angle: 0, carriages: Array(8).fill('mg') });
    const input = botInput(world, bot.id, world.rng);
    expect(bot.ai.mode).toBe('flee');
    expect(input.boost).toBe(true);
    expect(Math.abs(input.turn)).toBe(1);
  });

  it('attacks a much smaller train and aims at it', () => {
    const world = emptyWorld();
    const bot = world.addTrain({
      protectedFor: 0,
      controller: 'bot',
      x: 3000,
      y: 3000,
      angle: 0,
      carriages: Array(8).fill('mg'),
    });
    world.addTrain({ protectedFor: 0, carriages: [], x: 3000, y: 3200, angle: 0 });
    const input = botInput(world, bot.id, world.rng);
    expect(bot.ai.mode).toBe('attack');
    expect(input.boost).toBe(true);
    expect(input.aim).toBeCloseTo(Math.PI / 2, 5);
  });

  it('aims at an enemy in range', () => {
    const world = emptyWorld();
    const bot = world.addTrain({
      protectedFor: 0,
      carriages: [],
      controller: 'bot',
      x: 3000,
      y: 3000,
      angle: 0,
    });
    world.spawnEnemy('sentry', 2800, 3000);
    expect(Math.abs(botInput(world, bot.id, world.rng).aim)).toBeCloseTo(Math.PI, 5);
  });

  it('wanders when there is nothing to do', () => {
    const world = emptyWorld();
    const bot = world.addTrain({
      protectedFor: 0,
      carriages: [],
      controller: 'bot',
      x: 3000,
      y: 3000,
      angle: 0,
    });
    botInput(world, bot.id, world.rng);
    expect(bot.ai.mode).toBe('wander');
    expect(bot.ai.targetX).toBeGreaterThanOrEqual(200);
    expect(bot.ai.targetX).toBeLessThanOrEqual(5800);
  });

  it('produces the same input shape as a human', () => {
    const world = emptyWorld();
    const bot = world.addTrain({ protectedFor: 0, carriages: [], controller: 'bot' });
    const input = botInput(world, bot.id, world.rng);
    expect(Object.keys(input).sort()).toEqual(['aim', 'boost', 'brake', 'turn']);
    expect(Math.abs(input.turn)).toBeLessThanOrEqual(1);
  });

  it('survives a two-minute all-bot soak without errors or bad state', () => {
    const world = new World({ seed: 12345 });
    for (let i = 0; i < 8; i++) {
      world.addTrain({
        protectedFor: 0,
        controller: 'bot',
        carriages: Array.from({ length: 2 + (i % 4) }, () => world.randomPickupKind()),
      });
    }
    expect(() => run(world, 30 * 120)).not.toThrow();
    const size = world.rules.size;
    for (const t of world.state.trains) {
      for (const v of [t.x, t.y, t.angle, t.hull, t.fuel]) expect(Number.isFinite(v)).toBe(true);
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x).toBeLessThan(size);
      expect(t.y).toBeGreaterThanOrEqual(0);
      expect(t.y).toBeLessThan(size);
      expect(t.carriages.length).toBeLessThanOrEqual(150);
    }
    expect(world.state.trailers.length).toBeLessThanOrEqual(60);
    expect(world.state.enemies.length).toBeLessThanOrEqual(23);
  });
});
