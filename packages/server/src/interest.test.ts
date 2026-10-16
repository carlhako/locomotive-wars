import { describe, expect, it } from 'vitest';
import { MetaTracker, selectEvents, selectVisible, trainInView } from './interest.ts';
import { emptyWorld } from './testing.ts';

describe('selectVisible', () => {
  it('excludes an enemy 3000 units away and includes one 1000 away', () => {
    const world = emptyWorld();
    const me = world.addTrain({ x: 1000, y: 1000 });
    const near = world.spawnEnemy('drone', 1000, 2000);
    const far = world.spawnEnemy('drone', 1000, 4000);
    const visible = selectVisible(world, me.x, me.y, 1600, me.id);
    expect(visible.enemies.map((e) => e.id)).toEqual([near.id]);
    expect(visible.enemies.map((e) => e.id)).not.toContain(far.id);
  });

  it('measures distance across the map seam', () => {
    const world = emptyWorld();
    const me = world.addTrain({ x: 5900, y: 3000 });
    const across = world.spawnEnemy('drone', 100, 3000);
    const visible = selectVisible(world, me.x, me.y, 1600, me.id);
    expect(visible.enemies.map((e) => e.id)).toEqual([across.id]);
  });

  it('includes a long train whose head is far but a carriage is near', () => {
    const world = emptyWorld();
    const me = world.addTrain({ x: 1000, y: 1000 });
    const other = world.addTrain({ x: 3500, y: 1000, angle: Math.PI });
    other.carriages = [
      { kind: 'locomotive', x: 3482, y: 1000, angle: 0 },
      { kind: 'mg', x: 2000, y: 1000, angle: 0 },
    ];
    expect(Math.hypot(other.x - me.x, other.y - me.y)).toBeGreaterThan(2400);
    const visible = selectVisible(world, me.x, me.y, 1600, me.id);
    expect(visible.trains.map((t) => t.id)).toEqual([other.id]);
    expect(trainInView(other, me.x, me.y, 1600, world.rules.size)).toBe(true);
  });

  it('leaves out a train with nothing in range, and always the viewer own train', () => {
    const world = emptyWorld();
    const me = world.addTrain({ x: 1000, y: 1000 });
    world.addTrain({ x: 3500, y: 3500 });
    const visible = selectVisible(world, me.x, me.y, 1600, me.id);
    expect(visible.trains).toHaveLength(0);
  });

  it('selects trailers, drops, and projectiles by distance too', () => {
    const world = emptyWorld();
    const me = world.addTrain({ x: 1000, y: 1000 });
    world.spawnTrailer(1200, 1000, 'mg');
    world.spawnTrailer(4000, 4000, 'mg');
    world.spawnDrop(900, 1000, 'armor');
    world.spawnDrop(4500, 1000, 'armor');
    const visible = selectVisible(world, me.x, me.y, 1600, me.id);
    expect(visible.trailers).toHaveLength(1);
    expect(visible.drops).toHaveLength(1);
  });
});

describe('selectEvents', () => {
  const size = 6000;
  const hit = (x: number, victimId: number) =>
    ({
      type: 'hit',
      victimKind: 'train',
      victimId,
      attackerKind: 'enemy',
      attackerId: 99,
      amount: 5,
      x,
      y: 1000,
    }) as const;

  it('delivers a distant train destruction to everyone', () => {
    const kill = {
      type: 'trainDestroyed',
      victimId: 8,
      sourceKind: 'train',
      sourceId: 9,
      x: 4000,
      y: 4000,
    } as const;
    expect(selectEvents([kill], 1000, 1000, 1600, 1, size)).toEqual([kill]);
  });

  it('keeps nearby events and drops distant ones that do not involve the train', () => {
    const near = hit(1500, 5);
    const far = hit(4000, 5);
    expect(selectEvents([near, far], 1000, 1000, 1600, 1, size)).toEqual([near]);
  });

  it('keeps a distant event that involves the session train', () => {
    const involving = hit(4000, 1);
    expect(selectEvents([involving], 1000, 1000, 1600, 1, size)).toEqual([involving]);
  });
});

describe('MetaTracker', () => {
  it('announces a new train once, then nothing until it changes', () => {
    const world = emptyWorld();
    const t = world.addTrain({ name: 'A', carriages: ['mg'] });
    const tracker = new MetaTracker();
    const first = tracker.diff([t]);
    expect(first?.trains).toEqual([
      { id: t.id, name: 'A', color: t.color, ctl: 'human', kinds: ['locomotive', 'mg'] },
    ]);
    expect(tracker.diff([t])).toBeNull();
  });

  it('announces a new carriage kind', () => {
    const world = emptyWorld();
    const t = world.addTrain({ carriages: ['mg'] });
    const tracker = new MetaTracker();
    tracker.diff([t]);
    world.addCarriage(t.id, 'missile');
    const update = tracker.diff([t]);
    expect(update?.trains).toHaveLength(1);
    expect(update?.trains[0]?.kinds).toEqual(['locomotive', 'mg', 'missile']);
    expect(update?.gone).toEqual([]);
  });

  it('reports trains that leave view or the world as gone, and re-announces them on return', () => {
    const world = emptyWorld();
    const a = world.addTrain({});
    const b = world.addTrain({});
    const tracker = new MetaTracker();
    tracker.diff([a, b]);
    expect(tracker.diff([a])).toEqual({ trains: [], gone: [b.id] });
    expect(tracker.diff([a])).toBeNull();
    expect(tracker.diff([a, b])?.trains.map((m) => m.id)).toEqual([b.id]);
  });
});
