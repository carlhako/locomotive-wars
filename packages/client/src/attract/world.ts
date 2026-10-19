import { BOT_NAMES, viewFromWorld, World } from '@lw/shared';
import type { PickupKind, SimEvent, WorldOptions, WorldView } from '@lw/shared';
import { interpolateView } from '../interpolate.ts';

/**
 * The home screen's background: a bots-only world tuned for spectacle. A small map, plenty of
 * shooters and enemies, and long, weapon-heavy trains keep bullets in the air. Nothing here
 * touches the DOM; `scene.ts` draws it.
 */

/** Bots in the background world. */
export const ATTRACT_BOTS = 8;
/** Fewest and most carriages behind the locomotive a bot starts (and comes back) with. */
export const ATTRACT_MIN_CARRIAGES = 20;
export const ATTRACT_MAX_CARRIAGES = 40;
/** A train must be this many carriages longer than the followed one to take the camera. */
export const LEADER_MARGIN = 3;

export const ATTRACT_WORLD: WorldOptions = {
  // Bots fire only within 550 of their head, so density is what makes the bullets.
  mapSize: 3000,
  // A 150-car train would nearly span the map.
  maxCarriages: 60,
  initialEnemies: 18,
  maxEnemies: 24,
  initialTrailers: 30,
  maxTrailers: 40,
};

/**
 * The carriage mix: mostly the guns that put the most projectiles in the air (MG, flak), some
 * variety, and a few support cars so the trains still look like trains. Cloak has nothing to
 * show without a minimap and mines clutter a small map, so both are left out.
 */
export const ATTRACT_MIX: readonly { kind: PickupKind; weight: number }[] = [
  { kind: 'mg', weight: 4 },
  { kind: 'flak', weight: 3 },
  { kind: 'missile', weight: 1.5 },
  { kind: 'laser', weight: 1.5 },
  { kind: 'tailgun', weight: 1 },
  { kind: 'tesla', weight: 1 },
  { kind: 'armor', weight: 0.6 },
  { kind: 'shield', weight: 0.5 },
  { kind: 'speed', weight: 0.4 },
  { kind: 'fuel', weight: 0.3 },
  { kind: 'repair', weight: 0.3 },
];

/** Carriages that shoot, with or without fire input. */
export const ATTRACT_WEAPONS: ReadonlySet<PickupKind> = new Set([
  'mg',
  'flak',
  'missile',
  'laser',
  'tailgun',
  'tesla',
]);

/** Longest real time a single frame may add to the accumulator (a tab that was backgrounded). */
const MAX_FRAME = 0.25;

/** What `pickLeader` needs of a train; both `TrainState` and `TrainView` fit. */
export interface LeaderCandidate {
  id: number;
  alive: boolean;
  carriages: readonly unknown[];
}

/**
 * The train the camera should follow: the longest living one if the current one is dead or
 * gone, otherwise the current one unless another is at least `LEADER_MARGIN` carriages longer.
 * Ties go to the lowest id. Null when no train is alive.
 */
export function pickLeader(
  trains: readonly LeaderCandidate[],
  currentId: number | null,
): number | null {
  let best: LeaderCandidate | null = null;
  for (const t of trains) {
    if (!t.alive) continue;
    if (
      !best ||
      t.carriages.length > best.carriages.length ||
      (t.carriages.length === best.carriages.length && t.id < best.id)
    )
      best = t;
  }
  if (!best) return null;
  const current = trains.find((t) => t.id === currentId && t.alive);
  if (current && best.carriages.length - current.carriages.length < LEADER_MARGIN)
    return current.id;
  return best.id;
}

export interface AttractWorldOptions {
  /** World seed. Defaults to the current time so every visit differs. */
  seed?: number;
}

/**
 * The background world: bots stepped at the fixed tick rate from a time accumulator (as
 * `OfflineSession` does), destroyed bots brought back long under the same identity, and the
 * id of the train the camera follows.
 */
export class AttractWorld {
  readonly world: World;
  /** The train the camera follows, or null when none is alive. */
  leaderId: number | null = null;
  private accumulator = 0;
  private prev: WorldView;
  private curr: WorldView;

  constructor(opts: AttractWorldOptions = {}) {
    const world = new World({ ...ATTRACT_WORLD, seed: opts.seed ?? Date.now() >>> 0 });
    const names = [...BOT_NAMES];
    for (let i = 0; i < ATTRACT_BOTS; i++) {
      const name = names.splice(world.rng.int(0, names.length), 1)[0] ?? `Bot ${i + 1}`;
      // No protection at the start, so the firing begins at once.
      world.addTrain({
        name,
        controller: 'bot',
        carriages: this.carriageSet(world),
        protectedFor: 0,
      });
    }
    this.world = world;
    this.leaderId = pickLeader(world.state.trains, null);
    // Id 0 is never a train, so the view has no local train.
    this.curr = viewFromWorld(world, 0);
    this.prev = this.curr;
  }

  get mapSize(): number {
    return this.world.rules.size;
  }

  /** Steps the world for `dt` seconds of real time and returns the events of the ticks run. */
  advance(dt: number): SimEvent[] {
    const events: SimEvent[] = [];
    const tickDt = this.world.dt;
    this.accumulator += Math.min(Math.max(dt, 0), MAX_FRAME);
    while (this.accumulator >= tickDt) {
      this.accumulator -= tickDt;
      this.reviveDead();
      for (const e of this.world.step()) events.push(e);
      this.leaderId = pickLeader(this.world.state.trains, this.leaderId);
      this.prev = this.curr;
      this.curr = viewFromWorld(this.world, 0);
    }
    return events;
  }

  view(): WorldView {
    const alpha = this.accumulator / this.world.dt;
    return interpolateView(this.prev, this.curr, alpha, this.world.rules.size);
  }

  /**
   * Re-adds each destroyed bot as a fresh long train. Re-adding, rather than `respawnTrain` and
   * `addCarriage`, sets the hull for the full length; the same id keeps it the same train to the
   * camera and the effects. Default spawn protection stops it dying straight away in a fight.
   */
  private reviveDead(): void {
    for (const t of [...this.world.state.trains]) {
      if (t.alive) continue;
      const { id, name, color, controller } = t;
      this.world.removeTrain(id);
      this.world.addTrain({ id, name, color, controller, carriages: this.carriageSet(this.world) });
    }
  }

  private carriageSet(world: World): PickupKind[] {
    const count = world.rng.int(ATTRACT_MIN_CARRIAGES, ATTRACT_MAX_CARRIAGES + 1);
    return Array.from(
      { length: count },
      () => world.rng.weighted(ATTRACT_MIX, (m) => m.weight).kind,
    );
  }
}
