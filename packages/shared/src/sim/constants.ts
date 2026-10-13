import type { EnemyKind, PickupKind, ProjectileKind, WeaponKind } from './types.ts';

/**
 * Tuning constants for the simulation. Values come from `reference/locomotive-wars-v4.html`;
 * `ref:N` cites the line of the reference that defines or uses each one. Entries marked
 * "new" have no reference equivalent (they exist because the simulation is now tick-based).
 */

// ===== World and tick =====
/** ref:182 */
export const MAP_SIZE = 6000;
/** new: fixed ticks per second; the reference ran a variable-dt frame loop. */
export const TICK_RATE = 30;
/** new: default carriage cap per train, locomotive included. */
export const MAX_CARRIAGES = 150;

// ===== Train movement =====
/** ref:183 PLAYER_SPEED, units/s. */
export const BASE_SPEED = 180;
/** ref:184, units/s. */
export const BOOST_SPEED = 380;
/** ref:185, radians/s at full turn input. */
export const TURN_RATE = 3.6;
/** ref:560: braking multiplies speed. */
export const BRAKE_FACTOR = 0.5;
/** ref:186 CARRIAGE_SPACING (declared but unused there); now the arc length between carriages. */
export const CARRIAGE_SPACING = 18;
/** new: extra trail kept beyond the last possible carriage, in carriage spacings. */
export const PATH_MARGIN_CARRIAGES = 2;

// ===== Fuel =====
/** ref:190 */
export const FUEL_MAX = 100;
/** ref:191, per second while boosting. */
export const FUEL_DRAIN = 28;
/** ref:192, per second otherwise. */
export const FUEL_REGEN = 12;
/** ref:558: fuel cap is FUEL_MAX * (1 + fuelBonus * this). */
export const FUEL_CAPACITY_PER_BONUS = 0.5;

// ===== Hull =====
/** ref:478: hull before the first max-hull clamp. */
export const INITIAL_HULL = 100;
/** ref:540 */
export const BASE_HULL = 80;
/** ref:540: per carriage behind the locomotive. */
export const HULL_PER_CARRIAGE = 35;
/** ref:643-644: 0.5 hull at a 0.5/s chance, i.e. 0.25 hull/s on average (now exact). */
export const HULL_REGEN = 0.25;
/** ref:857 */
export const DAMAGE_REDUCTION_CAP = 0.7;

// ===== Carriage effects (ref:531-536) =====
export const ARMOR_BONUS = 35;
export const SPEED_BONUS = 0.07;
export const FUEL_BONUS = 0.3;
export const MAGNET_BONUS = 14;
export const SHIELD_REDUCTION = 0.08;

// ===== Pickups =====
/** ref:188 */
export const PICKUP_RADIUS_BASE = 32;
/** ref:1459: seconds before a dropped pickup disappears. */
export const DROP_LIFETIME = 35;
/** ref:883: fraction of carriages dropped when a train is destroyed. */
export const DEATH_DROP_FRACTION = 0.5;
/** ref:889: random offset applied to each death drop. */
export const DEATH_DROP_JITTER = 20;
/** ref:1393 */
export const ENEMY_DROP_JITTER = 15;
/** ref:1370 */
export const BOSS_DROP_JITTER = 30;

export interface TrailerType {
  kind: PickupKind;
  /** Rarity weight for random draws. */
  rarity: number;
}
/** ref:207-217, same order so weighted draws match. */
export const TRAILER_TYPES: readonly TrailerType[] = [
  { kind: 'mg', rarity: 1.0 },
  { kind: 'missile', rarity: 0.7 },
  { kind: 'laser', rarity: 0.8 },
  { kind: 'shield', rarity: 1.0 },
  { kind: 'drones', rarity: 0.7 },
  { kind: 'armor', rarity: 0.9 },
  { kind: 'speed', rarity: 0.9 },
  { kind: 'magnet', rarity: 0.8 },
  { kind: 'fuel', rarity: 0.9 },
];

// ===== Population =====
/** ref:195 */
export const MAX_TRAILERS = 60;
/** ref:196 */
export const MAX_ENEMIES = 22;
/** ref:1140 */
export const INITIAL_TRAILERS = 50;
/** ref:1142 */
export const INITIAL_ENEMIES = 12;
/** ref:193 */
export const TRAILER_RESPAWN = 4.0;
/** ref:1618: respawn interval is TRAILER_RESPAWN * (min + rand * span). */
export const TRAILER_RESPAWN_MIN = 0.6;
export const TRAILER_RESPAWN_SPAN = 0.8;
/** ref:1590: collecting a trailer never lets the respawn timer drop below this. */
export const TRAILER_RESPAWN_FLOOR = 0.5;
/** ref:194 */
export const ENEMY_RESPAWN = 7.0;
/** ref:1625 */
export const ENEMY_RESPAWN_MIN = 0.6;
export const ENEMY_RESPAWN_SPAN = 1.0;
/** ref:1619: margin from the map edge for trailer spawns. */
export const TRAILER_SPAWN_MARGIN = 100;
/** ref:1626 */
export const ENEMY_SPAWN_MARGIN = 150;
/** ref:990-994: train spawn margin, tries, and clearance from other trains. */
export const TRAIN_SPAWN_MARGIN = 200;
export const TRAIN_SPAWN_TRIES = 20;
export const TRAIN_SPAWN_CLEARANCE = 800;

/** Default colors for trains (ref:292). */
export const TRAIN_COLORS: readonly string[] = [
  '#ff6666',
  '#66ff66',
  '#6666ff',
  '#ffcc66',
  '#cc66ff',
  '#66ffcc',
  '#ff66cc',
  '#ccff66',
  '#ff9966',
  '#9966ff',
  '#66ccff',
  '#ff66aa',
];

// ===== Collision =====
/** ref:1416: train head hit radius for projectiles (enemy shots used 12 at ref:1426). */
export const HEAD_RADIUS = 14;
/** ref:1318 */
export const ENEMY_HIT_RADIUS = 18;
/** ref:1318 */
export const BOSS_HIT_RADIUS = 28;
/** ref:1604 */
export const RAM_RADIUS = 16;
/** ref:1605 */
export const RAM_DAMAGE_TO_TRAIN = 40;
/** ref:1606 */
export const RAM_DAMAGE_TO_ENEMY = 20;

// ===== Bridge (safe self-crossing) =====
/** ref:203 */
export const BRIDGE_RADIUS = 32;
/** ref:667: carriages before this index are never "trail". */
export const BRIDGE_MIN_INDEX = 4;

// ===== Weapons =====
export interface WeaponStats {
  /** Shots per second. */
  fireRate: number;
  damage: number;
  /** Projectile speed, units/s. */
  speed: number;
  /** Splash radius against enemies; 0 for none. */
  splash: number;
  projectile: ProjectileKind;
}
export const WEAPONS: Record<WeaponKind, WeaponStats> = {
  /** ref:733 */
  mg: { fireRate: 7, damage: 7, speed: 550, splash: 0, projectile: 'bullet' },
  /** ref:734 */
  missile: { fireRate: 0.9, damage: 28, speed: 280, splash: 50, projectile: 'missile' },
  /** ref:735 */
  laser: { fireRate: 3.5, damage: 14, speed: 900, splash: 0, projectile: 'laser' },
};
/** ref:731: a hostile must be this close to a weapon carriage for it to fire. */
export const WEAPON_RANGE = 550;
/** ref:746: firing arc half-width from the carriage heading (72 degrees). */
export const WEAPON_ARC = Math.PI / 2.5;
/** ref:751: muzzle distance from the carriage. */
export const WEAPON_MUZZLE_OFFSET = 9;
/** ref:754 */
export const PROJECTILE_LIFE = 1.6;
/** ref:1336: splash damage as a fraction of the direct hit. */
export const SPLASH_DAMAGE_FACTOR = 0.6;

// ===== Counter-drones =====
/** ref:703 */
export const DRONE_ORBIT_RADIUS = 35;
/** ref:589 (1.8/s) plus ref:700 (2/s): both advance the angle each frame. */
export const DRONE_ORBIT_SPEED = 3.8;
/** ref:705 */
export const DRONE_RANGE = 250;
/** ref:711 */
export const DRONE_COOLDOWN = 0.6;
/** ref:715 */
export const DRONE_PROJECTILE_SPEED = 380;
/** ref:716 */
export const DRONE_DAMAGE = 4;
/** ref:717 */
export const DRONE_PROJECTILE_LIFE = 1.0;

// ===== PvE enemies =====
export interface EnemyStats {
  hull: number;
  speed: number;
  damage: number;
}
/** ref:929-932 */
export const ENEMY_STATS: Record<Exclude<EnemyKind, 'boss'>, EnemyStats> = {
  drone: { hull: 25, speed: 90, damage: 5 },
  hunter: { hull: 90, speed: 70, damage: 9 },
  sentry: { hull: 180, speed: 0, damage: 12 },
};
/** ref:921-923: a random draw below the first is a drone, below the second a hunter, else sentry. */
export const ENEMY_DRONE_BELOW = 0.55;
export const ENEMY_HUNTER_BELOW = 0.85;
/** ref:1276: seconds between wander decisions is base + rand * span. */
export const ENEMY_MOVE_INTERVAL_BASE = 1.5;
export const ENEMY_MOVE_INTERVAL_SPAN = 2;
/** ref:1278 (grace period not ported) */
export const ENEMY_AGGRO_CHANCE = 0.4;
/** ref:1280 */
export const ENEMY_AGGRO_JITTER = 0.5;
/** ref:1284 */
export const ENEMY_TURN_RATE = 1.5;
/** ref:1291 */
export const SENTRY_RANGE = 500;
export const ENEMY_RANGE = 380;
/** ref:1292 */
export const SENTRY_COOLDOWN = 1.0;
export const ENEMY_COOLDOWN = 1.5;
/** ref:1296 */
export const SENTRY_PROJECTILE_SPEED = 320;
export const ENEMY_PROJECTILE_SPEED = 240;
/** ref:1299 */
export const ENEMY_PROJECTILE_LIFE = 2.5;

// ===== Boss =====
/** ref:198: seconds before the first boss (counted from ref:1215's 5 s gate). */
export const BOSS_INTERVAL = 75;
/** ref:1215: the boss countdown only runs once the world is older than this. */
export const BOSS_START_GATE = 5;
/** ref:1218: after a spawn the countdown restarts at BOSS_INTERVAL * this. */
export const BOSS_REPEAT_FACTOR = 1.5;
/** ref:954 */
export const BOSS_HULL = 1200;
/** ref:955 */
export const BOSS_SPEED = 50;
/** ref:956 */
export const BOSS_DAMAGE = 22;
/** ref:944 */
export const BOSS_NAMES: readonly string[] = [
  'OVERLORD',
  'DOOMCARRIAGE',
  'IRON COLOSSUS',
  'NULLIFIER',
  'HEARTSTEALER',
  'WORLDEATER',
  'ANNIHILATOR',
];
/** ref:946-948: spawn margin, tries, and the distance band from the focal train. */
export const BOSS_SPAWN_MARGIN = 300;
export const BOSS_SPAWN_TRIES = 30;
export const BOSS_SPAWN_MIN_DIST = 1500;
export const BOSS_SPAWN_MAX_DIST = 3000;
/** ref:1244 */
export const BOSS_ORBIT_DIST = 380;
/** ref:1245 (radians/s) */
export const BOSS_ORBIT_SPEED = 0.6;
/** ref:1250 */
export const BOSS_TURN_RATE = 0.8;
/** ref:1257 */
export const BOSS_COOLDOWN = 1.2;
/** ref:1260: shots fire at -1, 0, +1 times this angle off the target bearing. */
export const BOSS_SPREAD = 0.25;
/** ref:1264 */
export const BOSS_PROJECTILE_SPEED = 280;
/** ref:1262 */
export const BOSS_MUZZLE_OFFSET = 20;
/** ref:1268 */
export const BOSS_PROJECTILE_LIFE = 3;
/** ref:1367 */
export const BOSS_DROPS = 5;

// ===== Bot controller =====
/** ref:789: seconds between decisions is base + rand * span. */
export const BOT_DECISION_BASE = 1.0;
export const BOT_DECISION_SPAN = 1.5;
/** ref:790 */
export const BOT_THREAT_RANGE = 280;
/** ref:803 */
export const BOT_PREY_RANGE = 350;
/** ref:815 */
export const BOT_SEEK_RANGE = 1200;
/** ref:793, 806: trains are a threat or prey when their carriage count differs by more than this. */
export const BOT_SIZE_MARGIN = 2;
/** ref:825: margin from the map edge for wander targets. */
export const BOT_WANDER_MARGIN = 200;
/** ref:848: turn input is the heading error times this, clamped to [-1, 1]. */
export const BOT_TURN_GAIN = 2;
/** new: bots only boost above this fuel, so they do not flicker at an empty tank. */
export const BOT_BOOST_MIN_FUEL = 5;
