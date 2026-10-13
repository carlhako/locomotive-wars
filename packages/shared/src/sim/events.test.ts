import { describe, expect, it } from 'vitest';
import type { SimEvent } from './types.ts';
import { emptyWorld, ofType, run } from './testing.ts';
import { World } from './world.ts';

describe('event stream', () => {
  it('reports a hit with victim, attacker, amount, and position', () => {
    const world = emptyWorld();
    const victim = world.addTrain({ x: 2000, y: 2000, angle: Math.PI / 2 });
    world.state.projectiles.push({
      id: 9000,
      kind: 'bullet',
      x: 1980,
      y: 2000,
      vx: 600,
      vy: 0,
      damage: 7,
      life: 1,
      splash: 0,
      ownerKind: 'enemy',
      ownerId: 4242,
    });
    const hits = ofType(world.step(), 'hit');
    expect(hits).toHaveLength(1);
    const hit = hits[0]!;
    expect(hit.victimId).toBe(victim.id);
    expect(hit.victimKind).toBe('train');
    expect(hit.attackerId).toBe(4242);
    expect(hit.attackerKind).toBe('enemy');
    expect(hit.amount).toBe(7);
    expect(Number.isFinite(hit.x)).toBe(true);
    expect(hit.x).toBeGreaterThan(1980);
    expect(hit.x).toBeLessThan(2015);
    expect(hit.y).toBeCloseTo(2000, 0);
  });

  it('orders events within a tick: hit before destroyed', () => {
    const world = emptyWorld();
    const victim = world.addTrain({ x: 2000, y: 2000, angle: Math.PI / 2 });
    victim.hull = 1;
    world.state.projectiles.push({
      id: 9000,
      kind: 'bullet',
      x: 1980,
      y: 2000,
      vx: 600,
      vy: 0,
      damage: 7,
      life: 1,
      splash: 0,
      ownerKind: 'train',
      ownerId: 5,
    });
    const types = world.step().map((e) => e.type);
    expect(types.indexOf('hit')).toBeGreaterThanOrEqual(0);
    expect(types.indexOf('trainDestroyed')).toBeGreaterThan(types.indexOf('hit'));
  });

  it('returns a fresh list each tick', () => {
    const world = emptyWorld();
    world.addTrain({ x: 1000, y: 1000, angle: 0 });
    world.spawnTrailer(1020, 1000, 'mg');
    const first = world.step();
    const second = world.step();
    expect(first.length).toBeGreaterThan(0);
    expect(second).toHaveLength(0);
  });

  it('shows the full range of event types in a two-minute bot soak', () => {
    const world = new World({ seed: 777 });
    for (let i = 0; i < 8; i++) {
      world.addTrain({
        controller: 'bot',
        carriages: ['mg', 'laser', 'missile', 'shield', 'drones'].slice(0, 2 + (i % 4)) as never,
      });
    }
    const seen = new Set<SimEvent['type']>();
    for (let i = 0; i < 30 * 120; i++) for (const e of world.step()) seen.add(e.type);
    const types = [...seen].sort();
    // Types that must show up in a busy two-minute world with a boss scheduled at 80 s.
    for (const expected of ['fired', 'hit', 'pickup', 'enemyDestroyed', 'bossSpawn'] as const) {
      expect(types).toContain(expected);
    }
  });

  it('carries positions inside the map on every positional event', () => {
    const world = new World({ seed: 31 });
    for (let i = 0; i < 6; i++) world.addTrain({ controller: 'bot', carriages: ['mg', 'laser'] });
    for (const e of run(world, 30 * 40)) {
      if ('x' in e) {
        expect(e.x).toBeGreaterThanOrEqual(0);
        expect(e.x).toBeLessThan(6000);
        expect(e.y).toBeGreaterThanOrEqual(0);
        expect(e.y).toBeLessThan(6000);
      }
    }
  });
});
