import type { HighScoreOffer, HighScoresInfo, RoundResultInfo, RoundStatus } from '../source.ts';
import {
  highScoreRows,
  offerEditable,
  offerStatus,
  offerTitle,
  renderHighScoreRows,
} from './highscores.ts';

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

/** What the overlay shows beyond the standings. */
export interface RoundOverlayExtras {
  highscores?: HighScoresInfo | null;
  offer?: HighScoreOffer | null;
}

/**
 * The between-rounds overlay: standings, the winner, the high score table, the new-high-score
 * name box for a player who earned a place, and a countdown.
 */
export class RoundOverlay {
  private readonly root = byId('round-overlay');
  private readonly winner = byId('round-winner');
  private readonly body = byId('round-standings');
  private readonly countdown = byId('round-countdown');
  private readonly scoreBody = byId('round-highscores-rows');
  private readonly form = byId('hs-form') as HTMLFormElement;
  private readonly title = byId('hs-title');
  private readonly input = byId('hs-name') as HTMLInputElement;
  private readonly save = byId('hs-save') as HTMLButtonElement;
  private readonly status = byId('hs-status');
  private lastKey = '';
  private lastScoresKey = '';
  private offerShown = false;
  private submit: ((name: string) => void) | null = null;

  constructor() {
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submit?.(this.input.value);
    });
  }

  /** Called with the typed name when the player presses Save or Enter. */
  onSubmitName(handler: (name: string) => void): void {
    this.submit = handler;
  }

  update(
    round: RoundStatus | null,
    result: RoundResultInfo | null,
    localId: number,
    extras: RoundOverlayExtras = {},
  ): void {
    const show = round?.phase === 'intermission';
    this.root.style.display = show ? 'flex' : 'none';
    if (!show || !round) {
      this.lastKey = '';
      this.lastScoresKey = '';
      this.offerShown = false;
      return;
    }
    this.countdown.textContent = countdownText(round.secondsLeft);
    this.updateScores(extras.highscores ?? null);
    this.updateOffer(extras.offer ?? null, result, localId);
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

  private updateScores(info: HighScoresInfo | null): void {
    const key = JSON.stringify(info);
    if (key === this.lastScoresKey) return;
    this.lastScoresKey = key;
    renderHighScoreRows(this.scoreBody, highScoreRows(info));
  }

  private updateOffer(
    offer: HighScoreOffer | null,
    result: RoundResultInfo | null,
    localId: number,
  ): void {
    if (!offer) {
      this.form.style.display = 'none';
      this.offerShown = false;
      return;
    }
    this.form.style.display = 'flex';
    this.title.textContent = offerTitle(offer);
    this.status.textContent = offerStatus(offer);
    this.status.classList.toggle('error', offer.state === 'failed');
    const editable = offerEditable(offer);
    this.input.disabled = !editable;
    this.save.disabled = !editable;
    if (!this.offerShown) {
      this.offerShown = true;
      // Prefill with the name the player joined under, then let them overtype it at once.
      this.input.value = result?.standings.find((s) => s.id === localId)?.name ?? '';
      this.input.focus();
      this.input.select();
    }
  }
}
