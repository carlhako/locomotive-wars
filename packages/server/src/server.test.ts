import { afterEach, describe, expect, it } from 'vitest';
import {
  MAX_INPUT_RATE,
  MAX_MALFORMED,
  PROTOCOL_VERSION,
  SNAPSHOT_RATE,
  TRAIN_FLAG_DEAD,
  TRAIN_FLAG_PROTECTED,
} from '@lw/shared';
import type { SnapshotMsg } from '@lw/shared';
import type { GameServer } from './server.ts';
import { sleep, startServer, TestClient } from './testing.ts';

/** Config keys that leave the world free of bots. */
const NO_BOTS = { bots: { fillTo: 0 } };

let server: GameServer | null = null;
const clients: TestClient[] = [];

afterEach(async () => {
  for (const c of clients.splice(0)) c.close();
  await server?.close();
  server = null;
});

async function start(opts: Parameters<typeof startServer>[0] = {}): Promise<number> {
  const started = await startServer(opts);
  server = started.server;
  return started.port;
}

async function join(port: number, name?: string): Promise<TestClient> {
  const c = await TestClient.join(port, name);
  clients.push(c);
  return c;
}

function trainOf(id: number) {
  const t = server?.world.getTrain(id);
  if (!t) throw new Error(`no train ${id}`);
  return t;
}

describe('handshake', () => {
  it('replies to hello with welcome carrying the train id and world parameters', async () => {
    const port = await start();
    const c = await join(port, 'Casey');
    expect(c.welcome).toMatchObject({
      t: 'welcome',
      v: PROTOCOL_VERSION,
      tickRate: 30,
      snapRate: SNAPSHOT_RATE,
      mapSize: 6000,
      interpMs: 133,
      roundLengthSec: 600,
      intermissionSec: 20,
      idleKickSec: 60,
    });
    const train = trainOf(c.id);
    expect(train.name).toBe('Casey');
    expect(train.controller).toBe('human');
    await c.waitFor(() => c.of('snap').length > 0);
  });

  it('sanitises the name', async () => {
    const port = await start();
    const c = await join(port, '  Iron\u0007   Wolf the Magnificent Engine ');
    expect(trainOf(c.id).name).toBe('Iron Wolf the Ma');
  });

  it('gives an empty name a default', async () => {
    const port = await start();
    const c = await join(port, '');
    expect(trainOf(c.id).name).toMatch(/^Player-\d{4}$/);
  });

  it('rejects an older protocol version and closes the socket', async () => {
    const port = await start();
    const c = await TestClient.connect(port);
    clients.push(c);
    c.send({ t: 'hello', v: PROTOCOL_VERSION - 1, name: 'Old' });
    await c.waitFor(() => c.closeCode !== null);
    expect(c.of('reject')).toEqual([{ t: 'reject', reason: 'version' }]);
    expect(c.of('welcome')).toHaveLength(0);
    expect(server?.humans).toBe(0);
  });

  it('closes a connection that sends input before hello after repeated offences', async () => {
    const port = await start();
    const c = await TestClient.connect(port);
    clients.push(c);
    for (let i = 0; i < MAX_MALFORMED; i++) c.send({ t: 'ping', c: i });
    await c.waitFor(() => c.closeCode !== null);
    expect(c.of('pong')).toHaveLength(0);
  });

  it('refuses a second hello on the same connection', async () => {
    const port = await start({ config: NO_BOTS });
    const c = await join(port);
    const before = server?.world.state.trains.length;
    c.send({ t: 'hello', v: PROTOCOL_VERSION, name: 'Again' });
    await sleep(100);
    expect(server?.world.state.trains.length).toBe(before);
  });
});

describe('input', () => {
  it('turns the train at the turn rate while turn = 1 is held', async () => {
    const port = await start();
    const c = await join(port);
    const train = trainOf(c.id);
    const start0 = train.angle;
    for (let s = 1; s <= 10; s++) {
      c.send({ t: 'in', s, tr: 1, b: 0, br: 0, a: 0 });
      await sleep(50);
    }
    expect(train.input.turn).toBe(1);
    expect(train.angle).toBeGreaterThan(start0 + 0.5);
  });

  it('clamps turn = 50 to 1', async () => {
    const port = await start();
    const c = await join(port);
    c.send({ t: 'in', s: 1, tr: 50, b: 1, br: 1, a: 1.25 });
    await sleep(120);
    const input = trainOf(c.id).input;
    expect(input).toEqual({ turn: 1, boost: true, brake: true, aim: 1.25 });
  });

  it('ignores garbage and keeps serving other players', async () => {
    const port = await start();
    const a = await join(port, 'A');
    const b = await join(port, 'B');
    a.sendRaw('{not json');
    a.sendRaw('42');
    a.sendRaw('{"t":"in","s":1,"tr":"left","b":0,"br":0,"a":0}');
    a.sendRaw('{"t":"in","s":2,"tr":0,"b":0,"br":0,"a":1e999}');
    b.send({ t: 'in', s: 1, tr: -1, b: 0, br: 0, a: 0 });
    await sleep(150);
    expect(a.closeCode).toBeNull();
    expect(trainOf(a.id).input.turn).toBe(0);
    expect(trainOf(b.id).input.turn).toBe(-1);
    // Still connected and receiving snapshots.
    const n = a.of('snap').length;
    await a.waitFor(() => a.of('snap').length > n);
  });

  it('closes a connection after 20 malformed messages', async () => {
    const port = await start();
    const c = await join(port);
    for (let i = 0; i < MAX_MALFORMED; i++) c.sendRaw('garbage');
    await c.waitFor(() => c.closeCode !== null);
    expect(c.closeCode).toBe(1008);
  });

  it('never lets a client set its own position', async () => {
    const port = await start();
    const c = await join(port);
    const train = trainOf(c.id);
    const { x, y } = train;
    c.sendRaw('{"t":"in","s":1,"tr":0,"b":0,"br":0,"a":0,"x":10,"y":10}');
    c.sendRaw('{"t":"pos","x":10,"y":10}');
    await sleep(100);
    // Moving at most 180 u/s (boost is off), the train cannot have jumped to (10, 10).
    expect(Math.hypot(train.x - x, train.y - y)).toBeLessThan(60);
  });

  it('applies only the latest input per tick and drops a flood beyond 60 per second', async () => {
    const port = await start();
    const c = await join(port);
    const train = trainOf(c.id);
    // 200 inputs in one burst: the first 60 count, the rest are dropped; none are malformed.
    for (let s = 1; s <= 200; s++) {
      c.send({ t: 'in', s, tr: s <= MAX_INPUT_RATE ? 1 : -1, b: 0, br: 0, a: 0 });
    }
    await sleep(200);
    expect(train.input.turn).toBe(1);
    expect(c.closeCode).toBeNull();
    // The ack reflects the last accepted input.
    await c.waitFor(() => c.of('snap').some((s) => s.ack === MAX_INPUT_RATE));
  });

  it('answers ping with pong echoing the client time', async () => {
    const port = await start();
    const c = await join(port);
    c.send({ t: 'ping', c: 12345.5 });
    await c.waitFor(() => c.of('pong').length > 0);
    const pong = c.of('pong')[0];
    expect(pong?.c).toBe(12345.5);
    expect(pong?.st).toBeGreaterThanOrEqual(0);
  });
});

describe('leaving', () => {
  it('removes the train within a tick, drops pickups, and credits no kill', async () => {
    const port = await start();
    const a = await join(port, 'Stayer');
    const b = await join(port, 'Leaver');
    const leaverId = b.id;
    const world = server!.world;
    world.addCarriage(leaverId, 'armor');
    world.addCarriage(leaverId, 'speed');
    // Park the stayer near the leaver so the drops and the disappearance are in view.
    const stayer = trainOf(a.id);
    const leaver = trainOf(leaverId);
    stayer.x = leaver.x;
    stayer.y = leaver.y + 400;
    await a.waitFor(() => a.of('meta').some((m) => m.trains.some((t) => t.id === leaverId)));
    const dropsBefore = world.state.drops.length;

    b.close();
    await a.waitFor(() => a.of('meta').some((m) => m.gone.includes(leaverId)));

    expect(world.getTrain(leaverId)).toBeUndefined();
    expect(world.state.drops.length).toBeGreaterThan(dropsBefore);
    await a.waitFor(() => a.of('snap').some((s) => s.dr.length > 0));
    const events = a.of('snap').flatMap((s) => s.ev);
    expect(events.some((e) => e.type === 'trainDestroyed')).toBe(false);
    expect(events.some((e) => e.type === 'trainLeft' && e.trainId === leaverId)).toBe(true);
    expect(server?.humans).toBe(1);
  });
});

describe('snapshots', () => {
  it('delivers about 15 snapshots a second', async () => {
    const port = await start();
    const c = await join(port);
    await c.waitFor(() => c.of('snap').length > 0);
    const first = performance.now();
    const count0 = c.of('snap').length;
    await sleep(10_000);
    const seconds = (performance.now() - first) / 1000;
    const received = c.of('snap').length - count0;
    expect(received).toBeGreaterThan(SNAPSHOT_RATE * seconds * 0.95);
    expect(received).toBeLessThan(SNAPSHOT_RATE * seconds * 1.05);
  }, 20_000);

  it('includes the full own train, rounded numbers, and the ack', async () => {
    const port = await start();
    const c = await join(port);
    c.send({ t: 'in', s: 7, tr: 0, b: 0, br: 0, a: 0 });
    await c.waitFor(() => c.of('snap').some((s) => s.ack === 7));
    const snap = c.of('snap').find((s) => s.ack === 7) as SnapshotMsg;
    const train = trainOf(c.id);
    expect(snap.me).not.toBeNull();
    expect(snap.me?.cs).toHaveLength(train.carriages.length * 2);
    expect(Number.isInteger(snap.me?.x)).toBe(true);
    expect(snap.me?.mh).toBeGreaterThan(0);
    // Static data comes in meta, not in snapshots.
    expect(c.of('meta')[0]?.trains.find((t) => t.id === c.id)?.kinds).toEqual(['locomotive', 'mg']);
    // A fresh train is protected and on its first spawn.
    expect((snap.me?.fl ?? 0) & TRAIN_FLAG_PROTECTED).toBe(TRAIN_FLAG_PROTECTED);
    expect(snap.me?.sq).toBe(0);
    expect(snap.tr.every((row) => row[0] !== c.id)).toBe(true);
  });

  it('keeps distant trains out of snapshots but lists every train in the overview', async () => {
    const port = await start({ config: NO_BOTS });
    const a = await join(port, 'A');
    const b = await join(port, 'B');
    const ta = trainOf(a.id);
    const tb = trainOf(b.id);
    ta.x = 500;
    ta.y = 500;
    tb.x = 3500;
    tb.y = 3500;
    // Wait for a snapshot taken after the move, and an overview too.
    await a.waitFor(() => a.of('ov').some((o) => o.h.length === 2) && a.of('snap').length > 3);
    const seen = new Set(
      a
        .of('snap')
        .slice(-3)
        .flatMap((s) => s.tr.map((r) => r[0])),
    );
    expect(seen.has(b.id)).toBe(false);
    const ov = a.of('ov').at(-1);
    expect(ov?.h.map((r) => r[0]).sort()).toEqual([a.id, b.id].sort());
    expect(ov?.h.find((r) => r[0] === b.id)?.[3]).toBe(tb.color);
    expect(ov?.h.find((r) => r[0] === b.id)?.[4]).toBe('B');
  });

  it('sends a distant train destruction to everyone (global kill feed)', async () => {
    const port = await start({ config: NO_BOTS });
    const a = await join(port, 'A');
    const b = await join(port, 'B');
    const ta = trainOf(a.id);
    const tb = trainOf(b.id);
    ta.x = 500;
    ta.y = 500;
    tb.x = 3500;
    tb.y = 3500;
    await sleep(150);
    // Destroy B, far from A, by pushing a lethal enemy projectile onto it.
    tb.protectedFor = 0;
    tb.hull = 1;
    server!.world.state.projectiles.push({
      id: 999_999,
      kind: 'bullet',
      x: tb.x - 10,
      y: tb.y,
      vx: 600,
      vy: 0,
      damage: 50,
      life: 1,
      splash: 0,
      ownerKind: 'train',
      ownerId: a.id,
    });
    await a.waitFor(() => a.of('snap').some((s) => s.ev.some((e) => e.type === 'trainDestroyed')));
    const kill = a
      .of('snap')
      .flatMap((s) => s.ev)
      .find((e) => e.type === 'trainDestroyed');
    expect(kill).toMatchObject({ victimId: b.id, cause: 'weapon', killerTrainId: a.id });
  });

  it('respawns a destroyed player at a new position as a protected starter train', async () => {
    const port = await start({ config: NO_BOTS });
    const a = await join(port, 'A');
    const b = await join(port, 'B');
    const ta = trainOf(a.id);
    const tb = trainOf(b.id);
    ta.x = 500;
    ta.y = 500;
    tb.x = 3500;
    tb.y = 3500;
    for (const kind of ['armor', 'speed', 'shield'] as const) server!.world.addCarriage(b.id, kind);
    ta.protectedFor = 0;
    tb.protectedFor = 0;
    await b.waitFor(() => b.of('snap').some((s) => s.me !== null && s.me.cs.length === 10));
    const before = { x: tb.x, y: tb.y };
    tb.hull = 1;
    server!.world.state.projectiles.push({
      id: 999_998,
      kind: 'bullet',
      x: tb.x - 10,
      y: tb.y,
      vx: 600,
      vy: 0,
      damage: 50,
      life: 1,
      splash: 0,
      ownerKind: 'train',
      ownerId: a.id,
    });
    await b.waitFor(() => b.of('snap').some((s) => (s.me?.sq ?? 0) >= 1));
    const snap = b.of('snap').find((s) => (s.me?.sq ?? 0) >= 1) as SnapshotMsg;
    const me = snap.me!;
    expect(me.sq).toBe(1);
    expect(me.cs).toHaveLength(4);
    expect(me.fl & TRAIN_FLAG_DEAD).toBe(0);
    expect(me.fl & TRAIN_FLAG_PROTECTED).toBe(TRAIN_FLAG_PROTECTED);
    expect(me.hp).toBe(me.mh);
    expect(Math.hypot(me.x - before.x, me.y - before.y)).toBeGreaterThan(100);
    // The kill was announced to the victim, who is still the same session and train id.
    const kill = b
      .of('snap')
      .flatMap((x) => x.ev)
      .find((e) => e.type === 'trainDestroyed');
    expect(kill).toMatchObject({ victimId: b.id, killerTrainId: a.id, cause: 'weapon' });
    expect(server!.world.getTrain(b.id)?.carriages).toHaveLength(2);
  });

  it('announces a newly picked-up carriage kind in meta', async () => {
    const port = await start({ config: NO_BOTS });
    const c = await join(port);
    await c.waitFor(() => c.of('meta').length > 0);
    server!.world.addCarriage(c.id, 'missile');
    await c.waitFor(() =>
      c.of('meta').some((m) => m.trains.some((t) => t.id === c.id && t.kinds.includes('missile'))),
    );
  });
});

describe('tick rate', () => {
  it('steps the world at 30 Hz in real time', async () => {
    const port = await start();
    await join(port);
    const t0 = server!.world.state.tick;
    await sleep(2000);
    const ticks = server!.world.state.tick - t0;
    expect(ticks).toBeGreaterThan(55);
    expect(ticks).toBeLessThan(65);
  });
});
