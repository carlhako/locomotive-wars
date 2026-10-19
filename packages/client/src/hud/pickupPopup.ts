import type { PickupKind } from '@lw/shared';
import { CARRIAGE_TYPES } from '../render/palette.ts';

/** One pickup line. `count` is how many of the type the train now has, 0 when the train was full. */
export interface PickupLine {
  kind: PickupKind;
  count: number;
  full: boolean;
}

export interface PickupPopupSink {
  add(line: PickupLine): void;
}

/** Seconds a line stays on screen. */
export const PICKUP_POPUP_LIFE = 1.5;
/** Most lines shown at once. */
export const PICKUP_POPUP_MAX = 3;
/** Seconds a line takes to fade in. */
const FADE_IN = 0.1;
/** Seconds a line takes to fade out, ending at its life. */
const FADE_OUT = 0.3;

/** A line and how long it has been showing. */
export interface TimedPickupLine extends PickupLine {
  age: number;
}

/** The popup's lines and expiry, with no DOM so it can be tested directly. */
export class PickupPopup implements PickupPopupSink {
  private list: TimedPickupLine[] = [];
  private dirty = true;

  /** Oldest first, so the newest line is last. */
  get entries(): readonly TimedPickupLine[] {
    return this.list;
  }

  add(line: PickupLine): void {
    this.list.push({ ...line, age: 0 });
    if (this.list.length > PICKUP_POPUP_MAX) this.list.shift();
    this.dirty = true;
  }

  update(dt: number): void {
    for (const e of this.list) e.age += dt;
    const kept = this.list.filter((e) => e.age <= PICKUP_POPUP_LIFE);
    if (kept.length !== this.list.length) {
      this.list = kept;
      this.dirty = true;
    }
  }

  clear(): void {
    this.list = [];
    this.dirty = true;
  }

  /** True once after any change to which lines show, so a view rebuilds only when needed. */
  takeDirty(): boolean {
    const d = this.dirty;
    this.dirty = false;
    return d;
  }
}

/** What a line says under the type's name: its description, a count, or that the train is full. */
export function pickupDetail(line: PickupLine): string {
  if (line.full) return 'TRAIN FULL';
  if (line.count > 1) return `×${line.count}`;
  return CARRIAGE_TYPES[line.kind].describe();
}

/** A line's opacity at an age: a quick fade in, full, then a fade out over its last moments. */
export function pickupOpacity(age: number): number {
  const fadeIn = Math.min(1, age / FADE_IN);
  const fadeOut = Math.min(1, (PICKUP_POPUP_LIFE - age) / FADE_OUT);
  return Math.max(0, Math.min(fadeIn, fadeOut));
}

function span(className: string, text: string, color?: string): HTMLSpanElement {
  const el = document.createElement('span');
  el.className = className;
  el.textContent = text;
  if (color) el.style.color = color;
  return el;
}

/** Renders the popup into an element, rebuilding it only when the set of lines changes. */
export class PickupPopupView {
  private rows: HTMLElement[] = [];

  constructor(
    private readonly root: HTMLElement,
    private readonly popup: PickupPopup,
  ) {}

  render(): void {
    const entries = this.popup.entries;
    if (this.popup.takeDirty()) {
      this.root.replaceChildren();
      this.rows = entries.map((line) => {
        const type = CARRIAGE_TYPES[line.kind];
        const row = document.createElement('div');
        row.className = 'pickup-line';
        const chip = span('pickup-icon', type.icon);
        chip.style.background = type.color;
        row.append(
          chip,
          span('pickup-name', type.label, type.color),
          span('pickup-detail', pickupDetail(line)),
        );
        this.root.append(row);
        return row;
      });
    }
    // Opacity follows age, so it is refreshed every frame even when no row was rebuilt.
    entries.forEach((line, i) => {
      const row = this.rows[i];
      if (row) row.style.opacity = String(pickupOpacity(line.age));
    });
  }
}
