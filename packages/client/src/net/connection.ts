import {
  decodeServerMessage,
  encodeMessage,
  INPUT_HEARTBEAT_MS,
  PING_INTERVAL_MS,
  PROTOCOL_VERSION,
  SNAPSHOT_TIMEOUT_MS,
} from '@lw/shared';
import type {
  HighScoresMsg,
  LeaderRow,
  OverviewRow,
  RejectReason,
  RoundEndMsg,
  RoundMsg,
  ServerMessage,
  SimEvent,
  SnapshotMsg,
  TrainInput,
  TrainMeta,
  WelcomeMsg,
  WorldView,
} from '@lw/shared';
import type {
  Board,
  GameSource,
  HighScoreFailure,
  HighScoreOffer,
  HighScoresInfo,
  RoundResultInfo,
  RoundStatus,
} from '../source.ts';
import { SnapshotBuffer } from './buffer.ts';
import { ClockSync } from './clock.ts';
import { LocalTrain } from './localTrain.ts';
import { connectWebSocket } from './transport.ts';
import type { Connect, Transport } from './transport.ts';

/** Quick pings sent right after joining so the clock is trustworthy within a fraction of a second. */
const WARMUP_PINGS = 4;
const WARMUP_GAP_MS = 120;
/** Give up on a connection that has not produced a first snapshot in this long. */
const JOIN_TIMEOUT_MS = 8000;
/** Fewest milliseconds between input messages: a change of controls, and an aim-only change. */
const MIN_CONTROL_GAP_MS = 20;
const MIN_AIM_GAP_MS = 33;
/** Map size assumed until the server's welcome says otherwise. */
const DEFAULT_MAP_SIZE = 6000;

export type ConnectionStatus = 'connecting' | 'online' | 'disconnected';

/** Why a session ended, for the player: either a server refusal or a lost connection. */
export type DisconnectReason = RejectReason | 'closed' | 'timeout' | 'kicked';

export interface NetOptions {
  url: string;
  name: string;
  /** Opens the transport. Default: a browser WebSocket. */
  connect?: Connect;
  /** Millisecond clock. Default `performance.now`. */
  now?: () => number;
  /** Called whenever the status changes. */
  onStatus?: (status: ConnectionStatus, reason?: DisconnectReason) => void;
}

type Timers = {
  ping: ReturnType<typeof setInterval>;
  input: ReturnType<typeof setInterval>;
  watchdog: ReturnType<typeof setInterval>;
  joinTimeout: ReturnType<typeof setTimeout>;
  warmup: Array<ReturnType<typeof setTimeout>>;
};

/**
 * The online `GameSource`: joins the server, keeps a clock in step with it, sends the player's
 * controls, and turns incoming snapshots into views. Other trains and the world are drawn
 * slightly in the past, interpolated between snapshots; the player's own train is drawn from
 * the newest snapshot and run forward.
 */
export class NetSession implements GameSource {
  /** Resolves on the first snapshot of a connection; rejects if the join fails. */
  ready!: Promise<void>;
  status: ConnectionStatus = 'connecting';
  mapSize = DEFAULT_MAP_SIZE;
  generation = 0;
  /** Why the session is disconnected, while it is. */
  reason: DisconnectReason | null = null;
  /** Players and limit from a `full` refusal. */
  fullInfo: { humans: number; max: number } | null = null;

  private readonly connect: Connect;
  private readonly now: () => number;
  private transport: Transport | null = null;
  private timers: Timers | null = null;
  private resolveReady: (() => void) | null = null;
  private rejectReady: ((reason: Error) => void) | null = null;

  private welcome: WelcomeMsg | null = null;
  private interpMs = 133;
  private clock = new ClockSync();
  private buffer = new SnapshotBuffer(DEFAULT_MAP_SIZE);
  private local = new LocalTrain(DEFAULT_MAP_SIZE);
  private meta = new Map<number, TrainMeta>();
  private overview: OverviewRow[] = [];
  private roundMsg: RoundMsg | null = null;
  private roundEndMsg: RoundEndMsg | null = null;
  private scores: HighScoresMsg | null = null;
  private hs: {
    token: string;
    rank: number;
    score: number;
    state: HighScoreOffer['state'];
    failure?: HighScoreFailure;
  } | null = null;
  private leaders: LeaderRow[] = [];
  private rank = 0;
  /** Client time at which the inactivity kick lands, while a warning stands. */
  private kickAt: number | null = null;
  private pendingEvents: SimEvent[] = [];
  private lastSnapshotAt = 0;

  private input: TrainInput = { turn: 0, boost: false, brake: false, aim: 0 };
  private sent: TrainInput | null = null;
  private sentAt = -Infinity;
  private seq = 0;
  private pingSentAt = new Map<number, number>();

  private frameNow = 0;
  /** Bumped whenever incoming data changes what `view()` would return. */
  private version = 0;
  private cache: { at: number; version: number; view: WorldView } | null = null;

  constructor(private readonly opts: NetOptions) {
    this.connect = opts.connect ?? connectWebSocket;
    this.now = opts.now ?? (() => performance.now());
    this.open();
  }

  /** The session's own train id once welcomed, else 0. */
  get localId(): number {
    return this.welcome?.id ?? 0;
  }

  /** Throws away the old connection and joins afresh with the same name. */
  reconnect(): void {
    this.teardown();
    this.open();
  }

  /** Closes the connection for good. */
  close(): void {
    this.teardown();
    this.setStatus('disconnected', 'closed');
  }

  // ===== GameSource =====

  advance(_dt: number, input: TrainInput): SimEvent[] {
    this.frameNow = this.now();
    this.input = input;
    if (this.status === 'online') this.maybeSendInput(this.frameNow);
    const events = this.pendingEvents;
    this.pendingEvents = [];
    return events;
  }

  view(): WorldView {
    const cached = this.cache;
    if (cached && cached.at === this.frameNow && cached.version === this.version) {
      return cached.view;
    }
    const view = this.build(this.frameNow);
    this.cache = { at: this.frameNow, version: this.version, view };
    return view;
  }

  round(): RoundStatus | null {
    const r = this.roundMsg;
    if (!r) return null;
    const left = (r.endsAt - this.clock.serverTime(this.now())) / 1000;
    return { phase: r.phase, roundId: r.roundId, secondsLeft: Math.max(0, left) };
  }

  board(): Board | null {
    if (this.leaders.length === 0) return null;
    return {
      rows: this.leaders.map(([id, name, best, now, bot]) => ({
        id,
        name,
        best,
        now,
        bot: bot === 1,
      })),
      rank: this.rank,
    };
  }

  roundResult(): RoundResultInfo | null {
    const e = this.roundEndMsg;
    if (!e || this.roundMsg?.phase !== 'intermission') return null;
    return {
      roundId: e.roundId,
      winnerId: e.winnerId,
      standings: e.standings.map(([id, name, bot, best, kills]) => ({
        id,
        name,
        bot: bot === 1,
        best,
        kills,
      })),
    };
  }

  highscores(): HighScoresInfo | null {
    const s = this.scores;
    if (!s || this.roundMsg?.phase !== 'intermission') return null;
    return {
      rows: s.entries.map(([id, name, score]) => ({ id, name, score })),
      highlightIds: s.highlightIds,
    };
  }

  highScoreOffer(): HighScoreOffer | null {
    const h = this.hs;
    if (!h || this.roundMsg?.phase !== 'intermission') return null;
    return { rank: h.rank, score: h.score, state: h.state, failure: h.failure };
  }

  submitHighScoreName(name: string): void {
    const h = this.hs;
    if (!h || !this.transport || this.status !== 'online') return;
    // Only a fresh offer, or one the server said could be tried again, can be answered.
    const retry = h.state === 'failed' && h.failure === 'error';
    if (h.state !== 'ready' && !retry) return;
    h.state = 'saving';
    h.failure = undefined;
    this.version += 1;
    this.transport.send(encodeMessage({ t: 'hsName', token: h.token, name }));
  }

  idleWarning(): number | null {
    if (this.kickAt === null) return null;
    return Math.max(0, Math.ceil((this.kickAt - this.now()) / 1000));
  }

  /** Names and colours of every train the session has heard of, in view or not. */
  *knownTrains(): Iterable<{ id: number; name: string; color: string }> {
    for (const m of this.meta.values()) yield m;
    for (const [id, , , color, name] of this.overview) yield { id, name, color };
  }

  // ===== Connection lifecycle =====

  private open(): void {
    this.status = 'connecting';
    this.reason = null;
    this.fullInfo = null;
    this.welcome = null;
    this.roundMsg = null;
    this.roundEndMsg = null;
    this.scores = null;
    this.hs = null;
    this.leaders = [];
    this.rank = 0;
    this.kickAt = null;
    this.clock = new ClockSync();
    this.buffer = new SnapshotBuffer(this.mapSize);
    this.local = new LocalTrain(this.mapSize);
    this.meta = new Map();
    this.overview = [];
    this.pendingEvents = [];
    this.sent = null;
    this.sentAt = -Infinity;
    this.pingSentAt.clear();
    this.cache = null;
    this.frameNow = this.now();
    this.version += 1;
    this.generation += 1;
    this.ready = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    // A caller that never awaits `ready` must not trigger an unhandled rejection.
    this.ready.catch(() => undefined);
    this.opts.onStatus?.('connecting');

    this.transport = this.connect(this.opts.url, {
      onOpen: () =>
        this.transport?.send(
          encodeMessage({ t: 'hello', v: PROTOCOL_VERSION, name: this.opts.name }),
        ),
      onMessage: (text) => this.onMessage(text),
      onClose: () => this.fail('closed'),
    });
    this.timers = {
      ping: setInterval(() => this.sendPing(), PING_INTERVAL_MS),
      input: setInterval(() => {
        if (this.status === 'online') this.maybeSendInput(this.now());
      }, INPUT_HEARTBEAT_MS / 2),
      watchdog: setInterval(() => {
        if (this.status === 'online' && this.now() - this.lastSnapshotAt > SNAPSHOT_TIMEOUT_MS) {
          this.fail('timeout');
        }
      }, 1000),
      joinTimeout: setTimeout(() => {
        if (this.status === 'connecting') this.fail('timeout');
      }, JOIN_TIMEOUT_MS),
      warmup: [],
    };
  }

  private teardown(): void {
    const timers = this.timers;
    if (timers) {
      clearInterval(timers.ping);
      clearInterval(timers.input);
      clearInterval(timers.watchdog);
      clearTimeout(timers.joinTimeout);
      for (const t of timers.warmup) clearTimeout(t);
    }
    this.timers = null;
    const transport = this.transport;
    this.transport = null;
    transport?.close();
  }

  /** Ends the connection with a reason; safe to call more than once. */
  private fail(reason: DisconnectReason): void {
    if (this.status === 'disconnected') return;
    const wasConnecting = this.status === 'connecting';
    this.kickAt = null;
    this.teardown();
    this.setStatus('disconnected', reason);
    if (wasConnecting) this.rejectReady?.(new Error(reason));
  }

  private setStatus(status: ConnectionStatus, reason?: DisconnectReason): void {
    this.status = status;
    this.reason = status === 'disconnected' ? (reason ?? 'closed') : null;
    this.opts.onStatus?.(status, reason);
  }

  // ===== Incoming =====

  private onMessage(text: string): void {
    const msg = decodeServerMessage(text);
    if (!msg) return;
    this.handle(msg);
  }

  private handle(msg: ServerMessage): void {
    if (this.status === 'disconnected') return;
    switch (msg.t) {
      case 'welcome':
        this.onWelcome(msg);
        return;
      case 'reject':
        if (msg.humans !== undefined && msg.max !== undefined) {
          this.fullInfo = { humans: msg.humans, max: msg.max };
        }
        this.fail(msg.reason);
        return;
      case 'round':
        this.roundMsg = msg;
        if (msg.phase === 'playing') {
          this.roundEndMsg = null;
          this.scores = null;
          this.hs = null;
        }
        this.version += 1;
        return;
      case 'roundEnd':
        this.roundEndMsg = msg;
        this.version += 1;
        return;
      case 'highscores':
        this.scores = msg;
        this.version += 1;
        return;
      case 'hsEligible':
        this.hs = { token: msg.token, rank: msg.rank, score: msg.score, state: 'ready' };
        this.version += 1;
        return;
      case 'hsResult':
        if (this.hs) {
          // A refusal after a success (a repeated submit) must not undo the saved state.
          if (msg.ok) this.hs.state = 'saved';
          else if (this.hs.state !== 'saved') {
            this.hs.state = 'failed';
            this.hs.failure = msg.reason ?? 'error';
          }
        }
        this.version += 1;
        return;
      case 'idleWarn':
        this.kickAt = this.now() + msg.secondsLeft * 1000;
        return;
      case 'idleClear':
        this.kickAt = null;
        return;
      case 'kicked':
        this.fail('kicked');
        return;
      case 'meta':
        for (const t of msg.trains) this.meta.set(t.id, t);
        for (const id of msg.gone) this.meta.delete(id);
        this.version += 1;
        return;
      case 'snap':
        this.onSnapshot(msg);
        return;
      case 'ov':
        this.overview = msg.h;
        this.leaders = msg.lb;
        this.rank = msg.rk;
        this.version += 1;
        return;
      case 'pong': {
        const sentAt = this.pingSentAt.get(msg.c);
        if (sentAt === undefined) return;
        this.pingSentAt.delete(msg.c);
        this.clock.addSample(sentAt, this.now(), msg.st);
        return;
      }
    }
  }

  private onWelcome(msg: WelcomeMsg): void {
    this.welcome = msg;
    this.mapSize = msg.mapSize;
    this.interpMs = msg.interpMs;
    this.buffer = new SnapshotBuffer(msg.mapSize);
    this.local = new LocalTrain(msg.mapSize);
    this.lastSnapshotAt = this.now();
    this.sendPing();
    const warmup = this.timers?.warmup;
    for (let i = 1; i <= WARMUP_PINGS; i++) {
      warmup?.push(setTimeout(() => this.sendPing(), i * WARMUP_GAP_MS));
    }
  }

  private onSnapshot(snap: SnapshotMsg): void {
    if (!this.welcome) return;
    const now = this.now();
    this.lastSnapshotAt = now;
    this.clock.seed(snap.st, now);
    if (this.status === 'connecting') {
      if (this.timers) clearTimeout(this.timers.joinTimeout);
      this.setStatus('online');
    }
    this.version += 1;

    this.buffer.push(snap, this.welcome.id, this.meta);
    if (snap.me) {
      const speedCarriages =
        this.meta.get(this.welcome.id)?.kinds.filter((k) => k === 'speed').length ?? 0;
      this.local.onSnapshot(
        snap.me,
        snap.st,
        speedCarriages,
        this.clock.serverTime(now),
        now,
        this.input,
      );
    }
    for (const e of snap.ev) this.pendingEvents.push(e);
    if (this.resolveReady) {
      this.resolveReady();
      this.resolveReady = null;
    }
  }

  // ===== Outgoing =====

  private sendPing(): void {
    if (!this.transport || this.status === 'disconnected') return;
    const sentAt = this.now();
    // The client time doubles as the key to match the reply; make it unique even in one tick.
    let key = sentAt;
    while (this.pingSentAt.has(key)) key += 0.001;
    this.pingSentAt.set(key, sentAt);
    this.transport.send(encodeMessage({ t: 'ping', c: key }));
    // Forget pings that were never answered.
    if (this.pingSentAt.size > 32) {
      const oldest = this.pingSentAt.keys().next().value;
      if (oldest !== undefined) this.pingSentAt.delete(oldest);
    }
  }

  /** Sends the controls when they changed (rate-limited) or the heartbeat is due. */
  private maybeSendInput(now: number): void {
    const prev = this.sent;
    const cur = this.input;
    const gap = now - this.sentAt;
    const controlsChanged =
      !prev || prev.turn !== cur.turn || prev.boost !== cur.boost || prev.brake !== cur.brake;
    const aimChanged = !prev || Math.abs(prev.aim - cur.aim) > 0.001;
    const heartbeat = gap >= INPUT_HEARTBEAT_MS * 0.75;
    const due =
      (controlsChanged && gap >= MIN_CONTROL_GAP_MS) ||
      (aimChanged && gap >= MIN_AIM_GAP_MS) ||
      heartbeat;
    if (!due || !this.transport) return;
    this.seq += 1;
    this.sent = { ...cur };
    this.sentAt = now;
    this.transport.send(
      encodeMessage({
        t: 'in',
        s: this.seq,
        tr: cur.turn,
        b: cur.boost ? 1 : 0,
        br: cur.brake ? 1 : 0,
        a: Math.round(cur.aim * 1000) / 1000,
      }),
    );
  }

  // ===== Building the view =====

  private build(now: number): WorldView {
    const serverNow = this.clock.serverTime(now);
    const base = this.buffer.sample(serverNow - this.interpMs, this.meta);
    if (!base) return emptyView(this.localId);

    // Between rounds the world is frozen on the server, so the local train must not run ahead.
    const frozen = this.roundMsg?.phase === 'intermission';
    const pose = frozen ? null : this.local.sample(serverNow, now, this.input);
    const localId = this.localId;
    const trains = base.trains.map((t) => {
      if (t.id !== localId || !pose) return t;
      const meta = this.meta.get(localId);
      const carriages = pose.carriages.map((c, i) => ({
        kind: t.carriages[i]?.kind ?? meta?.kinds[i] ?? 'mg',
        x: c.x,
        y: c.y,
        angle: t.carriages[i]?.angle ?? pose.angle,
      }));
      return { ...t, x: pose.x, y: pose.y, angle: pose.angle, carriages, drones: pose.drones };
    });
    return { ...base, trains, minimap: this.minimap(trains, pose) };
  }

  /** One dot per living train from the 2 Hz overview, with trains in view placed exactly. */
  private minimap(trains: WorldView['trains'], pose: { x: number; y: number } | null) {
    const localId = this.localId;
    const byId = new Map(trains.map((t) => [t.id, t]));
    const out = this.overview.map(([id, x, y, color]) => {
      const live = byId.get(id);
      const at = id === localId && pose ? pose : live?.alive ? live : { x, y };
      return { id, x: at.x, y: at.y, color, isLocal: id === localId };
    });
    // Before the first overview, show what snapshots already tell us.
    if (out.length === 0) {
      for (const t of trains) {
        if (t.alive)
          out.push({ id: t.id, x: t.x, y: t.y, color: t.color, isLocal: t.id === localId });
      }
    }
    return out;
  }
}

function emptyView(localId: number): WorldView {
  return {
    tick: 0,
    time: 0,
    localId,
    trains: [],
    enemies: [],
    trailers: [],
    drops: [],
    projectiles: [],
    minimap: [],
  };
}
