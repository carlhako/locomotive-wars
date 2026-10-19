import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeMessage, PROTOCOL_VERSION, SNAPSHOT_TIMEOUT_MS } from '@lw/shared';
import type { ClientMessage, ServerMessage, TrainInput } from '@lw/shared';
import { NetSession } from './connection.ts';
import type { ConnectionStatus, DisconnectReason } from './connection.ts';
import { makeOwn, makeSnapshot } from './testing.ts';
import type { Connect, TransportHandlers } from './transport.ts';

const STILL: TrainInput = {
  turn: 0,
  boost: false,
  brake: false,
  fire: false,
  aimX: 200,
  aimY: 0,
};

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
  roundLengthSec: 600,
  intermissionSec: 20,
  idleKickSec: 60,
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
    expect(inputs[0]).toMatchObject({ t: 'in', tr: 1, b: 0, br: 0, f: 0 });
    vi.advanceTimersByTime(40);
    session.advance(0.016, { ...STILL, turn: 1, boost: true });
    const after = server.of('in');
    expect(after).toHaveLength(2);
    expect(after[1]?.s).toBeGreaterThan(after[0]?.s ?? 0);
    expect(after[1]?.b).toBe(1);
  });

  it('sends a fire press at once, without waiting for the heartbeat', () => {
    const session = makeSession();
    online(session);
    session.advance(0.016, STILL);
    vi.advanceTimersByTime(30);
    server.sent.length = 0;
    session.advance(0.016, { ...STILL, fire: true });
    const inputs = server.of('in');
    expect(inputs).toHaveLength(1);
    expect(inputs[0]?.f).toBe(1);
    vi.advanceTimersByTime(30);
    session.advance(0.016, STILL);
    expect(server.of('in').at(-1)?.f).toBe(0);
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
      session.advance(1 / 144, { ...STILL, aimX: 200 + i * 2 });
    }
    expect(server.of('in').length).toBeLessThanOrEqual(40);
  });

  it('sends the aim offset, rounded to 0.1 units', () => {
    const session = makeSession();
    online(session);
    session.advance(0.016, { ...STILL, aimX: -120.04, aimY: 33.36 });
    vi.advanceTimersByTime(100);
    expect(server.of('in').at(-1)).toMatchObject({ ax: -120, ay: 33.4 });
  });

  it('sends only heartbeats for a still mouse while the train moves', () => {
    const session = makeSession();
    online(session);
    const held = { ...STILL, aimX: 150, aimY: -80 };
    session.advance(0.016, held);
    vi.advanceTimersByTime(100);
    server.sent.length = 0;
    // A second of 60 fps frames, with the train moving on in every snapshot.
    for (let f = 1; f <= 60; f++) {
      vi.advanceTimersByTime(1000 / 60);
      if (f % 4 === 0) {
        const st = 1000 + 100 + f * (1000 / 60);
        server.say(snapshot(st, { me: makeOwn({ x: 1000 + f * 3, y: 1000, cs: [982, 1000] }) }));
      }
      session.advance(1 / 60, held);
    }
    const sent = server.of('in');
    // The heartbeat is due every 75-100 ms: about 10-14 in a second, and nothing more.
    expect(sent.length).toBeLessThanOrEqual(14);
    expect(sent.every((m) => m.ax === 150 && m.ay === -80)).toBe(true);
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
    server.say({ t: 'ov', h: [[9, 4000, 4000, '#f00', 'FarAway']], lb: [], rk: 0 });
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
      lb: [],
      rk: 0,
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

describe('NetSession rounds', () => {
  it('reports the round phase and seconds left on the server clock', () => {
    const session = makeSession();
    online(session, 1000);
    // The first snapshot seeds the clock: server time 1000 ms equals the client time now.
    const now = performance.now();
    server.say({ t: 'round', phase: 'playing', roundId: 3, endsAt: 1000 + 90_000 });
    const round = session.round();
    expect(round).toMatchObject({ phase: 'playing', roundId: 3 });
    expect(round?.secondsLeft).toBeGreaterThan(89.9);
    expect(round?.secondsLeft).toBeLessThanOrEqual(90 + (performance.now() - now) / 1000);
    vi.advanceTimersByTime(30_000);
    expect(session.round()?.secondsLeft).toBeCloseTo(60, 0);
  });

  it('is null before any round message', () => {
    const session = makeSession();
    online(session);
    expect(session.round()).toBeNull();
    expect(session.roundResult()).toBeNull();
  });

  it('keeps the standings only for the intermission', () => {
    const session = makeSession();
    online(session);
    server.say({ t: 'round', phase: 'intermission', roundId: 1, endsAt: 21_000 });
    server.say({
      t: 'roundEnd',
      roundId: 1,
      standings: [
        [9, 'IronWolf', 1, 40, 2],
        [5, 'Casey', 0, 12, 0],
      ],
      winnerId: 9,
      nextRoundAt: 21_000,
    });
    expect(session.roundResult()).toEqual({
      roundId: 1,
      winnerId: 9,
      standings: [
        { id: 9, name: 'IronWolf', bot: true, best: 40, kills: 2 },
        { id: 5, name: 'Casey', bot: false, best: 12, kills: 0 },
      ],
    });
    server.say({ t: 'round', phase: 'playing', roundId: 2, endsAt: 600_000 });
    expect(session.roundResult()).toBeNull();
  });

  it('does not run the local train ahead of a frozen world', () => {
    const session = makeSession();
    online(session);
    const boost = { ...STILL, boost: true };
    session.advance(0.016, boost);
    vi.advanceTimersByTime(300);
    session.advance(0.016, boost);
    const moving = session.view().trains.find((t) => t.id === 5)!;
    expect(moving.x).toBeGreaterThan(1000);

    server.say({ t: 'round', phase: 'intermission', roundId: 1, endsAt: 21_000 });
    vi.advanceTimersByTime(300);
    session.advance(0.016, boost);
    const frozen = session.view().trains.find((t) => t.id === 5)!;
    expect(frozen.x).toBe(1000);
  });

  it('builds the board from the overview leaderboard and keeps the own rank', () => {
    const session = makeSession();
    online(session);
    expect(session.board()).toBeNull();
    server.say({
      t: 'ov',
      h: [],
      lb: [
        [9, 'IronWolf', 40, 12, 1],
        [5, 'Casey', 12, 12, 0],
      ],
      rk: 2,
    });
    expect(session.board()).toEqual({
      rows: [
        { id: 9, name: 'IronWolf', best: 40, now: 12, bot: true },
        { id: 5, name: 'Casey', best: 12, now: 12, bot: false },
      ],
      rank: 2,
    });
  });
});

describe('NetSession high scores', () => {
  const table: ServerMessage = {
    t: 'highscores',
    entries: [
      ['a-r1-0', 'CARL', 64],
      ['a-r1-1', 'Ann', 40],
    ],
    highlightIds: ['a-r1-0'],
  };

  function intermission(session: NetSession): void {
    online(session);
    server.say({ t: 'round', phase: 'intermission', roundId: 1, endsAt: 21_000 });
  }

  it('shows the table and the offer only during the intermission', () => {
    const session = makeSession();
    online(session);
    server.say({ t: 'round', phase: 'playing', roundId: 1, endsAt: 600_000 });
    expect(session.highscores()).toBeNull();
    server.say({ t: 'round', phase: 'intermission', roundId: 1, endsAt: 21_000 });
    server.say({ t: 'hsEligible', token: 'tok', rank: 1, score: 64 });
    server.say(table);
    expect(session.highscores()).toEqual({
      rows: [
        { id: 'a-r1-0', name: 'CARL', score: 64 },
        { id: 'a-r1-1', name: 'Ann', score: 40 },
      ],
      highlightIds: ['a-r1-0'],
    });
    expect(session.highScoreOffer()).toEqual({
      rank: 1,
      score: 64,
      state: 'ready',
      failure: undefined,
    });
    server.say({ t: 'round', phase: 'playing', roundId: 2, endsAt: 620_000 });
    expect(session.highscores()).toBeNull();
    expect(session.highScoreOffer()).toBeNull();
  });

  it('has no offer unless the server made one', () => {
    const session = makeSession();
    intermission(session);
    server.say(table);
    expect(session.highScoreOffer()).toBeNull();
    session.submitHighScoreName('CARL');
    expect(server.of('hsName')).toHaveLength(0);
  });

  it('sends the typed name with the token, never a score, and tracks the reply', () => {
    const session = makeSession();
    intermission(session);
    server.say({ t: 'hsEligible', token: 'tok-1', rank: 2, score: 40 });
    session.submitHighScoreName('CARL');
    expect(server.of('hsName')).toEqual([{ t: 'hsName', token: 'tok-1', name: 'CARL' }]);
    expect(session.highScoreOffer()?.state).toBe('saving');
    // A second press while waiting sends nothing.
    session.submitHighScoreName('CARL2');
    expect(server.of('hsName')).toHaveLength(1);
    server.say({ t: 'hsResult', ok: true });
    expect(session.highScoreOffer()?.state).toBe('saved');
    session.submitHighScoreName('CARL3');
    expect(server.of('hsName')).toHaveLength(1);
  });

  it('allows another try after a server error, but not after a refusal', () => {
    const session = makeSession();
    intermission(session);
    server.say({ t: 'hsEligible', token: 'tok-1', rank: 2, score: 40 });
    session.submitHighScoreName('A');
    server.say({ t: 'hsResult', ok: false, reason: 'error' });
    expect(session.highScoreOffer()).toMatchObject({ state: 'failed', failure: 'error' });
    session.submitHighScoreName('B');
    expect(server.of('hsName')).toHaveLength(2);
    server.say({ t: 'hsResult', ok: false, reason: 'expired' });
    expect(session.highScoreOffer()).toMatchObject({ state: 'failed', failure: 'expired' });
    session.submitHighScoreName('C');
    expect(server.of('hsName')).toHaveLength(2);
  });
});

describe('NetSession idle warning and kick', () => {
  it('counts down from the warning and clears on idleClear', () => {
    const session = makeSession();
    online(session);
    expect(session.idleWarning()).toBeNull();
    server.say({ t: 'idleWarn', secondsLeft: 10 });
    expect(session.idleWarning()).toBe(10);
    vi.advanceTimersByTime(4000);
    expect(session.idleWarning()).toBe(6);
    server.say({ t: 'idleClear' });
    expect(session.idleWarning()).toBeNull();
  });

  it('ends the session with reason kicked, and the later close does not change it', () => {
    const session = makeSession();
    online(session);
    server.say({ t: 'idleWarn', secondsLeft: 10 });
    server.say({ t: 'kicked', reason: 'idle' });
    expect(session.status).toBe('disconnected');
    expect(session.reason).toBe('kicked');
    expect(session.idleWarning()).toBeNull();
    server.drop();
    expect(session.reason).toBe('kicked');
    expect(statuses.at(-1)).toEqual(['disconnected', 'kicked']);
  });

  it('can rejoin after a kick', () => {
    const session = makeSession();
    online(session);
    server.say({ t: 'kicked', reason: 'idle' });
    session.reconnect();
    server.open();
    expect(server.of('hello')).toHaveLength(1);
    expect(session.status).toBe('connecting');
  });
});

describe('NetSession server full', () => {
  it('rejects with the counts', async () => {
    const session = makeSession();
    server.open();
    server.say({ t: 'reject', reason: 'full', humans: 16, max: 16 });
    await expect(session.ready).rejects.toThrow('full');
    expect(session.reason).toBe('full');
    expect(session.fullInfo).toEqual({ humans: 16, max: 16 });
  });
});

describe('NetSession projectiles and hearts', () => {
  /** Snapshots every 66.7 ms from st 1000, each delivered as the clock reaches it. */
  function play(session: NetSession, frames: Array<Parameters<typeof snapshot>[1]>): number {
    online(session, 1000);
    let st = 1000;
    for (const over of frames) {
      vi.advanceTimersByTime(66.7);
      st += 66.7;
      server.say(snapshot(st, over));
    }
    return st;
  }

  it('draws its own projectiles from the newest snapshot, run forward to now', () => {
    const session = makeSession();
    const enemy = (y: number) =>
      [51, 4, 1200, y, 0, 240] as [number, number, number, number, number, number];
    const own = (x: number) =>
      [50, 0, x, 1000, 550, 0, 1] as [number, number, number, number, number, number, 1];
    const newest = play(session, [
      { pr: [enemy(1016), own(1100)] },
      { pr: [enemy(1032), own(1137)] },
      { pr: [enemy(1048), own(1174)] },
    ]);
    vi.advanceTimersByTime(40);
    session.advance(0.016, STILL);
    const shots = session.view().projectiles;
    const mine = shots.find((p) => p.id === 50)!;
    const theirs = shots.find((p) => p.id === 51)!;
    // Newest snapshot plus 40 ms at 550 units/s.
    expect(mine.x).toBeCloseTo(1174 + 550 * 0.04, 6);
    expect(shots.filter((p) => p.id === 50)).toHaveLength(1);
    // The drone's bullet is drawn 133 ms in the past, between the first two snapshots that had it.
    const at = newest + 40 - 133;
    const alpha = (at - (1000 + 66.7)) / 66.7;
    expect(theirs.y).toBeCloseTo(1016 + 16 * alpha, 6);
  });

  it('caps how far its own projectiles are run forward', () => {
    const session = makeSession();
    const own = [50, 0, 1100, 1000, 550, 0, 1] as [
      number,
      number,
      number,
      number,
      number,
      number,
      1,
    ];
    play(session, [{ pr: [own] }]);
    vi.advanceTimersByTime(1000);
    session.advance(0.016, STILL);
    const mine = session.view().projectiles.find((p) => p.id === 50)!;
    expect(mine.x).toBeCloseTo(1100 + 550 * 0.25, 6);
  });

  it('shows hearts in view and the own dose count', () => {
    const session = makeSession();
    play(session, [
      {
        me: makeOwn({ x: 1000, y: 1000, cs: [982, 1000], hd: 3 }),
        ht: [
          [60, 0, 1100, 1000],
          [61, 1, 900, 1000],
        ],
      },
    ]);
    session.advance(0.016, STILL);
    vi.advanceTimersByTime(200);
    session.advance(0.016, STILL);
    const view = session.view();
    expect(view.hearts).toEqual([
      { id: 60, kind: 'slow', x: 1100, y: 1000 },
      { id: 61, kind: 'full', x: 900, y: 1000 },
    ]);
    expect(view.localDoses).toBe(3);
  });
});
