import { describe, expect, it } from 'vitest';
import { botInput } from './bot.ts';
import { BASE_SPEED, BOT_TURN_GAIN, TURN_RATE } from './constants.ts';
import { clamp, shortAngle, wrapAngle } from './math.ts';
import { emptyWorld, ofType, run } from './testing.ts';
import type { TrainState } from './types.ts';
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
    expect(input.aimX).toBeCloseTo(0, 5);
    expect(input.aimY).toBeCloseTo(200, 5);
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
    const input = botInput(world, bot.id, world.rng);
    expect(input.aimX).toBeCloseTo(-200, 5);
    expect(input.aimY).toBeCloseTo(0, 5);
  });

  it('fires at an enemy 300 units away', () => {
    const world = emptyWorld();
    const bot = world.addTrain({
      protectedFor: 0,
      carriages: [],
      controller: 'bot',
      x: 3000,
      y: 3000,
      angle: 0,
    });
    world.spawnEnemy('drone', 3000, 3300);
    const input = botInput(world, bot.id, world.rng);
    expect(input.fire).toBe(true);
    // The aim offset points from the head to the enemy.
    expect(input.aimX).toBeCloseTo(0, 5);
    expect(input.aimY).toBeCloseTo(300, 5);
  });

  it('holds fire with nothing in range', () => {
    const world = emptyWorld();
    const bot = world.addTrain({
      protectedFor: 0,
      carriages: [],
      controller: 'bot',
      x: 3000,
      y: 3000,
      angle: 0,
    });
    world.spawnEnemy('drone', 3000, 3600);
    world.addTrain({ protectedFor: 0, carriages: [], x: 3700, y: 3000, angle: 0 });
    const input = botInput(world, bot.id, world.rng);
    expect(input.fire).toBe(false);
    // With nothing to aim at, it aims ahead along its heading.
    expect(input.aimX).toBeCloseTo(200);
    expect(input.aimY).toBeCloseTo(0);
  });

  it('never fires at a protected train', () => {
    const world = emptyWorld();
    const bot = world.addTrain({
      protectedFor: 0,
      carriages: [],
      controller: 'bot',
      x: 3000,
      y: 3000,
      angle: 0,
    });
    world.addTrain({ protectedFor: 2, carriages: [], x: 3200, y: 3000, angle: 0 });
    expect(botInput(world, bot.id, world.rng).fire).toBe(false);
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
    expect(Object.keys(input).sort()).toEqual(['aimX', 'aimY', 'boost', 'brake', 'fire', 'turn']);
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

/** Nearly forever, so a body train never becomes harmless or lethal mid-test by accident. */
const LONG = 1e9;

/**
 * A bot at (3000, 3000) heading +x, seeking a trailer at (3600, 3000), with a straight body of
 * another train crossing its path `ahead` units in front. The body's head is far up the +y side,
 * moving away, so the bot never treats it as a threat.
 */
function wallScene(botSkill: number, ahead: number, opts: { protectedFor?: number } = {}) {
  const world = emptyWorld({ botSkill });
  const bot = world.addTrain({
    protectedFor: 0,
    carriages: [],
    controller: 'bot',
    x: 3000,
    y: 3000,
    angle: 0,
  });
  world.spawnTrailer(3600, 3000, 'mg');
  const wall = world.addTrain({
    protectedFor: opts.protectedFor ?? 0,
    x: 3000 + ahead,
    y: 3900,
    angle: Math.PI / 2,
    carriages: Array(120).fill('mg'),
  });
  return { world, bot, wall };
}

/** The input the mode logic alone would give a seeking bot. */
function seekTurn(world: World, bot: TrainState): number {
  const target = wrapAngle(bot.x, bot.y, bot.ai.targetX, bot.ai.targetY, world.rules.size);
  return clamp(shortAngle(target - bot.angle) * BOT_TURN_GAIN, -1, 1);
}

describe('bot body avoidance', () => {
  it('leaves a clear path untouched', () => {
    const inputs = [0, 1].map((botSkill) => {
      const world = emptyWorld({ botSkill });
      const bot = world.addTrain({
        protectedFor: 0,
        carriages: [],
        controller: 'bot',
        x: 3000,
        y: 3000,
        angle: 0,
      });
      world.spawnTrailer(3400, 3300, 'mg');
      // Another train far off the path.
      world.addTrain({ protectedFor: 0, x: 1000, y: 1000, carriages: Array(20).fill('mg') });
      return botInput(world, bot.id, world.rng);
    });
    expect(inputs[1]).toEqual(inputs[0]);
  });

  it('at skill 0 drives straight into a body and dies by ramming', () => {
    const { world, bot, wall } = wallScene(0, 200);
    const events = run(world, 90);
    const deaths = ofType(events, 'trainDestroyed');
    expect(deaths).toHaveLength(1);
    expect(deaths[0]).toMatchObject({ victimId: bot.id, cause: 'ram', killerTrainId: wall.id });
  });

  it('at skill 1 steers around a body 200 units ahead', () => {
    const { world, bot } = wallScene(1, 200);
    let turned = false;
    for (let i = 0; i < 90; i++) {
      world.step();
      if (bot.input.turn !== seekTurn(world, bot)) turned = true;
      expect(bot.alive).toBe(true);
    }
    expect(turned).toBe(true);
    // It turned away before reaching the body's line.
    expect(bot.x).toBeLessThan(3200 - 14);
  });

  it('brakes to turn tighter when the body is too close to clear at full speed', () => {
    // Full turn at cruise speed swings ~50 units forward; braked, ~25.
    expect(BASE_SPEED / TURN_RATE).toBeCloseTo(50, 0);
    const { world, bot } = wallScene(1, 62);
    world.step();
    expect(bot.input.brake).toBe(true);
    expect(Math.abs(bot.input.turn)).toBe(1);
    for (let i = 0; i < 90; i++) {
      world.step();
      expect(bot.alive).toBe(true);
    }
  });
});

/** The all-bot soak world: 8 bots with mixed starting carriages on a fixed seed. */
function soakWorld(botSkill: number, seed = 12345): World {
  const world = new World({ seed, botSkill });
  for (let i = 0; i < 8; i++) {
    world.addTrain({
      protectedFor: 0,
      controller: 'bot',
      carriages: Array.from({ length: 2 + (i % 4) }, () => world.randomPickupKind()),
    });
  }
  return world;
}

describe('bot boost escapes', () => {
  it('never boosts out of danger with an empty tank', () => {
    const world = soakWorld(1);
    let blockedTicks = 0;
    for (let i = 0; i < 900; i++) {
      for (const t of world.state.trains) t.fuel = 0;
      world.step();
      for (const t of world.state.trains) {
        if (!t.alive) continue;
        if (t.ai.blocked) blockedTicks += 1;
        expect(t.input.boost).toBe(false);
      }
    }
    expect(blockedTicks).toBeGreaterThan(0);
  });
});

/**
 * A bot at the centre of a ring formed by another train's body, `radius` units out, circling in
 * place; the bot seeks a trailer outside the ring.
 */
function ringScene(botSkill: number, radius: number) {
  const world = emptyWorld({ botSkill });
  const ring = world.addTrain({
    protectedFor: LONG,
    x: 3000,
    y: 3000 - radius,
    angle: 0,
    carriages: Array(40).fill('mg'),
  });
  // A constant turn input circles at radius BASE_SPEED / (TURN_RATE * turn).
  world.setInput(ring.id, { turn: BASE_SPEED / (TURN_RATE * radius) });
  run(world, 120);
  ring.protectedFor = 0;
  const bot = world.addTrain({
    protectedFor: 0,
    carriages: [],
    controller: 'bot',
    x: 3000,
    y: 3000,
    angle: 0,
  });
  world.spawnTrailer(3600, 3000, 'mg');
  return { world, bot, ring };
}

describe('bot coil', () => {
  it('coils inside a ring of another body and survives', () => {
    const { world, bot } = ringScene(1, 66);
    world.step();
    expect(bot.ai.coilTurn).not.toBe(0);
    let coiled = 1;
    for (let i = 0; i < 150; i++) {
      world.step();
      expect(bot.alive).toBe(true);
      // Between coils it may take a clear braked arc, so it always circles tightly.
      expect(bot.input.brake).toBe(true);
      expect(Math.abs(bot.input.turn)).toBeGreaterThanOrEqual(0.5);
      if (bot.ai.coilTurn !== 0) {
        coiled += 1;
        expect(Math.abs(bot.ai.coilTurn)).toBe(1);
        expect(bot.input.turn).toBe(bot.ai.coilTurn);
        expect(bot.input.boost).toBe(false);
      }
    }
    // It starts coiled: at the centre every way out is blocked.
    expect(coiled).toBeGreaterThan(30);
  });

  it('leaves the coil once the ring is gone', () => {
    const { world, bot, ring } = ringScene(1, 66);
    run(world, 10);
    expect(bot.ai.coilTurn).not.toBe(0);
    world.removeTrain(ring.id);
    let resumedAfter = -1;
    for (let i = 0; i < 30 && resumedAfter < 0; i++) {
      world.step();
      if (bot.ai.coilTurn === 0 && !bot.input.brake && bot.input.turn === seekTurn(world, bot)) {
        resumedAfter = i + 1;
      }
    }
    expect(resumedAfter).toBeGreaterThan(0);
  });
});

/** Lapses started over 1,000 fresh clear-to-blocked encounters with a body 40 units ahead. */
function countLapses(botSkill: number): number {
  const { world, bot } = wallScene(botSkill, 40, { protectedFor: LONG });
  let lapses = 0;
  for (let i = 0; i < 1000; i++) {
    bot.ai.blocked = false;
    bot.ai.lapseTimer = 0;
    bot.ai.coilTurn = 0;
    botInput(world, bot.id, world.rng);
    expect(bot.ai.blocked).toBe(true);
    if (bot.ai.lapseTimer > 0) lapses += 1;
  }
  return lapses;
}

/**
 * Four bots wandering on a fixed seed at `botSkill`, each starting just short of a protected,
 * circling body when `bodies` is set. The bots are bare locomotives of one size, so they never
 * flee, attack, fire, or harm each other, and only avoidance can change how often they draw from
 * the random source. Returns the rng state after 600 ticks and the ticks a bot spent blocked.
 */
function wanderRun(botSkill: number, bodies: boolean): { rng: number; blocked: number } {
  const world = emptyWorld({ botSkill, seed: 777 });
  const bots = [0, 1, 2, 3].map((k) =>
    world.addTrain({
      protectedFor: 0,
      carriages: [],
      controller: 'bot',
      x: 600 + 1400 * k,
      y: 3000,
      angle: 0,
    }),
  );
  if (bodies) {
    for (let k = 0; k < 4; k++) {
      const body = world.addTrain({
        protectedFor: LONG,
        x: 900 + 1400 * k,
        y: 2850,
        angle: 0,
        carriages: Array(40).fill('mg'),
      });
      world.setInput(body.id, { turn: BASE_SPEED / (TURN_RATE * 150) });
    }
  }
  let blocked = 0;
  for (let i = 0; i < 600; i++) {
    world.step();
    for (const b of bots) if (b.ai.blocked) blocked += 1;
  }
  return { rng: world.rng.state, blocked };
}

describe('bot lapses', () => {
  it('never lapse at skill 1', () => {
    expect(countLapses(1)).toBe(0);
  });

  it('sometimes lapse at skill 0.5', () => {
    const lapses = countLapses(0.5);
    expect(lapses).toBeGreaterThan(0);
    expect(lapses).toBeLessThan(500);
  });

  it('keep the chosen input for the lapse time, then avoid', () => {
    const { world, bot } = wallScene(0.5, 40, { protectedFor: LONG });
    // Find a seed state whose first blocked tick lapses.
    let lapsed = false;
    for (let i = 0; i < 200 && !lapsed; i++) {
      bot.ai.blocked = false;
      world.rng.state = i;
      botInput(world, bot.id, world.rng);
      lapsed = bot.ai.lapseTimer > 0;
    }
    expect(lapsed).toBe(true);
    let lapseTicks = 1;
    while (bot.ai.lapseTimer > 0) {
      const input = botInput(world, bot.id, world.rng);
      if (bot.ai.lapseTimer > 0) {
        expect(input.turn).toBe(seekTurn(world, bot));
        lapseTicks += 1;
      } else {
        expect(input.turn).not.toBe(seekTurn(world, bot));
      }
    }
    expect(lapseTicks / 30).toBeCloseTo(0.4, 5);
  });

  it('at skill 1 draw from the random source only as a run with nothing blocked', () => {
    const blockedRun = wanderRun(1, true);
    expect(blockedRun.blocked).toBeGreaterThan(0);
    expect(wanderRun(1, false).blocked).toBe(0);
    expect(blockedRun.rng).toBe(wanderRun(1, false).rng);
    // Below skill 1 the blocked episodes draw for lapses, which the comparison would catch.
    expect(wanderRun(0.5, true).rng).not.toBe(wanderRun(0.5, false).rng);
  });
});
