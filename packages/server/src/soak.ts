import { encodeMessage, MAX_TRAIN_PROJECTILES, PICKUP_KINDS, PROTOCOL_VERSION } from '@lw/shared';
import type { PickupKind } from '@lw/shared';
import { WebSocket } from 'ws';
import { parseConfig } from './config.ts';
import { GameServer } from './server.ts';

/**
 * Headless soak test: connects bot-driven clients to a server for a while and reports whether
 * the tick loop held its rate and how much each client was sent.
 *
 *   npm run soak -w @lw/server
 *
 * Environment: SOAK_SECONDS (60), SOAK_CLIENTS (16), SOAK_BOTS (10, in-process server only),
 * SOAK_COMPRESS=1 (enable permessage-deflate, in-process server only), SOAK_CARRIAGES (comma-
 * separated carriage kinds added to every train each time it spawns, in-process server only),
 * SOAK_URL (test an already-running server, such as http://localhost:8080, instead of starting
 * one).
 *
 * Passes when ticks are within 1% of 30 per second and the 95th-percentile per-client downstream
 * rate (wire bytes, one sample per client per second) is at most 100 KB/s. With an in-process
 * server it also checks that no train ever has more weapon projectiles in flight than the budget.
 */

const SECONDS = Number(process.env.SOAK_SECONDS ?? 60);
const CLIENTS = Number(process.env.SOAK_CLIENTS ?? 16);
const BOTS = Number(process.env.SOAK_BOTS ?? 10);
const COMPRESS = process.env.SOAK_COMPRESS === '1';
const EXTERNAL = process.env.SOAK_URL;
const CARRIAGES = (process.env.SOAK_CARRIAGES ?? '')
  .split(',')
  .map((k) => k.trim())
  .filter((k) => k.length > 0);
const unknownKinds = CARRIAGES.filter((k) => !(PICKUP_KINDS as readonly string[]).includes(k));
if (unknownKinds.length > 0) throw new Error(`unknown SOAK_CARRIAGES: ${unknownKinds.join(', ')}`);
const TICK_RATE = 30;
const TICK_TOLERANCE = 0.01;
const MAX_KB_PER_SECOND = 100;

interface Slot {
  ws: WebSocket | null;
  /** Wire bytes read from the current socket as of the last sample. */
  lastBytes: number;
  turn: number;
  boost: boolean;
  fire: boolean;
  /** Aim offset from the head, in world units. */
  ax: number;
  ay: number;
  seq: number;
}

function bytesRead(ws: WebSocket): number {
  const socket = (ws as unknown as { _socket?: { bytesRead: number } })._socket;
  return socket?.bytesRead ?? 0;
}

function wsUrl(base: string): string {
  const u = new URL(base);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  u.pathname = '/ws';
  return u.toString();
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] as number;
}

async function main(): Promise<boolean> {
  let server: GameServer | null = null;
  let httpBase: string;
  let overruns = 0;
  if (EXTERNAL) {
    httpBase = EXTERNAL;
  } else {
    const parsed = parseConfig({
      port: 0,
      maxPlayers: Math.min(100, Math.max(16, CLIENTS)),
      roundLengthSec: 7200,
      idleKickSec: 0,
      bots: { fillTo: BOTS, min: BOTS, max: BOTS },
    });
    if (!parsed.ok) throw new Error(parsed.errors.join('; '));
    server = new GameServer({
      host: '127.0.0.1',
      clientDir: '',
      config: parsed.config,
      compress: COMPRESS,
      log: (m) => {
        if (m.includes('overrun')) overruns += 1;
      },
    });
    httpBase = `http://127.0.0.1:${await server.listen()}`;
  }
  const url = wsUrl(httpBase);
  const readTick = async (): Promise<number> => {
    if (server) return server.world.state.tick;
    const res = await fetch(new URL('/healthz', httpBase));
    return ((await res.json()) as { tick: number }).tick;
  };

  console.log(
    `soak: ${CLIENTS} clients for ${SECONDS}s against ${EXTERNAL ?? `in-process server (${BOTS} bots, deflate ${COMPRESS ? 'on' : 'off'})`}` +
      (CARRIAGES.length > 0 && server ? `, every train given ${CARRIAGES.join(', ')}` : ''),
  );

  // Forced carriages: added to each train once per spawn, checked a few times a second.
  const outfitted = new Map<number, number>();
  const outfit = (): void => {
    if (!server || CARRIAGES.length === 0) return;
    for (const t of server.world.state.trains) {
      if (!t.alive || outfitted.get(t.id) === t.spawnSeq) continue;
      outfitted.set(t.id, t.spawnSeq);
      for (const kind of CARRIAGES) server.world.addCarriage(t.id, kind as PickupKind);
    }
  };
  const outfitter = setInterval(outfit, 250);

  const slots: Slot[] = Array.from({ length: CLIENTS }, () => ({
    ws: null,
    lastBytes: 0,
    turn: 0,
    boost: false,
    fire: false,
    ax: 200,
    ay: 0,
    seq: 0,
  }));

  const connect = (slot: Slot): void => {
    const ws = new WebSocket(url);
    slot.ws = ws;
    slot.lastBytes = 0;
    ws.on('open', () =>
      ws.send(
        encodeMessage({
          t: 'hello',
          v: PROTOCOL_VERSION,
          name: `Soak${Math.floor(Math.random() * 1000)}`,
        }),
      ),
    );
    ws.on('error', () => undefined);
  };
  for (const slot of slots) connect(slot);

  // Each client steers randomly, boosts and fires now and then, and sweeps its aim around.
  const driver = setInterval(() => {
    for (const slot of slots) {
      const ws = slot.ws;
      if (!ws || ws.readyState !== WebSocket.OPEN) continue;
      if (Math.random() < 0.15) slot.turn = [-1, 0, 1][Math.floor(Math.random() * 3)] as number;
      if (Math.random() < 0.05) slot.boost = !slot.boost;
      if (Math.random() < 0.1) slot.fire = !slot.fire;
      if (Math.random() < 0.3) {
        const angle = (Math.random() - 0.5) * 2 * Math.PI;
        const len = 50 + Math.random() * 450;
        slot.ax = Math.round(Math.cos(angle) * len * 10) / 10;
        slot.ay = Math.round(Math.sin(angle) * len * 10) / 10;
      }
      slot.seq += 1;
      ws.send(
        encodeMessage({
          t: 'in',
          s: slot.seq,
          tr: slot.turn,
          b: slot.boost ? 1 : 0,
          br: 0,
          f: slot.fire ? 1 : 0,
          ax: slot.ax,
          ay: slot.ay,
        }),
      );
    }
  }, 100);

  // Let every client join and the first snapshots flow before measuring.
  await new Promise((r) => setTimeout(r, 2000));
  const tick0 = await readTick();
  const start = performance.now();
  const samples: number[] = [];
  for (const slot of slots) slot.lastBytes = slot.ws ? bytesRead(slot.ws) : 0;

  let peakShots = 0;
  let peakMines = 0;
  const sampler = setInterval(() => {
    if (server) {
      const perTrain = new Map<number, number>();
      for (const p of server.world.state.projectiles) {
        if (p.ownerKind === 'train' && p.kind !== 'drone') {
          perTrain.set(p.ownerId, (perTrain.get(p.ownerId) ?? 0) + 1);
        }
      }
      for (const n of perTrain.values()) peakShots = Math.max(peakShots, n);
      peakMines = Math.max(peakMines, server.world.state.mines.length);
    }
    for (const slot of slots) {
      if (!slot.ws) continue;
      const now = bytesRead(slot.ws);
      samples.push((now - slot.lastBytes) / 1024);
      slot.lastBytes = now;
    }
  }, 1000);

  await new Promise((r) => setTimeout(r, SECONDS * 1000));
  const elapsed = (performance.now() - start) / 1000;
  const ticks = (await readTick()) - tick0;
  clearInterval(sampler);
  clearInterval(driver);
  clearInterval(outfitter);
  for (const slot of slots) slot.ws?.close();

  const expected = elapsed * TICK_RATE;
  const drift = (ticks - expected) / expected;
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = samples.reduce((a, b) => a + b, 0) / Math.max(1, samples.length);
  const p95 = percentile(sorted, 0.95);
  const max = sorted[sorted.length - 1] ?? 0;

  const tickOk = Math.abs(drift) <= TICK_TOLERANCE;
  const bandwidthOk = p95 <= MAX_KB_PER_SECOND;
  const shotsOk = peakShots <= MAX_TRAIN_PROJECTILES;
  console.log(
    `ticks: ${ticks} in ${elapsed.toFixed(1)}s (expected ${expected.toFixed(0)}, ${(drift * 100).toFixed(2)}%)` +
      `${server ? `, loop overruns: ${overruns}` : ''} ${tickOk ? 'OK' : 'FAIL'}`,
  );
  console.log(
    `downstream per client: mean ${mean.toFixed(1)} KB/s, p95 ${p95.toFixed(1)} KB/s, max ${max.toFixed(1)} KB/s ` +
      `(${samples.length} samples) ${bandwidthOk ? 'OK' : `FAIL (limit ${MAX_KB_PER_SECOND})`}`,
  );

  if (server) {
    console.log(
      `peak weapon projectiles per train: ${peakShots} ` +
        `${shotsOk ? 'OK' : `FAIL (budget ${MAX_TRAIN_PROJECTILES})`}`,
    );
    console.log(`peak mines in the world: ${peakMines}`);
  }

  await server?.close();
  return tickOk && bandwidthOk && shotsOk;
}

main().then(
  (ok) => process.exit(ok ? 0 : 1),
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  },
);
