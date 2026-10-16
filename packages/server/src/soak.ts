import { TRAIN_FLAG_DEAD, decodeServerMessage, encodeMessage, PROTOCOL_VERSION } from '@lw/shared';
import { WebSocket } from 'ws';
import { GameServer } from './server.ts';

/**
 * Headless soak test: connects bot-driven clients to a server for a while and reports whether
 * the tick loop held its rate and how much each client was sent.
 *
 *   npm run soak -w @lw/server
 *
 * Environment: SOAK_SECONDS (60), SOAK_CLIENTS (16), SOAK_BOTS (10, in-process server only),
 * SOAK_COMPRESS=1 (enable permessage-deflate, in-process server only), SOAK_URL (test an
 * already-running server, such as http://localhost:8080, instead of starting one).
 *
 * Passes when ticks are within 1% of 30 per second and the 95th-percentile per-client downstream
 * rate (wire bytes, one sample per client per second) is at most 100 KB/s.
 */

const SECONDS = Number(process.env.SOAK_SECONDS ?? 60);
const CLIENTS = Number(process.env.SOAK_CLIENTS ?? 16);
const BOTS = Number(process.env.SOAK_BOTS ?? 10);
const COMPRESS = process.env.SOAK_COMPRESS === '1';
const EXTERNAL = process.env.SOAK_URL;
const TICK_RATE = 30;
const TICK_TOLERANCE = 0.01;
const MAX_KB_PER_SECOND = 100;

interface Slot {
  ws: WebSocket | null;
  /** Wire bytes read from the current socket as of the last sample. */
  lastBytes: number;
  turn: number;
  boost: boolean;
  aim: number;
  seq: number;
  /** Set once the train is destroyed, so the slot rejoins with a fresh one. */
  dead: boolean;
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
    server = new GameServer({
      port: 0,
      host: '127.0.0.1',
      clientDir: '',
      botCount: BOTS,
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
    `soak: ${CLIENTS} clients for ${SECONDS}s against ${EXTERNAL ?? `in-process server (${BOTS} bots, deflate ${COMPRESS ? 'on' : 'off'})`}`,
  );

  const slots: Slot[] = Array.from({ length: CLIENTS }, () => ({
    ws: null,
    lastBytes: 0,
    turn: 0,
    boost: false,
    aim: 0,
    seq: 0,
    dead: false,
  }));

  const connect = (slot: Slot): void => {
    const ws = new WebSocket(url);
    slot.ws = ws;
    slot.lastBytes = 0;
    slot.dead = false;
    ws.on('open', () =>
      ws.send(
        encodeMessage({
          t: 'hello',
          v: PROTOCOL_VERSION,
          name: `Soak${Math.floor(Math.random() * 1000)}`,
        }),
      ),
    );
    ws.on('message', (data) => {
      const msg = decodeServerMessage(String(data));
      if (msg?.t === 'snap' && msg.me && (msg.me.fl & TRAIN_FLAG_DEAD) !== 0) slot.dead = true;
    });
    ws.on('error', () => undefined);
  };
  for (const slot of slots) connect(slot);

  // Each client steers randomly, boosts now and then, and sweeps its aim around.
  const driver = setInterval(() => {
    for (const slot of slots) {
      const ws = slot.ws;
      if (!ws || ws.readyState !== WebSocket.OPEN) continue;
      if (Math.random() < 0.15) slot.turn = [-1, 0, 1][Math.floor(Math.random() * 3)] as number;
      if (Math.random() < 0.05) slot.boost = !slot.boost;
      slot.aim = Math.random() < 0.3 ? (Math.random() - 0.5) * 2 * Math.PI : slot.aim;
      slot.seq += 1;
      ws.send(
        encodeMessage({
          t: 'in',
          s: slot.seq,
          tr: slot.turn,
          b: slot.boost ? 1 : 0,
          br: 0,
          a: slot.aim,
        }),
      );
    }
  }, 100);

  // A destroyed train stays dead until change 05 adds respawn, so rejoin to keep the load up.
  const rejoin = setInterval(() => {
    for (const slot of slots) {
      if (!slot.dead) continue;
      slot.ws?.close();
      connect(slot);
    }
  }, 500);

  // Let every client join and the first snapshots flow before measuring.
  await new Promise((r) => setTimeout(r, 2000));
  const tick0 = await readTick();
  const start = performance.now();
  const samples: number[] = [];
  for (const slot of slots) slot.lastBytes = slot.ws ? bytesRead(slot.ws) : 0;

  const sampler = setInterval(() => {
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
  clearInterval(rejoin);
  for (const slot of slots) slot.ws?.close();

  const expected = elapsed * TICK_RATE;
  const drift = (ticks - expected) / expected;
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = samples.reduce((a, b) => a + b, 0) / Math.max(1, samples.length);
  const p95 = percentile(sorted, 0.95);
  const max = sorted[sorted.length - 1] ?? 0;

  const tickOk = Math.abs(drift) <= TICK_TOLERANCE;
  const bandwidthOk = p95 <= MAX_KB_PER_SECOND;
  console.log(
    `ticks: ${ticks} in ${elapsed.toFixed(1)}s (expected ${expected.toFixed(0)}, ${(drift * 100).toFixed(2)}%)` +
      `${server ? `, loop overruns: ${overruns}` : ''} ${tickOk ? 'OK' : 'FAIL'}`,
  );
  console.log(
    `downstream per client: mean ${mean.toFixed(1)} KB/s, p95 ${p95.toFixed(1)} KB/s, max ${max.toFixed(1)} KB/s ` +
      `(${samples.length} samples) ${bandwidthOk ? 'OK' : `FAIL (limit ${MAX_KB_PER_SECOND})`}`,
  );

  await server?.close();
  return tickOk && bandwidthOk;
}

main().then(
  (ok) => process.exit(ok ? 0 : 1),
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  },
);
