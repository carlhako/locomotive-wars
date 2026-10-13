import { spawnProjectile } from './combat.ts';
import {
  BOSS_COOLDOWN,
  BOSS_DAMAGE,
  BOSS_HULL,
  BOSS_MUZZLE_OFFSET,
  BOSS_NAMES,
  BOSS_ORBIT_DIST,
  BOSS_ORBIT_SPEED,
  BOSS_PROJECTILE_LIFE,
  BOSS_PROJECTILE_SPEED,
  BOSS_SPAWN_MARGIN,
  BOSS_SPAWN_MAX_DIST,
  BOSS_SPAWN_MIN_DIST,
  BOSS_SPAWN_TRIES,
  BOSS_SPEED,
  BOSS_SPREAD,
  BOSS_TURN_RATE,
  ENEMY_AGGRO_CHANCE,
  ENEMY_AGGRO_JITTER,
  ENEMY_COOLDOWN,
  ENEMY_DRONE_BELOW,
  ENEMY_HUNTER_BELOW,
  ENEMY_MOVE_INTERVAL_BASE,
  ENEMY_MOVE_INTERVAL_SPAN,
  ENEMY_PROJECTILE_LIFE,
  ENEMY_PROJECTILE_SPEED,
  ENEMY_RANGE,
  ENEMY_STATS,
  ENEMY_TURN_RATE,
  SENTRY_COOLDOWN,
  SENTRY_PROJECTILE_SPEED,
  SENTRY_RANGE,
} from './constants.ts';
import { shortAngle, TWO_PI, wrapAngle, wrapDelta, wrapDist, wrapPos } from './math.ts';
import type { EnemyKind, EnemyState } from './types.ts';
import type { World } from './world.ts';

/** Adds a drone, hunter, or sentry (a random one when `kind` is omitted). */
export function spawnEnemyAt(
  world: World,
  kind: Exclude<EnemyKind, 'boss'> | undefined,
  x: number,
  y: number,
): EnemyState {
  let type = kind;
  if (!type) {
    const r = world.rng.next();
    type = r < ENEMY_DRONE_BELOW ? 'drone' : r < ENEMY_HUNTER_BELOW ? 'hunter' : 'sentry';
  }
  const stats = ENEMY_STATS[type];
  const enemy: EnemyState = {
    id: world.newId(),
    kind: type,
    x: wrapPos(x, world.rules.size),
    y: wrapPos(y, world.rules.size),
    angle: world.rng.range(0, TWO_PI),
    hull: stats.hull,
    maxHull: stats.hull,
    speed: stats.speed,
    damage: stats.damage,
    shootTimer: 0,
    moveTimer: 0,
    targetAngle: 0,
    name: '',
    orbitAngle: 0,
  };
  world.state.enemies.push(enemy);
  return enemy;
}

/** Spawns the boss 1500 to 3000 units from the focal train (first human, else any train). */
export function spawnBoss(world: World): EnemyState {
  const size = world.rules.size;
  const living = world.state.trains.filter((t) => t.alive);
  const focal = living.find((t) => t.controller === 'human') ?? living[0];
  let pos = { x: 0, y: 0 };
  for (let tries = 0; tries < BOSS_SPAWN_TRIES; tries++) {
    pos = world.randomPos(BOSS_SPAWN_MARGIN);
    if (!focal) break;
    const d = wrapDist(pos.x, pos.y, focal.x, focal.y, size);
    if (d > BOSS_SPAWN_MIN_DIST && d < BOSS_SPAWN_MAX_DIST) break;
  }
  const boss: EnemyState = {
    id: world.newId(),
    kind: 'boss',
    x: pos.x,
    y: pos.y,
    angle: world.rng.range(0, TWO_PI),
    hull: BOSS_HULL,
    maxHull: BOSS_HULL,
    speed: BOSS_SPEED,
    damage: BOSS_DAMAGE,
    shootTimer: 0,
    moveTimer: 0,
    targetAngle: 0,
    name: world.rng.pick(BOSS_NAMES),
    orbitAngle: 0,
  };
  world.state.enemies.push(boss);
  world.state.bossId = boss.id;
  world.emit({ type: 'bossSpawn', enemyId: boss.id, name: boss.name, x: boss.x, y: boss.y });
  return boss;
}

/**
 * Moves and fires every living enemy. Regular enemies wander and sometimes head for the nearest
 * train, shooting it when it is in range. The boss orbits and fires a three-shot spread at the
 * nearest human (the nearest train when no human is alive).
 */
export function stepEnemies(world: World): void {
  const dt = world.dt;
  const size = world.rules.size;
  const rng = world.rng;

  for (const e of world.state.enemies) {
    if (e.hull <= 0) continue;
    e.shootTimer -= dt;
    e.moveTimer -= dt;

    if (e.kind === 'boss') {
      const target = world.nearestTrain(e.x, e.y, true) ?? world.nearestTrain(e.x, e.y);
      if (!target) continue;
      e.orbitAngle += dt * BOSS_ORBIT_SPEED;
      const orbitX = target.x + Math.cos(e.orbitAngle) * BOSS_ORBIT_DIST;
      const orbitY = target.y + Math.sin(e.orbitAngle) * BOSS_ORBIT_DIST;
      const toOrbit = wrapAngle(e.x, e.y, orbitX, orbitY, size);
      e.angle += shortAngle(toOrbit - e.angle) * dt * BOSS_TURN_RATE;
      e.x = wrapPos(e.x + Math.cos(e.angle) * e.speed * dt, size);
      e.y = wrapPos(e.y + Math.sin(e.angle) * e.speed * dt, size);
      if (e.shootTimer <= 0) {
        e.shootTimer = BOSS_COOLDOWN;
        const bearing = wrapAngle(e.x, e.y, target.x, target.y, size);
        for (let k = -1; k <= 1; k++) {
          const a = bearing + k * BOSS_SPREAD;
          spawnProjectile(world, {
            kind: 'enemy',
            x: e.x + Math.cos(a) * BOSS_MUZZLE_OFFSET,
            y: e.y + Math.sin(a) * BOSS_MUZZLE_OFFSET,
            angle: a,
            speed: BOSS_PROJECTILE_SPEED,
            damage: e.damage,
            life: BOSS_PROJECTILE_LIFE,
            ownerKind: 'enemy',
            ownerId: e.id,
          });
        }
      }
      continue;
    }

    if (e.speed > 0 && e.moveTimer <= 0) {
      e.moveTimer = ENEMY_MOVE_INTERVAL_BASE + rng.next() * ENEMY_MOVE_INTERVAL_SPAN;
      e.targetAngle = rng.range(0, TWO_PI);
      const nearest = world.nearestTrain(e.x, e.y);
      if (nearest && rng.next() < ENEMY_AGGRO_CHANCE) {
        e.targetAngle =
          wrapAngle(e.x, e.y, nearest.x, nearest.y, size) +
          rng.range(-ENEMY_AGGRO_JITTER, ENEMY_AGGRO_JITTER);
      }
    }
    e.angle += shortAngle(e.targetAngle - e.angle) * dt * ENEMY_TURN_RATE;
    e.x = wrapPos(e.x + Math.cos(e.angle) * e.speed * dt, size);
    e.y = wrapPos(e.y + Math.sin(e.angle) * e.speed * dt, size);

    if (e.shootTimer <= 0) {
      const target = world.nearestTrain(e.x, e.y);
      if (!target) continue;
      const sentry = e.kind === 'sentry';
      const dx = wrapDelta(target.x - e.x, size);
      const dy = wrapDelta(target.y - e.y, size);
      if (Math.hypot(dx, dy) < (sentry ? SENTRY_RANGE : ENEMY_RANGE)) {
        e.shootTimer = sentry ? SENTRY_COOLDOWN : ENEMY_COOLDOWN;
        spawnProjectile(world, {
          kind: 'enemy',
          x: e.x,
          y: e.y,
          angle: Math.atan2(dy, dx),
          speed: sentry ? SENTRY_PROJECTILE_SPEED : ENEMY_PROJECTILE_SPEED,
          damage: e.damage,
          life: ENEMY_PROJECTILE_LIFE,
          ownerKind: 'enemy',
          ownerId: e.id,
        });
      }
    }
  }
}
