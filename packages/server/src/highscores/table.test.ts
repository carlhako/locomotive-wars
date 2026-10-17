import { describe, expect, it } from 'vitest';
import { compareEntries, entryId, insertEntries, qualifies, rankOfEntry } from './table.ts';
import type { HighScoreEntry } from './table.ts';

function entry(
  score: number,
  over: Partial<HighScoreEntry> & { place?: number } = {},
): HighScoreEntry {
  const roundId = over.roundId ?? 1;
  return {
    id: over.id ?? entryId('run', roundId, over.place ?? 0),
    name: over.name ?? `P${score}`,
    score,
    achievedAt: over.achievedAt ?? '2026-10-20T19:00:00.000Z',
    roundId,
  };
}

const MON = '2026-10-19T12:00:00.000Z';
const TUE = '2026-10-20T12:00:00.000Z';

describe('ranking', () => {
  it('puts the earlier of two equal scores first', () => {
    const monday = entry(50, { name: 'Mon', achievedAt: MON, roundId: 1 });
    const tuesday = entry(50, { name: 'Tue', achievedAt: TUE, roundId: 2 });
    const { entries } = insertEntries([tuesday], 10, [monday]);
    expect(entries.map((e) => e.name)).toEqual(['Mon', 'Tue']);
    expect([tuesday, monday].sort(compareEntries).map((e) => e.name)).toEqual(['Mon', 'Tue']);
  });

  it('orders by score first, whatever the dates', () => {
    const old = entry(10, { achievedAt: MON, roundId: 1 });
    const recent = entry(90, { achievedAt: TUE, roundId: 2 });
    expect([old, recent].sort(compareEntries)).toEqual([recent, old]);
  });

  it('orders equal scores in one round by their place in the standings', () => {
    const second = entry(40, { name: 'Second', place: 1 });
    const first = entry(40, { name: 'First', place: 0 });
    const tenth = entry(40, { name: 'Tenth', place: 10 });
    expect([tenth, second, first].sort(compareEntries).map((e) => e.name)).toEqual([
      'First',
      'Second',
      'Tenth',
    ]);
  });
});

describe('qualification', () => {
  const full = [entry(90, { place: 0 }), entry(60, { place: 1 }), entry(30, { place: 2 })];

  it('lets a result beat the lowest entry, which then drops off', () => {
    const { entries, added } = insertEntries(full, 3, [entry(42, { roundId: 2, name: 'New' })]);
    expect(entries.map((e) => e.score)).toEqual([90, 60, 42]);
    expect(added.map((e) => e.name)).toEqual(['New']);
    expect(entries.some((e) => e.score === 30)).toBe(false);
  });

  it('does not let a result equal to the lowest in', () => {
    expect(qualifies(full, 3, 30)).toBe(false);
    const { entries, added } = insertEntries(full, 3, [entry(30, { roundId: 2 })]);
    expect(entries).toEqual(full);
    expect(added).toEqual([]);
  });

  it('accepts anything above 0 while there is a free slot, and nothing at 0', () => {
    expect(qualifies([], 3, 1)).toBe(true);
    expect(qualifies(full.slice(0, 2), 3, 1)).toBe(true);
    expect(qualifies([], 3, 0)).toBe(false);
  });

  it('inserts both of two qualifiers at their ranks', () => {
    const a = entry(75, { roundId: 2, place: 0, name: 'A' });
    const b = entry(45, { roundId: 2, place: 1, name: 'B' });
    const { entries, added } = insertEntries(full, 4, [a, b]);
    expect(entries.map((e) => e.score)).toEqual([90, 75, 60, 45]);
    expect(added.map((e) => e.name)).toEqual(['A', 'B']);
    expect(rankOfEntry(entries, a.id)).toBe(2);
    expect(rankOfEntry(entries, b.id)).toBe(4);
  });

  it('does not count a candidate that an earlier one pushed out', () => {
    // Size 2 holding 30 and 20: both 60 and 25 beat the 20, but only one place opens.
    const table = [entry(30, { place: 0 }), entry(20, { place: 1 })];
    const a = entry(60, { roundId: 2, place: 0 });
    const b = entry(25, { roundId: 2, place: 1 });
    const { entries, added } = insertEntries(table, 2, [a, b]);
    expect(entries.map((e) => e.score)).toEqual([60, 30]);
    expect(added).toEqual([a]);
    expect(rankOfEntry(entries, b.id)).toBe(0);
  });

  it('trims a table that is over size', () => {
    const { entries } = insertEntries(full, 2, []);
    expect(entries.map((e) => e.score)).toEqual([90, 60]);
  });
});
