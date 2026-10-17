import type { SimEvent, TrainInput, WorldView } from '@lw/shared';

/** Where the round stands, for the timer and the intermission overlay. */
export interface RoundStatus {
  phase: 'playing' | 'intermission';
  roundId: number;
  /** Seconds until the phase ends, never negative. */
  secondsLeft: number;
}

export interface BoardRow {
  id: number;
  name: string;
  /** Round best. */
  best: number;
  /** Live score (current length). */
  now: number;
  bot: boolean;
}

/** The leaderboard as ranked by the source: the top rows, and the local player's own rank. */
export interface Board {
  rows: BoardRow[];
  /** 1-based rank of the local player; 0 when unranked. */
  rank: number;
}

export interface StandingInfo {
  id: number;
  name: string;
  bot: boolean;
  best: number;
  kills: number;
}

/** The final standings of the round that just ended. */
export interface RoundResultInfo {
  roundId: number;
  winnerId: number | null;
  /** Best first. */
  standings: StandingInfo[];
}

export interface HighScoreRowInfo {
  id: string;
  name: string;
  score: number;
}

/** The all-time table, best first, with the entries this round added. */
export interface HighScoresInfo {
  rows: HighScoreRowInfo[];
  highlightIds: string[];
}

/** Why the server refused a high score name. */
export type HighScoreFailure = 'invalid' | 'used' | 'expired' | 'error';

/** The player's own result earned a place in the table; they may name the entry. */
export interface HighScoreOffer {
  /** 1-based rank in the table. */
  rank: number;
  /** Round best: carriages behind the locomotive at the longest. */
  score: number;
  /** `ready` to submit, `saving` while waiting for the server, `saved`, or `failed` with a reason. */
  state: 'ready' | 'saving' | 'saved' | 'failed';
  failure?: HighScoreFailure;
}

/**
 * Where the client's world comes from. Offline play steps a local simulation; the online client
 * (change 04) will implement the same interface over network snapshots. Everything downstream
 * of this interface, rendering and effects included, is shared between the two.
 */
export interface GameSource {
  /** Side length of the (square, wrapping) world. */
  readonly mapSize: number;
  /**
   * Changes whenever the world is replaced (an offline restart, a new round, a reconnect), so
   * presentation state tied to the old world can be dropped. Entity ids may repeat across worlds.
   */
  readonly generation: number;
  /**
   * Advances the session by `dt` real seconds, with `input` as the player's controls, and
   * returns the simulation events that occurred in that time.
   */
  advance(dt: number, input: TrainInput): SimEvent[];
  /** The view to draw right now (interpolated between simulation steps). */
  view(): WorldView;
  /**
   * Names and colours of trains the source knows about even when they are not in the view, so
   * events that mention a distant train (a kill) can still name it.
   */
  knownTrains?(): Iterable<{ id: number; name: string; color: string }>;
  /** Round phase and time left. Absent when the source has no rounds (offline play). */
  round?(): RoundStatus | null;
  /** The ranked leaderboard. Without it the client ranks the trains in the view. */
  board?(): Board | null;
  /** The standings of the round that just ended, while the intermission lasts. */
  roundResult?(): RoundResultInfo | null;
  /** The all-time high score table, while the intermission lasts. */
  highscores?(): HighScoresInfo | null;
  /** The player's invitation to name a new high score entry, while the intermission lasts. */
  highScoreOffer?(): HighScoreOffer | null;
  /** Sends the name for the offered entry. Does nothing without an offer that can be answered. */
  submitHighScoreName?(name: string): void;
  /** Whole seconds until the player is kicked for inactivity, or null when not warned. */
  idleWarning?(): number | null;
}
