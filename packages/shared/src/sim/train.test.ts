import { describe, expect, it } from 'vitest';
import { destroyTrain, damageTrain } from './combat.ts';
import { BASE_SPEED, BOOST_SPEED, TURN_RATE } from './constants.ts';
import { wrapDist } from './math.ts';
import { emptyWorld, ofType, run } from './testing.ts';
import { maxHullOf, pickupRadiusOf } from './train.ts';

const DT = 1 / 30;

describe('train control input', () => {
  it('turning changes heading by the turn rate', () => {
    const world = emptyWorld();
    const train = world.addTrain({ protectedFor: 0, carriages: [], x: 3000, y: 3000, angle: 0 });
    world.setInput(train.id, { turn: 1 });
    run(world, 30);
    expect(train.angle).toBeCloseTo(TURN_RATE, 6);
  });

  it('keeps the last input when none arrives', () => {
    const world = emptyWorld();
    const train = world.addTrain({ protectedFor: 0, carriages: [], x: 3000, y: 3000, angle: 0 });
    world.setInput(train.id, { boost: true });
    run(world, 10);
    expect(train.boosting).toBe(true);
    expect(train.fuel).toBeLessThan(100);
  });

  it('merges partial inputs and clamps turn', () => {
    const world = emptyWorld();
    const train = world.addTrain({ protectedFor: 0, carriages: [], angle: 1 });
    world.setInput(train.id, { turn: 5, boost: true });
    world.setInput(train.id, { aim: 2 });
    expect(train.input).toEqual({ turn: 1, boost: true, brake: false, fire: false, aim: 2 });
    world.setInput(train.id, { turn: Number.NaN, aim: Infinity });
    expect(train.input.turn).toBe(1);
    expect(train.input.aim).toBe(2);
  });
});

describe('movement, boost, and brake', () => {
  it('moves at base speed', () => {
    const world = emptyWorld();
    const train = world.addTrain({ protectedFor: 0, carriages: [], x: 1000, y: 1000, angle: 0 });
    run(world, 30);
    expect(train.x).toBeCloseTo(1000 + BASE_SPEED, 6);
  });

  it('boost drains fuel to zero in about 3.6 seconds, then moves at base speed', () => {
    const world = emptyWorld();
    const train = world.addTrain({ protectedFor: 0, carriages: [], x: 1000, y: 3000, angle: 0 });
    world.setInput(train.id, { boost: true });
    let ticks = 0;
    while (train.fuel > 0 && ticks < 1000) {
      world.step();
      ticks++;
    }
    expect(ticks * DT).toBeGreaterThan(3.5);
    expect(ticks * DT).toBeLessThan(3.7);

    // Still holding boost with an empty tank: base speed, not a flicker of boosts.
    for (let i = 0; i < 20; i++) {
      const before = train.x;
      world.step();
      expect(train.x - before).toBeCloseTo(BASE_SPEED * DT, 6);
      expect(train.boosting).toBe(false);
    }
  });

  it('boost moves at boost speed while fuel lasts', () => {
    const world = emptyWorld();
    const train = world.addTrain({ protectedFor: 0, carriages: [], x: 1000, y: 1000, angle: 0 });
    world.setInput(train.id, { boost: true });
    world.step();
    expect(train.x - 1000).toBeCloseTo(BOOST_SPEED * DT, 6);
  });

  it('boosting again needs the boost input to be released first', () => {
    const world = emptyWorld();
    const train = world.addTrain({ protectedFor: 0, carriages: [], x: 1000, y: 1000, angle: 0 });
    world.setInput(train.id, { boost: true });
    run(world, 120);
    expect(train.boostLocked).toBe(true);
    world.setInput(train.id, { boost: false });
    run(world, 30);
    expect(train.fuel).toBeGreaterThan(10);
    world.setInput(train.id, { boost: true });
    world.step();
    expect(train.boosting).toBe(true);
  });

  it('regenerates fuel at 12 per second when not boosting', () => {
    const world = emptyWorld();
    const train = world.addTrain({ protectedFor: 0, carriages: [], x: 1000, y: 1000, angle: 0 });
    train.fuel = 20;
    run(world, 30);
    expect(train.fuel).toBeCloseTo(32, 6);
  });

  it('brake halves the distance travelled', () => {
    const world = emptyWorld();
    const free = world.addTrain({ protectedFor: 0, carriages: [], x: 1000, y: 1000, angle: 0 });
    const braked = world.addTrain({ protectedFor: 0, carriages: [], x: 1000, y: 2000, angle: 0 });
    world.setInput(braked.id, { brake: true });
    run(world, 30);
    expect(braked.x - 1000).toBeCloseTo((free.x - 1000) / 2, 6);
  });

  it('wraps across the map edge', () => {
    const world = emptyWorld({ tickRate: 18 });
    const train = world.addTrain({ protectedFor: 0, carriages: [], x: 5995, y: 100, angle: 0 });
    world.step();
    // 180 units/s at 18 Hz is 10 units per tick.
    expect(train.x).toBeCloseTo(5, 6);
  });
});

describe('carriages', () => {
  it('starts with a locomotive laid out behind the head', () => {
    const world = emptyWorld();
    const train = world.addTrain({
      protectedFor: 0,
      x: 1000,
      y: 1000,
      angle: 0,
      carriages: ['mg', 'shield'],
    });
    expect(train.carriages.map((c) => c.kind)).toEqual(['locomotive', 'mg', 'shield']);
    expect(train.carriages[0]?.x).toBeCloseTo(982);
    expect(train.carriages[2]?.x).toBeCloseTo(946);
  });

  it('keeps carriages 18 units apart while boosting', () => {
    const world = emptyWorld();
    const train = world.addTrain({
      protectedFor: 0,
      x: 1000,
      y: 1000,
      angle: 0,
      carriages: ['mg', 'mg', 'shield', 'armor', 'speed', 'fuel', 'magnet', 'laser', 'missile'],
    });
    world.setInput(train.id, { boost: true });
    run(world, 60);
    expect(train.carriages).toHaveLength(10);
    for (let i = 1; i < train.carriages.length; i++) {
      const a = train.carriages[i - 1]!;
      const b = train.carriages[i]!;
      expect(Math.abs(wrapDist(a.x, a.y, b.x, b.y, 6000) - 18)).toBeLessThan(1);
    }
  });

  it('places carriages the same at 30 Hz and 60 Hz on a straight run', () => {
    const positions = [30, 60].map((tickRate) => {
      const world = emptyWorld({ tickRate });
      const train = world.addTrain({
        protectedFor: 0,
        x: 1000,
        y: 1000,
        angle: 0,
        carriages: ['mg', 'mg', 'shield', 'armor', 'speed'],
      });
      world.setInput(train.id, { boost: true });
      run(world, tickRate); // one second
      return train.carriages.map((c) => c.x);
    });
    positions[0]!.forEach((x, i) => {
      expect(Math.abs(x - positions[1]![i]!)).toBeLessThan(1);
    });
  });

  it('applies carriage effects', () => {
    const world = emptyWorld();
    const train = world.addTrain({
      protectedFor: 0,
      carriages: ['armor', 'speed', 'speed', 'fuel', 'magnet', 'drones'],
    });
    expect(train.armorBonus).toBe(35);
    expect(train.speedBonus).toBeCloseTo(0.14);
    expect(train.fuelBonus).toBeCloseTo(0.3);
    expect(pickupRadiusOf(train)).toBe(32 + 14);
    expect(train.drones).toHaveLength(1);
  });

  it('computes max hull as 80 plus 35 per carriage behind the locomotive plus armor', () => {
    const world = emptyWorld();
    const plain = world.addTrain({ protectedFor: 0, carriages: [] });
    expect(maxHullOf(plain)).toBe(80);
    expect(plain.maxHull).toBe(80);
    const armored = world.addTrain({
      protectedFor: 0,
      carriages: ['mg', 'armor', 'armor', 'shield'],
    });
    expect(armored.maxHull).toBe(80 + 4 * 35 + 2 * 35);
  });

  it('speed carriages raise speed', () => {
    const world = emptyWorld();
    const train = world.addTrain({
      protectedFor: 0,
      x: 1000,
      y: 1000,
      angle: 0,
      carriages: ['speed'],
    });
    run(world, 30);
    expect(train.x - 1000).toBeCloseTo(BASE_SPEED * 1.07, 6);
  });

  it('shield reduction is capped at 70%', () => {
    const world = emptyWorld();
    const train = world.addTrain({ protectedFor: 0, carriages: Array(10).fill('shield') });
    train.hull = 500;
    train.maxHull = 500;
    damageTrain(world, train, 100, null);
    expect(train.hull).toBeCloseTo(470);
  });

  it('consumes a pickup at the carriage limit without adding a carriage', () => {
    const world = emptyWorld({ maxCarriages: 4 });
    const train = world.addTrain({
      protectedFor: 0,
      x: 1000,
      y: 1000,
      angle: 0,
      carriages: ['mg', 'mg', 'mg'],
    });
    expect(train.carriages).toHaveLength(4);
    world.spawnTrailer(1020, 1000, 'laser');
    const events = run(world, 2);
    expect(world.state.trailers).toHaveLength(0);
    expect(train.carriages).toHaveLength(4);
    const pickups = ofType(events, 'pickup');
    expect(pickups).toHaveLength(1);
    expect(pickups[0]?.added).toBe(false);
  });
});

describe('bridge', () => {
  it('survives crossing its own trail and reports an active bridge', () => {
    const world = emptyWorld();
    const train = world.addTrain({
      protectedFor: 0,
      x: 3000,
      y: 3000,
      angle: 0,
      carriages: Array(19).fill('mg'),
    });
    expect(train.carriages).toHaveLength(20);
    world.setInput(train.id, { turn: 1 });
    // A full-lock circle at base speed has a 50-unit radius, so the head laps its own tail.
    const events = run(world, 150);
    expect(train.alive).toBe(true);
    expect(ofType(events, 'bridgeOn').length).toBeGreaterThan(0);
    expect(train.hull).toBeGreaterThan(0);
  });

  it('is not active on a straight run', () => {
    const world = emptyWorld();
    const train = world.addTrain({
      protectedFor: 0,
      x: 500,
      y: 500,
      angle: 0,
      carriages: Array(10).fill('mg'),
    });
    run(world, 30);
    expect(train.bridgeActive).toBe(false);
  });
});

describe('hull, regeneration, and destruction', () => {
  it('regenerates hull slowly', () => {
    const world = emptyWorld();
    const train = world.addTrain({ protectedFor: 0, carriages: ['mg', 'mg'] });
    train.hull = 10;
    run(world, 30);
    expect(train.hull).toBeCloseTo(10.25, 6);
  });

  it('never regenerates above max hull', () => {
    const world = emptyWorld();
    const train = world.addTrain({ protectedFor: 0, carriages: [] });
    run(world, 60);
    expect(train.hull).toBe(train.maxHull);
  });

  it('drops half its carriages when destroyed', () => {
    const world = emptyWorld();
    const train = world.addTrain({ protectedFor: 0, carriages: Array(9).fill('mg') });
    expect(train.carriages).toHaveLength(10);
    damageTrain(world, train, 10_000, { kind: 'enemy', id: 77 });
    expect(train.alive).toBe(false);
    expect(world.state.drops).toHaveLength(5);
  });

  it('emits a destroyed event naming the source', () => {
    const world = emptyWorld();
    const victim = world.addTrain({
      protectedFor: 0,
      x: 3000,
      y: 3000,
      carriages: Array(9).fill('mg'),
    });
    victim.hull = 1;
    const drone = world.spawnEnemy('drone', 3004, 3000);
    const events = world.step();
    const destroyed = ofType(events, 'trainDestroyed');
    expect(destroyed).toHaveLength(1);
    expect(destroyed[0]?.victimId).toBe(victim.id);
    expect(destroyed[0]?.cause).toBe('enemy');
    expect(destroyed[0]?.killerEnemyId).toBe(drone.id);
    expect(destroyed[0]?.killerTrainId).toBeUndefined();
    expect(victim.alive).toBe(false);
    expect(world.state.drops).toHaveLength(5);
  });

  it('is idempotent: destroying a dead train does nothing', () => {
    const world = emptyWorld();
    const train = world.addTrain({ protectedFor: 0, carriages: Array(9).fill('mg') });
    destroyTrain(world, train, 'enemy', null);
    const drops = world.state.drops.length;
    destroyTrain(world, train, 'enemy', null);
    expect(world.state.drops).toHaveLength(drops);
  });
});
