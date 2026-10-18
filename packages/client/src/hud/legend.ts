import type { CarriageKind, PickupKind } from '@lw/shared';
import { CARRIAGE_TYPES, CATEGORY_LABELS, CATEGORY_ORDER } from '../render/palette.ts';
import type { KeyValueStorage } from '../ui/join.ts';

/**
 * The carriage legend: every carriage type grouped by category, with the local train's count of
 * each. `Legend` holds the logic and writes through a `LegendView`, so it can be tested without
 * a DOM; `DomLegendView` is the real panel.
 */

/** localStorage key holding "collapsed" or "expanded". */
export const LEGEND_KEY = 'lw.legend';
/** With no remembered choice, windows shorter than this start with the legend collapsed. */
export const LEGEND_SHORT_WINDOW = 760;

/** Pickup kinds in legend order: by category, then table order. */
export const LEGEND_ORDER: readonly PickupKind[] = CATEGORY_ORDER.flatMap((cat) =>
  (Object.keys(CARRIAGE_TYPES) as PickupKind[]).filter((k) => CARRIAGE_TYPES[k].category === cat),
);

/** Carriages of each type in a train, the locomotive skipped. */
export function countKinds(kinds: readonly CarriageKind[]): Map<PickupKind, number> {
  const counts = new Map<PickupKind, number>();
  for (const k of kinds) if (k !== 'locomotive') counts.set(k, (counts.get(k) ?? 0) + 1);
  return counts;
}

/** What the legend changes on screen. Only called when something actually changed. */
export interface LegendView {
  setCount(kind: PickupKind, count: number): void;
  setCollapsed(collapsed: boolean): void;
  /** True while there is no live local train: the last counts stay, dimmed. */
  setStale(stale: boolean): void;
}

function defaultStorage(): KeyValueStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Accessing localStorage can throw when site data is blocked.
    return null;
  }
}

/** The remembered choice, else collapsed in short windows. */
export function initialCollapsed(storage: KeyValueStorage | null, windowHeight: number): boolean {
  try {
    const saved = storage?.getItem(LEGEND_KEY);
    if (saved === 'collapsed') return true;
    if (saved === 'expanded') return false;
  } catch {
    // Blocked storage: fall through to the default.
  }
  return windowHeight < LEGEND_SHORT_WINDOW;
}

export class Legend {
  private readonly counts = new Map<PickupKind, number>();
  private collapsedState: boolean;
  private stale = false;

  constructor(
    private readonly view: LegendView,
    private readonly storage: KeyValueStorage | null = defaultStorage(),
    windowHeight: number = typeof innerHeight === 'number' ? innerHeight : 1080,
  ) {
    this.collapsedState = initialCollapsed(storage, windowHeight);
    view.setCollapsed(this.collapsedState);
  }

  get collapsed(): boolean {
    return this.collapsedState;
  }

  /**
   * Shows the local train's carriages, or `null` while it is dead or absent (the last counts stay,
   * dimmed). Call every frame; only what changed is touched.
   */
  render(kinds: readonly CarriageKind[] | null): void {
    const stale = kinds === null;
    if (stale !== this.stale) {
      this.stale = stale;
      this.view.setStale(stale);
    }
    if (!kinds) return;
    const next = countKinds(kinds);
    for (const kind of LEGEND_ORDER) {
      const n = next.get(kind) ?? 0;
      if ((this.counts.get(kind) ?? 0) === n) continue;
      this.counts.set(kind, n);
      this.view.setCount(kind, n);
    }
  }

  toggle(): void {
    this.collapsedState = !this.collapsedState;
    this.view.setCollapsed(this.collapsedState);
    try {
      this.storage?.setItem(LEGEND_KEY, this.collapsedState ? 'collapsed' : 'expanded');
    } catch {
      // Private mode or a full quota: the choice just is not remembered.
    }
  }
}

/** The `#legend` panel: builds a row per type once, then updates counts and classes. */
export class DomLegendView implements LegendView {
  private readonly rows = new Map<PickupKind, { row: HTMLElement; count: HTMLElement }>();

  constructor(
    private readonly panel: HTMLElement,
    container: HTMLElement,
  ) {
    let category: string | null = null;
    for (const kind of LEGEND_ORDER) {
      const t = CARRIAGE_TYPES[kind];
      if (t.category !== category) {
        category = t.category;
        container.append(el('div', 'lg-cat', CATEGORY_LABELS[t.category]));
      }
      const row = el('div', 'lg-row');
      const swatch = el('span', 'lg-swatch');
      swatch.style.background = t.color;
      const count = el('span', 'lg-count');
      row.append(
        swatch,
        el('span', 'lg-icon', t.icon),
        el('span', 'lg-label', t.label),
        el('span', 'lg-desc', t.describe()),
        count,
      );
      container.append(row);
      this.rows.set(kind, { row, count });
    }
  }

  setCount(kind: PickupKind, count: number): void {
    const r = this.rows.get(kind);
    if (!r) return;
    r.count.textContent = count > 0 ? `×${count}` : '';
    r.row.classList.toggle('owned', count > 0);
  }

  setCollapsed(collapsed: boolean): void {
    this.panel.classList.toggle('collapsed', collapsed);
  }

  setStale(stale: boolean): void {
    this.panel.classList.toggle('stale', stale);
  }
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}
