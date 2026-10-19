import { describe, expect, it } from 'vitest';
import { PICKUP_KINDS, WEAPONS } from '@lw/shared';
import {
  CARRIAGE_TYPES,
  carriageColors,
  fmt,
  HEAL_COLOR,
  HEART_COLORS,
  isWeaponCarriage,
  shade,
} from './palette.ts';

const rows = Object.entries(CARRIAGE_TYPES);

describe('CARRIAGE_TYPES', () => {
  it('has a row for every pickup kind', () => {
    expect(Object.keys(CARRIAGE_TYPES).sort()).toEqual([...PICKUP_KINDS].sort());
  });

  it('gives every type its own 6-digit colour and a one-character icon', () => {
    const colors = rows.map(([, t]) => t.color.toLowerCase());
    expect(new Set(colors).size).toBe(colors.length);
    for (const [, t] of rows) {
      expect(t.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect([...t.icon]).toHaveLength(1);
    }
  });

  it('derives the carriage body and highlight from the type colour', () => {
    for (const [, t] of rows) {
      expect(t.body).toBe(shade(t.color, -0.2));
      expect(t.light).toBe(shade(t.color, 0.3));
    }
  });

  it('gives the locomotive colours but no legend row', () => {
    expect(carriageColors('locomotive').body).toMatch(/^#/);
    expect('locomotive' in CARRIAGE_TYPES).toBe(false);
    expect(carriageColors('mg')).toMatchObject({ body: CARRIAGE_TYPES.mg.body });
  });

  it('classes the weapon carriages', () => {
    expect(isWeaponCarriage('mg')).toBe(true);
    expect(isWeaponCarriage('laser')).toBe(true);
    expect(isWeaponCarriage('flak')).toBe(true);
    expect(isWeaponCarriage('tailgun')).toBe(false);
    expect(isWeaponCarriage('shield')).toBe(false);
    expect(isWeaponCarriage('locomotive')).toBe(false);
  });
});

describe('descriptions', () => {
  it('reads the MG line from the weapon stats', () => {
    expect(CARRIAGE_TYPES.mg.describe()).toBe('7/s × 7 dmg');
  });

  it('follows the simulation constants when they change', () => {
    const before = WEAPONS.mg.damage;
    WEAPONS.mg.damage = 9;
    try {
      expect(CARRIAGE_TYPES.mg.describe()).toBe(`${fmt(WEAPONS.mg.fireRate)}/s × 9 dmg`);
    } finally {
      WEAPONS.mg.damage = before;
    }
  });

  it('describes the new and changed types from the simulation constants', () => {
    expect(CARRIAGE_TYPES.laser.describe()).toBe('2/s × 22 · pierce 3');
    expect(CARRIAGE_TYPES.flak.describe()).toBe('5 × 6 dmg · short');
    expect(CARRIAGE_TYPES.mines.describe()).toBe('Mine/2s · 40 dmg');
    expect(CARRIAGE_TYPES.tailgun.describe()).toBe('Rear auto · 3/s × 6');
    expect(CARRIAGE_TYPES.tesla.describe()).toBe('Zap 180 · 18 dmg ×2');
    expect(CARRIAGE_TYPES.repair.describe()).toBe('+1.5 hull/s (max 6)');
    expect(CARRIAGE_TYPES.cowcatcher.describe()).toBe('+20 ram · −10% ram dmg');
    expect(CARRIAGE_TYPES.cloak.describe()).toBe('Hidden on minimap');
    expect(CARRIAGE_TYPES.armor.describe()).toBe('+70 max hull');
    expect(CARRIAGE_TYPES.speed.describe()).toBe('+7% speed (max 50%)');
    expect(CARRIAGE_TYPES.fuel.describe()).toBe('+15% tank · +20% regen');
  });

  it('keeps every description to one short line', () => {
    for (const [kind, t] of rows) {
      const text = t.describe();
      expect(text.length, `${kind}: "${text}"`).toBeLessThanOrEqual(24);
      expect(text.length).toBeGreaterThan(0);
    }
  });

  it('formats numbers with at most one decimal place', () => {
    expect(fmt(7)).toBe('7');
    expect(fmt(0.9)).toBe('0.9');
    expect(fmt(15.000000000000002)).toBe('15');
    expect(fmt(3.456)).toBe('3.5');
  });
});

describe('heart colours', () => {
  it('gives each heart kind and healing its own colour, apart from every carriage type', () => {
    const hearts = [HEART_COLORS.slow, HEART_COLORS.full, HEAL_COLOR];
    for (const c of hearts) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
    expect(new Set(hearts).size).toBe(3);
    const carriages = new Set(rows.map(([, t]) => t.color.toLowerCase()));
    for (const c of hearts) expect(carriages.has(c.toLowerCase())).toBe(false);
  });
});

describe('shade', () => {
  it('darkens toward black and lightens toward white', () => {
    expect(shade('#ff0000', -0.5)).toBe('#800000');
    expect(shade('#000000', 1)).toBe('#ffffff');
    expect(shade('#123456', 0)).toBe('#123456');
  });
});
