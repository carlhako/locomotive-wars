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
    cs: [90, 200, 72, 200],
    dn: [0.5],
  },
  tr: [[7, 10, 20, 3.14, 90, 100, 1, 5, 6, 7, 8]],
  en: [
    [3, 0, 10, 20, 1.2, 20, 20],
    [4, 3, 30, 40, 0, 1200, 1200, 'Dread Maw'],
  ],
  tl: [[9, 2, 50, 60]],
  dr: [[10, 4, 70, 80, 1.5]],
  pr: [[11, 1, 90, 100, 200, -50]],
  ev: [
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
  ],
};

const clientMessages: ClientMessage[] = [
  { t: 'hello', v: PROTOCOL_VERSION, name: 'Casey' },
  { t: 'in', s: 5, tr: -1, b: 1, br: 0, a: 2.5 },
  { t: 'ping', c: 123456.5 },
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
  },
  { t: 'reject', reason: 'version' },
  { t: 'reject', reason: 'full' },
  { t: 'reject', reason: 'malformed' },
  {
    t: 'meta',
    trains: [{ id: 4, name: 'Casey', color: '#fff', ctl: 'human', kinds: ['locomotive', 'mg'] }],
    gone: [2, 3],
  },
  snapshot,
  { ...snapshot, me: null, tr: [], en: [], tl: [], dr: [], pr: [], ev: [] },
  { t: 'ov', h: [[4, 10, 20, '#fff', 'Casey']] },
  { t: 'pong', c: 99, st: 1234.5 },
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
    ['input missing a field', '{"t":"in","s":1,"tr":0,"b":0,"br":0}'],
    ['input with a string turn', '{"t":"in","s":1,"tr":"1","b":0,"br":0,"a":0}'],
    ['input with a boolean boost', '{"t":"in","s":1,"tr":0,"b":true,"br":0,"a":0}'],
    ['input with boost 2', '{"t":"in","s":1,"tr":0,"b":2,"br":0,"a":0}'],
    ['input with an infinite aim', '{"t":"in","s":1,"tr":0,"b":0,"br":0,"a":1e999}'],
    ['input with an infinite turn', '{"t":"in","s":1,"tr":-1e999,"b":0,"br":0,"a":0}'],
    ['input with a fractional sequence', '{"t":"in","s":1.5,"tr":0,"b":0,"br":0,"a":0}'],
    ['ping with a string time', '{"t":"ping","c":"now"}'],
  ])('rejects %s', (_name, raw) => {
    expect(decodeClientMessage(raw)).toBeNull();
  });

  it('passes an out-of-range turn through for the server to clamp', () => {
    const msg = decodeClientMessage('{"t":"in","s":1,"tr":50,"b":0,"br":0,"a":0}');
    expect(msg).toEqual({ t: 'in', s: 1, tr: 50, b: 0, br: 0, a: 0 });
  });

  it('drops unknown extra fields, such as a client-claimed position', () => {
    const msg = decodeClientMessage('{"t":"in","s":1,"tr":0,"b":0,"br":0,"a":0,"x":5,"y":6}');
    expect(msg).toEqual({ t: 'in', s: 1, tr: 0, b: 0, br: 0, a: 0 });
  });
});

describe('decodeServerMessage', () => {
  it.each([
    ['invalid JSON', 'x'],
    ['an unknown type', '{"t":"nope"}'],
    ['a reject with a bad reason', '{"t":"reject","reason":"because"}'],
    [
      'a welcome missing the map size',
      '{"t":"welcome","v":1,"id":1,"tickRate":30,"snapRate":15,"interpMs":133}',
    ],
    ['a snapshot without events', JSON.stringify({ ...snapshot, ev: undefined })],
    ['a snapshot with a short train row', JSON.stringify({ ...snapshot, tr: [[1, 2, 3]] })],
    [
      'a snapshot with a non-numeric row entry',
      JSON.stringify({ ...snapshot, dr: [[1, 2, 'x', 4, 5]] }),
    ],
    [
      'a snapshot with an odd carriage list',
      JSON.stringify({ ...snapshot, me: { ...snapshot.me, cs: [1, 2, 3] } }),
    ],
    ['an overview row without a name', '{"t":"ov","h":[[1,2,3,"#fff"]]}'],
    [
      'a meta with a bad controller',
      '{"t":"meta","trains":[{"id":1,"name":"a","color":"c","ctl":"cat","kinds":[]}],"gone":[]}',
    ],
    ['a pong without a server time', '{"t":"pong","c":1}'],
  ])('rejects %s', (_name, raw) => {
    expect(decodeServerMessage(raw)).toBeNull();
  });
});
