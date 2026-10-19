import { describe, expect, it } from 'vitest';
import { MAP_SIZE, viewFromWorld, World } from '@lw/shared';
import type { CarriageKind, PickupKind, ProjectileKind, SimEvent, WorldView } from '@lw/shared';
import type { SoundPlayer } from '../audio/sound.ts';
import type { BannerSink } from '../hud/banner.ts';
import type { KillFeedEntry } from '../hud/killfeed.ts';
import type { PickupLine } from '../hud/pickupPopup.ts';
import { HEAL_COLOR } from '../render/palette.ts';
import { applyEvents, NameBook } from './eventFx.ts';
import type { FxContext, FxTargets } from './eventFx.ts';
import type { Particle } from './particles.ts';

interface Recorded {
  particles: Particle[];
  numbers: { x: number; y: number; amount: number; color?: string; prefix?: string }[];
  shakes: { intensity: number; duration: number }[];
  flashes: { id: number; duration: number }[];
  screenFlashes: number;
  healFlashes: number;
  feed: KillFeedEntry[];
  banners: { text: string; sub: string; color: string }[];
  popups: { text: string; color: string }[];
  pickupLines: PickupLine[];
  sounds: string[];
  turrets: { trainId: number; carriage: number; angle: number }[];
  zaps: Array<ReadonlyArray<readonly [number, number]>>;
}

function recorder(): { fx: FxTargets; rec: Recorded } {
  const rec: Recorded = {
    particles: [],
    numbers: [],
    shakes: [],
    flashes: [],
    screenFlashes: 0,
    healFlashes: 0,
    feed: [],
    banners: [],
    popups: [],
    pickupLines: [],
    sounds: [],
    turrets: [],
    zaps: [],
  };
  const sound: SoundPlayer = {
    shoot: (k: ProjectileKind) => rec.sounds.push(`shoot:${k}`),
    hit: () => rec.sounds.push('hit'),
    damage: () => rec.sounds.push('damage'),
    explosion: (big) => rec.sounds.push(big ? 'explosion:big' : 'explosion'),
    pickup: () => rec.sounds.push('pickup'),
    death: () => rec.sounds.push('death'),
    bossSpawn: () => rec.sounds.push('bossSpawn'),
    bridgeOn: () => rec.sounds.push('bridgeOn'),
    bridgeOff: () => rec.sounds.push('bridgeOff'),
    zap: () => rec.sounds.push('zap'),
    mine: () => rec.sounds.push('mine'),
    slowHeal: () => rec.sounds.push('slowHeal'),
    fullHeal: () => rec.sounds.push('fullHeal'),
  };
  const banner: BannerSink = {
    show: (text, sub, color) => rec.banners.push({ text, sub, color }),
    popup: (text, color) => rec.popups.push({ text, color }),
  };
  const fx: FxTargets = {
    particles: { emit: (p) => rec.particles.push(p) },
    damageNumbers: {
      add: (x, y, amount, color, prefix) =>
        rec.numbers.push(prefix ? { x, y, amount, color, prefix } : { x, y, amount, color }),
    },
    shake: { add: (intensity, duration) => rec.shakes.push({ intensity, duration }) },
    hitFlash: { add: (id, duration) => rec.flashes.push({ id, duration }) },
    screenFlash: {
      show: () => {
        rec.screenFlashes += 1;
      },
    },
    healFlash: {
      show: () => {
        rec.healFlashes += 1;
      },
    },
    killFeed: { add: (e) => rec.feed.push(e) },
    banner,
    pickups: { add: (line) => rec.pickupLines.push(line) },
    sound,
    turrets: { aim: (trainId, carriage, angle) => rec.turrets.push({ trainId, carriage, angle }) },
    zaps: { add: (points) => rec.zaps.push(points) },
  };
  return { fx, rec };
}

function scene() {
  const world = new World({
    seed: 3,
    initialTrailers: 0,
    initialEnemies: 0,
    maxTrailers: 0,
    maxEnemies: 0,
    boss: false,
  });
  const me = world.addTrain({ name: 'You', color: '#4a9eff', x: 1000, y: 1000, angle: 0 });
  const rival = world.addTrain({
    name: 'IronWolf',
    color: '#ff6666',
    x: 1200,
    y: 1000,
    angle: 0,
    controller: 'bot',
  });
  const far = world.addTrain({ name: 'Faraway', x: 4000, y: 4000, controller: 'bot' });
  const view = viewFromWorld(world, me.id);
  const names = new NameBook();
  names.observe(view);
  const ctx: FxContext = { view, names, size: MAP_SIZE, rand: () => 0.5 };
  return { me, rival, far, view, ctx };
}

describe('applyEvents', () => {
  it('shows a damage number, flash, and damage sound when the local train is hit', () => {
    const { me, ctx } = scene();
    const { fx, rec } = recorder();
    const hit: SimEvent = {
      type: 'hit',
      victimKind: 'train',
      victimId: me.id,
      attackerKind: 'enemy',
      attackerId: 99,
      amount: 12,
      x: 1005,
      y: 998,
    };

    applyEvents([hit], ctx, fx);

    expect(rec.numbers).toEqual([{ x: 1005, y: 998, amount: 12, color: '#ff8800' }]);
    expect(rec.screenFlashes).toBe(1);
    expect(rec.sounds).toContain('damage');
    expect(rec.flashes).toContainEqual({ id: me.id, duration: 0.2 });
  });

  it('does not flash the screen when another train is hit', () => {
    const { rival, ctx } = scene();
    const { fx, rec } = recorder();

    applyEvents(
      [
        {
          type: 'hit',
          victimKind: 'train',
          victimId: rival.id,
          attackerKind: 'train',
          attackerId: 1,
          amount: 7,
          x: 1200,
          y: 1000,
        },
      ],
      ctx,
      fx,
    );

    expect(rec.screenFlashes).toBe(0);
    expect(rec.sounds).not.toContain('damage');
    expect(rec.numbers).toHaveLength(1);
    expect(rec.flashes).toContainEqual({ id: rival.id, duration: 0.2 });
  });

  it('puts killer and victim names in the kill feed', () => {
    const { me, rival, ctx } = scene();
    const { fx, rec } = recorder();

    applyEvents(
      [
        {
          type: 'trainDestroyed',
          victimId: rival.id,
          cause: 'weapon',
          killerTrainId: me.id,
          x: 1200,
          y: 1000,
        },
      ],
      ctx,
      fx,
    );

    expect(rec.feed).toHaveLength(1);
    expect(rec.feed[0]).toMatchObject({
      killer: 'You',
      victim: 'IronWolf',
      weapon: 'shot',
      style: 'normal',
    });
    // The local player scored it, so they get the kill popup but no death effects.
    expect(rec.popups).toHaveLength(1);
    expect(rec.shakes).toHaveLength(0);
  });

  it('shakes, flashes, and plays the death sound when the local train is destroyed', () => {
    const { me, rival, ctx } = scene();
    const { fx, rec } = recorder();

    applyEvents(
      [
        {
          type: 'trainDestroyed',
          victimId: me.id,
          cause: 'weapon',
          killerTrainId: rival.id,
          x: 1000,
          y: 1000,
        },
      ],
      ctx,
      fx,
    );

    expect(rec.shakes).toEqual([{ intensity: 25, duration: 1.0 }]);
    expect(rec.screenFlashes).toBe(1);
    expect(rec.sounds).toContain('death');
    expect(rec.feed[0]).toMatchObject({ killer: 'IronWolf', victim: 'You' });
    expect(rec.particles.length).toBeGreaterThanOrEqual(60);
    expect(rec.banners).toEqual([{ text: 'Destroyed by IronWolf', sub: '', color: '#ff4444' }]);
  });

  it('shows a ram in the kill feed with the body owner as killer', () => {
    const { me, rival, ctx } = scene();
    const { fx, rec } = recorder();

    applyEvents(
      [
        {
          type: 'trainDestroyed',
          victimId: rival.id,
          cause: 'ram',
          killerTrainId: me.id,
          x: 1200,
          y: 1000,
        },
      ],
      ctx,
      fx,
    );

    expect(rec.feed).toHaveLength(1);
    expect(rec.feed[0]).toMatchObject({
      killer: 'You',
      victim: 'IronWolf',
      weapon: 'rammed',
      style: 'normal',
    });
    expect(rec.popups).toHaveLength(1);
  });

  it('tells a rammed local player who destroyed them', () => {
    const { me, rival, ctx } = scene();
    const { fx, rec } = recorder();

    applyEvents(
      [
        {
          type: 'trainDestroyed',
          victimId: me.id,
          cause: 'ram',
          killerTrainId: rival.id,
          x: 1000,
          y: 1000,
        },
      ],
      ctx,
      fx,
    );

    expect(rec.feed[0]).toMatchObject({ killer: 'IronWolf', victim: 'You', weapon: 'rammed' });
    expect(rec.banners.map((b) => b.text)).toEqual(['Destroyed by IronWolf']);
    expect(rec.popups).toHaveLength(0);
  });

  it('names an enemy in the notice, and falls back to "Wrecked" with no killer', () => {
    const { me, ctx } = scene();
    ctx.view.enemies.push({ id: 42, kind: 'sentry', x: 1000, y: 1000, angle: 0, hp: 1, maxHp: 1 });
    const { fx, rec } = recorder();

    applyEvents(
      [
        {
          type: 'trainDestroyed',
          victimId: me.id,
          cause: 'enemy',
          killerEnemyId: 42,
          x: 1000,
          y: 1000,
        },
        {
          type: 'trainDestroyed',
          victimId: me.id,
          cause: 'enemy',
          killerEnemyId: 77,
          x: 1000,
          y: 1000,
        },
        { type: 'trainDestroyed', victimId: me.id, cause: 'enemy', x: 1000, y: 1000 },
      ],
      ctx,
      fx,
    );

    expect(rec.banners.map((b) => b.text)).toEqual([
      'Destroyed by Sentry',
      'Destroyed by an enemy',
      'Wrecked',
    ]);
    expect(rec.feed[0]).toMatchObject({ killer: 'Sentry', victim: 'You', weapon: 'destroyed' });
    expect(rec.feed[1]).toMatchObject({ killer: 'An enemy', victim: 'You' });
    expect(rec.feed[2]).toMatchObject({ victim: 'You', style: 'system' });
  });

  it('shows unattributed kills as system lines and never shakes for non-local deaths', () => {
    const { rival, ctx } = scene();
    const { fx, rec } = recorder();

    applyEvents(
      [
        {
          type: 'trainDestroyed',
          victimId: rival.id,
          cause: 'enemy',
          x: 1200,
          y: 1000,
        },
      ],
      ctx,
      fx,
    );

    expect(rec.feed[0]).toMatchObject({ victim: 'IronWolf', style: 'system' });
    expect(rec.shakes).toHaveLength(0);
  });

  it('is quiet for distant events but still draws their particles', () => {
    const { far, ctx } = scene();
    const { fx, rec } = recorder();

    applyEvents(
      [
        {
          type: 'enemyDestroyed',
          enemyId: 7,
          enemyKind: 'hunter',
          sourceId: far.id,
          x: 4000,
          y: 4000,
        },
        {
          type: 'fired',
          weapon: 'laser',
          ownerKind: 'train',
          ownerId: far.id,
          x: 4000,
          y: 4000,
          angle: 0,
        },
      ],
      ctx,
      fx,
    );

    expect(rec.sounds).toEqual([]);
    expect(rec.particles.length).toBeGreaterThan(0);
  });

  it('plays shot sounds from the local train regardless of distance', () => {
    const { me, ctx } = scene();
    const { fx, rec } = recorder();

    applyEvents(
      [
        {
          type: 'fired',
          weapon: 'missile',
          ownerKind: 'train',
          ownerId: me.id,
          x: 1000,
          y: 1000,
          angle: 0,
        },
      ],
      ctx,
      fx,
    );

    expect(rec.sounds).toEqual(['shoot:missile']);
  });

  it('announces the boss with a banner and shake, and its defeat to the local killer', () => {
    const { me, ctx } = scene();
    const { fx, rec } = recorder();

    applyEvents(
      [
        { type: 'bossSpawn', enemyId: 5, name: 'OVERLORD', x: 3000, y: 3000 },
        { type: 'bossDown', enemyId: 5, name: 'OVERLORD', sourceId: me.id, x: 3000, y: 3000 },
      ],
      ctx,
      fx,
    );

    expect(rec.banners.map((b) => b.text)).toEqual(['⚠ OVERLORD ⚠', 'BOSS DOWN!']);
    expect(rec.sounds).toContain('bossSpawn');
    expect(rec.feed.map((f) => f.style)).toEqual(['system', 'boss']);
    expect(rec.shakes.map((s) => s.intensity)).toEqual([15, 20]);
  });

  it("turns a tail gunner's turret toward what it just shot at", () => {
    const { rival, ctx } = scene();
    const { fx, rec } = recorder();
    const fired = (carriage?: number): SimEvent => ({
      type: 'fired',
      weapon: 'bullet',
      ownerKind: 'train',
      ownerId: rival.id,
      x: 1180,
      y: 1000,
      angle: 3,
      ...(carriage === undefined ? {} : { carriage }),
    });
    applyEvents([fired(), fired(2)], ctx, fx);
    expect(rec.turrets).toEqual([{ trainId: rival.id, carriage: 2, angle: 3 }]);
  });

  it('draws a zap arc along the chain and crackles when in earshot', () => {
    const { rival, far, ctx } = scene();
    const { fx, rec } = recorder();
    const zap = (ownerId: number, x: number, y: number): SimEvent => ({
      type: 'zap',
      ownerId,
      points: [
        [x, y],
        [x + 100, y],
        [x + 150, y + 60],
      ],
      x,
      y,
    });
    applyEvents([zap(rival.id, 1200, 1000)], ctx, fx);
    expect(rec.zaps).toEqual([
      [
        [1200, 1000],
        [1300, 1000],
        [1350, 1060],
      ],
    ]);
    expect(rec.sounds).toEqual(['zap']);
    applyEvents([zap(far.id, 4000, 4000)], ctx, fx);
    expect(rec.zaps).toHaveLength(2);
    expect(rec.sounds).toEqual(['zap']);
  });

  it('explodes a mine on screen with particles, a thump, and a shake when close', () => {
    const { rival, far, ctx } = scene();
    const { fx, rec } = recorder();
    applyEvents(
      [{ type: 'mineExploded', mineId: 50, ownerId: rival.id, x: 1100, y: 1000 }],
      ctx,
      fx,
    );
    expect(rec.particles.length).toBeGreaterThan(0);
    expect(rec.particles.every((p) => Math.abs(p.x - 1100) < 20)).toBe(true);
    expect(rec.sounds).toEqual(['mine']);
    expect(rec.shakes).toHaveLength(1);

    const quiet = recorder();
    applyEvents(
      [{ type: 'mineExploded', mineId: 51, ownerId: far.id, x: 1600, y: 1000 }],
      ctx,
      quiet.fx,
    );
    expect(quiet.rec.particles.length).toBeGreaterThan(0);
    expect(quiet.rec.sounds).toEqual(['mine']);
    expect(quiet.rec.shakes).toHaveLength(0);
  });

  it('plays pickup and bridge sounds only for the local train', () => {
    const { me, rival, ctx } = scene();
    const { fx, rec } = recorder();

    applyEvents(
      [
        { type: 'bridgeOn', trainId: rival.id, x: 1200, y: 1000 },
        { type: 'bridgeOn', trainId: me.id, x: 1000, y: 1000 },
        {
          type: 'pickup',
          trainId: rival.id,
          pickupId: 1,
          carriage: 'mg',
          source: 'trailer',
          added: true,
          x: 1200,
          y: 1000,
        },
        {
          type: 'pickup',
          trainId: me.id,
          pickupId: 2,
          carriage: 'laser',
          source: 'drop',
          added: true,
          x: 1000,
          y: 1000,
        },
      ],
      ctx,
      fx,
    );

    expect(rec.sounds).toEqual(['bridgeOn', 'pickup']);
  });

  describe('pickup popup lines', () => {
    const pickup = (trainId: number, carriage: PickupKind, added = true): SimEvent => ({
      type: 'pickup',
      trainId,
      pickupId: 1,
      carriage,
      source: 'trailer',
      added,
      x: 1000,
      y: 1000,
    });

    /** The scene's view with the local train holding exactly these carriages. */
    function holding(kinds: CarriageKind[]) {
      const { me, rival, ctx } = scene();
      const view: WorldView = {
        ...ctx.view,
        trains: ctx.view.trains.map((t) =>
          t.id === me.id
            ? { ...t, carriages: kinds.map((kind) => ({ kind, x: 0, y: 0, angle: 0 })) }
            : t,
        ),
      };
      return { me, rival, ctx: { ...ctx, view } };
    }

    it('gives count 1 for the first of a type', () => {
      const { me, ctx } = holding(['locomotive', 'laser']);
      const { fx, rec } = recorder();

      applyEvents([pickup(me.id, 'laser')], ctx, fx);

      expect(rec.pickupLines).toEqual([{ kind: 'laser', count: 1, full: false }]);
    });

    it('gives the train count for a duplicate', () => {
      const { me, ctx } = holding(['locomotive', 'laser', 'mg', 'laser', 'laser']);
      const { fx, rec } = recorder();

      applyEvents([pickup(me.id, 'laser')], ctx, fx);

      expect(rec.pickupLines).toEqual([{ kind: 'laser', count: 3, full: false }]);
    });

    it('counts two same-type pickups in one batch as 1 then 2', () => {
      const { me, ctx } = holding(['locomotive', 'shield', 'shield']);
      const { fx, rec } = recorder();

      applyEvents([pickup(me.id, 'shield'), pickup(me.id, 'shield')], ctx, fx);

      expect(rec.pickupLines.map((l) => l.count)).toEqual([1, 2]);
    });

    it('marks a pickup that added nothing as full', () => {
      const { me, ctx } = holding(['locomotive', 'mg']);
      const { fx, rec } = recorder();

      applyEvents([pickup(me.id, 'missile', false)], ctx, fx);

      expect(rec.pickupLines).toEqual([{ kind: 'missile', count: 0, full: true }]);
    });

    it('never counts below 1 when the view is a carriage behind', () => {
      const { me, ctx } = holding(['locomotive']);
      const { fx, rec } = recorder();

      applyEvents([pickup(me.id, 'laser')], ctx, fx);

      expect(rec.pickupLines).toEqual([{ kind: 'laser', count: 1, full: false }]);
    });

    it('adds no line for a rival or a bot', () => {
      const { rival, ctx } = holding(['locomotive', 'laser']);
      const { fx, rec } = recorder();

      applyEvents([pickup(rival.id, 'laser'), pickup(rival.id, 'mg', false)], ctx, fx);

      expect(rec.pickupLines).toEqual([]);
    });
  });

  it('shows heart particles, a green +250, a green flash, and the full-heal sound', () => {
    const { me, ctx } = scene();
    const { fx, rec } = recorder();
    const heart: SimEvent = {
      type: 'heart',
      trainId: me.id,
      heartId: 77,
      kind: 'full',
      amount: 250,
      x: 1010,
      y: 1004,
    };

    applyEvents([heart], ctx, fx);

    expect(rec.particles.length).toBeGreaterThan(0);
    expect(rec.particles.every((p) => p.type === 'heart')).toBe(true);
    expect(rec.numbers).toEqual([
      { x: 1010, y: 1004, amount: 250, color: HEAL_COLOR, prefix: '+' },
    ]);
    expect(rec.healFlashes).toBe(1);
    expect(rec.screenFlashes).toBe(0);
    expect(rec.sounds).toEqual(['fullHeal']);
  });

  it('plays the slow-heal sound without a flash for a slow heart', () => {
    const { me, ctx } = scene();
    const { fx, rec } = recorder();
    applyEvents(
      [{ type: 'heart', trainId: me.id, heartId: 78, kind: 'slow', amount: 60, x: 1, y: 2 }],
      ctx,
      fx,
    );
    expect(rec.numbers[0]).toMatchObject({ amount: 60, prefix: '+' });
    expect(rec.healFlashes).toBe(0);
    expect(rec.sounds).toEqual(['slowHeal']);
  });

  it("shows another train's heart without a flash or sound", () => {
    const { rival, ctx } = scene();
    const { fx, rec } = recorder();
    applyEvents(
      [{ type: 'heart', trainId: rival.id, heartId: 79, kind: 'full', amount: 0, x: 1, y: 2 }],
      ctx,
      fx,
    );
    expect(rec.particles.length).toBeGreaterThan(0);
    expect(rec.numbers).toEqual([]);
    expect(rec.healFlashes).toBe(0);
    expect(rec.sounds).toEqual([]);
  });
});
