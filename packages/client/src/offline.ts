import { BOT_NAMES, viewFromWorld, World } from '@lw/shared';
import type { SimEvent, TrainInput, WorldOptions, WorldView } from '@lw/shared';
import { interpolateView } from './interpolate.ts';
import type { GameSource } from './source.ts';

/** Bots alongside a single human, matching the reference's one-player game (line 1148). */
export const OFFLINE_BOTS = 6;
/** Seconds between the local train being destroyed and the session restarting. */
export const RESTART_DELAY = 1.5;
/** Longest real time a single frame may add to the accumulator (a tab that was backgrounded). */
const MAX_FRAME = 0.25;

export interface OfflineOptions {
  /** World seed. Defaults to the current time so every session differs. */
  seed?: number;
  bots?: number;
  restartDelay?: number;
  world?: WorldOptions;
}

/**
 * A browser-local game: the shared simulation stepped at its fixed tick rate from a time
 * accumulator, with the player's train plus bots. It exists to develop and test the client
 * without a server, and stays available as a practice mode.
 */
export class OfflineSession implements GameSource {
  private world!: World;
  private localId = 0;
  private accumulator = 0;
  private prev!: WorldView;
  private curr!: WorldView;
  private restartIn: number | null = null;
  private worldGeneration = 0;
  private readonly opts: OfflineOptions;

  constructor(opts: OfflineOptions = {}) {
    this.opts = opts;
    this.start();
  }

  get mapSize(): number {
    return this.world.rules.size;
  }

  get generation(): number {
    return this.worldGeneration;
  }

  /** Id of the player's train in the current world. */
  get playerId(): number {
    return this.localId;
  }

  get currentWorld(): World {
    return this.world;
  }

  /** (Re)creates the world with the player's train and bots. */
  start(): void {
    const world = new World({
      ...this.opts.world,
      seed: this.opts.seed ?? Date.now() >>> 0,
    });
    const rng = world.rng;
    const player = world.addTrain({
      name: 'You',
      color: '#4a9eff',
      controller: 'human',
      x: world.rules.size / 2,
      y: world.rules.size / 2,
      // A starting weapon and shield so the player is not helpless at spawn (reference 1124).
      carriages: ['mg', 'shield'],
    });
    const names = [...BOT_NAMES];
    for (let i = 0; i < (this.opts.bots ?? OFFLINE_BOTS); i++) {
      const name = names.splice(rng.int(0, names.length), 1)[0] ?? `Bot ${i + 1}`;
      const count = rng.int(2, 6);
      world.addTrain({
        name,
        controller: 'bot',
        carriages: Array.from({ length: count }, () => world.randomPickupKind()),
      });
    }
    this.world = world;
    this.worldGeneration += 1;
    this.localId = player.id;
    this.accumulator = 0;
    this.restartIn = null;
    this.curr = viewFromWorld(world, player.id);
    this.prev = this.curr;
  }

  advance(dt: number, input: TrainInput): SimEvent[] {
    const events: SimEvent[] = [];
    const tickDt = this.world.dt;
    this.accumulator += Math.min(Math.max(dt, 0), MAX_FRAME);
    while (this.accumulator >= tickDt) {
      this.accumulator -= tickDt;
      this.world.setInput(this.localId, input);
      const tickEvents = this.world.step();
      for (const e of tickEvents) events.push(e);
      this.prev = this.curr;
      this.curr = viewFromWorld(this.world, this.localId);

      if (this.restartIn === null) {
        const destroyed = tickEvents.some(
          (e) => e.type === 'trainDestroyed' && e.victimId === this.localId,
        );
        if (destroyed) this.restartIn = this.opts.restartDelay ?? RESTART_DELAY;
      } else {
        this.restartIn -= tickDt;
        if (this.restartIn <= 0) {
          this.start();
          break;
        }
      }
    }
    return events;
  }

  view(): WorldView {
    const alpha = this.accumulator / this.world.dt;
    return interpolateView(this.prev, this.curr, alpha, this.world.rules.size);
  }
}
