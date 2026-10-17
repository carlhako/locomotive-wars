import { describe, expect, it } from 'vitest';
import type { RoundResultInfo } from '../source.ts';
import { countdownText, standingsModel } from './roundOverlay.ts';

const result: RoundResultInfo = {
  roundId: 4,
  winnerId: 8,
  standings: [
    { id: 8, name: 'IronWolf', bot: true, best: 52, kills: 3 },
    { id: 5, name: 'Casey', bot: false, best: 31, kills: 1 },
    { id: 9, name: 'Vortex', bot: true, best: 12, kills: 0 },
  ],
};

describe('standingsModel', () => {
  it('ranks every train, marks bots, the winner, and the local player', () => {
    const m = standingsModel(result, 5)!;
    expect(m.winner).toBe('IronWolf');
    expect(m.rows.map((r) => [r.rank, r.name, r.bot, r.best, r.kills, r.me, r.winner])).toEqual([
      [1, 'IronWolf', true, 52, 3, false, true],
      [2, 'Casey', false, 31, 1, true, false],
      [3, 'Vortex', true, 12, 0, false, false],
    ]);
  });

  it('has no winner for an empty round, and is null without a result', () => {
    expect(standingsModel({ roundId: 1, winnerId: null, standings: [] }, 1)).toEqual({
      winner: null,
      rows: [],
    });
    expect(standingsModel(null, 1)).toBeNull();
  });
});

describe('countdownText', () => {
  it('rounds up to whole seconds', () => {
    expect(countdownText(12)).toBe('Next round in 12s');
    expect(countdownText(11.2)).toBe('Next round in 12s');
    expect(countdownText(-1)).toBe('Next round in 0s');
  });
});
