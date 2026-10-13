/** One line in the kill feed. */
export interface KillFeedEntry {
  /** Who did it; absent for system lines such as a boss arriving. */
  killer?: string;
  killerColor?: string;
  victim: string;
  victimColor?: string;
  /** The verb between them, such as "destroyed" or "defeated". */
  weapon: string;
  style: 'normal' | 'boss' | 'system';
}

export interface KillFeedSink {
  add(entry: KillFeedEntry): void;
}

/** Seconds an entry stays on screen (reference line 1026). */
export const KILL_FEED_LIFE = 5.5;
/** Most entries shown at once (reference line 1027). */
export const KILL_FEED_MAX = 5;

interface TimedEntry extends KillFeedEntry {
  age: number;
}

/** The kill feed's contents and expiry, with no DOM so it can be tested directly. */
export class KillFeed implements KillFeedSink {
  private list: TimedEntry[] = [];
  private dirty = true;

  get entries(): readonly KillFeedEntry[] {
    return this.list;
  }

  add(entry: KillFeedEntry): void {
    this.list.push({ ...entry, age: 0 });
    if (this.list.length > KILL_FEED_MAX) this.list.shift();
    this.dirty = true;
  }

  update(dt: number): void {
    for (const e of this.list) e.age += dt;
    const kept = this.list.filter((e) => e.age <= KILL_FEED_LIFE);
    if (kept.length !== this.list.length) {
      this.list = kept;
      this.dirty = true;
    }
  }

  clear(): void {
    this.list = [];
    this.dirty = true;
  }

  /** True once after any change, so a view re-renders only when needed. */
  takeDirty(): boolean {
    const d = this.dirty;
    this.dirty = false;
    return d;
  }
}

function span(className: string, text: string, color?: string): HTMLSpanElement {
  const el = document.createElement('span');
  if (className) el.className = className;
  el.textContent = text;
  if (color) el.style.color = color;
  return el;
}

/**
 * Renders the feed into an element. Names are placed with `textContent`, never as markup,
 * because they will come from other players once the game is online.
 */
export class KillFeedView {
  constructor(
    private readonly root: HTMLElement,
    private readonly feed: KillFeed,
  ) {}

  render(): void {
    if (!this.feed.takeDirty()) return;
    this.root.replaceChildren();
    for (const k of this.feed.entries) {
      const row = document.createElement('div');
      row.className = k.style === 'normal' ? 'kf-entry' : `kf-entry ${k.style}`;
      if (k.style === 'system') {
        row.append(span('', '⚠', k.killerColor ?? '#4a9eff'));
        row.append(' ');
        row.append(span('victim', k.victim, k.victimColor ?? '#ff6666'));
        row.append(' ');
        row.append(span('weapon', k.weapon));
      } else {
        row.append(span('killer', k.killer ?? '', k.killerColor ?? '#4a9eff'));
        row.append(' ');
        row.append(span('weapon', k.weapon));
        row.append(' ');
        row.append(span('victim', k.victim, k.victimColor ?? '#ff6666'));
      }
      this.root.append(row);
    }
  }
}
