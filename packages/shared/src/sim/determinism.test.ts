import { describe, expect, it } from 'vitest';
import { serializeWorld } from './serialize.ts';
import { World } from './world.ts';

/** Builds a world with two scripted humans and three bots, and an input script by tick. */
function makeScenario(seed: number) {
  const world = new World({ seed });
  const humans = [
    world.addTrain({
      controller: 'human',
      x: 1500,
      y: 1500,
      angle: 0,
      carriages: ['mg', 'shield', 'mines', 'tesla'],
    }),
    world.addTrain({
      controller: 'human',
      x: 4000,
      y: 4000,
      angle: 2,
      carriages: ['laser', 'flak', 'tailgun', 'cowcatcher'],
    }),
  ];
  for (let i = 0; i < 3; i++) {
    world.addTrain({ controller: 'bot', carriages: ['mg', 'speed', 'mines', 'tailgun', 'repair'] });
  }
  const apply = (tick: number) => {
    humans.forEach((h, i) => {
      world.setInput(h.id, {
        turn: Math.sin((tick + i * 40) / 25),
        boost: tick % 90 < 40,
        brake: tick % 150 > 140,
        fire: (tick + i * 20) % 60 < 40,
        aim: (tick / 30) * (i + 1),
      });
    });
  };
  return { world, apply };
}

describe('determinism', () => {
  it('replays identically for the same seed and inputs, tick by tick', () => {
    const a = makeScenario(2024);
    const b = makeScenario(2024);
    expect(serializeWorld(a.world)).toBe(serializeWorld(b.world));
    for (let tick = 0; tick < 600; tick++) {
      a.apply(tick);
      b.apply(tick);
      const ea = a.world.step();
      const eb = b.world.step();
      expect(eb).toEqual(ea);
      expect(serializeWorld(b.world)).toBe(serializeWorld(a.world));
    }
  });

  it('diverges for different seeds', () => {
    const a = makeScenario(1);
    const b = makeScenario(2);
    expect(serializeWorld(a.world)).not.toBe(serializeWorld(b.world));
    for (let tick = 0; tick < 100; tick++) {
      a.apply(tick);
      b.apply(tick);
      a.world.step();
      b.world.step();
    }
    expect(serializeWorld(a.world)).not.toBe(serializeWorld(b.world));
  });

  it('diverges when the inputs differ', () => {
    const a = makeScenario(7);
    const b = makeScenario(7);
    for (let tick = 0; tick < 100; tick++) {
      a.apply(tick);
      a.world.step();
      b.world.step();
    }
    expect(serializeWorld(a.world)).not.toBe(serializeWorld(b.world));
  });

  it('produces JSON-safe state', () => {
    const { world, apply } = makeScenario(3);
    for (let tick = 0; tick < 200; tick++) {
      apply(tick);
      world.step();
    }
    const text = serializeWorld(world);
    expect(JSON.parse(text)).toBeTypeOf('object');
    expect(text).not.toContain('null,null');
    expect(text).not.toContain('NaN');
  });
});
