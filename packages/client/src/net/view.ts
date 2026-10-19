import {
  DRONE_ORBIT_SPEED,
  ENEMY_KINDS,
  PICKUP_KINDS,
  PROJECTILE_KINDS,
  TRAIN_FLAG_BOOST,
  TRAIN_FLAG_BRIDGE,
  TRAIN_FLAG_DEAD,
  TRAIN_FLAG_PROTECTED,
  TWO_PI,
  wrapDelta,
} from '@lw/shared';
import type {
  CarriageKind,
  CarriageView,
  OwnTrain,
  SnapshotMsg,
  TrainMeta,
  TrainView,
  WorldView,
} from '@lw/shared';

/** Turns snapshot messages into the render model. */

/** What the client knows about a train that is not in each snapshot. */
export type MetaBook = ReadonlyMap<number, TrainMeta>;

const FALLBACK_COLOR = '#888888';

/**
 * Heading of each carriage, derived from its neighbours: the direction from the carriage behind
 * to the one in front (the head, for the first). `coords` is a flat list of x/y pairs from the
 * locomotive back. The last carriage points along its own segment.
 */
export function deriveCarriageAngles(
  headX: number,
  headY: number,
  headAngle: number,
  coords: readonly number[],
  size: number,
): number[] {
  const n = coords.length / 2;
  const angles: number[] = [];
  const x = (i: number): number => (i < 0 ? headX : (coords[i * 2] as number));
  const y = (i: number): number => (i < 0 ? headY : (coords[i * 2 + 1] as number));
  for (let i = 0; i < n; i++) {
    const front = i - 1;
    const back = Math.min(i + 1, n - 1);
    const dx = wrapDelta(x(front) - x(back), size);
    const dy = wrapDelta(y(front) - y(back), size);
    angles.push(dx === 0 && dy === 0 ? headAngle : Math.atan2(dy, dx));
  }
  return angles;
}

function kindAt(meta: TrainMeta | undefined, i: number): CarriageKind {
  return meta?.kinds[i] ?? (i === 0 ? 'locomotive' : 'mg');
}

function carriagesOf(
  meta: TrainMeta | undefined,
  headX: number,
  headY: number,
  headAngle: number,
  coords: readonly number[],
  size: number,
): CarriageView[] {
  const angles = deriveCarriageAngles(headX, headY, headAngle, coords, size);
  return angles.map((angle, i) => ({
    kind: kindAt(meta, i),
    x: coords[i * 2] as number,
    y: coords[i * 2 + 1] as number,
    angle,
  }));
}

/** Orbit angles for a train's counter-drones, advancing with server time. */
export function droneAngles(count: number, timeSeconds: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(timeSeconds * DRONE_ORBIT_SPEED + (i * TWO_PI) / count);
  return out;
}

export function droneCount(meta: TrainMeta | undefined): number {
  return meta ? meta.kinds.filter((k) => k === 'drones').length : 0;
}

/** The session's own train from the full state in a snapshot. */
export function ownTrainView(
  id: number,
  me: OwnTrain,
  meta: TrainMeta | undefined,
  size: number,
): TrainView {
  return {
    id,
    name: meta?.name ?? `Train ${id}`,
    color: meta?.color ?? FALLBACK_COLOR,
    controller: meta?.ctl ?? 'human',
    alive: (me.fl & TRAIN_FLAG_DEAD) === 0,
    x: me.x,
    y: me.y,
    angle: me.a,
    hp: me.hp,
    maxHp: me.mh,
    fuel: me.f,
    fuelMax: me.fm,
    bridge: (me.fl & TRAIN_FLAG_BRIDGE) !== 0,
    boosting: (me.fl & TRAIN_FLAG_BOOST) !== 0,
    protected: (me.fl & TRAIN_FLAG_PROTECTED) !== 0,
    spawnSeq: me.sq,
    roundBest: me.rb,
    carriages: carriagesOf(meta, me.x, me.y, me.a, me.cs, size),
    drones: [...me.dn],
  };
}

/**
 * Builds the world view a snapshot describes. Other trains' drone angles are placeholders until
 * sampling time, when they are derived from the render clock so they spin smoothly. The minimap
 * is left empty: the overview supplies it.
 */
export function viewFromSnapshot(
  snap: SnapshotMsg,
  localId: number,
  meta: MetaBook,
  size: number,
): WorldView {
  const trains: TrainView[] = [];
  if (snap.me) trains.push(ownTrainView(localId, snap.me, meta.get(localId), size));
  for (const row of snap.tr) {
    const [id, x, y, angle, hp, maxHp, flags, spawnSeq] = row;
    const m = meta.get(id);
    trains.push({
      id,
      name: m?.name ?? `Train ${id}`,
      color: m?.color ?? FALLBACK_COLOR,
      controller: m?.ctl ?? 'bot',
      alive: (flags & TRAIN_FLAG_DEAD) === 0,
      x,
      y,
      angle,
      hp,
      maxHp,
      // Other trains' fuel is not sent and not drawn.
      fuel: 0,
      fuelMax: 1,
      bridge: (flags & TRAIN_FLAG_BRIDGE) !== 0,
      boosting: (flags & TRAIN_FLAG_BOOST) !== 0,
      protected: (flags & TRAIN_FLAG_PROTECTED) !== 0,
      spawnSeq,
      roundBest: 0,
      carriages: carriagesOf(m, x, y, angle, row.slice(8) as number[], size),
      drones: [],
    });
  }
  return {
    tick: snap.k,
    time: snap.st / 1000,
    localId,
    trains,
    enemies: snap.en.map((r) => {
      const view = {
        id: r[0],
        kind: ENEMY_KINDS[r[1]] ?? 'drone',
        x: r[2],
        y: r[3],
        angle: r[4],
        hp: r[5],
        maxHp: r[6],
      };
      return typeof r[7] === 'string' ? { ...view, name: r[7] } : view;
    }),
    trailers: snap.tl.map((r) => ({
      id: r[0],
      kind: PICKUP_KINDS[r[1]] ?? 'mg',
      x: r[2],
      y: r[3],
    })),
    drops: snap.dr.map((r) => ({
      id: r[0],
      kind: PICKUP_KINDS[r[1]] ?? 'mg',
      x: r[2],
      y: r[3],
      age: r[4],
    })),
    projectiles: snap.pr.map((r) => ({
      id: r[0],
      kind: PROJECTILE_KINDS[r[1]] ?? 'bullet',
      x: r[2],
      y: r[3],
      vx: r[4],
      vy: r[5],
    })),
    mines: snap.mn.map((r) => ({ id: r[0], ownerId: r[1], x: r[2], y: r[3], armed: r[4] === 1 })),
    minimap: [],
  };
}
