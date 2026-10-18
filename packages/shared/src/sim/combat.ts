import {
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
  HEAD_RADIUS,
  MAX_TRAIN_PROJECTILES,
  PROJECTILE_LIFE,
  RAM_DAMAGE_TO_ENEMY,
  RAM_DAMAGE_TO_TRAIN,
  RAM_RADIUS,
  SPLASH_DAMAGE_FACTOR,
  WEAPON_MUZZLE_OFFSET,
  WEAPONS,
} from './constants.ts';
import { segmentCircleHit, wrapAngle, wrapDist, wrapPos } from './math.ts';
import { damageReductionOf } from './train.ts';
import type {
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
    ownerKind: EntityKind;
    ownerId: number;
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
  };
  world.state.projectiles.push(p);
  world.emit({
    type: 'fired',
    weapon: spec.kind,
    ownerKind: spec.ownerKind,
    ownerId: spec.ownerId,
    x: p.x,
    y: p.y,
    angle: spec.angle,
  });
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
 * zero hull) until the end of the tick, and drop pickups.
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
  world.emit({
    type: 'enemyDestroyed',
    enemyId: enemy.id,
    enemyKind: enemy.kind,
    sourceId: credit,
    x: enemy.x,
    y: enemy.y,
  });
}

// ===== Weapons =====

function isWeapon(kind: string): kind is WeaponKind {
  return kind === 'mg' || kind === 'missile' || kind === 'laser';
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
 * Fires each ready weapon carriage along the train's aim angle while the fire input is on,
 * whatever the carriage's heading and whether or not anything is in range. Cooldowns tick down
 * every tick. A protected train holds fire, and a train with `MAX_TRAIN_PROJECTILES` of its
 * shots in flight waits. `live` holds those counts (see `countWeaponProjectiles`) and is
 * updated as the train fires.
 */
export function fireWeapons(world: World, train: TrainState, live: Map<number, number>): void {
  const dt = world.dt;
  const holding = train.protectedFor > 0 || !train.input.fire;
  const aim = train.input.aim;
  for (let i = 0; i < train.carriages.length; i++) {
    const c = train.carriages[i];
    if (!c || !isWeapon(c.kind)) continue;
    // Floor at -dt so an idle weapon is ready next tick without banking a burst of shots.
    const timer = Math.max((train.fireTimers[i] ?? 0) - dt, -dt);
    train.fireTimers[i] = timer;
    if (holding || timer > 0) continue;
    const inFlight = live.get(train.id) ?? 0;
    if (inFlight >= MAX_TRAIN_PROJECTILES) continue;
    live.set(train.id, inFlight + 1);
    const stats = WEAPONS[c.kind];
    train.fireTimers[i] = timer + 1 / stats.fireRate;
    spawnProjectile(world, {
      kind: stats.projectile,
      x: c.x + Math.cos(aim) * WEAPON_MUZZLE_OFFSET,
      y: c.y + Math.sin(aim) * WEAPON_MUZZLE_OFFSET,
      angle: aim,
      speed: stats.speed,
      damage: stats.damage,
      life: PROJECTILE_LIFE,
      splash: stats.splash,
      ownerKind: 'train',
      ownerId: train.id,
    });
  }
}

/** Orbits counter-drones around the head and fires them at the nearest enemy in range. */
export function fireDrones(world: World, train: TrainState): void {
  const dt = world.dt;
  const size = world.rules.size;
  for (const drone of train.drones) {
    drone.angle += dt * DRONE_ORBIT_SPEED;
    drone.fireTimer = Math.max(drone.fireTimer - dt, -dt);
    if (train.protectedFor > 0 || drone.fireTimer > 0) continue;
    const dx = train.x + Math.cos(drone.angle) * DRONE_ORBIT_RADIUS;
    const dy = train.y + Math.sin(drone.angle) * DRONE_ORBIT_RADIUS;
    let best: EnemyState | null = null;
    let bestDist = DRONE_RANGE;
    for (const e of world.state.enemies) {
      if (e.hull <= 0) continue;
      const d = wrapDist(dx, dy, e.x, e.y, size);
      if (d < bestDist) {
        bestDist = d;
        best = e;
      }
    }
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

/**
 * Moves every projectile one tick. Hits are tested along the segment each projectile travels
 * (so fast shots cannot skip over targets), the earliest hit wins, and a projectile never
 * hits its owner. Train-owned shots hit enemies and other trains; enemy shots hit trains.
 */
export function stepProjectiles(world: World): void {
  const s = world.state;
  const dt = world.dt;
  const size = world.rules.size;
  const kept: Projectile[] = [];

  for (const p of s.projectiles) {
    const x1 = p.x + p.vx * dt;
    const y1 = p.y + p.vy * dt;
    let bestT = Infinity;
    let hitEnemy: EnemyState | null = null;
    let hitTrain: TrainState | null = null;

    if (p.ownerKind === 'train') {
      for (const e of s.enemies) {
        if (e.hull <= 0) continue;
        const r = e.kind === 'boss' ? BOSS_HIT_RADIUS : ENEMY_HIT_RADIUS;
        const t = segmentCircleHit(p.x, p.y, x1, y1, e.x, e.y, r, size);
        if (t !== null && t < bestT) {
          bestT = t;
          hitEnemy = e;
          hitTrain = null;
        }
      }
    }
    for (const train of s.trains) {
      if (!train.alive) continue;
      if (p.ownerKind === 'train' && p.ownerId === train.id) continue;
      const t = segmentCircleHit(p.x, p.y, x1, y1, train.x, train.y, HEAD_RADIUS, size);
      if (t !== null && t < bestT) {
        bestT = t;
        hitTrain = train;
        hitEnemy = null;
      }
    }

    if (hitEnemy === null && hitTrain === null) {
      p.x = wrapPos(x1, size);
      p.y = wrapPos(y1, size);
      p.life -= dt;
      if (p.life > 0) kept.push(p);
      continue;
    }

    const at = {
      x: wrapPos(p.x + (x1 - p.x) * bestT, size),
      y: wrapPos(p.y + (y1 - p.y) * bestT, size),
    };
    const source: DamageSource = { kind: p.ownerKind, id: p.ownerId };
    if (hitEnemy) damageEnemy(world, hitEnemy, p.damage, source, at);
    else if (hitTrain) damageTrain(world, hitTrain, p.damage, source, at);

    if (p.splash > 0) {
      for (const e of s.enemies) {
        if (e === hitEnemy || e.hull <= 0) continue;
        if (wrapDist(at.x, at.y, e.x, e.y, size) < p.splash) {
          damageEnemy(world, e, p.damage * SPLASH_DAMAGE_FACTOR, source, at);
        }
      }
    }
  }
  s.projectiles = kept;
}

/**
 * Ramming: any train head touching a non-boss enemy takes 40 damage and deals 20 to it, each
 * tick of contact.
 */
export function ramEnemies(world: World): void {
  const size = world.rules.size;
  for (const train of world.state.trains) {
    if (!train.alive) continue;
    for (const e of world.state.enemies) {
      if (e.kind === 'boss' || e.hull <= 0) continue;
      if (wrapDist(train.x, train.y, e.x, e.y, size) >= RAM_RADIUS) continue;
      damageTrain(world, train, RAM_DAMAGE_TO_TRAIN, { kind: 'enemy', id: e.id });
      damageEnemy(world, e, RAM_DAMAGE_TO_ENEMY, { kind: 'train', id: train.id });
      if (!train.alive) break;
    }
  }
}

// ===== Train collisions =====

/**
 * Head-vs-body collisions between every pair of trains. A head within 14 units of another
 * train's carriage at index 3 or beyond is destroyed, crediting the body's owner. All pairs are
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
