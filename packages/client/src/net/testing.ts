import type { OwnTrain, SnapshotMsg, TrainMeta } from '@lw/shared';

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
    cs: [],
    dn: [],
    ...over,
  };
}

export function makeMeta(id: number, kinds: TrainMeta['kinds'] = ['locomotive']): TrainMeta {
  return { id, name: `Train ${id}`, color: '#abcdef', ctl: 'bot', kinds };
}
