import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  clamp,
  decodeClientMessage,
  encodeMessage,
  INTERP_MS,
  MAX_CLIENT_MESSAGE_BYTES,
  OVERVIEW_RATE,
  PROTOCOL_VERSION,
  sanitizeName,
  SNAPSHOT_RATE,
  VIEW_RADIUS,
  World,
} from '@lw/shared';
import type { ClientMessage, ServerMessage, SimEvent, WorldOptions } from '@lw/shared';
import { WebSocketServer } from 'ws';
import type { RawData, WebSocket } from 'ws';
import { BOT_COUNT, maintainBots } from './bots.ts';
import { createHttpHandler } from './http.ts';
import { selectEvents, selectVisible } from './interest.ts';
import { FixedStepLoop } from './loop.ts';
import { Session } from './sessions.ts';
import { buildOverview, buildSnapshot } from './snapshot.ts';

/** Starting carriages for a joining player, as in offline play (reference line 1124). */
const STARTER_CARRIAGES = ['mg', 'shield'] as const;
/** A client that has not said hello within this long is dropped. */
const HELLO_TIMEOUT_MS = 10_000;
/** Snapshots are skipped for a client whose socket already holds this much unsent data. */
const MAX_BUFFERED_BYTES = 512 * 1024;
/** WebSocket close code for a policy violation. */
const CLOSE_POLICY = 1008;

export interface GameServerOptions {
  /** TCP port; 0 picks a free one. */
  port: number;
  host?: string;
  /** Directory holding the built client. */
  clientDir: string;
  /** Bot trains kept in the world. */
  botCount?: number;
  world?: WorldOptions;
  /** Compress WebSocket messages over 1 KB (`permessage-deflate`). Default off. */
  compress?: boolean;
  log?: (message: string) => void;
}

/**
 * The game server: one authoritative world stepped at a fixed rate, an HTTP server for the client
 * and health check, and a WebSocket endpoint at `/ws` carrying the real-time protocol.
 */
export class GameServer {
  readonly world: World;
  readonly loop: FixedStepLoop;
  private readonly http: Server;
  private readonly wss: WebSocketServer;
  private readonly sessions = new Set<Session>();
  private readonly botCount: number;
  private readonly log: (message: string) => void;
  private readonly snapEvery: number;
  private readonly overviewEvery: number;
  private readonly stepMs: number;
  /** Events since the last snapshot was sent. */
  private events: SimEvent[] = [];

  constructor(private readonly opts: GameServerOptions) {
    this.log = opts.log ?? ((m) => console.log(m));
    this.botCount = opts.botCount ?? BOT_COUNT;
    this.world = new World(opts.world);
    const rate = this.world.options.tickRate;
    this.stepMs = 1000 / rate;
    this.snapEvery = Math.max(1, Math.round(rate / SNAPSHOT_RATE));
    this.overviewEvery = Math.max(1, Math.round(rate / OVERVIEW_RATE));

    this.loop = new FixedStepLoop({
      tickRate: rate,
      step: () => this.tick(),
      onOverrun: (n) => this.log(`tick loop overrun: skipped ${n} ticks`),
    });

    this.http = createServer(
      createHttpHandler({
        clientDir: opts.clientDir,
        health: () => ({
          humans: this.humans,
          bots: this.world.state.trains.filter((t) => t.controller === 'bot').length,
          tick: this.world.state.tick,
        }),
      }),
    );
    this.wss = new WebSocketServer({
      noServer: true,
      maxPayload: MAX_CLIENT_MESSAGE_BYTES,
      perMessageDeflate: opts.compress ? { threshold: 1024 } : false,
    });
    this.http.on('upgrade', (req, socket, head) => {
      const path = (req.url ?? '').split('?')[0];
      if (path !== '/ws') {
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(req, socket, head, (ws) => this.onConnection(ws));
    });
  }

  /** Connected players that have joined. */
  get humans(): number {
    let n = 0;
    for (const s of this.sessions) if (s.trainId !== null) n += 1;
    return n;
  }

  /** Starts listening and stepping the world. Resolves with the port in use. */
  listen(): Promise<number> {
    maintainBots(this.world, this.botCount);
    return new Promise((resolve, reject) => {
      this.http.once('error', reject);
      this.http.listen(this.opts.port, this.opts.host, () => {
        this.http.off('error', reject);
        this.loop.start();
        resolve((this.http.address() as AddressInfo).port);
      });
    });
  }

  /** Stops the loop, disconnects every client, and closes the listener. */
  close(): Promise<void> {
    this.loop.stop();
    for (const s of this.sessions) s.ws.terminate();
    return new Promise((resolve) => {
      this.wss.close(() => {
        this.http.close(() => resolve());
        this.http.closeAllConnections();
      });
    });
  }

  /** Server time in milliseconds: the tick's time plus the real time since it was due. */
  serverTimeMs(): number {
    return this.world.state.tick * this.stepMs + this.loop.sinceLastStepMs();
  }

  // ===== Connections =====

  private onConnection(ws: WebSocket): void {
    const session = new Session(ws);
    this.sessions.add(session);
    const helloTimer = setTimeout(() => {
      if (session.trainId === null) ws.close(CLOSE_POLICY, 'no hello');
    }, HELLO_TIMEOUT_MS);

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        this.malformed(session);
        return;
      }
      this.onMessage(session, data);
    });
    ws.on('error', () => ws.terminate());
    ws.on('close', () => {
      clearTimeout(helloTimer);
      this.sessions.delete(session);
      this.leave(session);
    });
  }

  private onMessage(session: Session, data: RawData): void {
    const msg = decodeClientMessage(rawToString(data));
    if (!msg) {
      this.malformed(session);
      return;
    }
    this.handle(session, msg);
  }

  private malformed(session: Session): void {
    if (session.recordMalformed()) session.ws.close(CLOSE_POLICY, 'too many malformed messages');
  }

  private handle(session: Session, msg: ClientMessage): void {
    switch (msg.t) {
      case 'hello': {
        if (session.trainId !== null) {
          this.malformed(session);
          return;
        }
        if (msg.v !== PROTOCOL_VERSION) {
          this.send(session.ws, { t: 'reject', reason: 'version' });
          session.ws.close();
          return;
        }
        this.join(session, msg.name);
        return;
      }
      case 'in': {
        if (session.trainId === null) {
          this.malformed(session);
          return;
        }
        if (!session.allowInput(performance.now())) return;
        session.pending = {
          seq: msg.s,
          input: {
            turn: clamp(msg.tr, -1, 1),
            boost: msg.b === 1,
            brake: msg.br === 1,
            aim: msg.a,
          },
        };
        return;
      }
      case 'ping': {
        if (session.trainId === null) {
          this.malformed(session);
          return;
        }
        this.send(session.ws, { t: 'pong', c: msg.c, st: this.serverTimeMs() });
        return;
      }
    }
  }

  private join(session: Session, rawName: string): void {
    const name = sanitizeName(rawName);
    const train = this.world.addTrain({
      name,
      controller: 'human',
      carriages: STARTER_CARRIAGES,
    });
    session.trainId = train.id;
    session.name = name;
    this.send(session.ws, {
      t: 'welcome',
      v: PROTOCOL_VERSION,
      id: train.id,
      tickRate: this.world.options.tickRate,
      snapRate: SNAPSHOT_RATE,
      mapSize: this.world.rules.size,
      interpMs: INTERP_MS,
    });
    this.log(`${name} joined as train ${train.id} (${this.humans} human(s))`);
  }

  private leave(session: Session): void {
    if (session.trainId === null) return;
    this.world.removeTrain(session.trainId, { drop: true });
    this.log(`${session.name} left (${this.humans} human(s))`);
    session.trainId = null;
  }

  // ===== The tick =====

  private tick(): void {
    const world = this.world;
    maintainBots(world, this.botCount);
    for (const s of this.sessions) {
      if (s.trainId === null || !s.pending) continue;
      world.setInput(s.trainId, s.pending.input);
      s.ackSeq = s.pending.seq;
      s.pending = null;
    }
    for (const e of world.step()) this.events.push(e);

    const tick = world.state.tick;
    if (tick % this.snapEvery === 0) {
      this.sendSnapshots(tick);
      this.events = [];
    }
    if (tick % this.overviewEvery === 0) this.sendOverviews();
  }

  private sendSnapshots(tick: number): void {
    const world = this.world;
    const size = world.rules.size;
    const serverTimeMs = tick * this.stepMs;
    for (const s of this.sessions) {
      if (s.trainId === null || !canSend(s.ws)) continue;
      const own = world.getTrain(s.trainId);
      if (!own) continue;
      const visible = selectVisible(world, own.x, own.y, VIEW_RADIUS, own.id);
      const meta = s.meta.diff([own, ...visible.trains]);
      if (meta) this.send(s.ws, { t: 'meta', trains: meta.trains, gone: meta.gone });
      this.send(
        s.ws,
        buildSnapshot({
          tick,
          serverTimeMs,
          ack: s.ackSeq,
          own,
          visible,
          events: selectEvents(this.events, own.x, own.y, VIEW_RADIUS, own.id, size),
        }),
      );
    }
  }

  private sendOverviews(): void {
    const text = encodeMessage(buildOverview(this.world.state.trains));
    for (const s of this.sessions) {
      if (s.trainId !== null && canSend(s.ws)) s.ws.send(text);
    }
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === ws.OPEN) ws.send(encodeMessage(msg));
  }
}

function canSend(ws: WebSocket): boolean {
  return ws.readyState === ws.OPEN && ws.bufferedAmount < MAX_BUFFERED_BYTES;
}

function rawToString(data: RawData): string {
  if (typeof data === 'string') return data;
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  return data.toString('utf8');
}
