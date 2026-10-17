import { randomUUID } from 'node:crypto';
import { cleanName } from '@lw/shared';
import type { HighScoresMsg, HsFailReason, HsResultMsg, ServerMessage } from '@lw/shared';
import type { HighScoreStore } from './store.ts';
import { entryId, insertEntries, rankOfEntry } from './table.ts';
import type { HighScoreEntry } from './table.ts';

/** A human whose round result may earn a place. `place` is their 0-based place in the standings. */
export interface RoundCandidate<S> {
  session: S;
  name: string;
  score: number;
  place: number;
}

/** What the service needs from the server to talk to players. */
export interface HighScoreHost<S> {
  send(session: S, msg: ServerMessage): void;
  broadcast(msg: ServerMessage): void;
}

export interface HighScoreServiceOptions<S> {
  store: HighScoreStore;
  /** Most entries kept (`highscores.size`). */
  size: number;
  host: HighScoreHost<S>;
  log?: (message: string) => void;
  now?: () => Date;
  /** Makes the one-time tokens. */
  newToken?: () => string;
  /** Tells this server run's entry ids apart from earlier runs'. */
  run?: string;
}

/** A row of `GET /api/highscores`. */
export interface HighScoreApiRow {
  rank: number;
  name: string;
  score: number;
  achievedAt: string;
}

interface Token<S> {
  entryId: string;
  session: S;
  roundId: number;
  used: boolean;
}

/**
 * The all-time table in play. At round end it adds each qualifying human's result under their
 * join name and offers them a one-time token to rename it; `rename` checks the token. Scores come
 * only from the round's standings, never from a client.
 */
export class HighScoreService<S> {
  private table: HighScoreEntry[] = [];
  /** The round whose intermission is open for renaming; null while a round is being played. */
  private openRound: number | null = null;
  private highlightIds: string[] = [];
  private tokens = new Map<string, Token<S>>();
  /** The previous round's tokens, kept so a late submission is told it expired. */
  private expired = new Map<string, Token<S>>();
  private readonly inflight = new Set<Promise<unknown>>();
  private readonly log: (message: string) => void;
  private readonly now: () => Date;
  private readonly newToken: () => string;
  private readonly run: string;

  constructor(private readonly opts: HighScoreServiceOptions<S>) {
    this.log = opts.log ?? ((m) => console.log(m));
    this.now = opts.now ?? (() => new Date());
    this.newToken = opts.newToken ?? randomUUID;
    this.run = opts.run ?? Date.now().toString(36);
  }

  /** Reads the saved table. Call once before the server starts listening. */
  async load(): Promise<void> {
    this.table = (await this.opts.store.load()).slice(0, this.opts.size);
  }

  get entries(): readonly HighScoreEntry[] {
    return this.table;
  }

  /** The table as `GET /api/highscores` returns it. */
  apiRows(): HighScoreApiRow[] {
    return this.table.map((e, i) => ({
      rank: i + 1,
      name: e.name,
      score: e.score,
      achievedAt: e.achievedAt,
    }));
  }

  /** The table and this round's new entries, as sent to clients. */
  message(): HighScoresMsg {
    return {
      t: 'highscores',
      entries: this.table.map((e) => [e.id, e.name, e.score]),
      highlightIds: this.highlightIds,
    };
  }

  /**
   * Adds the round's qualifying results (best first), saves, tells each new entry's owner how to
   * rename it, and sends everyone the table. Resolves once that is done.
   */
  roundEnded(roundId: number, candidates: readonly RoundCandidate<S>[]): Promise<void> {
    return this.track(this.processRound(roundId, candidates));
  }

  private async processRound(
    roundId: number,
    candidates: readonly RoundCandidate<S>[],
  ): Promise<void> {
    const achievedAt = this.now().toISOString();
    const made = candidates.map((c) => ({
      c,
      entry: {
        id: entryId(this.run, roundId, c.place),
        name: c.name,
        score: c.score,
        achievedAt,
        roundId,
      } satisfies HighScoreEntry,
    }));
    const { entries, added } = insertEntries(
      this.table,
      this.opts.size,
      made.map((m) => m.entry),
    );
    this.table = entries;
    this.openRound = roundId;
    this.highlightIds = added.map((e) => e.id);

    if (added.length > 0) {
      try {
        await this.opts.store.save(entries);
      } catch (e) {
        this.log(`error: could not save high scores: ${errText(e)}`);
      }
    }
    // The next round may have started while the file was written.
    if (this.openRound !== roundId) return;

    const kept = new Set(added.map((e) => e.id));
    for (const { c, entry } of made) {
      if (!kept.has(entry.id)) continue;
      const token = this.newToken();
      this.tokens.set(token, { entryId: entry.id, session: c.session, roundId, used: false });
      this.opts.host.send(c.session, {
        t: 'hsEligible',
        token,
        rank: rankOfEntry(this.table, entry.id),
        score: entry.score,
      });
    }
    this.opts.host.broadcast(this.message());
  }

  /** Renames a session's own entry. Resolves with the reply to send back to that session. */
  rename(session: S, token: string, rawName: string): Promise<HsResultMsg> {
    return this.track(this.processRename(session, token, rawName));
  }

  private async processRename(session: S, token: string, rawName: string): Promise<HsResultMsg> {
    const held = this.tokens.get(token) ?? this.expired.get(token);
    // Another session's token looks the same as an unknown one: it says nothing about who holds it.
    if (!held || held.session !== session) return fail('invalid');
    if (held.used) return fail('used');
    if (this.openRound !== held.roundId) return fail('expired');
    const index = this.table.findIndex((e) => e.id === held.entryId);
    const entry = this.table[index];
    if (!entry) return fail('expired');

    // Used up front, so a second submission arriving while the file is written is refused.
    held.used = true;
    const name = cleanName(rawName) || entry.name;
    if (name === entry.name) return { t: 'hsResult', ok: true };

    const before = this.table;
    this.table = before.map((e, i) => (i === index ? { ...e, name } : e));
    try {
      await this.opts.store.save(this.table);
    } catch (e) {
      this.log(`error: could not save high scores: ${errText(e)}`);
      // Undo, so the table everyone sees is the table on disk, and let them try again.
      this.table = before;
      held.used = false;
      return fail('error');
    }
    this.opts.host.broadcast(this.message());
    return { t: 'hsResult', ok: true };
  }

  /** A new round has begun: the intermission is over, so tokens stop working. */
  roundStarted(): void {
    this.openRound = null;
    this.highlightIds = [];
    this.expired = this.tokens;
    this.tokens = new Map();
  }

  /** Resolves when every save started so far has finished. */
  async settled(): Promise<void> {
    while (this.inflight.size > 0) await Promise.allSettled([...this.inflight]);
  }

  private track<T>(promise: Promise<T>): Promise<T> {
    this.inflight.add(promise);
    const done = () => this.inflight.delete(promise);
    promise.then(done, done);
    return promise;
  }
}

function fail(reason: HsFailReason): HsResultMsg {
  return { t: 'hsResult', ok: false, reason };
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
