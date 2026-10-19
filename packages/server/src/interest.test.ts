import { describe, expect, it } from 'vitest';
import type { SimEvent, TrainState } from '@lw/shared';
import { MetaTracker, selectEvents, selectVisible, trainInView } from './interest.ts';
import { buildSnapshot } from './snapshot.ts';
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

describe('mines in view', () => {
  it('sends an armed mine 500 units away with its owner and armed state', () => {
    const world = emptyWorld();
    const me = world.addTrain({ x: 1000, y: 1000 });
    const owner = world.addTrain({ x: 4000, y: 4000 });
    world.state.mines.push(
      { id: 501, x: 1500, y: 1000, ownerId: owner.id, age: 3 },
      { id: 502, x: 1000, y: 1300, ownerId: me.id, age: 0.1 },
      { id: 503, x: 4000, y: 1000, ownerId: owner.id, age: 3 },
    );
    const visible = selectVisible(world, me.x, me.y, 1600, me.id);
    expect(visible.mines.map((m) => m.id)).toEqual([501, 502]);
    const snap = buildSnapshot({
      tick: 1,
      serverTimeMs: 0,
      ack: 0,
      own: me,
      visible,
      events: [],
    });
    expect(snap.mn).toEqual([
      [501, owner.id, 1500, 1000, 1],
      [502, me.id, 1000, 1300, 0],
    ]);
  });
});

describe('hearts, own projectiles, and doses', () => {
  const snapOf = (world: ReturnType<typeof emptyWorld>, me: TrainState) =>
    buildSnapshot({
      tick: 1,
      serverTimeMs: 0,
      ack: 0,
      own: me,
      visible: selectVisible(world, me.x, me.y, 1600, me.id),
      events: [],
    });

  it('sends a heart in range with its kind, and not one out of range', () => {
    const world = emptyWorld();
    const me = world.addTrain({ x: 1000, y: 1000 });
    const full = world.spawnHeart('full', 1500, 1000);
    const slow = world.spawnHeart('slow', 1000, 1200, true);
    world.spawnHeart('slow', 4000, 4000);
    expect(snapOf(world, me).ht).toEqual([
      [full.id, 1, 1500, 1000],
      [slow.id, 0, 1000, 1200],
    ]);
  });

  it("flags only the session's own projectiles", () => {
    const world = emptyWorld();
    const me = world.addTrain({ x: 1000, y: 1000 });
    const other = world.addTrain({ x: 1400, y: 1000 });
    const base = {
      kind: 'bullet' as const,
      vx: 550,
      vy: 0,
      damage: 7,
      life: 1,
      splash: 0,
      pierce: 1,
      hitIds: [],
    };
    world.state.projectiles.push(
      { ...base, id: 701, x: 1100, y: 1000, ownerKind: 'train', ownerId: me.id },
      { ...base, id: 702, x: 1300, y: 1000, ownerKind: 'train', ownerId: other.id },
      { ...base, id: 703, x: 1200, y: 1050, ownerKind: 'enemy', ownerId: me.id },
    );
    const pr = snapOf(world, me).pr;
    expect(pr.map((r) => [r[0], r[6]])).toEqual([
      [701, 1],
      [702, undefined],
      [703, undefined],
    ]);
    expect(pr[1]).toHaveLength(6);
  });

  it('reports the own train dose count', () => {
    const world = emptyWorld();
    const me = world.addTrain({ x: 1000, y: 1000 });
    me.healDoses = [2, 7];
    expect(snapOf(world, me).me?.hd).toBe(2);
  });

  it('routes heart events by position or by the collecting train', () => {
    const e: SimEvent = {
      type: 'heart',
      trainId: 1,
      heartId: 5,
      kind: 'slow',
      amount: 60,
      x: 4000,
      y: 4000,
    };
    expect(selectEvents([e], 1000, 1000, 1600, 1, 6000)).toEqual([e]);
    expect(selectEvents([e], 1000, 1000, 1600, 2, 6000)).toEqual([]);
    expect(selectEvents([e], 3800, 4000, 1600, 2, 6000)).toEqual([e]);
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
      cause: 'ram',
      killerTrainId: 9,
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

  it('routes zaps and mine explosions by position or by owner', () => {
    const zap = (x: number, ownerId: number): SimEvent => ({
      type: 'zap',
      ownerId,
      points: [
        [x, 1000],
        [x + 100, 1000],
      ],
      x,
      y: 1000,
    });
    const boom = (x: number, ownerId: number): SimEvent => ({
      type: 'mineExploded',
      mineId: 70,
      ownerId,
      x,
      y: 1000,
    });
    const nearZap = zap(1200, 5);
    const farZap = zap(4000, 5);
    const ownFarZap = zap(4000, 1);
    const nearBoom = boom(1300, 5);
    const farBoom = boom(4200, 5);
    const ownFarBoom = boom(4200, 1);
    expect(
      selectEvents(
        [nearZap, farZap, ownFarZap, nearBoom, farBoom, ownFarBoom],
        1000,
        1000,
        1600,
        1,
        size,
      ),
    ).toEqual([nearZap, ownFarZap, nearBoom, ownFarBoom]);
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
