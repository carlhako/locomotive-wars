import { describe, expect, it } from 'vitest';
import { PICKUP_KINDS, WEAPONS } from '@lw/shared';
import { CARRIAGE_TYPES, carriageColors, fmt, isWeaponCarriage, shade } from './palette.ts';

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

describe('shade', () => {
  it('darkens toward black and lightens toward white', () => {
    expect(shade('#ff0000', -0.5)).toBe('#800000');
    expect(shade('#000000', 1)).toBe('#ffffff');
    expect(shade('#123456', 0)).toBe('#123456');
  });
});
