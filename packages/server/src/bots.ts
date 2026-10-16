import { BOT_NAMES } from '@lw/shared';
import type { World } from '@lw/shared';

/**
 * Temporary bot population: keeps a fixed number of bot trains in the world, replacing any that
 * are destroyed. Change 06 replaces this with configurable bot fill.
 */
export const BOT_COUNT = 6;

export function maintainBots(world: World, count: number): void {
  let bots = 0;
  for (const train of [...world.state.trains]) {
    if (train.controller !== 'bot') continue;
    // A destroyed bot has already dropped its pickups; just clear it away.
    if (!train.alive) world.removeTrain(train.id);
    else bots += 1;
  }
  for (; bots < count; bots++) {
    const taken = new Set(world.state.trains.map((t) => t.name));
    const free = BOT_NAMES.filter((n) => !taken.has(n));
    const pool = free.length > 0 ? free : BOT_NAMES;
    const name = pool[world.rng.int(0, pool.length)] ?? `Bot ${bots + 1}`;
    world.addTrain({
      name,
      controller: 'bot',
      carriages: Array.from({ length: world.rng.int(2, 6) }, () => world.randomPickupKind()),
    });
  }
}
