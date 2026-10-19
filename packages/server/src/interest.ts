import { wrapDist } from '@lw/shared';
import type {
  CarriageKind,
  EnemyState,
  Mine,
  Pickup,
  Projectile,
  SimEvent,
  TrainMeta,
  TrainState,
  World,
} from '@lw/shared';

/** The part of the world one session gets to see. */
export interface Visible {
  /** Other trains in view; the session's own train is excluded. */
  trains: TrainState[];
  enemies: EnemyState[];
  trailers: Pickup[];
  drops: Pickup[];
  projectiles: Projectile[];
  mines: Mine[];
}

/** True when the train's head, or any carriage, is within `radius` of (cx, cy). */
export function trainInView(
  train: TrainState,
  cx: number,
  cy: number,
  radius: number,
  size: number,
): boolean {
  if (wrapDist(cx, cy, train.x, train.y, size) <= radius) return true;
  for (const c of train.carriages) {
    if (wrapDist(cx, cy, c.x, c.y, size) <= radius) return true;
  }
  return false;
}

/** Entities within `radius` (wrapped distance) of (cx, cy). Destroyed enemies are skipped. */
export function selectVisible(
  world: World,
  cx: number,
  cy: number,
  radius: number,
  exceptTrainId: number,
): Visible {
  const s = world.state;
  const size = world.rules.size;
  const near = (x: number, y: number): boolean => wrapDist(cx, cy, x, y, size) <= radius;
  return {
    trains: s.trains.filter((t) => t.id !== exceptTrainId && trainInView(t, cx, cy, radius, size)),
    enemies: s.enemies.filter((e) => e.hull > 0 && near(e.x, e.y)),
    trailers: s.trailers.filter((p) => near(p.x, p.y)),
    drops: s.drops.filter((p) => near(p.x, p.y)),
    projectiles: s.projectiles.filter((p) => near(p.x, p.y)),
    mines: s.mines.filter((m) => near(m.x, m.y)),
  };
}

/** True when the event names the train, whatever role it played. */
export function eventInvolves(e: SimEvent, trainId: number): boolean {
  switch (e.type) {
    case 'fired':
      return e.ownerKind === 'train' && e.ownerId === trainId;
    case 'hit':
      return (
        (e.victimKind === 'train' && e.victimId === trainId) ||
        (e.attackerKind === 'train' && e.attackerId === trainId)
      );
    case 'enemyDestroyed':
    case 'bossDown':
      return e.sourceId === trainId;
    case 'trainDestroyed':
      return e.victimId === trainId || e.killerTrainId === trainId;
    case 'pickup':
    case 'bridgeOn':
    case 'bridgeOff':
    case 'trainLeft':
      return e.trainId === trainId;
    case 'zap':
    case 'mineExploded':
      return e.ownerId === trainId;
    case 'bossSpawn':
      return false;
  }
}

/**
 * Events a session should receive: those near its head or involving its train. Kills are global
 * so the kill feed shows every train destruction.
 */
export function selectEvents(
  events: readonly SimEvent[],
  cx: number,
  cy: number,
  radius: number,
  trainId: number,
  size: number,
): SimEvent[] {
  return events.filter(
    (e) =>
      e.type === 'trainDestroyed' ||
      wrapDist(cx, cy, e.x, e.y, size) <= radius ||
      eventInvolves(e, trainId),
  );
}

/** Carriage kinds of a train, locomotive first. */
export function kindsOf(train: TrainState): CarriageKind[] {
  return train.carriages.map((c) => c.kind);
}

function signature(m: TrainMeta): string {
  return `${m.name}\u0000${m.color}\u0000${m.ctl}\u0000${m.kinds.join(',')}`;
}

/**
 * Remembers which trains' static data a session has been sent, so the next `meta` message holds
 * only what changed: trains seen for the first time, trains whose carriages changed, and trains
 * that are gone or no longer in view.
 */
export class MetaTracker {
  private readonly known = new Map<number, string>();

  /** Returns the update for the given visible trains, or null when nothing changed. */
  diff(visible: readonly TrainState[]): { trains: TrainMeta[]; gone: number[] } | null {
    const trains: TrainMeta[] = [];
    const seen = new Set<number>();
    for (const t of visible) {
      seen.add(t.id);
      const meta: TrainMeta = {
        id: t.id,
        name: t.name,
        color: t.color,
        ctl: t.controller,
        kinds: kindsOf(t),
      };
      const sig = signature(meta);
      if (this.known.get(t.id) !== sig) {
        this.known.set(t.id, sig);
        trains.push(meta);
      }
    }
    const gone: number[] = [];
    for (const id of this.known.keys()) {
      if (!seen.has(id)) {
        gone.push(id);
        this.known.delete(id);
      }
    }
    return trains.length > 0 || gone.length > 0 ? { trains, gone } : null;
  }
}
