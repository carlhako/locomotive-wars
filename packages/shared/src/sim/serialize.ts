import type { World } from './world.ts';

/**
 * Stable text form of the entire world state, including the random generator. Two worlds that
 * were built and stepped identically serialize identically, which is what determinism tests
 * compare. Key order is fixed by construction here, not by the state objects.
 */
export function serializeWorld(world: World): string {
  const s = world.state;
  return JSON.stringify({
    tick: s.tick,
    time: s.time,
    rng: world.rng.state,
    nextId: s.nextId,
    trailerTimer: s.trailerTimer,
    enemyTimer: s.enemyTimer,
    bossTimer: s.bossTimer,
    bossId: s.bossId,
    trains: s.trains,
    enemies: s.enemies,
    projectiles: s.projectiles,
    trailers: s.trailers,
    drops: s.drops,
  });
}
