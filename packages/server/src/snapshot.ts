import {
  ENEMY_KINDS,
  PICKUP_KINDS,
  PROJECTILE_KINDS,
  shortAngle,
  TRAIN_FLAG_BOOST,
  TRAIN_FLAG_BRIDGE,
  TRAIN_FLAG_DEAD,
  TRAIN_FLAG_PROTECTED,
  fuelCapacityOf,
} from '@lw/shared';
import type {
  EnemyRow,
  LeaderRow,
  OverviewMsg,
  OwnTrain,
  SimEvent,
  SnapshotMsg,
  TrainRow,
  TrainState,
} from '@lw/shared';
import type { Visible } from './interest.ts';

const round = Math.round;
const r1 = (v: number): number => round(v * 10) / 10;
const r2 = (v: number): number => round(v * 100) / 100;
/** Heading as a short angle, so the number stays small however long the train has turned. */
const ang = (v: number): number => r2(shortAngle(v));

function flagsOf(t: TrainState): number {
  return (
    (t.bridgeActive ? TRAIN_FLAG_BRIDGE : 0) |
    (t.boosting ? TRAIN_FLAG_BOOST : 0) |
    (t.alive ? 0 : TRAIN_FLAG_DEAD) |
    (t.protectedFor > 0 ? TRAIN_FLAG_PROTECTED : 0)
  );
}

function carriageCoords(t: TrainState): number[] {
  const out: number[] = [];
  for (const c of t.carriages) out.push(round(c.x), round(c.y));
  return out;
}

export function ownTrainOf(t: TrainState): OwnTrain {
  return {
    x: round(t.x),
    y: round(t.y),
    a: ang(t.angle),
    hp: r1(t.hull),
    mh: r1(t.maxHull),
    f: r1(t.fuel),
    fm: r1(fuelCapacityOf(t)),
    fl: flagsOf(t),
    sq: t.spawnSeq,
    rb: t.roundBest,
    cs: carriageCoords(t),
    dn: t.drones.map((d) => ang(d.angle)),
  };
}

export function trainRowOf(t: TrainState): TrainRow {
  return [
    t.id,
    round(t.x),
    round(t.y),
    ang(t.angle),
    round(t.hull),
    round(t.maxHull),
    flagsOf(t),
    t.spawnSeq,
    ...carriageCoords(t),
  ];
}

/** Rounds the numbers an event carries, leaving everything else as it is. */
export function roundEvent(e: SimEvent): SimEvent {
  const out: Record<string, unknown> = { ...e };
  for (const key of ['x', 'y']) {
    if (typeof out[key] === 'number') out[key] = round(out[key]);
  }
  if (typeof out.angle === 'number') out.angle = r2(out.angle);
  if (typeof out.amount === 'number') out.amount = r2(out.amount);
  return out as unknown as SimEvent;
}

export interface SnapshotInput {
  tick: number;
  /** Server time of this tick, in milliseconds. */
  serverTimeMs: number;
  /** Sequence number of the last input applied to the session's train. */
  ack: number;
  own: TrainState | undefined;
  visible: Visible;
  events: readonly SimEvent[];
}

/** Encodes one session's view of the world as a snapshot message. */
export function buildSnapshot(input: SnapshotInput): SnapshotMsg {
  const { visible } = input;
  return {
    t: 'snap',
    k: input.tick,
    st: r2(input.serverTimeMs),
    ack: input.ack,
    me: input.own ? ownTrainOf(input.own) : null,
    tr: visible.trains.map(trainRowOf),
    en: visible.enemies.map((e): EnemyRow => {
      const row: EnemyRow = [
        e.id,
        ENEMY_KINDS.indexOf(e.kind),
        round(e.x),
        round(e.y),
        ang(e.angle),
        round(e.hull),
        round(e.maxHull),
      ];
      if (e.kind === 'boss') row.push(e.name);
      return row;
    }),
    tl: visible.trailers.map((p) => [p.id, PICKUP_KINDS.indexOf(p.kind), round(p.x), round(p.y)]),
    dr: visible.drops.map((p) => [
      p.id,
      PICKUP_KINDS.indexOf(p.kind),
      round(p.x),
      round(p.y),
      r1(p.age),
    ]),
    pr: visible.projectiles.map((p) => [
      p.id,
      PROJECTILE_KINDS.indexOf(p.kind),
      round(p.x),
      round(p.y),
      round(p.vx),
      round(p.vy),
    ]),
    ev: input.events.map(roundEvent),
  };
}

/**
 * Every living train's id, head position, colour, and name, for the minimap and kill feed, with
 * the leaderboard and the recipient's own rank (0 if none).
 */
export function buildOverview(
  trains: readonly TrainState[],
  lb: LeaderRow[] = [],
  rk = 0,
): OverviewMsg {
  return {
    t: 'ov',
    h: trains.filter((t) => t.alive).map((t) => [t.id, round(t.x), round(t.y), t.color, t.name]),
    lb,
    rk,
  };
}
