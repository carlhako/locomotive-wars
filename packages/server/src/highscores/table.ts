/** One row of the all-time table. */
export interface HighScoreEntry {
  /**
   * `<run>-r<roundId>-<n>`: `run` tells server starts apart (round ids restart at 1), and `n` is
   * the entry's place in that round's standings, which breaks ties.
   */
  id: string;
  name: string;
  /** The player's round best: the longest their train reached in the round. */
  score: number;
  /** ISO 8601 time the round ended. */
  achievedAt: string;
  roundId: number;
}

/** Makes an entry id from the server run, the round, and the player's place in its standings (0-based). */
export function entryId(run: string, roundId: number, place: number): string {
  return `${run}-r${roundId}-${place}`;
}

function place(entry: HighScoreEntry): number {
  const n = Number(entry.id.slice(entry.id.lastIndexOf('-') + 1));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Table order: higher score first; at equal scores the earlier achievement; at the same moment
 * (two players in one round) the better place in that round's standings.
 */
export function compareEntries(a: HighScoreEntry, b: HighScoreEntry): number {
  if (a.score !== b.score) return b.score - a.score;
  const time = Date.parse(a.achievedAt) - Date.parse(b.achievedAt);
  if (time !== 0) return time;
  if (a.roundId !== b.roundId) return a.roundId - b.roundId;
  return place(a) - place(b);
}

/**
 * Whether a round best earns a place: it must be above 0, and the table must have a free slot
 * or the score must be strictly higher than the lowest entry.
 */
export function qualifies(
  entries: readonly HighScoreEntry[],
  size: number,
  score: number,
): boolean {
  if (!(score > 0)) return false;
  if (entries.length < size) return true;
  const lowest = entries[entries.length - 1];
  return !lowest || score > lowest.score;
}

export interface InsertResult {
  /** The new table, ranked and cut to `size`. */
  entries: HighScoreEntry[];
  /** The candidates that earned a place, in the order given. */
  added: HighScoreEntry[];
}

/**
 * Adds one round's candidates (best first) to the table. Each is checked against the table as it
 * stands once the earlier ones are in, so a candidate that a better one has just pushed out does
 * not count. The result is ranked and trimmed to `size`.
 */
export function insertEntries(
  entries: readonly HighScoreEntry[],
  size: number,
  candidates: readonly HighScoreEntry[],
): InsertResult {
  let table = [...entries].sort(compareEntries).slice(0, size);
  for (const c of candidates) {
    if (!qualifies(table, size, c.score)) continue;
    table = [...table, c].sort(compareEntries).slice(0, size);
  }
  const kept = new Set(table.map((e) => e.id));
  return { entries: table, added: candidates.filter((c) => kept.has(c.id)) };
}

/** 1-based rank of an entry, or 0 when it is not in the table. */
export function rankOfEntry(entries: readonly HighScoreEntry[], id: string): number {
  const i = entries.findIndex((e) => e.id === id);
  return i < 0 ? 0 : i + 1;
}
