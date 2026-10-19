import {
  ARMOR_BONUS,
  COWCATCHER_RAM_BONUS,
  COWCATCHER_RAM_REDUCTION,
  DAMAGE_REDUCTION_CAP,
  DRONE_DAMAGE,
  DRONE_RANGE,
  FUEL_BONUS,
  FUEL_CAPACITY_PER_BONUS,
  FUEL_REGEN_PER_BONUS,
  MAGNET_BONUS,
  MINE_DAMAGE,
  MINE_INTERVAL,
  REPAIR_BONUS,
  REPAIR_CAP,
  SHIELD_REDUCTION,
  SPEED_BONUS,
  SPEED_BONUS_CAP,
  TAILGUN,
  TESLA_DAMAGE,
  TESLA_RANGE,
  WEAPONS,
} from '@lw/shared';
import type { CarriageKind, PickupKind } from '@lw/shared';

/** Legend groups, in the order the legend shows them. `auto` weapons fire without the button. */
export type CarriageCategory = 'weapon' | 'auto' | 'defence' | 'support';

export const CATEGORY_ORDER: readonly CarriageCategory[] = ['weapon', 'auto', 'defence', 'support'];

export const CATEGORY_LABELS: Record<CarriageCategory, string> = {
  weapon: 'Weapons',
  auto: 'Auto weapons',
  defence: 'Defence',
  support: 'Support',
};

export interface CarriageColors {
  /** Carriage fill. */
  body: string;
  /** Carriage highlight stripe and turret. */
  light: string;
}

/**
 * Everything the client shows for one carriage type. Trailers, drops, carriages, the minimap,
 * and the legend all read this one table, so a type looks the same everywhere.
 */
export interface CarriageType extends CarriageColors {
  label: string;
  /** One character, drawn on pickups and on non-weapon carriages. */
  icon: string;
  category: CarriageCategory;
  /** The type's colour (6-digit hex): pickups, minimap dots, legend swatch. */
  color: string;
  /** One short line (at most 24 characters) built from the simulation's own constants. */
  describe(): string;
}

/** Mixes a 6-digit hex colour toward black (amount < 0) or white (amount > 0). */
export function shade(hex: string, amount: number): string {
  const target = amount < 0 ? 0 : 255;
  const t = Math.abs(amount);
  const channel = (i: number): string => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
    return Math.round(v + (target - v) * t)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

/** A number with at most one decimal place: 7, 0.9, 3.5. */
export function fmt(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

const pct = (fraction: number): string => fmt(fraction * 100);

function type(
  label: string,
  icon: string,
  category: CarriageCategory,
  color: string,
  describe: () => string,
): CarriageType {
  return {
    label,
    icon,
    category,
    color,
    body: shade(color, -0.2),
    light: shade(color, 0.3),
    describe,
  };
}

export const CARRIAGE_TYPES: Record<PickupKind, CarriageType> = {
  mg: type('MG Turret', 'M', 'weapon', '#ff4040', () => {
    const w = WEAPONS.mg;
    return `${fmt(w.fireRate)}/s × ${fmt(w.damage)} dmg`;
  }),
  missile: type('Missile', 'R', 'weapon', '#ff9020', () => {
    const w = WEAPONS.missile;
    return `${fmt(w.fireRate)}/s × ${fmt(w.damage)} · splash ${fmt(w.splash)}`;
  }),
  laser: type('Laser', 'L', 'weapon', '#ff40e0', () => {
    const w = WEAPONS.laser;
    return `${fmt(w.fireRate)}/s × ${fmt(w.damage)} · pierce ${fmt(w.pierce ?? 1)}`;
  }),
  flak: type('Flak', 'K', 'weapon', '#b0ff30', () => {
    const w = WEAPONS.flak;
    return `${fmt(w.pellets ?? 1)} × ${fmt(w.damage)} dmg · short`;
  }),
  mines: type(
    'Mine Layer',
    'X',
    'auto',
    '#8a8f3a',
    () => `Mine/${fmt(MINE_INTERVAL)}s · ${fmt(MINE_DAMAGE)} dmg`,
  ),
  tailgun: type(
    'Tail Gunner',
    'T',
    'auto',
    '#ff6a9e',
    () => `Rear auto · ${fmt(TAILGUN.fireRate)}/s × ${fmt(TAILGUN.damage)}`,
  ),
  tesla: type(
    'Tesla Coil',
    'Z',
    'auto',
    '#30d0b0',
    () => `Zap ${fmt(TESLA_RANGE)} · ${fmt(TESLA_DAMAGE)} dmg ×2`,
  ),
  shield: type(
    'Shield',
    'S',
    'defence',
    '#3f7bff',
    () => `−${pct(SHIELD_REDUCTION)}% dmg (max ${pct(DAMAGE_REDUCTION_CAP)}%)`,
  ),
  drones: type(
    'Counter-Drone',
    'D',
    'defence',
    '#40e8ff',
    () => `Drone · ${fmt(DRONE_DAMAGE)} dmg, range ${fmt(DRONE_RANGE)}`,
  ),
  armor: type('Armor', 'A', 'defence', '#9a5cff', () => `+${fmt(ARMOR_BONUS)} max hull`),
  cowcatcher: type(
    'Cowcatcher',
    'C',
    'defence',
    '#a0a8b8',
    () => `+${fmt(COWCATCHER_RAM_BONUS)} ram · −${pct(COWCATCHER_RAM_REDUCTION)}% ram dmg`,
  ),
  speed: type(
    'Booster',
    'B',
    'support',
    '#40ff80',
    () => `+${pct(SPEED_BONUS)}% speed (max ${pct(SPEED_BONUS_CAP)}%)`,
  ),
  magnet: type('Magnet', '◆', 'support', '#ffff40', () => `+${fmt(MAGNET_BONUS)} pickup radius`),
  fuel: type(
    'Fuel Tank',
    'F',
    'support',
    '#d9a066',
    () =>
      `+${pct(FUEL_BONUS * FUEL_CAPACITY_PER_BONUS)}% tank · +${pct(FUEL_BONUS * FUEL_REGEN_PER_BONUS)}% regen`,
  ),
  repair: type(
    'Repair Car',
    '+',
    'support',
    '#f4f4f4',
    () => `+${fmt(REPAIR_BONUS)} hull/s (max ${fmt(REPAIR_CAP)})`,
  ),
  cloak: type('Cloak', '?', 'support', '#5a4f7a', () => 'Hidden on minimap'),
};

/** The locomotive: not a pickup, so it has colours but no legend row. */
const LOCOMOTIVE_COLORS: CarriageColors = { body: '#888888', light: '#aaaaaa' };

/** Body and highlight colours for any carriage, the locomotive included. */
export function carriageColors(kind: CarriageKind): CarriageColors {
  return kind === 'locomotive' ? LOCOMOTIVE_COLORS : CARRIAGE_TYPES[kind];
}

export function isWeaponCarriage(kind: CarriageKind): boolean {
  return kind !== 'locomotive' && CARRIAGE_TYPES[kind].category === 'weapon';
}

/** The local player's colour in the HUD and minimap. */
export const LOCAL_COLOR = '#4a9eff';
