import { describe, expect, it } from 'vitest';
import { emptyWorld, run } from './sim/testing.ts';
import { viewFromWorld } from './view.ts';

describe('viewFromWorld', () => {
  it('maps trains, trailers, and enemies with their positions', () => {
    const world = emptyWorld();
    const a = world.addTrain({
      protectedFor: 0,
      name: 'Alpha',
      x: 1000,
      y: 1500,
      angle: 0,
      carriages: ['mg'],
    });
    const b = world.addTrain({
      protectedFor: 0,
      carriages: [],
      name: 'Beta',
      x: 3000,
      y: 2500,
      angle: 1,
      controller: 'bot',
    });
    world.spawnTrailer(100, 200, 'laser');
    world.spawnTrailer(300, 400, 'shield');
    world.spawnTrailer(500, 600, 'fuel');
    world.spawnEnemy('hunter', 2000, 2100);

    const view = viewFromWorld(world, a.id);

    expect(view.localId).toBe(a.id);
    expect(view.tick).toBe(world.state.tick);
    expect(view.trains.map((t) => t.id)).toEqual([a.id, b.id]);
    expect(view.trains[0]).toMatchObject({
      name: 'Alpha',
      x: 1000,
      y: 1500,
      alive: true,
      controller: 'human',
    });
    expect(view.trains[0]?.carriages.map((c) => c.kind)).toEqual(['locomotive', 'mg']);
    expect(view.trains[1]).toMatchObject({ name: 'Beta', x: 3000, y: 2500, controller: 'bot' });
    expect(view.trailers.map((t) => [t.kind, t.x, t.y])).toEqual([
      ['laser', 100, 200],
      ['shield', 300, 400],
      ['fuel', 500, 600],
    ]);
    expect(view.enemies).toHaveLength(1);
    expect(view.enemies[0]).toMatchObject({ kind: 'hunter', x: 2000, y: 2100 });
  });

  it('reports hull and fuel for the HUD', () => {
    const world = emptyWorld();
    const t = world.addTrain({ protectedFor: 0, carriages: ['armor', 'fuel'] });
    t.hull = t.maxHull * 0.4;

    const v = viewFromWorld(world, t.id).trains[0]!;

    expect(v.hp / v.maxHp).toBeCloseTo(0.4);
    expect(v.maxHp).toBe(t.maxHull);
    expect(v.fuelMax).toBeGreaterThan(100);
    expect(v.carriages).toHaveLength(3);
  });

  it('marks exactly one living train as local on the minimap', () => {
    const world = emptyWorld();
    const me = world.addTrain({ protectedFor: 0, carriages: [], x: 100, y: 100 });
    world.addTrain({ protectedFor: 0, carriages: [], x: 2000, y: 2000, controller: 'bot' });
    world.addTrain({ protectedFor: 0, carriages: [], x: 4000, y: 4000, controller: 'bot' });

    const view = viewFromWorld(world, me.id);

    expect(view.minimap).toHaveLength(3);
    expect(view.minimap.filter((m) => m.isLocal)).toHaveLength(1);
    expect(view.minimap.find((m) => m.isLocal)?.id).toBe(me.id);
  });

  it('leaves destroyed trains off the minimap but in the train list', () => {
    const world = emptyWorld();
    const me = world.addTrain({ protectedFor: 0, carriages: [], x: 100, y: 100 });
    const dead = world.addTrain({
      protectedFor: 0,
      carriages: [],
      x: 2000,
      y: 2000,
      controller: 'bot',
    });
    dead.alive = false;

    const view = viewFromWorld(world, me.id);

    expect(view.trains.find((t) => t.id === dead.id)?.alive).toBe(false);
    expect(view.minimap.map((m) => m.id)).toEqual([me.id]);
  });

  it('is plain data that shares nothing with the world', () => {
    const world = emptyWorld({ initialEnemies: 3, maxEnemies: 3 });
    const me = world.addTrain({ protectedFor: 0, carriages: ['mg', 'drones'] });
    const view = viewFromWorld(world, me.id);
    const before = JSON.stringify(view);

    run(world, 30);

    expect(JSON.stringify(view)).toBe(before);
    expect(view.trains[0]?.drones).toHaveLength(1);
  });
});
