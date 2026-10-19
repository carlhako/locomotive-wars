import type { SimEvent, WorldOptions } from './types.ts';
import { World } from './world.ts';

/** Test helpers; not part of the package's public API and excluded from the build. */

/** A world with no trailers, enemies, world hearts, replenishment, or boss, for isolated scenarios. */
export function emptyWorld(options: WorldOptions = {}): World {
  return new World({
    seed: 1,
    initialTrailers: 0,
    initialEnemies: 0,
    maxTrailers: 0,
    maxEnemies: 0,
    boss: false,
    maxSlowHearts: 0,
    maxFullHearts: 0,
    ...options,
  });
}

/** Steps the world `ticks` times and returns every event emitted, in order. */
export function run(world: World, ticks: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) events.push(...world.step());
  return events;
}

/** Events of one type, narrowed. */
export function ofType<T extends SimEvent['type']>(
  events: SimEvent[],
  type: T,
): Extract<SimEvent, { type: T }>[] {
  return events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);
}
