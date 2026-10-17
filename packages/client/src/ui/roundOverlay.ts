import type { RoundResultInfo, RoundStatus } from '../source.ts';

export interface StandingRowModel {
  rank: number;
  id: number;
  name: string;
  bot: boolean;
  best: number;
  kills: number;
  me: boolean;
  winner: boolean;
}

export interface StandingsModel {
  /** The winner's name, null for an empty round. */
  winner: string | null;
  rows: StandingRowModel[];
}

/** The intermission table: every train ranked, the winner and the local player marked. */
export function standingsModel(
  result: RoundResultInfo | null,
  localId: number,
): StandingsModel | null {
  if (!result) return null;
  const rows = result.standings.map((s, i): StandingRowModel => ({
    rank: i + 1,
    id: s.id,
    name: s.name,
    bot: s.bot,
    best: s.best,
    kills: s.kills,
    me: s.id === localId,
    winner: s.id === result.winnerId,
  }));
  return { winner: rows.find((r) => r.winner)?.name ?? null, rows };
}

/** "Next round in 12s". */
export function countdownText(secondsLeft: number): string {
  return `Next round in ${Math.max(0, Math.ceil(secondsLeft))}s`;
}

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id} in index.html`);
  return el;
}

function cell(text: string, className = ''): HTMLTableCellElement {
  const td = document.createElement('td');
  td.textContent = text;
  if (className) td.className = className;
  return td;
}

/** The between-rounds overlay: standings, the winner, and a countdown. */
export class RoundOverlay {
  private readonly root = byId('round-overlay');
  private readonly winner = byId('round-winner');
  private readonly body = byId('round-standings');
  private readonly countdown = byId('round-countdown');
  private lastKey = '';

  update(round: RoundStatus | null, result: RoundResultInfo | null, localId: number): void {
    const show = round?.phase === 'intermission';
    this.root.style.display = show ? 'flex' : 'none';
    if (!show || !round) {
      this.lastKey = '';
      return;
    }
    this.countdown.textContent = countdownText(round.secondsLeft);
    const model = standingsModel(result, localId);
    const key = JSON.stringify([model, localId]);
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.winner.textContent = model?.winner ? `Winner: ${model.winner}` : '';
    this.body.replaceChildren(
      ...(model?.rows ?? []).map((r) => {
        const tr = document.createElement('tr');
        tr.className = [r.me ? 'me' : '', r.winner ? 'winner' : ''].filter(Boolean).join(' ');
        const name = cell(r.name, 'name');
        if (r.bot) {
          const tag = document.createElement('span');
          tag.className = 'bot-tag';
          tag.textContent = 'BOT';
          name.append(tag);
        }
        tr.append(cell(String(r.rank), 'rank'), name, cell(String(r.best)), cell(String(r.kills)));
        return tr;
      }),
    );
  }
}
