import { describe, expect, it } from 'vitest';
import { DROP_LIFETIME, MAX_TRAILERS, TRAILER_TYPES } from './constants.ts';
import { PICKUP_KINDS } from '../protocol/messages.ts';
import { emptyWorld, ofType, run } from './testing.ts';
import { World } from './world.ts';

describe('World construction', () => {
  it('places the reference initial population by default', () => {
    const world = new World({ seed: 5 });
    expect(world.state.trailers).toHaveLength(50);
    expect(world.state.enemies).toHaveLength(12);
    expect(world.state.trains).toHaveLength(0);
  });

  it('keeps trailers and enemies inside the map', () => {
    const world = new World({ seed: 9 });
    for (const p of [...world.state.trailers, ...world.state.enemies]) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThan(6000);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThan(6000);
    }
  });

  it('gives different seeds different initial placements', () => {
    const a = new World({ seed: 1 });
    const b = new World({ seed: 2 });
    expect(a.state.trailers.map((t) => [t.x, t.y])).not.toEqual(
      b.state.trailers.map((t) => [t.x, t.y]),
    );
    expect(a.state.enemies.map((e) => [e.x, e.y])).not.toEqual(
      b.state.enemies.map((e) => [e.x, e.y]),
    );
  });

  it('runs headless in a plain Node environment', () => {
    expect(typeof (globalThis as { window?: unknown }).window).toBe('undefined');
    expect(typeof (globalThis as { document?: unknown }).document).toBe('undefined');
    const world = new World({ seed: 3 });
    world.addTrain({ protectedFor: 0, carriages: [], controller: 'bot' });
    expect(() => run(world, 60)).not.toThrow();
  });
});

describe('trains', () => {
  it('assigns unique ids and removes trains', () => {
    const world = emptyWorld();
    const a = world.addTrain({ protectedFor: 0, carriages: [] });
    const b = world.addTrain({ protectedFor: 0, carriages: [] });
    expect(a.id).not.toBe(b.id);
    expect(world.removeTrain(a.id)).toBe(true);
    expect(world.getTrain(a.id)).toBeUndefined();
    expect(world.getTrain(b.id)).toBe(b);
    expect(world.removeTrain(a.id)).toBe(false);
  });

  it('reports a removed train as trainLeft, not as a kill', () => {
    const world = emptyWorld();
    const a = world.addTrain({
      protectedFor: 0,
      x: 1000,
      y: 1000,
      carriages: ['mg', 'shield', 'armor', 'speed'],
    });
    world.addTrain({ protectedFor: 0, carriages: [], x: 4000, y: 4000 });
    const events = [...world.step()];
    expect(world.removeTrain(a.id)).toBe(true);
    events.push(...world.step());
    expect(ofType(events, 'trainLeft')).toEqual([
      { type: 'trainLeft', trainId: a.id, x: a.x, y: a.y },
    ]);
    expect(ofType(events, 'trainDestroyed')).toHaveLength(0);
    expect(world.state.drops).toHaveLength(0);
  });

  it('drops half the carriages as pickups when asked, with no kill event', () => {
    const world = emptyWorld();
    // Locomotive plus four carriages: five in all, so two drop.
    const a = world.addTrain({
      protectedFor: 0,
      x: 1000,
      y: 1000,
      carriages: ['mg', 'shield', 'armor', 'speed'],
    });
    world.step();
    world.removeTrain(a.id, { drop: true });
    const events = world.step();
    expect(world.state.drops).toHaveLength(2);
    expect(ofType(events, 'trainLeft')).toHaveLength(1);
    expect(ofType(events, 'trainDestroyed')).toHaveLength(0);
    for (const d of world.state.drops) {
      expect(Math.abs(d.x - 1000)).toBeLessThan(120);
    }
  });

  it('spawns new trains away from existing ones when it can', () => {
    const world = emptyWorld();
    world.addTrain({ protectedFor: 0, carriages: [], x: 3000, y: 3000 });
    for (let i = 0; i < 5; i++) {
      const t = world.addTrain({ protectedFor: 0, carriages: [] });
      expect(Math.hypot(t.x - 3000, t.y - 3000)).toBeGreaterThan(300);
    }
  });
});

describe('pickups', () => {
  it('lets a bot-controlled train collect a trailer in range', () => {
    const world = emptyWorld();
    const bot = world.addTrain({
      protectedFor: 0,
      carriages: [],
      controller: 'bot',
      x: 1000,
      y: 1000,
      angle: 0,
    });
    world.spawnTrailer(1025, 1000, 'laser');
    const before = bot.carriages.length;
    const events = world.step();
    expect(world.state.trailers).toHaveLength(0);
    expect(bot.carriages).toHaveLength(before + 1);
    expect(bot.carriages.at(-1)?.kind).toBe('laser');
    const pickup = ofType(events, 'pickup');
    expect(pickup).toHaveLength(1);
    expect(pickup[0]).toMatchObject({ trainId: bot.id, carriage: 'laser', added: true });
  });

  it('ignores trailers out of range', () => {
    const world = emptyWorld();
    const train = world.addTrain({ protectedFor: 0, carriages: [], x: 1000, y: 1000, angle: 0 });
    world.spawnTrailer(1000, 1200, 'mg');
    run(world, 1);
    expect(world.state.trailers).toHaveLength(1);
    expect(train.carriages).toHaveLength(1);
  });

  it('extends pickup range with magnet carriages', () => {
    const plain = emptyWorld();
    const magnet = emptyWorld();
    plain.addTrain({ protectedFor: 0, carriages: [], x: 1000, y: 1000, angle: Math.PI / 2 });
    magnet.addTrain({
      protectedFor: 0,
      x: 1000,
      y: 1000,
      angle: Math.PI / 2,
      carriages: ['magnet'],
    });
    // After one tick the head is 6 units further along y; the trailer is ~42 units away.
    for (const w of [plain, magnet]) w.spawnTrailer(1000, 1048, 'mg');
    run(plain, 1);
    run(magnet, 1);
    expect(plain.state.trailers).toHaveLength(1);
    expect(magnet.state.trailers).toHaveLength(0);
  });

  it('collects across the map seam', () => {
    const world = emptyWorld();
    const train = world.addTrain({ protectedFor: 0, carriages: [], x: 5990, y: 1000, angle: 0 });
    world.spawnTrailer(10, 1000, 'mg');
    run(world, 1);
    expect(world.state.trailers).toHaveLength(0);
    expect(train.carriages).toHaveLength(2);
  });

  it('only gives a trailer to one train', () => {
    const world = emptyWorld();
    const a = world.addTrain({ protectedFor: 0, carriages: [], x: 1000, y: 1000, angle: 0 });
    const b = world.addTrain({ protectedFor: 0, carriages: [], x: 1000, y: 1000, angle: 0 });
    world.spawnTrailer(1010, 1000, 'mg');
    run(world, 1);
    expect(a.carriages.length + b.carriages.length).toBe(3);
  });

  it('removes uncollected drops after 35 seconds', () => {
    const world = emptyWorld();
    world.spawnDrop(100, 100, 'mg');
    run(world, Math.floor((DROP_LIFETIME - 1) * 30));
    expect(world.state.drops).toHaveLength(1);
    run(world, 2 * 30 + 1);
    expect(world.state.drops).toHaveLength(0);
  });

  it('lets trains collect drops', () => {
    const world = emptyWorld();
    const train = world.addTrain({ protectedFor: 0, carriages: [], x: 1000, y: 1000, angle: 0 });
    world.spawnDrop(1020, 1000, 'shield');
    const events = run(world, 1);
    expect(world.state.drops).toHaveLength(0);
    expect(train.carriages.at(-1)?.kind).toBe('shield');
    expect(ofType(events, 'pickup')[0]?.source).toBe('drop');
  });
});

describe('carriage type draw', () => {
  it('draws every pickup type in proportion to its rarity weight', () => {
    expect(TRAILER_TYPES.map((t) => t.kind).sort()).toEqual([...PICKUP_KINDS].sort());
    const world = new World({ seed: 42, initialTrailers: 0, initialEnemies: 0 });
    const draws = 20000;
    const counts = new Map<string, number>();
    for (let i = 0; i < draws; i++) {
      const kind = world.randomPickupKind();
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
    const total = TRAILER_TYPES.reduce((sum, t) => sum + t.rarity, 0);
    expect(total).toBeCloseTo(11.5);
    for (const t of TRAILER_TYPES) {
      const expected = t.rarity / total;
      const share = (counts.get(t.kind) ?? 0) / draws;
      expect(Math.abs(share - expected) / expected, t.kind).toBeLessThan(0.1);
    }
  });
});

describe('population', () => {
  it('replenishes trailers up to 60', () => {
    const world = new World({ seed: 4, initialTrailers: 55, initialEnemies: 0, maxEnemies: 0 });
    world.state.trailers.splice(0, 20);
    expect(world.state.trailers).toHaveLength(35);
    let ticks = 0;
    while (world.state.trailers.length < MAX_TRAILERS && ticks < 30 * 600) {
      world.step();
      ticks++;
    }
    expect(world.state.trailers).toHaveLength(MAX_TRAILERS);
    // And it stops there.
    run(world, 30 * 30);
    expect(world.state.trailers).toHaveLength(MAX_TRAILERS);
  });

  it('replenishes enemies up to the cap', () => {
    const world = new World({ seed: 4, initialTrailers: 0, maxTrailers: 0, boss: false });
    run(world, 30 * 200);
    expect(world.state.enemies).toHaveLength(22);
  });

  it('uses the last input on every tick without new input', () => {
    const world = emptyWorld();
    const train = world.addTrain({ protectedFor: 0, carriages: [], x: 100, y: 100, angle: 0 });
    world.setInput(train.id, { turn: -1 });
    run(world, 15);
    const mid = train.angle;
    run(world, 15);
    expect(train.angle).toBeCloseTo(mid * 2, 6);
  });
});
