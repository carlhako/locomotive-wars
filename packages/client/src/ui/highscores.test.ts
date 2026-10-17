import { describe, expect, it } from 'vitest';
import {
  failureText,
  fetchHighScores,
  highScoreRows,
  offerEditable,
  offerStatus,
  offerTitle,
  parseHighScoresResponse,
} from './highscores.ts';
import type { HighScoreOffer } from '../source.ts';

describe('highScoreRows', () => {
  it('ranks the rows and marks this round’s entries', () => {
    const rows = highScoreRows({
      rows: [
        { id: 'a', name: 'CARL', score: 64 },
        { id: 'b', name: 'Ann', score: 40 },
      ],
      highlightIds: ['a'],
    });
    expect(rows).toEqual([
      { rank: 1, name: 'CARL', score: 64, fresh: true },
      { rank: 2, name: 'Ann', score: 40, fresh: false },
    ]);
  });

  it('is empty without a table', () => {
    expect(highScoreRows(null)).toEqual([]);
  });
});

describe('parseHighScoresResponse', () => {
  it('reads the API shape', () => {
    const info = parseHighScoresResponse({
      entries: [{ rank: 1, name: 'CARL', score: 64, achievedAt: '2026-10-20T19:04:11Z' }],
    });
    expect(info?.rows).toEqual([{ id: 'rank-1', name: 'CARL', score: 64 }]);
    expect(info?.highlightIds).toEqual([]);
  });

  it.each([null, 'x', {}, { entries: 'no' }, { entries: [{ rank: 1, name: 5, score: 3 }] }])(
    'rejects %j',
    (bad) => {
      expect(parseHighScoresResponse(bad)).toBeNull();
    },
  );
});

describe('fetchHighScores', () => {
  const respond = (body: unknown, ok = true): typeof fetch =>
    (() => Promise.resolve({ ok, json: () => Promise.resolve(body) })) as unknown as typeof fetch;

  it('returns the table', async () => {
    const info = await fetchHighScores(respond({ entries: [{ rank: 1, name: 'A', score: 2 }] }));
    expect(info?.rows).toHaveLength(1);
  });

  it('returns null on an error status, a bad body, or a network failure', async () => {
    expect(await fetchHighScores(respond({ entries: [] }, false))).toBeNull();
    expect(await fetchHighScores(respond({ nope: 1 }))).toBeNull();
    expect(
      await fetchHighScores((() => Promise.reject(new Error('down'))) as typeof fetch),
    ).toBeNull();
  });
});

describe('name entry text', () => {
  const offer = (over: Partial<HighScoreOffer> = {}): HighScoreOffer => ({
    rank: 3,
    score: 64,
    state: 'ready',
    ...over,
  });

  it('titles the prompt with rank and length', () => {
    expect(offerTitle(offer())).toBe('NEW HIGH SCORE #3 — 64 carriages');
    expect(offerTitle(offer({ score: 1 }))).toBe('NEW HIGH SCORE #3 — 1 carriage');
  });

  it('reports saving, saved, and failures', () => {
    expect(offerStatus(offer())).toBe('');
    expect(offerStatus(offer({ state: 'saving' }))).toBe('Saving…');
    expect(offerStatus(offer({ state: 'saved' }))).toBe('Saved');
    expect(offerStatus(offer({ state: 'failed', failure: 'expired' }))).toBe(
      failureText('expired'),
    );
  });

  it('allows editing until saved, and again after a server error only', () => {
    expect(offerEditable(offer())).toBe(true);
    expect(offerEditable(offer({ state: 'saving' }))).toBe(false);
    expect(offerEditable(offer({ state: 'saved' }))).toBe(false);
    expect(offerEditable(offer({ state: 'failed', failure: 'error' }))).toBe(true);
    expect(offerEditable(offer({ state: 'failed', failure: 'expired' }))).toBe(false);
  });
});
