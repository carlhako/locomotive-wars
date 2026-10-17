import { describe, expect, it } from 'vitest';
import { viewFromWorld, World } from '@lw/shared';
import type { Board, BoardRow } from '../source.ts';
import { boardFromView, leaderboardModel, localScoreOf } from './leaderboard.ts';

function row(id: number, best: number, over: Partial<BoardRow> = {}): BoardRow {
  return { id, name: `P${id}`, best, now: best, bot: false, ...over };
}

function topTen(): BoardRow[] {
  return Array.from({ length: 10 }, (_, i) => row(100 + i, 50 - i));
}

describe('leaderboardModel', () => {
  it('lists the top rows with ranks, best and now, marking bots', () => {
    const board: Board = {
      rows: [row(1, 40, { bot: true, now: 12 }), row(2, 30)],
      rank: 2,
    };
    const rows = leaderboardModel(board, { id: 2, name: 'P2', best: 30, now: 30 });
    expect(rows).toEqual([
      { rank: 1, id: 1, name: 'P1', best: 40, now: 12, bot: true, me: false },
      { rank: 2, id: 2, name: 'P2', best: 30, now: 30, bot: false, me: true },
    ]);
  });

  it('appends the local player with their rank when they are outside the top 10', () => {
    const board: Board = { rows: topTen(), rank: 14 };
    const rows = leaderboardModel(board, { id: 7, name: 'Me', best: 9, now: 4 });
    expect(rows).toHaveLength(11);
    expect(rows.slice(0, 10).every((r) => !r.me)).toBe(true);
    expect(rows[10]).toEqual({
      rank: 14,
      id: 7,
      name: 'Me',
      best: 9,
      now: 4,
      bot: false,
      me: true,
    });
  });

  it('adds no extra row when the local player is inside the top 10', () => {
    const board: Board = { rows: topTen(), rank: 3 };
    const rows = leaderboardModel(board, { id: 102, name: 'P102', best: 48, now: 48 });
    expect(rows).toHaveLength(10);
    expect(rows.filter((r) => r.me)).toHaveLength(1);
    expect(rows[2]?.me).toBe(true);
  });

  it('adds no extra row when the local player has no rank', () => {
    const board: Board = { rows: topTen(), rank: 0 };
    expect(leaderboardModel(board, { id: 7, name: 'Me', best: 1, now: 1 })).toHaveLength(10);
  });

  it('uses the live numbers for the local row', () => {
    const board: Board = { rows: [row(5, 10, { now: 10 })], rank: 1 };
    const rows = leaderboardModel(board, { id: 5, name: 'Me', best: 12, now: 11 });
    expect(rows[0]).toMatchObject({ best: 12, now: 11, me: true });
  });

  it('is empty without a board', () => {
    expect(leaderboardModel(null, null)).toEqual([]);
  });
});

describe('boardFromView', () => {
  it('ranks the trains of a view by round best (offline play)', () => {
    const w = new World({ seed: 3, initialTrailers: 0, initialEnemies: 0, boss: false });
    const me = w.addTrain({ name: 'Me' });
    w.addTrain({ name: 'Big', controller: 'bot', carriages: Array(9).fill('armor') });
    w.addTrain({ name: 'Mid', controller: 'bot', carriages: Array(4).fill('armor') });
    const view = viewFromWorld(w, me.id);
    const board = boardFromView(view);
    expect(board.rows.map((r) => r.name)).toEqual(['Big', 'Mid', 'Me']);
    expect(board.rows[0]).toMatchObject({ best: 9, bot: true });
    expect(board.rank).toBe(3);
    expect(localScoreOf(view)).toEqual({ id: me.id, name: 'Me', best: 1, now: 1 });
  });
});
