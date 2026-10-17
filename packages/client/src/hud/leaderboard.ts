import type { WorldView } from '@lw/shared';
import type { Board, BoardRow } from '../source.ts';

/** Rows the panel shows before the local player's own row. */
export const BOARD_SIZE = 10;

export interface LeaderboardRowModel {
  rank: number;
  id: number;
  name: string;
  best: number;
  now: number;
  bot: boolean;
  me: boolean;
}

export interface LocalScore {
  id: number;
  name: string;
  best: number;
  now: number;
}

/** The local player's live numbers, from the view. Null before their train exists. */
export function localScoreOf(view: WorldView): LocalScore | null {
  const t = view.trains.find((x) => x.id === view.localId);
  if (!t) return null;
  const now = Math.max(0, t.carriages.length - 1);
  return { id: t.id, name: t.name, best: Math.max(t.roundBest, now), now };
}

/**
 * Ranks the trains in a view by round best. For sources that have no server-side ranking
 * (offline play, where every train's round best is known).
 */
export function boardFromView(view: WorldView): Board {
  const rows: BoardRow[] = view.trains.map((t) => {
    const now = t.alive ? Math.max(0, t.carriages.length - 1) : 0;
    return {
      id: t.id,
      name: t.name,
      best: Math.max(t.roundBest, now),
      now,
      bot: t.controller === 'bot',
    };
  });
  rows.sort((a, b) => b.best - a.best || a.id - b.id);
  const rank = rows.findIndex((r) => r.id === view.localId) + 1;
  return { rows: rows.slice(0, BOARD_SIZE), rank };
}

/**
 * The rows to show: the board's top rows, with the local player's row highlighted using their
 * live numbers, and appended with their rank when they are outside the top.
 */
export function leaderboardModel(
  board: Board | null,
  local: LocalScore | null,
  bots: ReadonlySet<number> = new Set(),
): LeaderboardRowModel[] {
  if (!board) return [];
  const rows: LeaderboardRowModel[] = board.rows.map((r, i) => {
    const me = local !== null && r.id === local.id;
    return {
      rank: i + 1,
      id: r.id,
      name: r.name,
      best: me ? Math.max(r.best, local.best) : r.best,
      now: me ? local.now : r.now,
      bot: r.bot || bots.has(r.id),
      me,
    };
  });
  if (local && board.rank > 0 && !rows.some((r) => r.me)) {
    rows.push({
      rank: board.rank,
      id: local.id,
      name: local.name,
      best: local.best,
      now: local.now,
      bot: false,
      me: true,
    });
  }
  return rows;
}

function el(tag: string, className: string, text: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

/** Renders the leaderboard rows into the panel; names go in as text, never as markup. */
export class LeaderboardView {
  private last = '';

  constructor(private readonly container: HTMLElement) {}

  render(rows: readonly LeaderboardRowModel[]): void {
    const key = JSON.stringify(rows);
    if (key === this.last) return;
    this.last = key;
    this.container.replaceChildren(
      ...rows.map((r) => {
        const row = document.createElement('div');
        row.className = r.me ? 'row me' : 'row';
        const name = el('span', 'name', r.name);
        if (r.bot) name.append(el('span', 'bot-tag', 'BOT'));
        row.append(
          el('span', 'rank', String(r.rank)),
          name,
          el('span', 'score', String(r.best)),
          el('span', 'now', String(r.now)),
        );
        return row;
      }),
    );
  }
}
