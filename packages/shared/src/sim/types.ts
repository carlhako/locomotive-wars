/**
 * Plain-data types for the headless simulation. Everything here is JSON-serializable so the
 * server can snapshot it and tests can compare worlds structurally.
 */

/** Carriages that fire while the fire input is held. */
export type WeaponKind = 'mg' | 'missile' | 'laser' | 'flak';
/** Carriages that attack on their own, without fire input. */
export type AutoKind = 'tailgun' | 'tesla' | 'mines';
export type DefenseKind = 'shield' | 'drones' | 'armor' | 'cowcatcher';
export type SupportKind = 'speed' | 'magnet' | 'fuel' | 'repair' | 'cloak';
/** What a trailer or dropped pickup holds, and the carriage it becomes. */
export type PickupKind = WeaponKind | AutoKind | DefenseKind | SupportKind;
export type CarriageKind = 'locomotive' | PickupKind;

export type EnemyKind = 'drone' | 'hunter' | 'sentry' | 'boss';
export type ProjectileKind = 'bullet' | 'missile' | 'laser' | 'drone' | 'enemy' | 'flak';
export type Controller = 'human' | 'bot';
/** Who owns a projectile, took damage, or dealt it. Trains and enemies share one id space. */
export type EntityKind = 'train' | 'enemy';

/** What destroyed a train: another train's body or weapon, an enemy, or the boss. */
export type KillCause = 'ram' | 'weapon' | 'enemy' | 'boss';

export interface DamageSource {
  kind: EntityKind;
  id: number;
}

/** Per-tick control input. Humans and bots both produce exactly this. */
export interface TrainInput {
  /** -1 (left) to 1 (right). */
  turn: number;
  boost: boolean;
  brake: boolean;
  /** Weapon carriages fire while this is on. */
  fire: boolean;
  /** World-space aim angle in radians. */
  aim: number;
}

/** One sample of the head's trail; `s` is the cumulative arc length travelled at the sample. */
export interface PathSample {
  x: number;
  y: number;
  angle: number;
  s: number;
}

export interface Carriage {
  kind: CarriageKind;
  x: number;
  y: number;
  /** Direction of travel at the carriage's position on the trail. */
  angle: number;
}

export interface Drone {
  /** Orbit angle around the train head. */
  angle: number;
  fireTimer: number;
}

export type BotMode = 'wander' | 'seek' | 'attack' | 'flee';

/** Bot controller memory. Present on every train, only used while `controller === 'bot'`. */
export interface BotState {
  mode: BotMode;
  /** Seconds until the next decision. */
  decisionTimer: number;
  /** Train being fled from or attacked, if any. */
  targetTrainId: number | null;
  /** Position being steered at in seek and wander modes. */
  targetX: number;
  targetY: number;
}

export interface TrainState {
  id: number;
  name: string;
  color: string;
  controller: Controller;
  alive: boolean;
  /** Head position and heading (heading is unbounded; use shortAngle to compare). */
  x: number;
  y: number;
  angle: number;
  hull: number;
  maxHull: number;
  fuel: number;
  input: TrainInput;
  /** True after boost drained the tank, until the boost input is released. */
  boostLocked: boolean;
  /** True on a tick the train moved at boost speed (for client effects). */
  boosting: boolean;
  /** True while the head is within bridge range of its own trail. */
  bridgeActive: boolean;
  /** Index 0 is the locomotive. */
  carriages: Carriage[];
  /** Weapon cooldowns, parallel to `carriages`. */
  fireTimers: number[];
  drones: Drone[];
  armorBonus: number;
  speedBonus: number;
  fuelBonus: number;
  magnetBonus: number;
  /** Damage reduction from shield carriages before the cap. */
  damageReduction: number;
  /** Hull/s of extra regeneration from repair cars, before the cap. */
  repairBonus: number;
  /** Extra ram damage dealt to enemies, from cowcatchers. */
  ramBonus: number;
  /** Fraction of ram damage taken removed by cowcatchers, before the cap. */
  ramReduction: number;
  /** Cloak carriages: any hides the train from other players' minimaps. */
  cloaks: number;
  path: PathSample[];
  ai: BotState;
  /** Seconds of spawn protection left; the train cannot be harmed, ram, or fire while above 0. */
  protectedFor: number;
  /** Increments each time the train respawns, so clients can tell a new train from a moved one. */
  spawnSeq: number;
  /** Trains this train has destroyed since it last spawned. For the kill feed, not score. */
  kills: number;
  /** Highest live score (carriages behind the locomotive) reached this round. */
  roundBest: number;
  /** Tick at which `roundBest` was first reached; breaks ties between equal bests. */
  roundBestTick: number;
}

export interface EnemyState {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  angle: number;
  hull: number;
  maxHull: number;
  speed: number;
  damage: number;
  shootTimer: number;
  moveTimer: number;
  targetAngle: number;
  /** Boss only: display name; empty for other enemies. */
  name: string;
  /** Boss only: current angle around its orbit target. */
  orbitAngle: number;
}

export interface Projectile {
  id: number;
  kind: ProjectileKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  /** Seconds remaining. */
  life: number;
  /** Splash radius against enemies and other trains' heads; 0 for none. */
  splash: number;
  ownerKind: EntityKind;
  ownerId: number;
  /** Hits left before the projectile is consumed: 1 for most, more for a piercing laser. */
  pierce: number;
  /** Targets already hit (trains and enemies share one id space); each is hit at most once. */
  hitIds: number[];
}

/** A mine dropped by a mine layer. It is armed once `age >= MINE_ARM_TIME`. */
export interface Mine {
  id: number;
  x: number;
  y: number;
  /** The train that laid it; it never harms or is set off by that train. */
  ownerId: number;
  /** Seconds since it was dropped. */
  age: number;
}

/** A trailer on the map or a dropped pickup. `age` only advances for drops. */
export interface Pickup {
  id: number;
  x: number;
  y: number;
  kind: PickupKind;
  age: number;
}

export type SimEvent =
  | {
      type: 'fired';
      weapon: ProjectileKind;
      ownerKind: EntityKind;
      ownerId: number;
      x: number;
      y: number;
      angle: number;
      /** Tail gunner shots only: the firing carriage's index, so clients can turn its turret. */
      carriage?: number;
    }
  | {
      type: 'hit';
      victimKind: EntityKind;
      victimId: number;
      attackerKind: EntityKind | null;
      attackerId: number | null;
      /** Damage actually applied (after shield reduction for trains). */
      amount: number;
      x: number;
      y: number;
    }
  | {
      type: 'enemyDestroyed';
      enemyId: number;
      enemyKind: Exclude<EnemyKind, 'boss'>;
      /** Train that earned the kill, if any. */
      sourceId: number | null;
      x: number;
      y: number;
    }
  | {
      type: 'trainDestroyed';
      victimId: number;
      cause: KillCause;
      /** Train that earned the kill: the projectile's owner or the body rammed. */
      killerTrainId?: number;
      /** Enemy (or boss) that landed the killing blow. */
      killerEnemyId?: number;
      x: number;
      y: number;
    }
  | {
      type: 'pickup';
      trainId: number;
      pickupId: number;
      carriage: PickupKind;
      source: 'trailer' | 'drop';
      /** False when the train was at its carriage limit and the pickup was only consumed. */
      added: boolean;
      x: number;
      y: number;
    }
  | {
      /** A train was removed from the world without being destroyed (its owner left). */
      type: 'trainLeft';
      trainId: number;
      x: number;
      y: number;
    }
  | { type: 'bridgeOn'; trainId: number; x: number; y: number }
  | { type: 'bridgeOff'; trainId: number; x: number; y: number }
  | { type: 'bossSpawn'; enemyId: number; name: string; x: number; y: number }
  | {
      /** A tesla coil's instant chain: the coil, the first target, and the chained one if any. */
      type: 'zap';
      ownerId: number;
      points: Array<[number, number]>;
      /** The coil's position. */
      x: number;
      y: number;
    }
  | { type: 'mineExploded'; mineId: number; ownerId: number; x: number; y: number }
  | {
      type: 'bossDown';
      enemyId: number;
      name: string;
      sourceId: number | null;
      x: number;
      y: number;
    };

export interface WorldOptions {
  /** Seed for the world's random source. Default 1. */
  seed?: number;
  /** Ticks per second. Default 30. */
  tickRate?: number;
  /** Side length of the square, wrapping world. Default 6000. */
  mapSize?: number;
  /** Maximum carriages per train, locomotive included. Default 150. */
  maxCarriages?: number;
  /** Arc length between carriages along the head's path. Default 18. */
  carriageSpacing?: number;
  /** Trailers the world replenishes up to. Default 60. */
  maxTrailers?: number;
  /** Enemies the world replenishes up to. Default 22. */
  maxEnemies?: number;
  /** Trailers placed when the world is created. Default 50. */
  initialTrailers?: number;
  /** Enemies placed when the world is created. Default 12. */
  initialEnemies?: number;
  /** Whether the boss schedule runs. Default true. */
  boss?: boolean;
}

export type ResolvedWorldOptions = Required<WorldOptions>;

export interface AddTrainOptions {
  /** An id from `World.newId()` reserved earlier. Default: a fresh one. */
  id?: number;
  name?: string;
  color?: string;
  controller?: Controller;
  x?: number;
  y?: number;
  /** Initial heading in radians. Random if omitted. */
  angle?: number;
  /** Carriages to add behind the locomotive. Default: one MG, the starter train. */
  carriages?: readonly PickupKind[];
  /** Seconds of spawn protection. Default `SPAWN_PROTECTION`. */
  protectedFor?: number;
}

/** Everything that changes as the world runs, in one serializable object. */
export interface WorldState {
  tick: number;
  /** Seconds simulated. */
  time: number;
  nextId: number;
  trains: TrainState[];
  enemies: EnemyState[];
  projectiles: Projectile[];
  mines: Mine[];
  trailers: Pickup[];
  drops: Pickup[];
  trailerTimer: number;
  enemyTimer: number;
  bossTimer: number;
  bossId: number | null;
}
