import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeMessage, PROTOCOL_VERSION, SNAPSHOT_TIMEOUT_MS } from '@lw/shared';
import type { ClientMessage, ServerMessage, TrainInput } from '@lw/shared';
import { NetSession } from './connection.ts';
import type { ConnectionStatus, DisconnectReason } from './connection.ts';
import { makeOwn, makeSnapshot } from './testing.ts';
import type { Connect, TransportHandlers } from './transport.ts';

const STILL: TrainInput = { turn: 0, boost: false, brake: false, aim: 0 };

/** A transport the test drives by hand. */
class FakeServer {
  readonly sent: ClientMessage[] = [];
  handlers: TransportHandlers | null = null;
  connects = 0;
  closed = 0;

  readonly connect: Connect = (_url, handlers) => {
    this.connects += 1;
    this.handlers = handlers;
    this.sent.length = 0;
    return {
      send: (text) => this.sent.push(JSON.parse(text) as ClientMessage),
      close: () => (this.closed += 1),
    };
  };

  open(): void {
    this.handlers?.onOpen();
  }

  say(msg: ServerMessage): void {
    this.handlers?.onMessage(encodeMessage(msg));
  }

  drop(): void {
    this.handlers?.onClose();
  }

  of<T extends ClientMessage['t']>(t: T): Extract<ClientMessage, { t: T }>[] {
    return this.sent.filter((m): m is Extract<ClientMessage, { t: T }> => m.t === t);
  }
}

const welcome: ServerMessage = {
  t: 'welcome',
  v: PROTOCOL_VERSION,
  id: 5,
  tickRate: 30,
  snapRate: 15,
  mapSize: 6000,
  interpMs: 133,
};

let server: FakeServer;
let statuses: Array<[ConnectionStatus, DisconnectReason | undefined]>;

function makeSession(): NetSession {
  return new NetSession({
    url: 'ws://test/ws',
    name: 'Casey',
    connect: server.connect,
    onStatus: (s, r) => statuses.push([s, r]),
  });
}

function snapshot(
  st: number,
  over: Parameters<typeof makeSnapshot>[0] extends infer P ? Partial<P> : never = {},
) {
  return makeSnapshot({ st, me: makeOwn({ x: 1000, y: 1000, cs: [982, 1000] }), ...over });
}

/** Connects, welcomes, and delivers a first snapshot. */
function online(session: NetSession, st = 1000): void {
  server.open();
  server.say(welcome);
  server.say({
    t: 'meta',
    trains: [{ id: 5, name: 'Casey', color: '#0f0', ctl: 'human', kinds: ['locomotive', 'mg'] }],
    gone: [],
  });
  server.say(snapshot(st));
  expect(session.status).toBe('online');
}

beforeEach(() => {
  vi.useFakeTimers();
  server = new FakeServer();
  statuses = [];
});
afterEach(() => {
  vi.useRealTimers();
});

describe('NetSession joining', () => {
  it('says hello with the protocol version and the name once the socket opens', () => {
    makeSession();
    expect(server.sent).toEqual([]);
    server.open();
    expect(server.sent).toEqual([{ t: 'hello', v: PROTOCOL_VERSION, name: 'Casey' }]);
  });

  it('is ready at the first snapshot, with the world parameters from welcome', async () => {
    const session = makeSession();
    server.open();
    server.say(welcome);
    expect(session.status).toBe('connecting');
    expect(session.mapSize).toBe(6000);
    expect(session.localId).toBe(5);
    server.say(snapshot(1000));
    await expect(session.ready).resolves.toBeUndefined();
    expect(session.status).toBe('online');
    expect(statuses.map(([s]) => s)).toEqual(['connecting', 'online']);
  });

  it('shows the local train in the view, named from meta', () => {
    const session = makeSession();
    online(session);
    session.advance(0.016, STILL);
    const view = session.view();
    expect(view.localId).toBe(5);
    const me = view.trains.find((t) => t.id === 5);
    expect(me?.name).toBe('Casey');
    expect(me?.carriages.map((c) => c.kind)).toEqual(['locomotive']);
  });

  it('refuses with the reason when the server rejects the version', async () => {
    const session = makeSession();
    server.open();
    server.say({ t: 'reject', reason: 'version' });
    await expect(session.ready).rejects.toThrow('version');
    expect(session.status).toBe('disconnected');
    expect(session.reason).toBe('version');
  });

  it('fails when the socket closes before a snapshot', async () => {
    const session = makeSession();
    server.drop();
    await expect(session.ready).rejects.toThrow('closed');
    expect(session.reason).toBe('closed');
  });

  it('gives up when the join takes too long', async () => {
    const session = makeSession();
    server.open();
    vi.advanceTimersByTime(9000);
    await expect(session.ready).rejects.toThrow('timeout');
    expect(session.reason).toBe('timeout');
  });

  it('ignores malformed server messages', () => {
    const session = makeSession();
    server.open();
    server.handlers?.onMessage('not json');
    server.handlers?.onMessage('{"t":"snap"}');
    expect(session.status).toBe('connecting');
  });
});

describe('NetSession input', () => {
  it('sends a changed input once, with a rising sequence number', () => {
    const session = makeSession();
    online(session);
    server.sent.length = 0;
    session.advance(0.016, { ...STILL, turn: 1 });
    vi.advanceTimersByTime(40);
    session.advance(0.016, { ...STILL, turn: 1 });
    const inputs = server.of('in');
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toMatchObject({ t: 'in', tr: 1, b: 0, br: 0 });
    vi.advanceTimersByTime(40);
    session.advance(0.016, { ...STILL, turn: 1, boost: true });
    const after = server.of('in');
    expect(after).toHaveLength(2);
    expect(after[1]?.s).toBeGreaterThan(after[0]?.s ?? 0);
    expect(after[1]?.b).toBe(1);
  });

  it('keeps sending a heartbeat at least every 100 ms while nothing changes', () => {
    const session = makeSession();
    online(session);
    session.advance(0.016, STILL);
    server.sent.length = 0;
    vi.advanceTimersByTime(1000);
    const n = server.of('in').length;
    expect(n).toBeGreaterThanOrEqual(9);
    expect(n).toBeLessThanOrEqual(20);
  });

  it('stays under the server cap even if the aim changes every frame at 144 fps', () => {
    const session = makeSession();
    online(session);
    server.sent.length = 0;
    for (let i = 0; i < 144; i++) {
      vi.advanceTimersByTime(1000 / 144);
      session.advance(1 / 144, { ...STILL, aim: i * 0.01 });
    }
    expect(server.of('in').length).toBeLessThanOrEqual(40);
  });

  it('sends nothing once disconnected', () => {
    const session = makeSession();
    online(session);
    server.drop();
    server.sent.length = 0;
    session.advance(0.016, { ...STILL, turn: 1 });
    vi.advanceTimersByTime(1000);
    expect(server.sent).toEqual([]);
  });
});

describe('NetSession time and events', () => {
  it('pings on joining and then every 2 s, and uses pongs for the clock', () => {
    const session = makeSession();
    online(session);
    const pings = server.of('ping');
    expect(pings.length).toBeGreaterThanOrEqual(1);
    server.sent.length = 0;
    vi.advanceTimersByTime(2100);
    expect(server.of('ping').length).toBeGreaterThanOrEqual(1);
    // Answer a ping as a server 7 s ahead would; the session accepts it without error.
    const ping = server.of('ping')[0];
    server.say({ t: 'pong', c: ping?.c ?? 0, st: performance.now() + 7000 });
    expect(session.view()).toBeDefined();
  });

  it('delivers snapshot events once', () => {
    const session = makeSession();
    online(session);
    server.say(snapshot(1067, { ev: [{ type: 'trainLeft', trainId: 9, x: 1, y: 2 }] }));
    expect(session.advance(0.016, STILL)).toEqual([{ type: 'trainLeft', trainId: 9, x: 1, y: 2 }]);
    expect(session.advance(0.016, STILL)).toEqual([]);
  });

  it('knows names of trains outside the view from the overview', () => {
    const session = makeSession();
    online(session);
    server.say({ t: 'ov', h: [[9, 4000, 4000, '#f00', 'FarAway']] });
    expect([...(session.knownTrains?.() ?? [])]).toContainEqual({
      id: 9,
      name: 'FarAway',
      color: '#f00',
    });
  });

  it('builds the minimap from the overview, placing the local train from its pose', () => {
    const session = makeSession();
    online(session);
    server.say({
      t: 'ov',
      h: [
        [5, 900, 900, '#0f0', 'Casey'],
        [9, 4000, 4000, '#f00', 'FarAway'],
      ],
    });
    session.advance(0.016, STILL);
    const map = session.view().minimap;
    expect(map.map((m) => m.id).sort()).toEqual([5, 9]);
    expect(map.find((m) => m.id === 5)?.isLocal).toBe(true);
    expect(map.find((m) => m.id === 5)?.x).not.toBe(900);
    expect(map.find((m) => m.id === 9)).toMatchObject({ x: 4000, y: 4000 });
  });
});

describe('NetSession disconnect and reconnect', () => {
  it('goes disconnected when the socket closes', () => {
    const session = makeSession();
    online(session);
    server.drop();
    expect(session.status).toBe('disconnected');
    expect(session.reason).toBe('closed');
    expect(statuses.at(-1)).toEqual(['disconnected', 'closed']);
  });

  it('goes disconnected after 5 s without snapshots', () => {
    const session = makeSession();
    online(session);
    vi.advanceTimersByTime(SNAPSHOT_TIMEOUT_MS - 1000);
    expect(session.status).toBe('online');
    vi.advanceTimersByTime(2500);
    expect(session.status).toBe('disconnected');
    expect(session.reason).toBe('timeout');
    expect(server.closed).toBeGreaterThan(0);
  });

  it('keeps the connection alive while snapshots keep arriving', () => {
    const session = makeSession();
    online(session);
    for (let i = 1; i <= 20; i++) {
      vi.advanceTimersByTime(1000);
      server.say(snapshot(1000 + i * 1000));
    }
    expect(session.status).toBe('online');
  });

  it('rejoins afresh on reconnect: new hello, new world generation', () => {
    const session = makeSession();
    online(session);
    const gen = session.generation;
    server.drop();
    session.reconnect();
    expect(server.connects).toBe(2);
    expect(session.status).toBe('connecting');
    expect(session.generation).toBeGreaterThan(gen);
    server.open();
    expect(server.sent).toEqual([{ t: 'hello', v: PROTOCOL_VERSION, name: 'Casey' }]);
    server.say({ ...welcome, id: 8 } as ServerMessage);
    server.say(snapshot(500));
    expect(session.status).toBe('online');
    expect(session.localId).toBe(8);
  });

  it('can be reconnected after the server was unreachable', async () => {
    const session = makeSession();
    server.drop();
    await expect(session.ready).rejects.toThrow();
    session.reconnect();
    server.open();
    server.say(welcome);
    server.say(snapshot(1));
    await expect(session.ready).resolves.toBeUndefined();
  });

  it('ignores late messages from a closed connection', () => {
    const session = makeSession();
    online(session);
    server.drop();
    server.say(snapshot(5000, { ev: [{ type: 'trainLeft', trainId: 1, x: 0, y: 0 }] }));
    expect(session.advance(0.016, STILL)).toEqual([]);
  });
});
