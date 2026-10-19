import { describe, expect, it } from 'vitest';
import { emptyWorld } from './testing.ts';
import { World } from './world.ts';

/** 32-bit FNV-1a of a string, as 8 hex digits. */
function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** One tick of a world as text: every train's input and motion, plus the pickup and enemy counts. */
function tickDigest(world: World): string {
  const s = world.state;
  const trains = s.trains.map((t) => {
    const i = t.input;
    return [
      t.id,
      i.turn,
      i.boost ? 1 : 0,
      i.brake ? 1 : 0,
      i.fire ? 1 : 0,
      i.aimX,
      i.aimY,
      t.x,
      t.y,
      t.angle,
      t.hull,
      t.alive ? 1 : 0,
      t.carriages.length,
    ].join(',');
  });
  return `${s.tick}|${trains.join(';')}|${s.trailers.length},${s.enemies.length},${s.drops.length}`;
}

/** The soak world from `bot.test.ts`: 8 bots with mixed starting carriages on a fixed seed. */
function botWorld(botSkill: number): World {
  const world = new World({ seed: 12345, botSkill });
  for (let i = 0; i < 8; i++) {
    world.addTrain({
      protectedFor: 0,
      controller: 'bot',
      carriages: Array.from({ length: 2 + (i % 4) }, () => world.randomPickupKind()),
    });
  }
  return world;
}

describe('bot skill', () => {
  it('defaults to 0.7', () => {
    expect(new World().options.botSkill).toBe(0.7);
  });

  it('is clamped to [0, 1]', () => {
    expect(new World({ botSkill: 1.5 }).options.botSkill).toBe(1);
    expect(new World({ botSkill: -1 }).options.botSkill).toBe(0);
    expect(new World({ botSkill: 0.4 }).options.botSkill).toBe(0.4);
  });

  it('new and respawned trains start with no coil, lapse, or block', () => {
    const world = emptyWorld();
    const bot = world.addTrain({ controller: 'bot' });
    expect(bot.ai).toMatchObject({ coilTurn: 0, lapseTimer: 0, blocked: false });
    bot.ai.coilTurn = 1;
    bot.ai.lapseTimer = 0.3;
    bot.ai.blocked = true;
    world.respawnTrain(bot.id);
    expect(bot.ai).toMatchObject({ coilTurn: 0, lapseTimer: 0, blocked: false });
  });

  it('skill 0 matches the pre-skill controller', () => {
    const world = botWorld(0);
    // A hash per tick keeps the snapshot small while still showing the first tick that differs.
    const hashes: string[] = [];
    for (let i = 0; i < 600; i++) {
      world.step();
      hashes.push(fnv1a(tickDigest(world)));
    }
    expect({ hashes, final: tickDigest(world) }).toMatchSnapshot();
  });
});
