import type { OwnTrain, SnapshotMsg, TrainMeta, TrainRow } from '@lw/shared';

/** Test helpers for the networking layer; not used by the game. */

export function makeSnapshot(over: Partial<SnapshotMsg> & { st: number }): SnapshotMsg {
  return {
    t: 'snap',
    k: Math.round(over.st / 33.33),
    ack: 0,
    me: null,
    tr: [],
    en: [],
    tl: [],
    dr: [],
    pr: [],
    ev: [],
    ...over,
  };
}

/** A train row as the server sends it: id, pose, hull, flags, spawn counter, then carriages. */
export function makeRow(
  id: number,
  x: number,
  y: number,
  a = 0,
  coords: number[] = [],
  over: { flags?: number; spawnSeq?: number } = {},
): TrainRow {
  return [id, x, y, a, 50, 100, over.flags ?? 0, over.spawnSeq ?? 0, ...coords];
}

export function makeOwn(over: Partial<OwnTrain> = {}): OwnTrain {
  return {
    x: 1000,
    y: 1000,
    a: 0,
    hp: 100,
    mh: 100,
    f: 100,
    fm: 100,
    fl: 0,
    sq: 0,
    rb: 1,
    cs: [],
    dn: [],
    ...over,
  };
}

export function makeMeta(id: number, kinds: TrainMeta['kinds'] = ['locomotive']): TrainMeta {
  return { id, name: `Train ${id}`, color: '#abcdef', ctl: 'bot', kinds };
}
