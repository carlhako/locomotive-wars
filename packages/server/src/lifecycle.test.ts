import { afterEach, describe, expect, it } from 'vitest';
import { CLOSE_KICKED, PROTOCOL_VERSION } from '@lw/shared';
import type { GameServer } from './server.ts';
import { sleep, startServer, TestClient } from './testing.ts';

/**
 * Integration tests that run the real server over WebSocket but drive its tick by hand, so a
 * 30-second round takes milliseconds. The loop is stopped; `ticks()` runs the server's own tick.
 */

let server: GameServer | null = null;
const clients: TestClient[] = [];

afterEach(async () => {
  for (const c of clients.splice(0)) c.close();
  await server?.close();
  server = null;
});

const NO_BOTS = { fillTo: 0 };
/** No trailers, enemies, or boss: nothing but the players changes a train's length or health. */
const EMPTY_WORLD = {
  initialTrailers: 0,
  initialEnemies: 0,
  maxTrailers: 0,
  maxEnemies: 0,
  boss: false,
};

async function start(config: Record<string, unknown> = {}): Promise<number> {
  const started = await startServer({ config: { bots: NO_BOTS, ...config }, world: EMPTY_WORLD });
  server = started.server;
  server.loop.stop();
  return started.port;
}

async function join(port: number, name = 'Tester'): Promise<TestClient> {
  const c = await TestClient.join(port, name);
  clients.push(c);
  return c;
}

/** Runs `n` server ticks, yielding to the event loop now and then so sockets can flush. */
async function ticks(n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    server!.tick();
    if (i % 20 === 19) await new Promise((r) => setImmediate(r));
  }
  await sleep(30);
}

const SECOND = 30;

describe('config wiring', () => {
  it('sends a snapshot every tick when snapshotRate equals tickRate', async () => {
    const port = await start({ snapshotRate: 30 });
    const c = await join(port);
    expect(c.welcome).toMatchObject({ tickRate: 30, snapRate: 30, interpMs: 67 });
    await ticks(10);
    const snaps = c.of('snap');
    expect(snaps.length).toBeGreaterThanOrEqual(10);
    const k = snaps.map((s) => s.k);
    for (let i = 1; i < k.length; i++) expect(k[i]).toBe((k[i - 1] ?? 0) + 1);
  });

  it('passes the tick rate, carriage limit, and round settings through', async () => {
    const port = await start({
      tickRate: 20,
      snapshotRate: 10,
      maxCarriages: 12,
      roundLengthSec: 45,
      intermissionSec: 7,
      idleKickSec: 30,
    });
    const c = await join(port);
    expect(server!.world.options.tickRate).toBe(20);
    expect(server!.world.rules.maxCarriages).toBe(12);
    expect(c.welcome).toMatchObject({
      tickRate: 20,
      snapRate: 10,
      roundLengthSec: 45,
      intermissionSec: 7,
      idleKickSec: 30,
    });
  });

  it('limits what snapshots show to the configured view radius', async () => {
    const port = await start({ viewRadius: 500 });
    const a = await join(port, 'A');
    const b = await join(port, 'B');
    const ta = server!.world.getTrain(a.id)!;
    const tb = server!.world.getTrain(b.id)!;
    ta.x = 1000;
    ta.y = 1000;
    tb.x = 1800;
    tb.y = 1000;
    await ticks(6);
    const last = a.of('snap').at(-1)!;
    expect(last.tr.some((r) => r[0] === b.id)).toBe(false);
  });
});

describe('round lifecycle', () => {
  it('ends a round on time, freezes the world, then starts the next round fresh', async () => {
    const port = await start({ roundLengthSec: 30, intermissionSec: 5 });
    const c = await join(port, 'Casey');
    expect(c.of('round')).toHaveLength(1);
    expect(c.of('round')[0]).toMatchObject({ phase: 'playing', roundId: 1 });

    server!.world.addCarriage(c.id, 'armor');
    server!.world.addCarriage(c.id, 'armor');
    await ticks(30 * SECOND - 1);
    expect(c.of('roundEnd')).toHaveLength(0);
    await ticks(1);
    await c.waitFor(() => c.of('roundEnd').length > 0);

    const rounds = c.of('round');
    expect(rounds.at(-1)).toMatchObject({ phase: 'intermission', roundId: 1 });
    const end = c.of('roundEnd')[0]!;
    expect(end.roundId).toBe(1);
    expect(end.winnerId).toBe(c.id);
    expect(end.standings[0]).toEqual([c.id, 'Casey', 0, 3, expect.any(Number)]);
    // The next round starts intermissionSec after the end, on the server clock.
    expect(end.nextRoundAt - rounds.at(-1)!.endsAt).toBe(0);
    expect(end.nextRoundAt).toBeCloseTo((30 * SECOND + 5 * SECOND) * (1000 / 30), 3);

    // Frozen: held input moves nothing, and the world tick stands still.
    const train = server!.world.getTrain(c.id)!;
    c.send({ t: 'in', s: 1, tr: 1, b: 1, br: 0, a: 0 });
    await sleep(30);
    const frozen = { tick: server!.world.state.tick, x: train.x, y: train.y, angle: train.angle };
    await ticks(2 * SECOND);
    expect({ tick: server!.world.state.tick, x: train.x, y: train.y, angle: train.angle }).toEqual(
      frozen,
    );
    expect(train.input.boost).toBe(false);
    // Snapshots keep coming so the client has a frame behind the overlay.
    const n = c.of('snap').length;
    await ticks(4);
    await c.waitFor(() => c.of('snap').length > n);

    await ticks(3 * SECOND);
    await c.waitFor(() => c.of('round').some((r) => r.roundId === 2));
    expect(c.of('round').at(-1)).toMatchObject({ phase: 'playing', roundId: 2 });
    const fresh = server!.world.getTrain(c.id)!;
    expect(fresh.carriages).toHaveLength(2);
    expect(fresh.roundBest).toBe(1);
    expect(fresh.spawnSeq).toBeGreaterThan(0);
    // Play resumes.
    const t0 = server!.world.state.tick;
    await ticks(5);
    expect(server!.world.state.tick).toBe(t0 + 5);
  });

  it('names the highest round best the winner, with bots marked in the standings', async () => {
    const port = await start({
      roundLengthSec: 30,
      intermissionSec: 5,
      bots: { fillTo: 2, min: 2, max: 2 },
    });
    const a = await join(port, 'Alpha');
    const b = await join(port, 'Bravo');
    const world = server!.world;
    for (let i = 0; i < 6; i++) world.addCarriage(a.id, 'armor');
    for (let i = 0; i < 9; i++) world.addCarriage(b.id, 'armor');
    // Bravo peaked at 10, then lost it all; Alpha ends with 7.
    world.getTrain(b.id)!.alive = false;
    await ticks(30 * SECOND);
    await a.waitFor(() => a.of('roundEnd').length > 0);
    const end = a.of('roundEnd')[0]!;
    expect(end.winnerId).toBe(b.id);
    expect(end.standings.map((r) => r[1]).slice(0, 2)).toEqual(['Bravo', 'Alpha']);
    expect(end.standings.filter((r) => r[2] === 1)).toHaveLength(2);
    expect(end.standings).toHaveLength(4);
    // Both humans got the same standings.
    await b.waitFor(() => b.of('roundEnd').length > 0);
    expect(b.of('roundEnd')[0]).toEqual(end);
  });

  it('calls the round-end hook once with the standings', async () => {
    const results: unknown[] = [];
    const started = await startServer({
      config: { bots: NO_BOTS, roundLengthSec: 30, intermissionSec: 5 },
      world: EMPTY_WORLD,
      onRoundEnd: (r) => results.push(r),
    });
    server = started.server;
    server.loop.stop();
    const c = await join(started.port, 'Hooked');
    await ticks(30 * SECOND);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      roundId: 1,
      winnerId: c.id,
      standings: [{ id: c.id, name: 'Hooked', bot: false, roundBest: 1 }],
    });
  });

  it('pauses when the last player leaves and starts a full round for the next', async () => {
    const port = await start({ roundLengthSec: 30, intermissionSec: 5 });
    const a = await join(port, 'First');
    await ticks(10 * SECOND);
    expect(server!.rounds.phase).toBe('playing');
    a.close();
    await a.waitFor(() => a.closeCode !== null);
    await sleep(50);
    expect(server!.humans).toBe(0);
    expect(server!.rounds.phase).toBe('idle');

    const t0 = server!.world.state.tick;
    await ticks(5 * SECOND);
    expect(server!.world.state.tick).toBe(t0);

    const b = await join(port, 'Second');
    await b.waitFor(() => b.of('round').length > 0);
    expect(b.of('round')[0]).toMatchObject({ phase: 'playing', roundId: 2 });
    expect(server!.rounds.ticksLeft).toBe(30 * SECOND);
    await ticks(1);
    expect(server!.world.state.tick).toBe(t0 + 1);
  });

  it('pauses when the last player leaves during an intermission', async () => {
    const port = await start({ roundLengthSec: 30, intermissionSec: 5 });
    const a = await join(port);
    await ticks(30 * SECOND);
    expect(server!.rounds.phase).toBe('intermission');
    a.close();
    await a.waitFor(() => a.closeCode !== null);
    await sleep(50);
    expect(server!.rounds.phase).toBe('idle');
    await ticks(10 * SECOND);
    expect(server!.rounds.phase).toBe('idle');
  });
});

describe('joining during an intermission', () => {
  it('shows the standings and spawns the train only when the next round starts', async () => {
    const port = await start({ roundLengthSec: 30, intermissionSec: 5 });
    await join(port, 'Early');
    await ticks(30 * SECOND);
    await ticks(2 * SECOND);
    expect(server!.rounds.phase).toBe('intermission');

    const late = await join(port, 'Late');
    await late.waitFor(() => late.of('roundEnd').length > 0 && late.of('round').length > 0);
    expect(late.of('round')[0]).toMatchObject({ phase: 'intermission', roundId: 1 });
    expect(late.of('roundEnd')[0]?.standings.map((r) => r[1])).toEqual(['Early']);
    expect(server!.world.getTrain(late.id)).toBeUndefined();
    expect(server!.humans).toBe(2);

    // While waiting it gets empty snapshots that keep the connection alive, and no train.
    await ticks(4);
    await late.waitFor(() => late.of('snap').length > 0);
    expect(late.of('snap').every((s) => s.me === null && s.tr.length === 0)).toBe(true);

    await ticks(3 * SECOND);
    await late.waitFor(() => late.of('round').some((r) => r.phase === 'playing'));
    const train = server!.world.getTrain(late.id);
    expect(train).toBeDefined();
    expect(train?.name).toBe('Late');
    await ticks(4);
    await late.waitFor(() => late.of('snap').some((s) => s.me !== null));
  });

  it('removes nothing if a waiting player leaves before the round starts', async () => {
    const port = await start({ roundLengthSec: 30, intermissionSec: 5 });
    await join(port, 'Early');
    await ticks(30 * SECOND);
    const late = await join(port, 'Late');
    const trainsBefore = server!.world.state.trains.length;
    late.close();
    await late.waitFor(() => late.closeCode !== null);
    await sleep(50);
    expect(server!.humans).toBe(1);
    expect(server!.world.state.trains).toHaveLength(trainsBefore);
  });
});

describe('population', () => {
  it('fills the world with bots as the round starts and reports them in /healthz', async () => {
    const port = await start({ bots: { fillTo: 6, min: 0, max: 4 } });
    await join(port);
    await ticks(10 * SECOND);
    const bots = server!.world.state.trains.filter((t) => t.controller === 'bot');
    expect(bots).toHaveLength(4);
    const health = (await (await fetch(`http://127.0.0.1:${port}/healthz`)).json()) as {
      bots: number;
      humans: number;
      phase: string;
    };
    expect(health).toMatchObject({ bots: 4, humans: 1, phase: 'playing' });
  });

  it('adds bots gradually, one a second', async () => {
    const port = await start({ bots: { fillTo: 12, min: 0, max: 10 } });
    await join(port);
    await ticks(3 * SECOND);
    const n = server!.world.state.trains.filter((t) => t.controller === 'bot').length;
    expect(n).toBeGreaterThanOrEqual(3);
    expect(n).toBeLessThanOrEqual(4);
  });
});

describe('player limit', () => {
  it('rejects a join beyond maxPlayers with the counts, and spawns nothing', async () => {
    const port = await start({ maxPlayers: 2 });
    await join(port, 'One');
    await join(port, 'Two');
    const extra = await TestClient.connect(port);
    clients.push(extra);
    extra.send({ t: 'hello', v: PROTOCOL_VERSION, name: 'Three' });
    await extra.waitFor(() => extra.closeCode !== null);
    expect(extra.of('reject')).toEqual([{ t: 'reject', reason: 'full', humans: 2, max: 2 }]);
    expect(extra.of('welcome')).toHaveLength(0);
    expect(server!.humans).toBe(2);
    expect(server!.world.state.trains).toHaveLength(2);
  });

  it('lets a waiting player in once a slot frees up', async () => {
    const port = await start({ maxPlayers: 1 });
    const first = await join(port, 'One');
    const blocked = await TestClient.connect(port);
    clients.push(blocked);
    blocked.send({ t: 'hello', v: PROTOCOL_VERSION, name: 'Two' });
    await blocked.waitFor(() => blocked.closeCode !== null);
    expect(blocked.of('reject')[0]?.reason).toBe('full');

    first.close();
    await first.waitFor(() => first.closeCode !== null);
    await sleep(50);
    const retry = await join(port, 'Two');
    expect(server!.world.getTrain(retry.id)).toBeDefined();
  });

  it('counts a player waiting out an intermission', async () => {
    const port = await start({ maxPlayers: 2, roundLengthSec: 30, intermissionSec: 5 });
    await join(port, 'One');
    await ticks(30 * SECOND);
    await join(port, 'Waiting');
    const extra = await TestClient.connect(port);
    clients.push(extra);
    extra.send({ t: 'hello', v: PROTOCOL_VERSION, name: 'Three' });
    await extra.waitFor(() => extra.closeCode !== null);
    expect(extra.of('reject')[0]).toMatchObject({ reason: 'full', humans: 2, max: 2 });
  });
});

describe('idle kick', () => {
  /** Identical input heartbeats: the client is connected but not playing. */
  function heartbeat(c: TestClient, seq: number): void {
    c.send({ t: 'in', s: seq, tr: 0, b: 0, br: 0, a: 0 });
  }

  it('warns 10 seconds ahead, then kicks with code 4000; heartbeats are not activity', async () => {
    const port = await start({ idleKickSec: 20 });
    const c = await join(port);
    // The first heartbeat differs from the spawn input; it is applied on the first tick.
    heartbeat(c, 0);
    await sleep(30);
    await ticks(1);
    for (let s = 1; s <= 9; s++) {
      await ticks(SECOND);
      heartbeat(c, s);
    }
    // 271 ticks of play so far: 29 to go before the warning at 10 seconds.
    expect(c.of('idleWarn')).toHaveLength(0);
    await ticks(28);
    expect(c.of('idleWarn')).toHaveLength(0);
    await ticks(1);
    await c.waitFor(() => c.of('idleWarn').length > 0);
    expect(c.of('idleWarn')).toEqual([{ t: 'idleWarn', secondsLeft: 10 }]);
    expect(c.of('kicked')).toHaveLength(0);

    await ticks(10 * SECOND - 1);
    expect(c.of('kicked')).toHaveLength(0);
    await ticks(1);
    await c.waitFor(() => c.closeCode !== null);
    expect(c.of('kicked')).toEqual([{ t: 'kicked', reason: 'idle' }]);
    expect(c.closeCode).toBe(CLOSE_KICKED);
    await sleep(50);
    expect(server!.humans).toBe(0);
  });

  it('clears the warning when the player turns', async () => {
    const port = await start({ idleKickSec: 20 });
    const c = await join(port);
    await ticks(10 * SECOND);
    await c.waitFor(() => c.of('idleWarn').length > 0);
    c.send({ t: 'in', s: 1, tr: 1, b: 0, br: 0, a: 0 });
    await sleep(30);
    await ticks(1);
    await c.waitFor(() => c.of('idleClear').length > 0);
    // The idle time started over: no kick for another 20 seconds.
    await ticks(19 * SECOND);
    expect(c.of('kicked')).toHaveLength(0);
    expect(c.closeCode).toBeNull();
  });

  it('does not count the intermission as idle time', async () => {
    const port = await start({ idleKickSec: 40, roundLengthSec: 30, intermissionSec: 5 });
    const c = await join(port);
    // 30 s of inactivity in play brings the warning, then the intermission passes.
    await ticks(30 * SECOND);
    await c.waitFor(() => c.of('idleWarn').length > 0);
    await ticks(5 * SECOND);
    await c.waitFor(() => c.of('round').some((r) => r.roundId === 2));
    // Only 10 more seconds of play are left before the 40-second limit, not 5.
    await ticks(10 * SECOND - 1);
    expect(c.of('kicked')).toHaveLength(0);
    await ticks(1);
    await c.waitFor(() => c.of('kicked').length > 0);
  });

  it('never kicks when idleKickSec is 0', async () => {
    const port = await start({ idleKickSec: 0, roundLengthSec: 30 });
    const c = await join(port);
    await ticks(29 * SECOND);
    expect(c.of('idleWarn')).toHaveLength(0);
    expect(c.of('kicked')).toHaveLength(0);
    expect(c.closeCode).toBeNull();
  });
});

describe('leaderboard', () => {
  it('ranks by round best and tells each player their own rank', async () => {
    const port = await start({ bots: { fillTo: 1, min: 1, max: 1 } });
    const a = await join(port, 'Alpha');
    const b = await join(port, 'Bravo');
    for (let i = 0; i < 5; i++) server!.world.addCarriage(b.id, 'armor');
    await ticks(2 * SECOND);
    await a.waitFor(() => a.of('ov').some((o) => o.lb[0]?.[1] === 'Bravo'));
    const ov = a.of('ov').at(-1)!;
    expect(ov.lb[0]).toEqual([b.id, 'Bravo', 6, 6, 0]);
    expect(ov.rk).toBe(ov.lb.findIndex((r) => r[0] === a.id) + 1);
    await b.waitFor(() => b.of('ov').some((o) => o.rk === 1));
    expect(ov.lb.some((r) => r[4] === 1)).toBe(true);
  });
});
