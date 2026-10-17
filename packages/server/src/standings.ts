import { compareRank, scoreOf } from '@lw/shared';
import type { LeaderRow, StandingRow, TrainState } from '@lw/shared';

/** Rows in the live leaderboard. */
export const LEADERBOARD_SIZE = 10;

/** One train's result for a finished round. */
export interface Standing {
  id: number;
  name: string;
  bot: boolean;
  roundBest: number;
  kills: number;
}

/** What a finished round produced; passed to the `onRoundEnd` hook. */
export interface RoundResult {
  roundId: number;
  /** Every train, best first. */
  standings: Standing[];
  winnerId: number | null;
}

/** Trains in rank order: round best, then who got there first, then id. */
export function rankTrains(trains: readonly TrainState[]): TrainState[] {
  return [...trains].sort(compareRank);
}

/** Live score for display: a destroyed train is about to restart at the starter length. */
function liveScore(t: TrainState): number {
  return t.alive ? scoreOf(t) : 0;
}

export function buildLeaderboard(ranked: readonly TrainState[]): LeaderRow[] {
  return ranked
    .slice(0, LEADERBOARD_SIZE)
    .map((t): LeaderRow => [
      t.id,
      t.name,
      t.roundBest,
      liveScore(t),
      t.controller === 'bot' ? 1 : 0,
    ]);
}

/** 1-based rank of a train, or 0 when it is not ranked. */
export function rankOf(ranked: readonly TrainState[], id: number): number {
  const i = ranked.findIndex((t) => t.id === id);
  return i < 0 ? 0 : i + 1;
}

export function buildResult(roundId: number, ranked: readonly TrainState[]): RoundResult {
  const standings = ranked.map((t): Standing => ({
    id: t.id,
    name: t.name,
    bot: t.controller === 'bot',
    roundBest: t.roundBest,
    kills: t.kills,
  }));
  return { roundId, standings, winnerId: standings[0]?.id ?? null };
}

export function standingRows(result: RoundResult): StandingRow[] {
  return result.standings.map((s): StandingRow => [
    s.id,
    s.name,
    s.bot ? 1 : 0,
    s.roundBest,
    s.kills,
  ]);
}
