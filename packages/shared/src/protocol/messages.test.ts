import { describe, expect, it } from 'vitest';
import {
  decodeClientMessage,
  decodeServerMessage,
  encodeMessage,
  PROTOCOL_VERSION,
} from './messages.ts';
import type { ClientMessage, ServerMessage, SnapshotMsg } from './messages.ts';

const snapshot: SnapshotMsg = {
  t: 'snap',
  k: 120,
  st: 4000,
  ack: 17,
  me: {
    x: 100,
    y: 200,
    a: 1.57,
    hp: 80,
    mh: 100,
    f: 50,
    fm: 100,
    fl: 2,
    sq: 3,
    rb: 12,
    cs: [90, 200, 72, 200],
    dn: [0.5],
    hd: 2,
  },
  tr: [[7, 10, 20, 3.14, 90, 100, 9, 2, 5, 6, 7, 8]],
  en: [
    [3, 0, 10, 20, 1.2, 20, 20],
    [4, 3, 30, 40, 0, 1200, 1200, 'Dread Maw'],
  ],
  tl: [[9, 2, 50, 60]],
  dr: [[10, 4, 70, 80, 1.5]],
  pr: [
    [11, 1, 90, 100, 200, -50],
    [14, 0, 95, 105, 550, 0, 1],
  ],
  mn: [
    [12, 7, 110, 120, 1],
    [13, 9, 130, 140, 0],
  ],
  ht: [
    [15, 0, 150, 160],
    [16, 1, 170, 180],
  ],
  ev: [
    { type: 'trainDestroyed', victimId: 7, cause: 'ram', killerTrainId: 9, x: 5, y: 6 },
    {
      type: 'hit',
      victimKind: 'train',
      victimId: 7,
      attackerKind: 'enemy',
      attackerId: 3,
      amount: 5,
      x: 1,
      y: 2,
    },
    { type: 'trainLeft', trainId: 8, x: 3, y: 4 },
    {
      type: 'zap',
      ownerId: 7,
      points: [
        [10, 20],
        [30, 40],
        [50, 60],
      ],
      x: 10,
      y: 20,
    },
    { type: 'mineExploded', mineId: 12, ownerId: 7, x: 110, y: 120 },
    { type: 'heart', trainId: 7, heartId: 16, kind: 'full', amount: 250, x: 170, y: 180 },
  ],
};

const clientMessages: ClientMessage[] = [
  { t: 'hello', v: PROTOCOL_VERSION, name: 'Casey' },
  { t: 'in', s: 5, tr: -1, b: 1, br: 0, f: 1, ax: -120.5, ay: 30 },
  { t: 'ping', c: 123456.5 },
  { t: 'hsName', token: '3f1c9a52-8d1e-4a6b-9a64-2b7d3e0c1f11', name: 'CARL' },
];

const serverMessages: ServerMessage[] = [
  {
    t: 'welcome',
    v: PROTOCOL_VERSION,
    id: 4,
    tickRate: 30,
    snapRate: 15,
    mapSize: 6000,
    interpMs: 133,
    roundLengthSec: 600,
    intermissionSec: 20,
    idleKickSec: 60,
  },
  { t: 'reject', reason: 'version' },
  { t: 'reject', reason: 'full', humans: 16, max: 16 },
  { t: 'reject', reason: 'malformed' },
  {
    t: 'meta',
    trains: [{ id: 4, name: 'Casey', color: '#fff', ctl: 'human', kinds: ['locomotive', 'mg'] }],
    gone: [2, 3],
  },
  snapshot,
  { ...snapshot, me: null, tr: [], en: [], tl: [], dr: [], pr: [], mn: [], ht: [], ev: [] },
  {
    t: 'ov',
    h: [[4, 10, 20, '#fff', 'Casey']],
    lb: [
      [4, 'Casey', 12, 5, 0],
      [9, 'IronWolf', 9, 9, 1],
    ],
    rk: 1,
  },
  { t: 'pong', c: 99, st: 1234.5 },
  { t: 'round', phase: 'playing', roundId: 3, endsAt: 600000 },
  { t: 'round', phase: 'intermission', roundId: 3, endsAt: 620000 },
  {
    t: 'roundEnd',
    roundId: 3,
    standings: [
      [4, 'Casey', 0, 40, 2],
      [9, 'IronWolf', 1, 31, 0],
    ],
    winnerId: 4,
    nextRoundAt: 620000,
  },
  { t: 'roundEnd', roundId: 4, standings: [], winnerId: null, nextRoundAt: 1000 },
  { t: 'idleWarn', secondsLeft: 10 },
  { t: 'idleClear' },
  { t: 'kicked', reason: 'idle' },
  { t: 'hsEligible', token: '3f1c9a52-8d1e-4a6b-9a64-2b7d3e0c1f11', rank: 3, score: 64 },
  { t: 'hsResult', ok: true },
  { t: 'hsResult', ok: false, reason: 'used' },
  {
    t: 'highscores',
    entries: [
      ['a-r1-0', 'CARL', 64],
      ['a-r1-1', 'Ann', 40],
    ],
    highlightIds: ['a-r1-0'],
  },
  { t: 'highscores', entries: [], highlightIds: [] },
];

describe('message round trips', () => {
  it.each(clientMessages)('client message %j', (msg) => {
    expect(decodeClientMessage(encodeMessage(msg))).toEqual(msg);
  });

  it.each(serverMessages.map((m) => [m.t, m] as const))('server message %s', (_name, msg) => {
    expect(decodeServerMessage(encodeMessage(msg))).toEqual(msg);
  });
});

describe('decodeClientMessage', () => {
  it.each([
    ['invalid JSON', '{nope'],
    ['empty string', ''],
    ['a JSON array', '[1,2]'],
    ['a JSON number', '42'],
    ['null', 'null'],
    ['no type', '{"v":1}'],
    ['an unknown type', '{"t":"teleport","x":1}'],
    ['hello without a name', '{"t":"hello","v":1}'],
    ['hello with a fractional version', '{"t":"hello","v":1.5,"name":"a"}'],
    ['hello with a numeric name', '{"t":"hello","v":1,"name":7}'],
    ['hello with an enormous name', JSON.stringify({ t: 'hello', v: 1, name: 'x'.repeat(5000) })],
    ['input missing a field', '{"t":"in","s":1,"tr":0,"b":0,"br":0,"f":0,"ax":0}'],
    ['input with the old aim angle', '{"t":"in","s":1,"tr":0,"b":0,"br":0,"f":0,"a":0}'],
    ['input with a string aim y', '{"t":"in","s":1,"tr":0,"b":0,"br":0,"f":0,"ax":0,"ay":"0"}'],
    ['input missing fire', '{"t":"in","s":1,"tr":0,"b":0,"br":0,"ax":0,"ay":0}'],
    ['input with fire 2', '{"t":"in","s":1,"tr":0,"b":0,"br":0,"f":2,"ax":0,"ay":0}'],
    ['input with a string turn', '{"t":"in","s":1,"tr":"1","b":0,"br":0,"f":0,"ax":0,"ay":0}'],
    ['input with a boolean boost', '{"t":"in","s":1,"tr":0,"b":true,"br":0,"f":0,"ax":0,"ay":0}'],
    ['input with boost 2', '{"t":"in","s":1,"tr":0,"b":2,"br":0,"f":0,"ax":0,"ay":0}'],
    [
      'input with an infinite aim x',
      '{"t":"in","s":1,"tr":0,"b":0,"br":0,"f":0,"ax":1e999,"ay":0}',
    ],
    [
      'input with an infinite turn',
      '{"t":"in","s":1,"tr":-1e999,"b":0,"br":0,"f":0,"ax":0,"ay":0}',
    ],
    [
      'input with a fractional sequence',
      '{"t":"in","s":1.5,"tr":0,"b":0,"br":0,"f":0,"ax":0,"ay":0}',
    ],
    ['ping with a string time', '{"t":"ping","c":"now"}'],
    ['hsName without a token', '{"t":"hsName","name":"CARL"}'],
    ['hsName with an empty token', '{"t":"hsName","token":"","name":"CARL"}'],
    [
      'hsName with an enormous token',
      JSON.stringify({ t: 'hsName', token: 'x'.repeat(65), name: 'a' }),
    ],
    ['hsName with a numeric token', '{"t":"hsName","token":7,"name":"CARL"}'],
    ['hsName without a name', '{"t":"hsName","token":"abc"}'],
    [
      'hsName with an enormous name',
      JSON.stringify({ t: 'hsName', token: 'a', name: 'x'.repeat(5000) }),
    ],
    ['hsName carrying only a score', '{"t":"hsName","score":9999}'],
  ])('rejects %s', (_name, raw) => {
    expect(decodeClientMessage(raw)).toBeNull();
  });

  it('passes an out-of-range turn through for the server to clamp', () => {
    const msg = decodeClientMessage('{"t":"in","s":1,"tr":50,"b":0,"br":0,"f":0,"ax":0,"ay":0}');
    expect(msg).toEqual({ t: 'in', s: 1, tr: 50, b: 0, br: 0, f: 0, ax: 0, ay: 0 });
  });

  it('drops unknown extra fields, such as a client-claimed position', () => {
    const msg = decodeClientMessage(
      '{"t":"in","s":1,"tr":0,"b":0,"br":0,"f":0,"ax":0,"ay":0,"x":5,"y":6}',
    );
    expect(msg).toEqual({ t: 'in', s: 1, tr: 0, b: 0, br: 0, f: 0, ax: 0, ay: 0 });
  });
});

describe('decodeServerMessage', () => {
  it.each([
    ['invalid JSON', 'x'],
    ['an unknown type', '{"t":"nope"}'],
    ['a reject with a bad reason', '{"t":"reject","reason":"because"}'],
    [
      'a welcome missing the map size',
      '{"t":"welcome","v":1,"id":1,"tickRate":30,"snapRate":15,"interpMs":133,"roundLengthSec":600,"intermissionSec":20,"idleKickSec":60}',
    ],
    [
      'a welcome missing the round settings',
      '{"t":"welcome","v":3,"id":1,"tickRate":30,"snapRate":15,"mapSize":6000,"interpMs":133}',
    ],
    ['a snapshot without events', JSON.stringify({ ...snapshot, ev: undefined })],
    ['a snapshot with a short train row', JSON.stringify({ ...snapshot, tr: [[1, 2, 3]] })],
    [
      'a snapshot with a train row missing its spawn counter',
      JSON.stringify({ ...snapshot, tr: [[7, 10, 20, 3.14, 90, 100, 1]] }),
    ],
    ['a snapshot without mines', JSON.stringify({ ...snapshot, mn: undefined })],
    ['a snapshot without hearts', JSON.stringify({ ...snapshot, ht: undefined })],
    ['a snapshot with a short heart row', JSON.stringify({ ...snapshot, ht: [[1, 0, 3]] })],
    ['a snapshot with an unknown heart kind', JSON.stringify({ ...snapshot, ht: [[1, 2, 3, 4]] })],
    [
      'a snapshot with a projectile own flag that is not 1',
      JSON.stringify({ ...snapshot, pr: [[1, 0, 2, 3, 4, 5, 0]] }),
    ],
    [
      'an own train without a dose count',
      JSON.stringify({ ...snapshot, me: { ...snapshot.me, hd: undefined } }),
    ],
    ['a snapshot with a short mine row', JSON.stringify({ ...snapshot, mn: [[1, 2, 3, 4]] })],
    [
      'a snapshot with a mine armed flag that is not 0 or 1',
      JSON.stringify({ ...snapshot, mn: [[1, 2, 3, 4, 2]] }),
    ],
    [
      'an own train without a spawn counter',
      JSON.stringify({ ...snapshot, me: { ...snapshot.me, sq: undefined } }),
    ],
    [
      'a snapshot with a non-numeric row entry',
      JSON.stringify({ ...snapshot, dr: [[1, 2, 'x', 4, 5]] }),
    ],
    [
      'a snapshot with an odd carriage list',
      JSON.stringify({ ...snapshot, me: { ...snapshot.me, cs: [1, 2, 3] } }),
    ],
    ['an overview row without a name', '{"t":"ov","h":[[1,2,3,"#fff"]],"lb":[],"rk":0}'],
    ['an overview without a leaderboard', '{"t":"ov","h":[],"rk":0}'],
    ['an overview with a bad leaderboard row', '{"t":"ov","h":[],"lb":[[1,"a",2,3,7]],"rk":0}'],
    ['a round with an unknown phase', '{"t":"round","phase":"idle","roundId":1,"endsAt":0}'],
    [
      'a roundEnd with a bad standings row',
      '{"t":"roundEnd","roundId":1,"standings":[[1,"a",2,3,4]],"winnerId":1,"nextRoundAt":0}',
    ],
    ['an idleWarn without a count', '{"t":"idleWarn"}'],
    ['an hsEligible without a token', '{"t":"hsEligible","rank":1,"score":5}'],
    ['an hsEligible with a fractional rank', '{"t":"hsEligible","token":"a","rank":1.5,"score":5}'],
    ['an hsResult without ok', '{"t":"hsResult"}'],
    ['a highscores without entries', '{"t":"highscores","highlightIds":[]}'],
    ['a highscores with a bad row', '{"t":"highscores","entries":[["a","b"]],"highlightIds":[]}'],
    ['a highscores with a bad highlight', '{"t":"highscores","entries":[],"highlightIds":[3]}'],
    ['a kicked with another reason', '{"t":"kicked","reason":"cheating"}'],
    [
      'a meta with a bad controller',
      '{"t":"meta","trains":[{"id":1,"name":"a","color":"c","ctl":"cat","kinds":[]}],"gone":[]}',
    ],
    ['a pong without a server time', '{"t":"pong","c":1}'],
  ])('rejects %s', (_name, raw) => {
    expect(decodeServerMessage(raw)).toBeNull();
  });
});
