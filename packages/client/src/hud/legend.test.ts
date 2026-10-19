import { describe, expect, it } from 'vitest';
import type { CarriageKind, PickupKind } from '@lw/shared';
import { PICKUP_KINDS } from '@lw/shared';
import { CARRIAGE_TYPES, CATEGORY_LABELS, CATEGORY_ORDER } from '../render/palette.ts';
import type { KeyValueStorage } from '../ui/join.ts';
import { countKinds, initialCollapsed, Legend, LEGEND_KEY, LEGEND_ORDER } from './legend.ts';
import type { LegendView } from './legend.ts';

class FakeView implements LegendView {
  counts = new Map<PickupKind, number>();
  collapsed: boolean | null = null;
  stale = false;
  writes = 0;
  setCount(kind: PickupKind, count: number): void {
    this.counts.set(kind, count);
    this.writes += 1;
  }
  setCollapsed(collapsed: boolean): void {
    this.collapsed = collapsed;
  }
  setStale(stale: boolean): void {
    this.stale = stale;
  }
}

function memory(
  initial: Record<string, string> = {},
): KeyValueStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

const blocked: KeyValueStorage = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
};

const train = (...kinds: CarriageKind[]): CarriageKind[] => ['locomotive', ...kinds];

describe('legend order', () => {
  it('lists every pickup kind once, grouped by category in order', () => {
    expect([...LEGEND_ORDER].sort()).toEqual([...PICKUP_KINDS].sort());
    const cats = LEGEND_ORDER.map((k) => CATEGORY_ORDER.indexOf(CARRIAGE_TYPES[k].category));
    expect(cats).toEqual([...cats].sort((a, b) => a - b));
  });
});

describe('legend sections', () => {
  it('lists the whole roster under its headings', () => {
    const byCategory = (cat: string) =>
      LEGEND_ORDER.filter((k) => CARRIAGE_TYPES[k].category === cat).map(
        (k) => CARRIAGE_TYPES[k].label,
      );
    expect(LEGEND_ORDER).toHaveLength(16);
    expect(CATEGORY_LABELS.auto).toBe('Auto weapons');
    expect(CATEGORY_ORDER.indexOf('auto')).toBe(CATEGORY_ORDER.indexOf('weapon') + 1);
    expect(byCategory('weapon')).toEqual(['MG Turret', 'Missile', 'Laser', 'Flak']);
    expect(byCategory('auto')).toEqual(['Mine Layer', 'Tail Gunner', 'Tesla Coil']);
    expect(byCategory('defence')).toContain('Cowcatcher');
    expect(byCategory('support')).toEqual(expect.arrayContaining(['Repair Car', 'Cloak']));
  });

  it('counts the new types like any other', () => {
    const view = new FakeView();
    new Legend(view, memory()).render(train('mines', 'tesla', 'tesla', 'cloak'));
    expect(view.counts.get('mines')).toBe(1);
    expect(view.counts.get('tesla')).toBe(2);
    expect(view.counts.get('cloak')).toBe(1);
  });
});

describe('countKinds', () => {
  it('counts carriages by type and skips the locomotive', () => {
    const c = countKinds(train('mg', 'shield', 'mg'));
    expect(c.get('mg')).toBe(2);
    expect(c.get('shield')).toBe(1);
    expect(c.has('locomotive' as PickupKind)).toBe(false);
  });
});

describe('Legend counts', () => {
  it('shows the count of each type the train has', () => {
    const view = new FakeView();
    const legend = new Legend(view, memory());
    legend.render(train('shield', 'shield'));
    expect(view.counts.get('shield')).toBe(2);
    legend.render(train('shield', 'shield', 'shield'));
    expect(view.counts.get('shield')).toBe(3);
  });

  it('leaves types the train lacks at zero (dimmed)', () => {
    const view = new FakeView();
    new Legend(view, memory()).render(train('mg'));
    expect(view.counts.get('magnet')).toBeUndefined();
  });

  it('resets to the new train after a respawn', () => {
    const view = new FakeView();
    const legend = new Legend(view, memory());
    legend.render(train('mg', 'armor', 'armor', 'speed'));
    legend.render(train('mg'));
    expect(view.counts.get('armor')).toBe(0);
    expect(view.counts.get('speed')).toBe(0);
    expect(view.counts.get('mg')).toBe(1);
  });

  it('keeps the last counts, dimmed, while the train is dead', () => {
    const view = new FakeView();
    const legend = new Legend(view, memory());
    legend.render(train('shield', 'shield'));
    legend.render(null);
    expect(view.stale).toBe(true);
    expect(view.counts.get('shield')).toBe(2);
    legend.render(train('mg'));
    expect(view.stale).toBe(false);
    expect(view.counts.get('shield')).toBe(0);
  });

  it('writes nothing when the counts are unchanged', () => {
    const view = new FakeView();
    const legend = new Legend(view, memory());
    legend.render(train('mg', 'laser'));
    const writes = view.writes;
    for (let i = 0; i < 100; i++) legend.render(train('laser', 'mg'));
    expect(view.writes).toBe(writes);
  });
});

describe('Legend collapse', () => {
  it('toggles and remembers the choice', () => {
    const storage = memory();
    const view = new FakeView();
    const legend = new Legend(view, storage, 1080);
    expect(view.collapsed).toBe(false);
    legend.toggle();
    expect(view.collapsed).toBe(true);
    expect(storage.data[LEGEND_KEY]).toBe('collapsed');
    // A reload with the same storage starts collapsed.
    const again = new FakeView();
    new Legend(again, storage, 1080);
    expect(again.collapsed).toBe(true);
  });

  it('starts collapsed in a short window with no remembered choice', () => {
    expect(initialCollapsed(memory(), 700)).toBe(true);
    expect(initialCollapsed(memory(), 900)).toBe(false);
  });

  it('prefers the remembered choice over the window height', () => {
    expect(initialCollapsed(memory({ [LEGEND_KEY]: 'expanded' }), 700)).toBe(false);
    expect(initialCollapsed(memory({ [LEGEND_KEY]: 'collapsed' }), 1200)).toBe(true);
  });

  it('works with blocked storage', () => {
    const view = new FakeView();
    const legend = new Legend(view, blocked, 1080);
    expect(view.collapsed).toBe(false);
    expect(() => legend.toggle()).not.toThrow();
    expect(view.collapsed).toBe(true);
  });
});
