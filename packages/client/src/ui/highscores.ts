import type { HighScoreFailure, HighScoreOffer, HighScoresInfo } from '../source.ts';

/** A row of the high score table as displayed. */
export interface HighScoreRowModel {
  rank: number;
  name: string;
  score: number;
  /** True for an entry this round added. */
  fresh: boolean;
}

export function highScoreRows(info: HighScoresInfo | null): HighScoreRowModel[] {
  if (!info) return [];
  const fresh = new Set(info.highlightIds);
  return info.rows.map((r, i) => ({
    rank: i + 1,
    name: r.name,
    score: r.score,
    fresh: fresh.has(r.id),
  }));
}

/** Reads the body of `GET /api/highscores`. Null when it is not the expected shape. */
export function parseHighScoresResponse(json: unknown): HighScoresInfo | null {
  if (typeof json !== 'object' || json === null) return null;
  const entries = (json as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) return null;
  const rows: HighScoresInfo['rows'] = [];
  for (const e of entries) {
    if (typeof e !== 'object' || e === null) return null;
    const { rank, name, score } = e as Record<string, unknown>;
    if (typeof rank !== 'number' || typeof name !== 'string' || typeof score !== 'number') {
      return null;
    }
    rows.push({ id: `rank-${rank}`, name, score });
  }
  return { rows, highlightIds: [] };
}

/** Fetches the table for the join screen. Null when the server cannot be reached or misanswers. */
export async function fetchHighScores(
  fetcher: typeof fetch = (...args) => fetch(...args),
  url = '/api/highscores',
): Promise<HighScoresInfo | null> {
  try {
    const res = await fetcher(url, { cache: 'no-store' });
    if (!res.ok) return null;
    return parseHighScoresResponse(await res.json());
  } catch {
    return null;
  }
}

/** "NEW HIGH SCORE #3 — 64 carriages". */
export function offerTitle(offer: Pick<HighScoreOffer, 'rank' | 'score'>): string {
  const unit = offer.score === 1 ? 'carriage' : 'carriages';
  return `NEW HIGH SCORE #${offer.rank} — ${offer.score} ${unit}`;
}

/** What the player is told about a name that was not saved. */
export function failureText(reason: HighScoreFailure | undefined): string {
  switch (reason) {
    case 'used':
      return 'A name was already saved for this score.';
    case 'expired':
      return 'Too late: the next round has started.';
    case 'invalid':
      return 'The server did not accept that.';
    default:
      return 'The server could not save that. Try again.';
  }
}

/** The status line under the name box. */
export function offerStatus(offer: HighScoreOffer): string {
  switch (offer.state) {
    case 'saving':
      return 'Saving…';
    case 'saved':
      return 'Saved';
    case 'failed':
      return failureText(offer.failure);
    default:
      return '';
  }
}

/** True while the name box and button should accept input. */
export function offerEditable(offer: HighScoreOffer): boolean {
  return offer.state === 'ready' || (offer.state === 'failed' && offer.failure === 'error');
}

function cell(text: string, className = ''): HTMLTableCellElement {
  const td = document.createElement('td');
  td.textContent = text;
  if (className) td.className = className;
  return td;
}

/** Replaces the rows of a high score table body. */
export function renderHighScoreRows(body: HTMLElement, rows: readonly HighScoreRowModel[]): void {
  body.replaceChildren(
    ...rows.map((r) => {
      const tr = document.createElement('tr');
      if (r.fresh) tr.className = 'fresh';
      tr.append(cell(String(r.rank), 'rank'), cell(r.name, 'name'), cell(String(r.score)));
      return tr;
    }),
  );
}
