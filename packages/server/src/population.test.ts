import { describe, expect, it } from 'vitest';
import { BOT_NAMES } from '@lw/shared';
import { botTarget, BotPopulation } from './population.ts';
import type { BotFill } from './population.ts';
import { emptyWorld } from './testing.ts';

const FILL: BotFill = { fillTo: 12, min: 0, max: 10 };
const TICK_RATE = 30;

function setup(fill: BotFill = FILL) {
  const world = emptyWorld();
  const pop = new BotPopulation(world, fill, TICK_RATE);
  const bots = () => world.state.trains.filter((t) => t.controller === 'bot');
  const run = (ticks: number, humans: number) => {
    for (let i = 0; i < ticks; i++) pop.update(humans);
  };
  return { world, pop, bots, run };
}

describe('botTarget', () => {
  it('is fillTo minus humans, clamped', () => {
    expect(botTarget(FILL, 1)).toBe(10);
    expect(botTarget(FILL, 5)).toBe(7);
    expect(botTarget(FILL, 14)).toBe(0);
    expect(botTarget({ fillTo: 12, min: 3, max: 10 }, 14)).toBe(3);
  });

  it('is zero when bots are disabled', () => {
    expect(botTarget({ fillTo: 0, min: 0, max: 10 }, 0)).toBe(0);
  });
});

describe('adding bots', () => {
  it('adds one a second until the target is reached', () => {
    const { bots, run } = setup();
    run(1, 1);
    expect(bots()).toHaveLength(1);
    run(TICK_RATE - 1, 1);
    expect(bots()).toHaveLength(1);
    run(1, 1);
    expect(bots()).toHaveLength(2);
    run(TICK_RATE * 20, 1);
    expect(bots()).toHaveLength(10);
  });

  it('adds none when many humans are connected', () => {
    const { bots, run } = setup();
    run(TICK_RATE * 5, 14);
    expect(bots()).toHaveLength(0);
  });

  it('adds none when bots are disabled', () => {
    const { bots, run } = setup({ fillTo: 0, min: 0, max: 10 });
    run(TICK_RATE * 5, 0);
    expect(bots()).toHaveLength(0);
  });

  it('adds protected starter bots with distinct names, even past the name list', () => {
    const { bots, run } = setup({ fillTo: 100, min: 0, max: 100 });
    run(TICK_RATE * 100, 0);
    const all = bots();
    expect(all).toHaveLength(100);
    expect(new Set(all.map((b) => b.name)).size).toBe(100);
    expect(all.some((b) => BOT_NAMES.includes(b.name))).toBe(true);
    expect(all[0]?.carriages.map((c) => c.kind)).toEqual(['locomotive', 'mg']);
    expect(all[0]?.protectedFor).toBeGreaterThan(0);
  });
});

describe('a busy world', () => {
  it('keeps living bots when a human joins, and does not respawn a destroyed one', () => {
    const { world, bots, run } = setup();
    run(TICK_RATE * 20, 1);
    expect(bots()).toHaveLength(10);

    // A second and third human join: the target drops to 9. No living bot is removed.
    run(TICK_RATE * 3, 3);
    expect(bots()).toHaveLength(10);

    const victim = bots()[0]!;
    victim.alive = false;
    run(1, 3);
    expect(world.getTrain(victim.id)).toBeUndefined();
    expect(bots()).toHaveLength(9);
  });

  it('respawns a destroyed bot as a starter while at or under the target', () => {
    const { world, bots, run } = setup();
    run(TICK_RATE * 20, 1);
    const bot = bots()[0]!;
    bot.alive = false;
    run(1, 1);
    const back = world.getTrain(bot.id)!;
    expect(back.alive).toBe(true);
    expect(back.spawnSeq).toBe(1);
    expect(bots()).toHaveLength(10);
  });

  it('trims the excess, lowest-ranked first, at round reset', () => {
    const { world, pop, bots, run } = setup();
    run(TICK_RATE * 20, 1);
    const ranked = bots();
    // Give two bots a higher round best so they survive the trim.
    world.addCarriage(ranked[0]!.id, 'armor');
    world.addCarriage(ranked[0]!.id, 'armor');
    world.addCarriage(ranked[1]!.id, 'armor');
    pop.trimExcess(4);
    expect(bots()).toHaveLength(8);
    const ids = bots().map((b) => b.id);
    expect(ids).toContain(ranked[0]!.id);
    expect(ids).toContain(ranked[1]!.id);
  });
});
