import { describe, expect, it } from 'vitest';
import { DEFAULT_BOT_SKILL } from './constants.ts';
import type { KillCause } from './types.ts';
import { World } from './world.ts';

// The shared package builds without Node or DOM types; vitest runs it in Node, which has this.
declare const console: { log(message: string): void };

/** Bots per run. */
const BOTS = 10;
/** Seconds simulated per run. */
const DURATION = 5 * 60;
/** Seconds a destroyed bot waits before respawning, as on the server. */
const RESPAWN_DELAY = 2;
const SEEDS = [1, 2, 3, 4, 5];

type Deaths = Record<KillCause, number>;

/** Deaths by cause over one all-bot run. */
function benchRun(seed: number, botSkill: number): Deaths {
  const world = new World({ seed, botSkill });
  for (let i = 0; i < BOTS; i++) world.addTrain({ controller: 'bot' });
  const deaths: Deaths = { ram: 0, weapon: 0, enemy: 0, boss: 0 };
  const respawnAt = new Map<number, number>();
  const ticks = DURATION * world.options.tickRate;
  for (let i = 0; i < ticks; i++) {
    for (const e of world.step()) {
      if (e.type !== 'trainDestroyed') continue;
      deaths[e.cause] += 1;
      respawnAt.set(e.victimId, world.state.tick + RESPAWN_DELAY * world.options.tickRate);
    }
    for (const [id, tick] of respawnAt) {
      if (tick > world.state.tick) continue;
      world.respawnTrain(id);
      respawnAt.delete(id);
    }
  }
  return deaths;
}

/** Deaths by cause summed over every seed. */
function benchSkill(botSkill: number): Deaths {
  const total: Deaths = { ram: 0, weapon: 0, enemy: 0, boss: 0 };
  for (const seed of SEEDS) {
    const d = benchRun(seed, botSkill);
    for (const cause of Object.keys(total) as KillCause[]) total[cause] += d[cause];
  }
  return total;
}

describe('bot skill benchmark', () => {
  it('halves ram deaths at the default skill', { timeout: 300_000 }, () => {
    const rows = [0, DEFAULT_BOT_SKILL, 1].map((skill) => ({ skill, ...benchSkill(skill) }));
    console.log(
      `${BOTS} bots, ${DURATION} s, seeds ${SEEDS.join(',')}: deaths by cause\n` +
        'skill  ram  weapon  enemy  boss  total\n' +
        rows
          .map(
            (r) =>
              `${r.skill.toFixed(1).padStart(5)}  ${String(r.ram).padStart(3)}  ` +
              `${String(r.weapon).padStart(6)}  ${String(r.enemy).padStart(5)}  ` +
              `${String(r.boss).padStart(4)}  ${String(r.ram + r.weapon + r.enemy + r.boss).padStart(5)}`,
          )
          .join('\n'),
    );
    const [base, def] = rows as [(typeof rows)[number], (typeof rows)[number]];
    expect(def.ram).toBeLessThanOrEqual(base.ram / 2);
  });
});
