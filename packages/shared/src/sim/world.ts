import { botInput } from './bot.ts';
import { dropCarriages, fireDrones, fireWeapons, ramEnemies, stepProjectiles } from './combat.ts';
import {
  BOSS_INTERVAL,
  BOSS_REPEAT_FACTOR,
  BOSS_START_GATE,
  DROP_LIFETIME,
  ENEMY_RESPAWN,
  ENEMY_RESPAWN_MIN,
  ENEMY_RESPAWN_SPAN,
  ENEMY_SPAWN_MARGIN,
  INITIAL_ENEMIES,
  INITIAL_TRAILERS,
  MAP_SIZE,
  MAX_CARRIAGES,
  MAX_ENEMIES,
  MAX_TRAILERS,
  CARRIAGE_SPACING,
  TICK_RATE,
  TRAILER_RESPAWN,
  TRAILER_RESPAWN_FLOOR,
  TRAILER_RESPAWN_MIN,
  TRAILER_RESPAWN_SPAN,
  TRAILER_SPAWN_MARGIN,
  TRAILER_TYPES,
  TRAIN_COLORS,
  TRAIN_SPAWN_CLEARANCE,
  TRAIN_SPAWN_MARGIN,
  TRAIN_SPAWN_TRIES,
} from './constants.ts';
import { spawnBoss, spawnEnemyAt, stepEnemies } from './enemies.ts';
import { clamp, TWO_PI, wrapDist, wrapPos } from './math.ts';
import { Rng } from './rng.ts';
import { addCarriage, advanceTrain, createTrain, pickupRadiusOf, updateBridge } from './train.ts';
import type { TrainRules } from './train.ts';
import type {
  AddTrainOptions,
  EnemyKind,
  EnemyState,
  Pickup,
  PickupKind,
  ResolvedWorldOptions,
  SimEvent,
  TrainInput,
  TrainState,
  WorldOptions,
  WorldState,
} from './types.ts';

/**
 * The authoritative game world: any number of trains (human or bot), PvE enemies, a boss,
 * pickups, and projectiles on a wrapping square map. `step()` advances exactly one fixed tick
 * and returns the events that happened; callers own real-time scheduling.
 */
export class World {
  readonly options: ResolvedWorldOptions;
  /** The world's only source of randomness. */
  readonly rng: Rng;
  /** All mutable simulation state, plain data. */
  readonly state: WorldState;
  /** Seconds simulated per `step()`. */
  readonly dt: number;
  /** Geometry shared by every train. */
  readonly rules: TrainRules;
  private events: SimEvent[] = [];

  constructor(options: WorldOptions = {}) {
    this.options = {
      seed: options.seed ?? 1,
      tickRate: options.tickRate ?? TICK_RATE,
      mapSize: options.mapSize ?? MAP_SIZE,
      maxCarriages: options.maxCarriages ?? MAX_CARRIAGES,
      carriageSpacing: options.carriageSpacing ?? CARRIAGE_SPACING,
      maxTrailers: options.maxTrailers ?? MAX_TRAILERS,
      maxEnemies: options.maxEnemies ?? MAX_ENEMIES,
      initialTrailers: options.initialTrailers ?? INITIAL_TRAILERS,
      initialEnemies: options.initialEnemies ?? INITIAL_ENEMIES,
      boss: options.boss ?? true,
    };
    this.rng = new Rng(this.options.seed);
    this.dt = 1 / this.options.tickRate;
    this.rules = {
      size: this.options.mapSize,
      spacing: this.options.carriageSpacing,
      maxCarriages: this.options.maxCarriages,
    };
    this.state = {
      tick: 0,
      time: 0,
      nextId: 1,
      trains: [],
      enemies: [],
      projectiles: [],
      trailers: [],
      drops: [],
      trailerTimer: 0,
      enemyTimer: 0,
      bossTimer: BOSS_INTERVAL,
      bossId: null,
    };
    for (let i = 0; i < this.options.initialTrailers; i++) this.spawnTrailer();
    for (let i = 0; i < this.options.initialEnemies; i++) this.spawnEnemy();
  }

  // ===== Internals used by the sim modules =====

  /** Records an event for the current tick. */
  emit(event: SimEvent): void {
    this.events.push(event);
  }

  /** Allocates an id, unique across trains, enemies, projectiles, and pickups. */
  newId(): number {
    return this.state.nextId++;
  }

  randomPos(margin: number): { x: number; y: number } {
    const size = this.rules.size;
    return { x: this.rng.range(margin, size - margin), y: this.rng.range(margin, size - margin) };
  }

  /** Draws a pickup type by rarity. */
  randomPickupKind(): PickupKind {
    return this.rng.weighted(TRAILER_TYPES, (t) => t.rarity).kind;
  }

  /** Puts a dropped pickup into the world; it expires after 35 seconds. */
  spawnDrop(x: number, y: number, kind: PickupKind = this.randomPickupKind()): Pickup {
    const drop: Pickup = {
      id: this.newId(),
      x: wrapPos(x, this.rules.size),
      y: wrapPos(y, this.rules.size),
      kind,
      age: 0,
    };
    this.state.drops.push(drop);
    return drop;
  }

  /** Nearest living train to a point, optionally limited to human-controlled ones. */
  nearestTrain(x: number, y: number, humansOnly = false): TrainState | null {
    let best: TrainState | null = null;
    let bestDist = Infinity;
    for (const t of this.state.trains) {
      if (!t.alive || (humansOnly && t.controller !== 'human')) continue;
      const d = wrapDist(x, y, t.x, t.y, this.rules.size);
      if (d < bestDist) {
        bestDist = d;
        best = t;
      }
    }
    return best;
  }

  // ===== Public API =====

  getTrain(id: number): TrainState | undefined {
    return this.state.trains.find((t) => t.id === id);
  }

  getEnemy(id: number): EnemyState | undefined {
    return this.state.enemies.find((e) => e.id === id);
  }

  /** Adds a train with a locomotive plus any requested carriages. */
  addTrain(opts: AddTrainOptions = {}): TrainState {
    const id = this.newId();
    let x = opts.x;
    let y = opts.y;
    if (x === undefined || y === undefined) {
      const pos = this.findSpawnPosition();
      x = pos.x;
      y = pos.y;
    }
    const angle = opts.angle ?? this.rng.range(0, TWO_PI);
    const train = createTrain(
      {
        id,
        name: opts.name ?? `Train ${id}`,
        color: opts.color ?? (TRAIN_COLORS[id % TRAIN_COLORS.length] as string),
        controller: opts.controller ?? 'human',
        x: wrapPos(x, this.rules.size),
        y: wrapPos(y, this.rules.size),
        angle,
      },
      this.rules,
    );
    for (const kind of opts.carriages ?? []) addCarriage(train, kind, this.rules, this.rng);
    this.state.trains.push(train);
    return train;
  }

  /**
   * Removes a train. With `drop`, half of a living train's carriages become pickups as in a
   * destruction. A living train's removal is reported as a `trainLeft` event, never as a kill.
   */
  removeTrain(id: number, opts: { drop?: boolean } = {}): boolean {
    const train = this.getTrain(id);
    if (!train) return false;
    if (train.alive) {
      if (opts.drop) dropCarriages(this, train);
      this.emit({ type: 'trainLeft', trainId: id, x: train.x, y: train.y });
    }
    this.state.trains = this.state.trains.filter((t) => t.id !== id);
    return true;
  }

  /**
   * Sets fields of a train's control input. Fields not given keep their previous value, and
   * the input stays in force on every following tick until changed. Non-finite numbers are
   * ignored and turn is clamped to [-1, 1], so untrusted input is safe to pass straight in.
   */
  setInput(id: number, input: Partial<TrainInput>): void {
    const train = this.getTrain(id);
    if (!train) return;
    const cur = train.input;
    if (typeof input.turn === 'number' && Number.isFinite(input.turn)) {
      cur.turn = clamp(input.turn, -1, 1);
    }
    if (typeof input.aim === 'number' && Number.isFinite(input.aim)) cur.aim = input.aim;
    if (typeof input.boost === 'boolean') cur.boost = input.boost;
    if (typeof input.brake === 'boolean') cur.brake = input.brake;
  }

  /** Adds a carriage to a train as if it had picked one up. False at the carriage limit. */
  addCarriage(trainId: number, kind: PickupKind): boolean {
    const train = this.getTrain(trainId);
    if (!train) return false;
    return addCarriage(train, kind, this.rules, this.rng);
  }

  spawnTrailer(x?: number, y?: number, kind?: PickupKind): Pickup {
    let px = x;
    let py = y;
    if (px === undefined || py === undefined) {
      const pos = this.randomPos(TRAILER_SPAWN_MARGIN);
      px = pos.x;
      py = pos.y;
    }
    const trailer: Pickup = {
      id: this.newId(),
      x: wrapPos(px, this.rules.size),
      y: wrapPos(py, this.rules.size),
      kind: kind ?? this.randomPickupKind(),
      age: 0,
    };
    this.state.trailers.push(trailer);
    return trailer;
  }

  /** Adds a PvE enemy. Kind and position are random when omitted. */
  spawnEnemy(kind?: Exclude<EnemyKind, 'boss'>, x?: number, y?: number): EnemyState {
    let px = x;
    let py = y;
    if (px === undefined || py === undefined) {
      const pos = this.randomPos(ENEMY_SPAWN_MARGIN);
      px = pos.x;
      py = pos.y;
    }
    return spawnEnemyAt(this, kind, px, py);
  }

  /** Spawns the boss now. Returns the existing boss if one is already alive. */
  spawnBoss(): EnemyState {
    const existing = this.state.bossId === null ? undefined : this.getEnemy(this.state.bossId);
    if (existing && existing.hull > 0) return existing;
    return spawnBoss(this);
  }

  /**
   * Advances the world by one tick and returns that tick's events in order. Events raised
   * between steps (a train removed by its owner) come first.
   */
  step(): SimEvent[] {
    const s = this.state;
    const dt = this.dt;
    s.tick += 1;
    s.time += dt;

    for (const train of s.trains) {
      if (train.alive && train.controller === 'bot') {
        train.input = botInput(this, train.id, this.rng);
      }
    }

    for (const train of s.trains) {
      if (!train.alive) continue;
      advanceTrain(train, dt, this.rules);
      const bridge = updateBridge(train, this.rules);
      if (bridge !== null) {
        this.emit({
          type: bridge ? 'bridgeOn' : 'bridgeOff',
          trainId: train.id,
          x: train.x,
          y: train.y,
        });
      }
      fireWeapons(this, train);
      fireDrones(this, train);
    }

    if (this.options.boss && s.bossId === null && s.time > BOSS_START_GATE) {
      s.bossTimer -= dt;
      if (s.bossTimer <= 0) {
        s.bossTimer = BOSS_INTERVAL * BOSS_REPEAT_FACTOR;
        spawnBoss(this);
      }
    }

    stepEnemies(this);
    stepProjectiles(this);
    this.collectPickups();
    ramEnemies(this);
    this.expireDrops();
    s.enemies = s.enemies.filter((e) => e.hull > 0);
    this.replenish();

    const events = this.events;
    this.events = [];
    return events;
  }

  // ===== Step phases =====

  private collectPickups(): void {
    const s = this.state;
    for (const train of s.trains) {
      if (!train.alive) continue;
      const radius = pickupRadiusOf(train);
      s.trailers = this.collect(train, s.trailers, radius, 'trailer');
      s.drops = this.collect(train, s.drops, radius, 'drop');
    }
  }

  private collect(
    train: TrainState,
    list: Pickup[],
    radius: number,
    source: 'trailer' | 'drop',
  ): Pickup[] {
    const kept: Pickup[] = [];
    for (const p of list) {
      if (wrapDist(train.x, train.y, p.x, p.y, this.rules.size) >= radius) {
        kept.push(p);
        continue;
      }
      const added = addCarriage(train, p.kind, this.rules, this.rng);
      this.emit({
        type: 'pickup',
        trainId: train.id,
        pickupId: p.id,
        carriage: p.kind,
        source,
        added,
        x: p.x,
        y: p.y,
      });
      if (source === 'trailer') {
        this.state.trailerTimer = Math.max(TRAILER_RESPAWN_FLOOR, this.state.trailerTimer);
      }
    }
    return kept;
  }

  private expireDrops(): void {
    const dt = this.dt;
    for (const d of this.state.drops) d.age += dt;
    this.state.drops = this.state.drops.filter((d) => d.age <= DROP_LIFETIME);
  }

  private replenish(): void {
    const s = this.state;
    const dt = this.dt;
    if (s.trailers.length < this.options.maxTrailers) {
      s.trailerTimer -= dt;
      if (s.trailerTimer <= 0) {
        s.trailerTimer =
          TRAILER_RESPAWN * (TRAILER_RESPAWN_MIN + this.rng.next() * TRAILER_RESPAWN_SPAN);
        this.spawnTrailer();
      }
    }
    if (s.enemies.length < this.options.maxEnemies) {
      s.enemyTimer -= dt;
      if (s.enemyTimer <= 0) {
        s.enemyTimer = ENEMY_RESPAWN * (ENEMY_RESPAWN_MIN + this.rng.next() * ENEMY_RESPAWN_SPAN);
        this.spawnEnemy();
      }
    }
  }

  /** Random position away from living trains (best effort after a few tries). */
  private findSpawnPosition(): { x: number; y: number } {
    let pos = { x: 0, y: 0 };
    for (let tries = 0; tries < TRAIN_SPAWN_TRIES; tries++) {
      pos = this.randomPos(TRAIN_SPAWN_MARGIN);
      const crowded = this.state.trains.some(
        (t) => t.alive && wrapDist(pos.x, pos.y, t.x, t.y, this.rules.size) < TRAIN_SPAWN_CLEARANCE,
      );
      if (!crowded) break;
    }
    return pos;
  }
}
