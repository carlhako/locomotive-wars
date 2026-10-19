import { damageEnemy, damageTrain } from './combat.ts';
import {
  MAX_TRAIN_MINES,
  MINE_ARM_TIME,
  MINE_BLAST_RADIUS,
  MINE_DAMAGE,
  MINE_INTERVAL,
  MINE_LIFE,
  MINE_TRIGGER_RADIUS,
  MINES_PER_LAYER,
} from './constants.ts';
import { wrapDist } from './math.ts';
import type { DamageSource, Mine, TrainState } from './types.ts';
import type { World } from './world.ts';

/**
 * One tick of mines: mine layers drop at their train's last carriage, mines age and expire, and
 * armed mines touched by an enemy or another train's head explode. Mine layers keep their drop
 * timer in their `fireTimers` slot.
 */
export function stepMines(world: World): void {
  dropMines(world);
  const s = world.state;
  const dt = world.dt;
  const kept: Mine[] = [];
  for (const m of s.mines) {
    m.age += dt;
    if (m.age >= MINE_LIFE) continue;
    if (m.age >= MINE_ARM_TIME && triggered(world, m)) {
      explode(world, m);
      continue;
    }
    kept.push(m);
  }
  s.mines = kept;
}

/** Live mines per owning train id. */
function countMines(world: World): Map<number, number> {
  const counts = new Map<number, number>();
  for (const m of world.state.mines) counts.set(m.ownerId, (counts.get(m.ownerId) ?? 0) + 1);
  return counts;
}

/**
 * Each mine layer's timer counts down; a ready one on a living, unprotected train drops a mine at
 * the last carriage, unless the train has 6 live mines per layer (24 at most) already. A layer
 * waiting at the cap does not bank drops.
 */
function dropMines(world: World): void {
  const dt = world.dt;
  const live = countMines(world);
  for (const train of world.state.trains) {
    if (!train.alive) continue;
    const layers = train.carriages.filter((c) => c.kind === 'mines').length;
    if (layers === 0) continue;
    const cap = Math.min(MINES_PER_LAYER * layers, MAX_TRAIN_MINES);
    for (let i = 0; i < train.carriages.length; i++) {
      if (train.carriages[i]?.kind !== 'mines') continue;
      const timer = Math.max((train.fireTimers[i] ?? 0) - dt, -dt);
      train.fireTimers[i] = timer;
      if (timer > 0 || train.protectedFor > 0) continue;
      const count = live.get(train.id) ?? 0;
      if (count >= cap) continue;
      const tail = train.carriages[train.carriages.length - 1] as TrainState['carriages'][number];
      world.state.mines.push({
        id: world.newId(),
        x: tail.x,
        y: tail.y,
        ownerId: train.id,
        age: 0,
      });
      live.set(train.id, count + 1);
      train.fireTimers[i] = timer + MINE_INTERVAL;
    }
  }
}

/** True when a living enemy or another living, unprotected train's head is touching the mine. */
function triggered(world: World, m: Mine): boolean {
  const size = world.rules.size;
  for (const e of world.state.enemies) {
    if (e.hull > 0 && wrapDist(m.x, m.y, e.x, e.y, size) < MINE_TRIGGER_RADIUS) return true;
  }
  for (const t of world.state.trains) {
    if (t.id === m.ownerId || !t.alive || t.protectedFor > 0) continue;
    if (wrapDist(m.x, m.y, t.x, t.y, size) < MINE_TRIGGER_RADIUS) return true;
  }
  return false;
}

/** Damages every enemy and other train's head in the blast, credited to the mine's owner. */
function explode(world: World, m: Mine): void {
  const size = world.rules.size;
  const source: DamageSource = { kind: 'train', id: m.ownerId };
  world.emit({ type: 'mineExploded', mineId: m.id, ownerId: m.ownerId, x: m.x, y: m.y });
  for (const e of world.state.enemies) {
    if (e.hull > 0 && wrapDist(m.x, m.y, e.x, e.y, size) < MINE_BLAST_RADIUS) {
      damageEnemy(world, e, MINE_DAMAGE, source, m);
    }
  }
  for (const t of world.state.trains) {
    if (t.id === m.ownerId || !t.alive) continue;
    if (wrapDist(m.x, m.y, t.x, t.y, size) < MINE_BLAST_RADIUS) {
      damageTrain(world, t, MINE_DAMAGE, source);
    }
  }
}
