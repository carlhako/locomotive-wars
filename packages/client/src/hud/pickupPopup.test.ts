import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CARRIAGE_TYPES } from '../render/palette.ts';
import {
  pickupDetail,
  pickupOpacity,
  PICKUP_POPUP_LIFE,
  PICKUP_POPUP_MAX,
  PickupPopup,
  PickupPopupView,
} from './pickupPopup.ts';

describe('PickupPopup', () => {
  it('drops a line once it has lived past its life', () => {
    const p = new PickupPopup();
    p.add({ kind: 'laser', count: 1, full: false });

    p.update(PICKUP_POPUP_LIFE - 0.1);
    expect(p.entries).toHaveLength(1);
    p.update(0.2);
    expect(p.entries).toHaveLength(0);
  });

  it('drops the oldest line when a fourth arrives, keeping the newest last', () => {
    const p = new PickupPopup();
    for (let count = 1; count <= PICKUP_POPUP_MAX + 1; count++) {
      p.add({ kind: 'shield', count, full: false });
    }

    expect(p.entries.map((e) => e.count)).toEqual([2, 3, 4]);
  });

  it('empties on clear', () => {
    const p = new PickupPopup();
    p.add({ kind: 'mg', count: 1, full: false });
    p.clear();
    expect(p.entries).toHaveLength(0);
  });

  it('reports dirty once after a change, and not after plain ageing', () => {
    const p = new PickupPopup();
    p.takeDirty();
    expect(p.takeDirty()).toBe(false);

    p.add({ kind: 'mg', count: 1, full: false });
    expect(p.takeDirty()).toBe(true);
    expect(p.takeDirty()).toBe(false);

    p.update(0.5);
    expect(p.takeDirty()).toBe(false);
    p.update(PICKUP_POPUP_LIFE);
    expect(p.takeDirty()).toBe(true);
  });
});

describe('pickupDetail', () => {
  it('describes the first of a type, counts duplicates, and says when full', () => {
    expect(pickupDetail({ kind: 'laser', count: 1, full: false })).toBe(
      CARRIAGE_TYPES.laser.describe(),
    );
    expect(pickupDetail({ kind: 'laser', count: 3, full: false })).toBe('×3');
    expect(pickupDetail({ kind: 'missile', count: 0, full: true })).toBe('TRAIN FULL');
  });
});

describe('pickupOpacity', () => {
  it('fades in quickly, holds, and fades out by the end of its life', () => {
    expect(pickupOpacity(0)).toBe(0);
    expect(pickupOpacity(0.05)).toBeCloseTo(0.5);
    expect(pickupOpacity(0.8)).toBe(1);
    expect(pickupOpacity(PICKUP_POPUP_LIFE - 0.15)).toBeCloseTo(0.5);
    expect(pickupOpacity(PICKUP_POPUP_LIFE)).toBe(0);
  });
});

/** The few DOM members the view uses, standing in for a DOM since client tests run in Node. */
class FakeEl {
  className = '';
  textContent = '';
  style: Record<string, string> = {};
  children: FakeEl[] = [];
  replaced = 0;
  constructor(public tag = 'div') {}
  append(...kids: FakeEl[]): void {
    this.children.push(...kids);
  }
  replaceChildren(): void {
    this.children = [];
    this.replaced += 1;
  }
}

describe('PickupPopupView', () => {
  beforeEach(() => {
    vi.stubGlobal('document', { createElement: (tag: string) => new FakeEl(tag) });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function setup() {
    const root = new FakeEl();
    const popup = new PickupPopup();
    const view = new PickupPopupView(root as unknown as HTMLElement, popup);
    return { root, popup, view };
  }

  const parts = (row: FakeEl): string[] => row.children.map((c) => c.textContent);

  it('writes the icon, name in the type colour, and the second part for each form', () => {
    const { root, popup, view } = setup();
    popup.add({ kind: 'laser', count: 1, full: false });
    popup.add({ kind: 'laser', count: 2, full: false });
    popup.add({ kind: 'missile', count: 0, full: true });

    view.render();

    const laser = CARRIAGE_TYPES.laser;
    expect(root.children).toHaveLength(3);
    expect(parts(root.children[0]!)).toEqual([laser.icon, laser.label, laser.describe()]);
    expect(parts(root.children[1]!)).toEqual([laser.icon, laser.label, '×2']);
    expect(parts(root.children[2]!)).toEqual([
      CARRIAGE_TYPES.missile.icon,
      CARRIAGE_TYPES.missile.label,
      'TRAIN FULL',
    ]);
    expect(root.children[0]!.children[1]!.style.color).toBe(laser.color);
  });

  it('does not rebuild the root when nothing changed, but keeps opacity following age', () => {
    const { root, popup, view } = setup();
    popup.add({ kind: 'mg', count: 1, full: false });
    view.render();
    const rebuilds = root.replaced;
    const row = root.children[0]!;

    popup.update(0.5);
    view.render();

    expect(root.replaced).toBe(rebuilds);
    expect(root.children[0]).toBe(row);
    expect(row.style.opacity).toBe('1');

    popup.update(1.1);
    view.render();
    expect(root.children).toHaveLength(0);
  });
});
