import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  clamp,
  CLOSE_KICKED,
  decodeClientMessage,
  encodeMessage,
  MAX_CLIENT_MESSAGE_BYTES,
  OVERVIEW_RATE,
  PROTOCOL_VERSION,
  sanitizeName,
  World,
} from '@lw/shared';
import type { ClientMessage, RoundMsg, ServerMessage, SimEvent, WorldOptions } from '@lw/shared';
import { WebSocketServer } from 'ws';
import type { RawData, WebSocket } from 'ws';
import { IdleTracker, isFull } from './admission.ts';
import { defaultConfig, IDLE_WARN_SEC } from './config.ts';
import type { ServerConfig } from './config.ts';
import { HighScoreService } from './highscores/service.ts';
import type { RoundCandidate } from './highscores/service.ts';
import { createMemoryStore } from './highscores/store.ts';
import type { HighScoreStore } from './highscores/store.ts';
import { createHttpHandler } from './http.ts';
import { selectEvents, selectVisible } from './interest.ts';
import type { Visible } from './interest.ts';
import { FixedStepLoop } from './loop.ts';
import { BotPopulation } from './population.ts';
import { RoundClock } from './rounds.ts';
import { Session } from './sessions.ts';
import { buildOverview, buildSnapshot } from './snapshot.ts';
import { buildLeaderboard, buildResult, rankOf, rankTrains, standingRows } from './standings.ts';
import type { RoundResult } from './standings.ts';

/** A client that has not said hello within this long is dropped. */
const HELLO_TIMEOUT_MS = 10_000;
/** Snapshots are skipped for a client whose socket already holds this much unsent data. */
const MAX_BUFFERED_BYTES = 512 * 1024;
/** WebSocket close code for a policy violation. */
const CLOSE_POLICY = 1008;

export interface GameServerOptions {
  host?: string;
  /** Directory holding the built client. */
  clientDir: string;
  /** Operator settings. Default: every setting at its default. */
  config?: ServerConfig;
  /** World options beyond the config's (seed, spawn counts); the config's tick rate and carriage limit win. */
  world?: WorldOptions;
  /** Compress WebSocket messages over 1 KB (`permessage-deflate`). Default off. */
  compress?: boolean;
  log?: (message: string) => void;
  /** Where the high score table is kept. Default: in memory only, lost when the server stops. */
  highscoreStore?: HighScoreStore;
  /** Called once when a round ends, with its final standings. */
  onRoundEnd?: (result: RoundResult) => void;
}

/** Seed for a round's world, so each round differs but a given server seed repeats. */
function roundSeed(base: number, roundId: number): number {
  return (base ^ Math.imul(roundId, 0x9e3779b1)) >>> 0;
}

/**
 * The game server: one authoritative world stepped at a fixed rate, an HTTP server for the client
 * and health check, and a WebSocket endpoint at `/ws` carrying the real-time protocol. Play runs
 * in timed rounds (see `RoundClock`); with no humans connected the world is paused.
 */
export class GameServer {
  readonly world: World;
  readonly loop: FixedStepLoop;
  readonly config: ServerConfig;
  readonly rounds: RoundClock;
  private readonly http: Server;
  private readonly wss: WebSocketServer;
  private readonly sessions = new Set<Session>();
  private readonly population: BotPopulation;
  private readonly highscores: HighScoreService<Session>;
  private readonly log: (message: string) => void;
  private readonly snapEvery: number;
  private readonly overviewEvery: number;
  private readonly stepMs: number;
  private readonly idleWarnTicks: number;
  private readonly idleKickTicks: number;
  /** Loop ticks since start. Unlike the world's tick, it keeps counting while the world is paused. */
  private serverTick = 0;
  /** The last `roundEnd`, as sent, for players who join during the intermission. */
  private lastRoundEnd: string | null = null;
  /** Events since the last snapshot was sent. */
  private events: SimEvent[] = [];

  constructor(private readonly opts: GameServerOptions) {
    const config = opts.config ?? defaultConfig();
    this.config = config;
    this.log = opts.log ?? ((m) => console.log(m));
    this.world = new World({
      ...opts.world,
      tickRate: config.tickRate,
      maxCarriages: config.maxCarriages,
    });
    const rate = config.tickRate;
    this.stepMs = 1000 / rate;
    this.snapEvery = Math.max(1, Math.round(rate / config.snapshotRate));
    this.overviewEvery = Math.max(1, Math.round(rate / OVERVIEW_RATE));
    this.idleWarnTicks = Math.max(0, config.idleKickSec - IDLE_WARN_SEC) * rate;
    this.idleKickTicks = config.idleKickSec * rate;
    this.rounds = new RoundClock(config.roundLengthSec * rate, config.intermissionSec * rate);
    this.population = new BotPopulation(this.world, config.bots, rate);
    this.highscores = new HighScoreService<Session>({
      store: opts.highscoreStore ?? createMemoryStore(),
      size: config.highscores.size,
      log: this.log,
      host: {
        send: (session, msg) => this.send(session.ws, msg),
        broadcast: (msg) => this.broadcast(msg),
      },
    });

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
          phase: this.rounds.phase,
          round: this.rounds.roundId,
        }),
        highscores: () => this.highscores.apiRows(),
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

  /** Connected players that have joined, including any waiting out an intermission. */
  get humans(): number {
    let n = 0;
    for (const s of this.sessions) if (s.joined) n += 1;
    return n;
  }

  /** Loads the high scores, then starts listening and stepping the world. Resolves with the port in use. */
  async listen(): Promise<number> {
    await this.highscores.load();
    return new Promise((resolve, reject) => {
      this.http.once('error', reject);
      this.http.listen(this.config.port, this.opts.host, () => {
        this.http.off('error', reject);
        this.loop.start();
        resolve((this.http.address() as AddressInfo).port);
      });
    });
  }

  /** Stops the loop, disconnects every client, waits for any high score save, and closes the listener. */
  async close(): Promise<void> {
    this.loop.stop();
    for (const s of this.sessions) s.ws.terminate();
    await this.highscores.settled();
    return new Promise((resolve) => {
      this.wss.close(() => {
        this.http.close(() => resolve());
        this.http.closeAllConnections();
      });
    });
  }

  /** Server time in milliseconds: the tick's time plus the real time since it was due. */
  serverTimeMs(): number {
    return this.serverTick * this.stepMs + this.loop.sinceLastStepMs();
  }

  // ===== Connections =====

  private onConnection(ws: WebSocket): void {
    const session = new Session(ws);
    this.sessions.add(session);
    const helloTimer = setTimeout(() => {
      if (!session.joined) ws.close(CLOSE_POLICY, 'no hello');
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
        if (session.joined) {
          this.malformed(session);
          return;
        }
        if (msg.v !== PROTOCOL_VERSION) {
          this.send(session.ws, { t: 'reject', reason: 'version' });
          session.ws.close();
          return;
        }
        if (isFull(this.humans, this.config.maxPlayers)) {
          this.send(session.ws, {
            t: 'reject',
            reason: 'full',
            humans: this.humans,
            max: this.config.maxPlayers,
          });
          session.ws.close();
          return;
        }
        this.join(session, msg.name);
        return;
      }
      case 'in': {
        if (!session.joined) {
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
        if (!session.joined) {
          this.malformed(session);
          return;
        }
        this.send(session.ws, { t: 'pong', c: msg.c, st: this.serverTimeMs() });
        return;
      }
      case 'hsName': {
        if (!session.joined) {
          this.malformed(session);
          return;
        }
        void this.highscores.rename(session, msg.token, msg.name).then((reply) => {
          this.send(session.ws, reply);
        });
        return;
      }
    }
  }

  private join(session: Session, rawName: string): void {
    const name = sanitizeName(rawName);
    session.joined = true;
    session.name = name;
    // The train id is promised now; the train itself exists once a round is playing.
    session.reservedId = this.world.newId();
    const config = this.config;
    this.send(session.ws, {
      t: 'welcome',
      v: PROTOCOL_VERSION,
      id: session.reservedId,
      tickRate: config.tickRate,
      snapRate: config.snapshotRate,
      mapSize: this.world.rules.size,
      interpMs: Math.round((2 * 1000) / config.snapshotRate),
      roundLengthSec: config.roundLengthSec,
      intermissionSec: config.intermissionSec,
      idleKickSec: config.idleKickSec,
    });
    if (this.rounds.phase === 'idle') {
      // The first human wakes the server: a fresh round starts, and the broadcast reaches them.
      this.startRound();
    } else {
      if (this.rounds.phase === 'playing') this.spawn(session);
      this.send(session.ws, this.roundMessage());
      if (this.rounds.phase === 'intermission' && this.lastRoundEnd) {
        this.sendText(session.ws, this.lastRoundEnd);
        this.send(session.ws, this.highscores.message());
      }
    }
    this.log(`${name} joined as train ${session.reservedId} (${this.humans} human(s))`);
  }

  private leave(session: Session): void {
    if (!session.joined) return;
    if (session.trainId !== null) this.world.removeTrain(session.trainId, { drop: true });
    session.trainId = null;
    session.joined = false;
    this.log(`${session.name} left (${this.humans} human(s))`);
    if (this.humans === 0 && this.rounds.phase !== 'idle') {
      this.rounds.stop();
      this.log('no players left; world paused');
    }
  }

  /** Puts a joined session's train into the world. */
  private spawn(session: Session): void {
    const train = this.world.addTrain({
      id: session.reservedId ?? undefined,
      name: session.name,
      controller: 'human',
    });
    session.trainId = train.id;
    session.idle = new IdleTracker(train.input);
  }

  // ===== Rounds =====

  private roundMessage(): RoundMsg {
    const phase = this.rounds.phase === 'intermission' ? 'intermission' : 'playing';
    return {
      t: 'round',
      phase,
      roundId: this.rounds.roundId,
      endsAt: (this.serverTick + this.rounds.ticksLeft) * this.stepMs,
    };
  }

  /** Begins a round: excess bots go, the world resets, waiting players spawn, everyone is told. */
  private startRound(): void {
    this.population.trimExcess(this.humans);
    this.rounds.start();
    this.highscores.roundStarted();
    this.world.resetForRound(roundSeed(this.world.options.seed, this.rounds.roundId));
    this.events = [];
    this.lastRoundEnd = null;
    for (const s of this.sessions) {
      if (s.joined && s.trainId === null) this.spawn(s);
    }
    this.broadcast(this.roundMessage());
    this.log(`round ${this.rounds.roundId} started`);
  }

  /** Freezes the world, announces the standings, and hands them to the round-end hook. */
  private endRound(): void {
    const result = buildResult(this.rounds.roundId, rankTrains(this.world.state.trains));
    const round = this.roundMessage();
    this.lastRoundEnd = encodeMessage({
      t: 'roundEnd',
      roundId: result.roundId,
      standings: standingRows(result),
      winnerId: result.winnerId,
      nextRoundAt: round.endsAt,
    });
    this.broadcast(round);
    for (const s of this.sessions) {
      if (s.joined) this.sendText(s.ws, this.lastRoundEnd);
    }
    const winner = result.standings[0];
    this.log(
      `round ${result.roundId} ended` +
        (winner ? `: ${winner.name} won with ${winner.roundBest}` : ''),
    );
    try {
      this.opts.onRoundEnd?.(result);
    } catch (e) {
      this.log(`onRoundEnd failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    this.highscores.roundEnded(result.roundId, this.highScoreCandidates(result)).catch((e) => {
      this.log(`high scores failed: ${e instanceof Error ? e.message : String(e)}`);
    });
  }

  /** The connected humans in the standings, best first. Bots never take a place. */
  private highScoreCandidates(result: RoundResult): RoundCandidate<Session>[] {
    const byTrain = new Map<number, Session>();
    for (const s of this.sessions) if (s.joined && s.trainId !== null) byTrain.set(s.trainId, s);
    const out: RoundCandidate<Session>[] = [];
    result.standings.forEach((standing, place) => {
      const session = standing.bot ? undefined : byTrain.get(standing.id);
      if (session) out.push({ session, name: standing.name, score: standing.roundBest, place });
    });
    return out;
  }

  // ===== The tick =====

  /**
   * Runs one server tick. The loop calls this at the tick rate; tests stop the loop and call it
   * directly to run rounds faster than real time.
   */
  tick(): void {
    this.serverTick += 1;
    const phase = this.rounds.phase;
    if (phase === 'playing') this.tickPlaying();
    else if (phase === 'intermission') this.dropInputs();
    if (phase !== 'idle') {
      const next = this.rounds.tick();
      if (next === 'intermission') this.endRound();
      else if (next === 'playing') this.startRound();
    }

    if (this.serverTick % this.snapEvery === 0) {
      this.sendSnapshots(this.serverTick);
      this.events = [];
    }
    if (this.serverTick % this.overviewEvery === 0) this.sendOverviews();
  }

  private tickPlaying(): void {
    const world = this.world;
    // A destroyed player gets a fresh starter train at the start of the next tick.
    for (const t of world.state.trains) {
      if (!t.alive && t.controller === 'human') world.respawnTrain(t.id);
    }
    this.population.update(this.humans);
    for (const s of this.sessions) {
      if (s.trainId === null) continue;
      if (s.pending) {
        world.setInput(s.trainId, s.pending.input);
        s.ackSeq = s.pending.seq;
        if (s.idle?.observe(s.pending.input) && s.idle.clearWarning()) {
          this.send(s.ws, { t: 'idleClear' });
        }
        s.pending = null;
      }
      this.checkIdle(s);
    }
    for (const e of world.step()) this.events.push(e);
  }

  /** The world is frozen between rounds, so input is thrown away. */
  private dropInputs(): void {
    for (const s of this.sessions) s.pending = null;
  }

  private checkIdle(s: Session): void {
    if (!s.idle || s.ws.readyState !== s.ws.OPEN) return;
    const action = s.idle.tick(this.idleWarnTicks, this.idleKickTicks);
    if (action === 'warn') {
      this.send(s.ws, { t: 'idleWarn', secondsLeft: IDLE_WARN_SEC });
    } else if (action === 'kick') {
      this.log(`${s.name} kicked for inactivity`);
      this.send(s.ws, { t: 'kicked', reason: 'idle' });
      s.ws.close(CLOSE_KICKED, 'idle');
    }
  }

  private sendSnapshots(tick: number): void {
    const world = this.world;
    const size = world.rules.size;
    const radius = this.config.viewRadius;
    const serverTimeMs = tick * this.stepMs;
    for (const s of this.sessions) {
      if (!s.joined || !canSend(s.ws)) continue;
      const own = s.trainId === null ? undefined : world.getTrain(s.trainId);
      if (!own) {
        // Waiting for the next round: an empty snapshot keeps the connection and clock alive.
        this.send(
          s.ws,
          buildSnapshot({
            tick: world.state.tick,
            serverTimeMs,
            ack: s.ackSeq,
            own: undefined,
            visible: EMPTY_VISIBLE,
            events: [],
          }),
        );
        continue;
      }
      const visible = selectVisible(world, own.x, own.y, radius, own.id);
      const meta = s.meta.diff([own, ...visible.trains]);
      if (meta) this.send(s.ws, { t: 'meta', trains: meta.trains, gone: meta.gone });
      this.send(
        s.ws,
        buildSnapshot({
          tick: world.state.tick,
          serverTimeMs,
          ack: s.ackSeq,
          own,
          visible,
          events: selectEvents(this.events, own.x, own.y, radius, own.id, size),
        }),
      );
    }
  }

  private sendOverviews(): void {
    const trains = this.world.state.trains;
    const ranked = rankTrains(trains);
    const base = buildOverview(trains, buildLeaderboard(ranked));
    for (const s of this.sessions) {
      if (s.trainId === null || !canSend(s.ws)) continue;
      s.ws.send(encodeMessage({ ...base, rk: rankOf(ranked, s.trainId) }));
    }
  }

  private broadcast(msg: ServerMessage): void {
    const text = encodeMessage(msg);
    for (const s of this.sessions) if (s.joined) this.sendText(s.ws, text);
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    this.sendText(ws, encodeMessage(msg));
  }

  /** Sends an already-encoded message, whatever the socket's backlog: these are small and not skippable. */
  private sendText(ws: WebSocket, text: string): void {
    if (ws.readyState === ws.OPEN) ws.send(text);
  }
}

const EMPTY_VISIBLE: Visible = {
  trains: [],
  enemies: [],
  trailers: [],
  drops: [],
  projectiles: [],
};

function canSend(ws: WebSocket): boolean {
  return ws.readyState === ws.OPEN && ws.bufferedAmount < MAX_BUFFERED_BYTES;
}

function rawToString(data: RawData): string {
  if (typeof data === 'string') return data;
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  return data.toString('utf8');
}
