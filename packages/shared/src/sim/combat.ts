import {
  AIM_CLOSE_RANGE,
  BOSS_DROP_JITTER,
  BOSS_DROPS,
  BODY_COLLISION_MIN_INDEX,
  BODY_COLLISION_RADIUS,
  BOSS_HIT_RADIUS,
  DEATH_DROP_FRACTION,
  DEATH_DROP_JITTER,
  DRONE_COOLDOWN,
  DRONE_DAMAGE,
  DRONE_ORBIT_RADIUS,
  DRONE_ORBIT_SPEED,
  DRONE_PROJECTILE_LIFE,
  DRONE_PROJECTILE_SPEED,
  DRONE_RANGE,
  ENEMY_DROP_JITTER,
  ENEMY_HIT_RADIUS,
  FULL_HEART_DROP_CHANCE,
  HEAD_RADIUS,
  MAX_TRAIN_PROJECTILES,
  PROJECTILE_LIFE,
  RAM_DAMAGE_TO_ENEMY,
  RAM_DAMAGE_TO_TRAIN,
  RAM_RADIUS,
  SLOW_HEART_DROP_CHANCE,
  SPLASH_DAMAGE_FACTOR,
  TAILGUN,
  TAILGUN_ARC,
  TAILGUN_RANGE,
  TESLA_CHAIN_RANGE,
  TESLA_COOLDOWN,
  TESLA_DAMAGE,
  TESLA_RANGE,
  WEAPON_MUZZLE_OFFSET,
  WEAPONS,
} from './constants.ts';
import type { WeaponStats } from './constants.ts';
import { segmentCircleHit, shortAngle, wrapAngle, wrapDist, wrapPos } from './math.ts';
import { damageReductionOf, ramReductionOf } from './train.ts';
import type {
  Carriage,
  DamageSource,
  EnemyState,
  EntityKind,
  KillCause,
  Projectile,
  ProjectileKind,
  SimEvent,
  TrainState,
  WeaponKind,
} from './types.ts';
import type { World } from './world.ts';

/** Inserts a projectile and announces the shot. */
export function spawnProjectile(
  world: World,
  spec: {
    kind: ProjectileKind;
    x: number;
    y: number;
    angle: number;
    speed: number;
    damage: number;
    life: number;
    splash?: number;
    pierce?: number;
    ownerKind: EntityKind;
    ownerId: number;
    /** Carriage index to name in the fired event. */
    carriage?: number;
  },
): Projectile {
  const size = world.rules.size;
  const p: Projectile = {
    id: world.newId(),
    kind: spec.kind,
    x: wrapPos(spec.x, size),
    y: wrapPos(spec.y, size),
    vx: Math.cos(spec.angle) * spec.speed,
    vy: Math.sin(spec.angle) * spec.speed,
    damage: spec.damage,
    life: spec.life,
    splash: spec.splash ?? 0,
    ownerKind: spec.ownerKind,
    ownerId: spec.ownerId,
    pierce: spec.pierce ?? 1,
    hitIds: [],
  };
  world.state.projectiles.push(p);
  const fired: Extract<SimEvent, { type: 'fired' }> = {
    type: 'fired',
    weapon: spec.kind,
    ownerKind: spec.ownerKind,
    ownerId: spec.ownerId,
    x: p.x,
    y: p.y,
    angle: spec.angle,
  };
  if (spec.carriage !== undefined) fired.carriage = spec.carriage;
  world.emit(fired);
  return p;
}

// ===== Damage and destruction =====

/** How a kill by this damage source is classed: a train's shot, an enemy's, or the boss's. */
function causeOf(world: World, source: DamageSource | null): KillCause {
  if (source?.kind === 'train') return 'weapon';
  return world.getEnemy(source?.id ?? -1)?.kind === 'boss' ? 'boss' : 'enemy';
}

/**
 * Applies damage to a train after shield reduction and emits a hit event. The train is
 * destroyed at zero hull, crediting `source`. A protected train takes nothing (the caller still
 * consumes the projectile). `at` is where the hit landed (the head by default).
 */
export function damageTrain(
  world: World,
  train: TrainState,
  amount: number,
  source: DamageSource | null,
  at?: { x: number; y: number },
): void {
  if (!train.alive || train.protectedFor > 0) return;
  const dealt = amount * (1 - damageReductionOf(train));
  train.hull -= dealt;
  world.emit({
    type: 'hit',
    victimKind: 'train',
    victimId: train.id,
    attackerKind: source?.kind ?? null,
    attackerId: source?.id ?? null,
    amount: dealt,
    x: at?.x ?? train.x,
    y: at?.y ?? train.y,
  });
  if (train.hull <= 0) destroyTrain(world, train, causeOf(world, source), source);
}

/** Turns half of a train's carriages (rounded down) into random pickups scattered around them. */
export function dropCarriages(world: World, train: TrainState): void {
  const dropCount = Math.floor(train.carriages.length * DEATH_DROP_FRACTION);
  for (let i = 0; i < dropCount; i++) {
    const c = train.carriages[i];
    if (!c) continue;
    const kind = world.randomPickupKind();
    const jx = world.rng.range(-DEATH_DROP_JITTER, DEATH_DROP_JITTER);
    const jy = world.rng.range(-DEATH_DROP_JITTER, DEATH_DROP_JITTER);
    world.spawnDrop(c.x + jx, c.y + jy, kind);
  }
}

/**
 * Marks a train destroyed and turns half its carriages (rounded down) into random pickups
 * scattered around where they were. The train stays in the world, dead, until its owner removes
 * or respawns it. The event names the cause and the killer, and a train killer's kill count goes
 * up.
 */
export function destroyTrain(
  world: World,
  train: TrainState,
  cause: KillCause,
  killer: DamageSource | null,
): void {
  if (!train.alive) return;
  train.alive = false;
  train.hull = 0;
  train.boosting = false;
  train.healDoses = [];
  if (train.bridgeActive) {
    train.bridgeActive = false;
    world.emit({ type: 'bridgeOff', trainId: train.id, x: train.x, y: train.y });
  }
  dropCarriages(world, train);
  const event: Extract<SimEvent, { type: 'trainDestroyed' }> = {
    type: 'trainDestroyed',
    victimId: train.id,
    cause,
    x: train.x,
    y: train.y,
  };
  if (killer?.kind === 'train') {
    event.killerTrainId = killer.id;
    const credited = world.getTrain(killer.id);
    if (credited) credited.kills += 1;
  } else if (killer?.kind === 'enemy') {
    event.killerEnemyId = killer.id;
  }
  world.emit(event);
}

/**
 * Applies damage to an enemy and emits a hit event. Destroyed enemies stay in the list (with
 * zero hull) until the end of the tick, and drop pickups: one and maybe a heart for a regular
 * enemy, five and a full heart for the boss.
 */
export function damageEnemy(
  world: World,
  enemy: EnemyState,
  amount: number,
  source: DamageSource | null,
  at?: { x: number; y: number },
): void {
  if (enemy.hull <= 0) return;
  enemy.hull -= amount;
  world.emit({
    type: 'hit',
    victimKind: 'enemy',
    victimId: enemy.id,
    attackerKind: source?.kind ?? null,
    attackerId: source?.id ?? null,
    amount,
    x: at?.x ?? enemy.x,
    y: at?.y ?? enemy.y,
  });
  if (enemy.hull > 0) return;
  enemy.hull = 0;
  const credit = source?.kind === 'train' ? source.id : null;
  if (enemy.kind === 'boss') {
    for (let i = 0; i < BOSS_DROPS; i++) {
      const jx = world.rng.range(-BOSS_DROP_JITTER, BOSS_DROP_JITTER);
      const jy = world.rng.range(-BOSS_DROP_JITTER, BOSS_DROP_JITTER);
      world.spawnDrop(enemy.x + jx, enemy.y + jy);
    }
    world.spawnHeart('full', enemy.x, enemy.y, true);
    world.state.bossId = null;
    world.emit({
      type: 'bossDown',
      enemyId: enemy.id,
      name: enemy.name,
      sourceId: credit,
      x: enemy.x,
      y: enemy.y,
    });
    return;
  }
  const jx = world.rng.range(-ENEMY_DROP_JITTER, ENEMY_DROP_JITTER);
  const jy = world.rng.range(-ENEMY_DROP_JITTER, ENEMY_DROP_JITTER);
  world.spawnDrop(enemy.x + jx, enemy.y + jy);
  // One roll, so an enemy never drops both kinds.
  const roll = world.rng.next();
  if (roll < FULL_HEART_DROP_CHANCE) world.spawnHeart('full', enemy.x, enemy.y, true);
  else if (roll < FULL_HEART_DROP_CHANCE + SLOW_HEART_DROP_CHANCE) {
    world.spawnHeart('slow', enemy.x, enemy.y, true);
  }
  world.emit({
    type: 'enemyDestroyed',
    enemyId: enemy.id,
    enemyKind: enemy.kind,
    sourceId: credit,
    x: enemy.x,
    y: enemy.y,
  });
}

// ===== Targeting =====

/** Something a train can shoot at: a living enemy, or another train's unprotected head. */
export type Hostile =
  | { kind: 'enemy'; enemy: EnemyState; id: number; x: number; y: number; dist: number }
  | { kind: 'train'; train: TrainState; id: number; x: number; y: number; dist: number };

/**
 * The hostile nearest to (x, y), strictly within `range`, for `train`: living enemies first, then
 * other living, unprotected train heads (an exact tie goes to the enemy). `filter` can rule
 * candidates out, by position or by id.
 */
export function nearestHostile(
  world: World,
  train: TrainState,
  x: number,
  y: number,
  range: number,
  filter?: (h: { id: number; x: number; y: number }) => boolean,
): Hostile | null {
  const size = world.rules.size;
  let best: Hostile | null = null;
  let bestDist = range;
  for (const e of world.state.enemies) {
    if (e.hull <= 0) continue;
    const d = wrapDist(x, y, e.x, e.y, size);
    if (d >= bestDist || (filter && !filter(e))) continue;
    bestDist = d;
    best = { kind: 'enemy', enemy: e, id: e.id, x: e.x, y: e.y, dist: d };
  }
  for (const t of world.state.trains) {
    if (t === train || !t.alive || t.protectedFor > 0) continue;
    const d = wrapDist(x, y, t.x, t.y, size);
    if (d >= bestDist || (filter && !filter(t))) continue;
    bestDist = d;
    best = { kind: 'train', train: t, id: t.id, x: t.x, y: t.y, dist: d };
  }
  return best;
}

/** Damages a hostile, enemy or train head, crediting `source`. */
export function damageHostile(
  world: World,
  target: Hostile,
  amount: number,
  source: DamageSource,
): void {
  if (target.kind === 'enemy') damageEnemy(world, target.enemy, amount, source);
  else damageTrain(world, target.train, amount, source);
}

// ===== Weapons =====

function isWeapon(kind: string): kind is WeaponKind {
  return kind === 'mg' || kind === 'missile' || kind === 'laser' || kind === 'flak';
}

/** Projectile kinds fired by weapon carriages (counter-drone shots are not among them). */
const WEAPON_PROJECTILES: ReadonlySet<ProjectileKind> = new Set(
  Object.values(WEAPONS).map((w) => w.projectile),
);

/** Live weapon-carriage projectiles per owning train id, for the projectile budget. */
export function countWeaponProjectiles(world: World): Map<number, number> {
  const counts = new Map<number, number>();
  for (const p of world.state.projectiles) {
    if (p.ownerKind !== 'train' || !WEAPON_PROJECTILES.has(p.kind)) continue;
    counts.set(p.ownerId, (counts.get(p.ownerId) ?? 0) + 1);
  }
  return counts;
}

/**
 * The bearing a weapon carriage fires along: from the carriage to the train's aim point (the head
 * plus the aim offset), or the head's bearing to it when the carriage is within
 * `AIM_CLOSE_RANGE` of the point, so guns under the cursor do not spin.
 */
export function carriageBearing(world: World, train: TrainState, c: Carriage): number {
  const size = world.rules.size;
  const { aimX, aimY } = train.input;
  const tx = wrapPos(train.x + aimX, size);
  const ty = wrapPos(train.y + aimY, size);
  if (wrapDist(c.x, c.y, tx, ty, size) < AIM_CLOSE_RANGE) {
    return aimX === 0 && aimY === 0 ? train.angle : Math.atan2(aimY, aimX);
  }
  return wrapAngle(c.x, c.y, tx, ty, size);
}

/**
 * Fires each ready weapon carriage at the train's aim point while the fire input is on (see
 * `carriageBearing`), whatever the carriage's heading and whether or not anything is in range,
 * and each ready auto
 * weapon (tail gunner, tesla coil) at whatever it finds, fire input or not. Cooldowns tick down
 * every tick. A protected train holds fire, and a train with `MAX_TRAIN_PROJECTILES` of its
 * shots in flight waits. `live` holds those counts (see `countWeaponProjectiles`) and is
 * updated as the train fires. Mine layers use their timer slot too, but drop in `stepMines`.
 */
export function fireWeapons(world: World, train: TrainState, live: Map<number, number>): void {
  const dt = world.dt;
  const holding = train.protectedFor > 0 || !train.input.fire;
  for (let i = 0; i < train.carriages.length; i++) {
    const c = train.carriages[i];
    if (!c || (!isWeapon(c.kind) && c.kind !== 'tailgun' && c.kind !== 'tesla')) continue;
    // Floor at -dt so an idle weapon is ready next tick without banking a burst of shots.
    const timer = Math.max((train.fireTimers[i] ?? 0) - dt, -dt);
    train.fireTimers[i] = timer;
    if (timer > 0 || train.protectedFor > 0) continue;
    if (c.kind === 'tailgun') {
      if (fireTailGun(world, train, i, live)) train.fireTimers[i] = timer + 1 / TAILGUN.fireRate;
    } else if (c.kind === 'tesla') {
      if (zapTesla(world, train, c)) train.fireTimers[i] = timer + TESLA_COOLDOWN;
    } else if (isWeapon(c.kind) && !holding) {
      const stats = WEAPONS[c.kind];
      if (fireVolley(world, train, c, stats, carriageBearing(world, train, c), live) > 0) {
        train.fireTimers[i] = timer + 1 / stats.fireRate;
      }
    }
  }
}

/**
 * Tail gunner: one bullet at the nearest hostile within range in the carriage's rear half (within
 * `TAILGUN_ARC` of straight back). True when it fired.
 */
function fireTailGun(
  world: World,
  train: TrainState,
  index: number,
  live: Map<number, number>,
): boolean {
  const size = world.rules.size;
  const c = train.carriages[index] as Carriage;
  const back = c.angle + Math.PI;
  const behind = (h: { x: number; y: number }): boolean =>
    Math.abs(shortAngle(wrapAngle(c.x, c.y, h.x, h.y, size) - back)) <= TAILGUN_ARC;
  const target = nearestHostile(world, train, c.x, c.y, TAILGUN_RANGE, behind);
  if (!target) return false;
  const bearing = wrapAngle(c.x, c.y, target.x, target.y, size);
  return fireVolley(world, train, c, TAILGUN, bearing, live, index) > 0;
}

/**
 * Tesla coil: instant damage to the nearest hostile in range, then to the nearest other hostile
 * near that one. Emits a zap event with the chain. True when anything was zapped.
 */
function zapTesla(world: World, train: TrainState, c: Carriage): boolean {
  const first = nearestHostile(world, train, c.x, c.y, TESLA_RANGE);
  if (!first) return false;
  const second = nearestHostile(
    world,
    train,
    first.x,
    first.y,
    TESLA_CHAIN_RANGE,
    (h) => h.id !== first.id,
  );
  const points: Array<[number, number]> = [
    [c.x, c.y],
    [first.x, first.y],
  ];
  if (second) points.push([second.x, second.y]);
  world.emit({ type: 'zap', ownerId: train.id, points, x: c.x, y: c.y });
  const source: DamageSource = { kind: 'train', id: train.id };
  damageHostile(world, first, TESLA_DAMAGE, source);
  if (second) damageHostile(world, second, TESLA_DAMAGE, source);
  return true;
}

/**
 * Fires one shot of a weapon from a carriage along `aim`, with the muzzle offset that way too:
 * its pellets spread evenly across aim ± spread. Each pellet counts toward the train's projectile budget, so a volley that reaches
 * the budget part-way is cut short. Returns the number of projectiles fired.
 */
function fireVolley(
  world: World,
  train: TrainState,
  c: Carriage,
  stats: WeaponStats,
  aim: number,
  live: Map<number, number>,
  carriage?: number,
): number {
  const pellets = stats.pellets ?? 1;
  const spread = stats.spread ?? 0;
  const inFlight = live.get(train.id) ?? 0;
  const count = Math.min(pellets, MAX_TRAIN_PROJECTILES - inFlight);
  if (count <= 0) return 0;
  live.set(train.id, inFlight + count);
  for (let k = 0; k < count; k++) {
    const angle = pellets > 1 ? aim + spread * ((2 * k) / (pellets - 1) - 1) : aim;
    spawnProjectile(world, {
      kind: stats.projectile,
      x: c.x + Math.cos(aim) * WEAPON_MUZZLE_OFFSET,
      y: c.y + Math.sin(aim) * WEAPON_MUZZLE_OFFSET,
      angle,
      speed: stats.speed,
      damage: stats.damage,
      life: stats.life ?? PROJECTILE_LIFE,
      splash: stats.splash,
      pierce: stats.pierce,
      ownerKind: 'train',
      ownerId: train.id,
      carriage,
    });
  }
  return count;
}

/**
 * Orbits counter-drones around the head and fires them at the nearest hostile in range: an enemy
 * or another train's unprotected head.
 */
export function fireDrones(world: World, train: TrainState): void {
  const dt = world.dt;
  const size = world.rules.size;
  for (const drone of train.drones) {
    drone.angle += dt * DRONE_ORBIT_SPEED;
    drone.fireTimer = Math.max(drone.fireTimer - dt, -dt);
    if (train.protectedFor > 0 || drone.fireTimer > 0) continue;
    const dx = train.x + Math.cos(drone.angle) * DRONE_ORBIT_RADIUS;
    const dy = train.y + Math.sin(drone.angle) * DRONE_ORBIT_RADIUS;
    const best = nearestHostile(world, train, dx, dy, DRONE_RANGE);
    if (!best) continue;
    drone.fireTimer = DRONE_COOLDOWN;
    spawnProjectile(world, {
      kind: 'drone',
      x: dx,
      y: dy,
      angle: wrapAngle(dx, dy, best.x, best.y, size),
      speed: DRONE_PROJECTILE_SPEED,
      damage: DRONE_DAMAGE,
      life: DRONE_PROJECTILE_LIFE,
      ownerKind: 'train',
      ownerId: train.id,
    });
  }
}

// ===== Projectiles =====

interface ProjectileHit {
  t: number;
  enemy: EnemyState | null;
  train: TrainState | null;
}

/**
 * Moves every projectile one tick. Hits are tested along the segment each projectile travels
 * (so fast shots cannot skip over targets) and applied in order along it until the projectile's
 * pierce runs out; a projectile never hits its owner or the same target twice. Train-owned
 * shots hit enemies and other trains; enemy shots hit trains. A projectile with pierce left
 * carries on to the segment's end.
 */
export function stepProjectiles(world: World): void {
  const s = world.state;
  const dt = world.dt;
  const size = world.rules.size;
  const kept: Projectile[] = [];

  for (const p of s.projectiles) {
    const x1 = p.x + p.vx * dt;
    const y1 = p.y + p.vy * dt;
    const hits: ProjectileHit[] = [];

    if (p.ownerKind === 'train') {
      for (const e of s.enemies) {
        if (e.hull <= 0 || p.hitIds.includes(e.id)) continue;
        const r = e.kind === 'boss' ? BOSS_HIT_RADIUS : ENEMY_HIT_RADIUS;
        const t = segmentCircleHit(p.x, p.y, x1, y1, e.x, e.y, r, size);
        if (t !== null) hits.push({ t, enemy: e, train: null });
      }
    }
    for (const train of s.trains) {
      if (!train.alive || p.hitIds.includes(train.id)) continue;
      if (p.ownerKind === 'train' && p.ownerId === train.id) continue;
      const t = segmentCircleHit(p.x, p.y, x1, y1, train.x, train.y, HEAD_RADIUS, size);
      if (t !== null) hits.push({ t, enemy: null, train });
    }
    // Stable, so an exact tie keeps enemies before trains.
    hits.sort((a, b) => a.t - b.t);

    const source: DamageSource = { kind: p.ownerKind, id: p.ownerId };
    for (const hit of hits) {
      if (p.pierce <= 0) break;
      p.pierce -= 1;
      const at = {
        x: wrapPos(p.x + (x1 - p.x) * hit.t, size),
        y: wrapPos(p.y + (y1 - p.y) * hit.t, size),
      };
      if (hit.enemy) {
        p.hitIds.push(hit.enemy.id);
        damageEnemy(world, hit.enemy, p.damage, source, at);
      } else if (hit.train) {
        p.hitIds.push(hit.train.id);
        damageTrain(world, hit.train, p.damage, source, at);
      }
      if (p.splash > 0) splashAt(world, p, at, hit, source);
    }
    if (p.pierce <= 0) continue;

    p.x = wrapPos(x1, size);
    p.y = wrapPos(y1, size);
    p.life -= dt;
    if (p.life > 0) kept.push(p);
  }
  s.projectiles = kept;
}

/**
 * Splash damage around a hit: 60% of the projectile's damage to every other enemy and every
 * other train's head within its splash radius, never the owner's.
 */
function splashAt(
  world: World,
  p: Projectile,
  at: { x: number; y: number },
  direct: ProjectileHit,
  source: DamageSource,
): void {
  const size = world.rules.size;
  const splash = p.damage * SPLASH_DAMAGE_FACTOR;
  for (const e of world.state.enemies) {
    if (e === direct.enemy || e.hull <= 0) continue;
    if (wrapDist(at.x, at.y, e.x, e.y, size) < p.splash) {
      damageEnemy(world, e, splash, source, at);
    }
  }
  for (const train of world.state.trains) {
    if (train === direct.train || !train.alive) continue;
    if (p.ownerKind === 'train' && p.ownerId === train.id) continue;
    if (wrapDist(at.x, at.y, train.x, train.y, size) < p.splash) {
      damageTrain(world, train, splash, source, at);
    }
  }
}

/**
 * Ramming: any train head touching a non-boss enemy takes 40 damage and deals 20 to it, each
 * tick of contact. Cowcatchers raise the damage dealt and cut the damage taken (before shields).
 */
export function ramEnemies(world: World): void {
  const size = world.rules.size;
  for (const train of world.state.trains) {
    if (!train.alive) continue;
    for (const e of world.state.enemies) {
      if (e.kind === 'boss' || e.hull <= 0) continue;
      if (wrapDist(train.x, train.y, e.x, e.y, size) >= RAM_RADIUS) continue;
      const taken = RAM_DAMAGE_TO_TRAIN * (1 - ramReductionOf(train));
      damageTrain(world, train, taken, { kind: 'enemy', id: e.id });
      damageEnemy(world, e, RAM_DAMAGE_TO_ENEMY + train.ramBonus, { kind: 'train', id: train.id });
      if (!train.alive) break;
    }
  }
}

// ===== Train collisions =====

/**
 * Head-vs-body collisions between every pair of trains. A head within 14 units of another
 * train's carriage at index 2 (`BODY_COLLISION_MIN_INDEX`) or beyond is destroyed, crediting the body's owner. All pairs are
 * found before any train is destroyed, so a mutual ram destroys both whatever the iteration
 * order, and a train destroyed here still earns credit for the body that got hit. Protected
 * trains neither die nor kill.
 */
export function collideTrains(world: World): void {
  const trains = world.state.trains;
  const size = world.rules.size;
  const rammed: Array<{ victim: TrainState; owner: TrainState }> = [];
  for (const victim of trains) {
    if (!victim.alive || victim.protectedFor > 0) continue;
    for (const owner of trains) {
      if (owner === victim || !owner.alive || owner.protectedFor > 0) continue;
      for (let i = BODY_COLLISION_MIN_INDEX; i < owner.carriages.length; i++) {
        const c = owner.carriages[i] as TrainState['carriages'][number];
        if (wrapDist(victim.x, victim.y, c.x, c.y, size) < BODY_COLLISION_RADIUS) {
          rammed.push({ victim, owner });
          break;
        }
      }
    }
  }
  for (const { victim, owner } of rammed) {
    destroyTrain(world, victim, 'ram', { kind: 'train', id: owner.id });
  }
}
