import type { CarriageKind, PickupKind } from '@lw/shared';

/** Colours and labels for pickups (reference TRAILER_TYPES, line 207). */
export interface PickupStyle {
  label: string;
  color: string;
  icon: string;
}

export const PICKUP_STYLES: Record<PickupKind, PickupStyle> = {
  mg: { label: 'MG Turret', color: '#ff4444', icon: 'M' },
  missile: { label: 'Missile', color: '#ff6633', icon: 'R' },
  laser: { label: 'Laser', color: '#ffaa00', icon: 'L' },
  shield: { label: 'Shield', color: '#4488ff', icon: 'S' },
  drones: { label: 'Counter-Drone', color: '#44ddff', icon: 'D' },
  armor: { label: 'Armor', color: '#9944ff', icon: 'A' },
  speed: { label: 'Booster', color: '#44ff88', icon: 'B' },
  magnet: { label: 'Magnet', color: '#ffff44', icon: '◆' },
  fuel: { label: 'Fuel Tank', color: '#ff88ff', icon: 'F' },
};

export interface CarriageColors {
  body: string;
  light: string;
}

/** Body and highlight colours per carriage type (reference getCarriageColor, line 450). */
export const CARRIAGE_COLORS: Record<CarriageKind, CarriageColors> = {
  locomotive: { body: '#888', light: '#aaa' },
  mg: { body: '#cc3333', light: '#ff8888' },
  missile: { body: '#cc4422', light: '#ff9966' },
  laser: { body: '#cc8822', light: '#ffcc55' },
  shield: { body: '#3366cc', light: '#88bbff' },
  drones: { body: '#33aacc', light: '#88e8ff' },
  armor: { body: '#6633cc', light: '#9966ff' },
  speed: { body: '#33cc66', light: '#88ff99' },
  magnet: { body: '#cccc33', light: '#ffff88' },
  fuel: { body: '#cc33aa', light: '#ff88dd' },
};

export function isWeaponCarriage(kind: CarriageKind): boolean {
  return kind === 'mg' || kind === 'missile' || kind === 'laser';
}

/** The local player's colour in the HUD and minimap. */
export const LOCAL_COLOR = '#4a9eff';
