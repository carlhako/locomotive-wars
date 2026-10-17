import { BOT_NAMES, clamp, compareRank } from '@lw/shared';
import type { TrainState, World } from '@lw/shared';

export interface BotFill {
  fillTo: number;
  min: number;
  max: number;
}

/** How many bots the world should hold with this many humans connected. */
export function botTarget(fill: BotFill, humans: number): number {
  return clamp(fill.fillTo - humans, fill.min, fill.max);
}

/**
 * Keeps the number of bot trains near `clamp(fillTo - humans, min, max)`: adds one a second when
 * short, never removes a living bot mid-round, lets destroyed bots go instead of respawning when
 * over, and trims the rest at round reset.
 */
export class BotPopulation {
  /** Ticks since the last bot was added, capped at one second. */
  private sinceAdd: number;

  constructor(
    private readonly world: World,
    private readonly fill: BotFill,
    private readonly tickRate: number,
  ) {
    this.sinceAdd = tickRate;
  }

  get count(): number {
    return this.bots().length;
  }

  /** Runs once per playing tick, before the world steps. */
  update(humans: number): void {
    const target = botTarget(this.fill, humans);
    let count = this.bots().length;
    for (const bot of this.bots()) {
      if (bot.alive) continue;
      // A destroyed bot has already dropped its pickups; it comes back only while the world
      // wants this many bots.
      if (count > target) {
        this.world.removeTrain(bot.id);
        count -= 1;
      } else {
        this.world.respawnTrain(bot.id);
      }
    }
    if (this.sinceAdd < this.tickRate) this.sinceAdd += 1;
    if (count < target && this.sinceAdd >= this.tickRate) {
      this.sinceAdd = 0;
      this.add();
    }
  }

  /** Removes bots beyond the target, the lowest-ranked first. Call before a round reset. */
  trimExcess(humans: number): void {
    const target = botTarget(this.fill, humans);
    const worstFirst = this.bots().sort((a, b) => compareRank(b, a));
    for (let n = worstFirst.length; n > target; n--) {
      const bot = worstFirst.shift();
      if (bot) this.world.removeTrain(bot.id);
    }
  }

  private bots(): TrainState[] {
    return this.world.state.trains.filter((t) => t.controller === 'bot');
  }

  private add(): void {
    this.world.addTrain({ name: this.freeName(), controller: 'bot' });
  }

  /** A bot name not in use by any train, drawn from the shared list. */
  private freeName(): string {
    const taken = new Set(this.world.state.trains.map((t) => t.name));
    const free = BOT_NAMES.filter((n) => !taken.has(n));
    if (free.length > 0) return free[this.world.rng.int(0, free.length)] as string;
    for (let n = taken.size + 1; ; n++) {
      const name = `Bot ${n}`;
      if (!taken.has(name)) return name;
    }
  }
}
