import type {
  CarriageKind,
  Controller,
  EnemyKind,
  PickupKind,
  ProjectileKind,
  SimEvent,
} from '../sim/types.ts';

/** Bumped on any incompatible change to the message shapes. */
export const PROTOCOL_VERSION = 4;

/**
 * The wire protocol, JSON for the beta. Keys are short and entity lists are arrays of numbers to
 * keep snapshots small; the shapes live here so the server and client cannot disagree on them.
 * Anything arriving from a client is untrusted: `decodeClientMessage` checks every field.
 */

// ===== Enumerations carried as indexes =====

export const PICKUP_KINDS = [
  'mg',
  'missile',
  'laser',
  'shield',
  'drones',
  'armor',
  'speed',
  'magnet',
  'fuel',
] as const satisfies readonly PickupKind[];
export const ENEMY_KINDS = [
  'drone',
  'hunter',
  'sentry',
  'boss',
] as const satisfies readonly EnemyKind[];
export const PROJECTILE_KINDS = [
  'bullet',
  'missile',
  'laser',
  'drone',
  'enemy',
] as const satisfies readonly ProjectileKind[];

// Compile-time check that the lists above are complete.
type Missing<T, L extends readonly T[]> = Exclude<T, L[number]>;
const _complete: [
  Missing<PickupKind, typeof PICKUP_KINDS>,
  Missing<EnemyKind, typeof ENEMY_KINDS>,
  Missing<ProjectileKind, typeof PROJECTILE_KINDS>,
] extends [never, never, never]
  ? true
  : never = true;
void _complete;

/** Bits of a train row's `flags` field. */
export const TRAIN_FLAG_BRIDGE = 1;
export const TRAIN_FLAG_BOOST = 2;
export const TRAIN_FLAG_DEAD = 4;
/** Spawn protection is active: the client draws a shield ring. */
export const TRAIN_FLAG_PROTECTED = 8;

// ===== Client to server =====

export interface HelloMsg {
  t: 'hello';
  v: number;
  name: string;
}

export interface InputMsg {
  t: 'in';
  /** Sequence number, echoed back as `ack` in snapshots. */
  s: number;
  /** Turn, -1 to 1 (the server clamps). */
  tr: number;
  /** Boost. */
  b: 0 | 1;
  /** Brake. */
  br: 0 | 1;
  /** World-space aim angle in radians. */
  a: number;
}

export interface PingMsg {
  t: 'ping';
  /** The client's own clock reading, echoed back in the pong. */
  c: number;
}

/** Longest `hsName` token accepted. The server issues 36-character UUIDs. */
export const MAX_HS_TOKEN = 64;

/** Names the player's own high score entry. Only ever carries a token the server issued. */
export interface HsNameMsg {
  t: 'hsName';
  token: string;
  name: string;
}

export type ClientMessage = HelloMsg | InputMsg | PingMsg | HsNameMsg;

// ===== Server to client =====

export interface WelcomeMsg {
  t: 'welcome';
  v: number;
  /** The session's train id. */
  id: number;
  tickRate: number;
  snapRate: number;
  mapSize: number;
  interpMs: number;
  /** Operator settings the client shows: round and intermission length, idle kick (0 = off). */
  roundLengthSec: number;
  intermissionSec: number;
  idleKickSec: number;
}

export type RejectReason = 'version' | 'full' | 'malformed';

export interface RejectMsg {
  t: 'reject';
  reason: RejectReason;
  /** `full` only: connected humans and the limit. */
  humans?: number;
  max?: number;
}

export type RoundPhase = 'playing' | 'intermission';

/** The round phase on join and at every change. `endsAt` is server time in ms (the `pong.st` clock). */
export interface RoundMsg {
  t: 'round';
  phase: RoundPhase;
  roundId: number;
  endsAt: number;
}

/** `[id, name, isBot 0/1, roundBest, kills]`, in rank order. */
export type StandingRow = [number, string, 0 | 1, number, number];

/** Sent once when a round ends, and to anyone who joins during the intermission. */
export interface RoundEndMsg {
  t: 'roundEnd';
  roundId: number;
  standings: StandingRow[];
  /** Id of the winning train, or null for an empty round. */
  winnerId: number | null;
  /** Server time in ms at which the next round starts. */
  nextRoundAt: number;
}

/** Your round result earned a place in the all-time table; `token` lets you name the entry. */
export interface HsEligibleMsg {
  t: 'hsEligible';
  token: string;
  /** 1-based rank in the table. */
  rank: number;
  score: number;
}

/** Why an `hsName` was refused. `invalid` covers an unknown token or another session's. */
export type HsFailReason = 'invalid' | 'used' | 'expired' | 'error';
const HS_FAIL_REASONS: readonly HsFailReason[] = ['invalid', 'used', 'expired', 'error'];

/** The reply to an `hsName`. */
export interface HsResultMsg {
  t: 'hsResult';
  ok: boolean;
  reason?: HsFailReason;
}

/** `[id, name, score]`, in rank order. */
export type HighScoreRow = [string, string, number];

/**
 * The all-time table, broadcast when a round's results are added and when a name changes, and
 * sent to a player who joins during the intermission. `highlightIds` are this round's new entries.
 */
export interface HighScoresMsg {
  t: 'highscores';
  entries: HighScoreRow[];
  highlightIds: string[];
}

/** The server is about to kick the session for inactivity. */
export interface IdleWarnMsg {
  t: 'idleWarn';
  secondsLeft: number;
}

/** The session did something; the idle warning is withdrawn. */
export interface IdleClearMsg {
  t: 'idleClear';
}

/** Sent just before the server closes the socket (close code 4000). */
export interface KickedMsg {
  t: 'kicked';
  reason: 'idle';
}

/** Close code the server uses after `kicked`. */
export const CLOSE_KICKED = 4000;

/** Slow-changing facts about one train: sent when first seen and whenever they change. */
export interface TrainMeta {
  id: number;
  name: string;
  color: string;
  ctl: Controller;
  /** Carriage kinds from the locomotive back. */
  kinds: CarriageKind[];
}

export interface MetaMsg {
  t: 'meta';
  trains: TrainMeta[];
  /** Trains the session knew that no longer exist or are out of its view. */
  gone: number[];
}

/**
 * `[id, x, y, angle, hp, maxHp, flags, spawnSeq, ...carriage x/y pairs from the locomotive back]`.
 * `spawnSeq` changes each time the train respawns, so a client can jump to the new position
 * instead of drawing the train travelling there.
 */
export type TrainRow = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  ...number[],
];
/** `[id, kind index, x, y, angle, hp, maxHp, bossName?]`. */
export type EnemyRow = [number, number, number, number, number, number, number, string?];
/** `[id, kind index, x, y]`. */
export type TrailerRow = [number, number, number, number];
/** `[id, kind index, x, y, age]`. */
export type DropRow = [number, number, number, number, number];
/** `[id, kind index, x, y, vx, vy]`. */
export type ProjectileRow = [number, number, number, number, number, number];

/** Everything about the session's own train. */
export interface OwnTrain {
  x: number;
  y: number;
  /** Heading, unbounded. */
  a: number;
  hp: number;
  mh: number;
  /** Fuel and fuel capacity. */
  f: number;
  fm: number;
  /** Flags, as in a train row. */
  fl: number;
  /** Spawn counter, as in a train row. */
  sq: number;
  /** Round best: the longest this train has been (carriages behind the locomotive) this round. */
  rb: number;
  /** Carriage x/y pairs from the locomotive back. */
  cs: number[];
  /** Drone orbit angles. */
  dn: number[];
}

export interface SnapshotMsg {
  t: 'snap';
  /** Simulation tick. */
  k: number;
  /** Server time in milliseconds, on the same clock as `pong.st`. */
  st: number;
  /** Sequence number of the last input applied to the session's train. */
  ack: number;
  me: OwnTrain | null;
  tr: TrainRow[];
  en: EnemyRow[];
  tl: TrailerRow[];
  dr: DropRow[];
  pr: ProjectileRow[];
  ev: SimEvent[];
}

/**
 * `[id, x, y, color, name]` for every living train, for the minimap. The name is here, not only in
 * `meta`, so the global kill feed can name trains that were never in view.
 */
export type OverviewRow = [number, number, number, string, string];

/** `[id, name, roundBest, score, isBot 0/1]`. */
export type LeaderRow = [number, string, number, number, 0 | 1];

export interface OverviewMsg {
  t: 'ov';
  h: OverviewRow[];
  /** The top 10 by round best, in rank order. */
  lb: LeaderRow[];
  /** The recipient's own rank, 1-based; 0 when it has none. */
  rk: number;
}

export interface PongMsg {
  t: 'pong';
  /** The client time from the ping. */
  c: number;
  /** Server time in milliseconds. */
  st: number;
}

export type ServerMessage =
  | WelcomeMsg
  | RejectMsg
  | MetaMsg
  | SnapshotMsg
  | OverviewMsg
  | PongMsg
  | RoundMsg
  | RoundEndMsg
  | IdleWarnMsg
  | IdleClearMsg
  | KickedMsg
  | HsEligibleMsg
  | HsResultMsg
  | HighScoresMsg;

// ===== Encoding =====

export function encodeMessage(msg: ClientMessage | ServerMessage): string {
  return JSON.stringify(msg);
}

type Json = Record<string, unknown>;

function isObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v);
}

function isFlag(v: unknown): v is 0 | 1 {
  return v === 0 || v === 1;
}

function parse(raw: string): Json | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  return isObject(value) ? value : null;
}

/** Longest name accepted in a hello before sanitising; anything longer is malformed. */
const MAX_HELLO_NAME = 200;

/**
 * Parses and validates one client message. Returns null for anything that is not valid JSON,
 * has an unknown type, or has a missing, mistyped, or non-finite field. Out-of-range values
 * (such as a turn of 50) pass: clamping is the receiver's policy, not a shape rule.
 */
export function decodeClientMessage(raw: string): ClientMessage | null {
  const m = parse(raw);
  if (!m) return null;
  switch (m.t) {
    case 'hello':
      if (isInt(m.v) && typeof m.name === 'string' && m.name.length <= MAX_HELLO_NAME) {
        return { t: 'hello', v: m.v, name: m.name };
      }
      return null;
    case 'in':
      if (isInt(m.s) && isNum(m.tr) && isFlag(m.b) && isFlag(m.br) && isNum(m.a)) {
        return { t: 'in', s: m.s, tr: m.tr, b: m.b, br: m.br, a: m.a };
      }
      return null;
    case 'ping':
      if (isNum(m.c)) return { t: 'ping', c: m.c };
      return null;
    case 'hsName':
      if (
        typeof m.token === 'string' &&
        m.token.length > 0 &&
        m.token.length <= MAX_HS_TOKEN &&
        typeof m.name === 'string' &&
        m.name.length <= MAX_HELLO_NAME
      ) {
        return { t: 'hsName', token: m.token, name: m.name };
      }
      return null;
    default:
      return null;
  }
}

function numRows(v: unknown, minLength: number): boolean {
  if (!Array.isArray(v)) return false;
  for (const row of v) {
    if (!Array.isArray(row) || row.length < minLength) return false;
    for (let i = 0; i < minLength; i++) if (!isNum(row[i])) return false;
  }
  return true;
}

function isOwnTrain(v: unknown): v is OwnTrain {
  if (!isObject(v)) return false;
  const nums = [v.x, v.y, v.a, v.hp, v.mh, v.f, v.fm, v.fl, v.sq, v.rb];
  return (
    nums.every(isNum) &&
    Array.isArray(v.cs) &&
    v.cs.length % 2 === 0 &&
    v.cs.every(isNum) &&
    Array.isArray(v.dn) &&
    v.dn.every(isNum)
  );
}

function isLeaderRow(r: unknown): r is LeaderRow {
  return (
    Array.isArray(r) &&
    isInt(r[0]) &&
    typeof r[1] === 'string' &&
    isNum(r[2]) &&
    isNum(r[3]) &&
    isFlag(r[4])
  );
}

function isStandingRow(r: unknown): r is StandingRow {
  return (
    Array.isArray(r) &&
    isInt(r[0]) &&
    typeof r[1] === 'string' &&
    isFlag(r[2]) &&
    isNum(r[3]) &&
    isNum(r[4])
  );
}

function isHighScoreRow(r: unknown): r is HighScoreRow {
  return Array.isArray(r) && typeof r[0] === 'string' && typeof r[1] === 'string' && isNum(r[2]);
}

function isTrainMeta(v: unknown): v is TrainMeta {
  return (
    isObject(v) &&
    isInt(v.id) &&
    typeof v.name === 'string' &&
    typeof v.color === 'string' &&
    (v.ctl === 'human' || v.ctl === 'bot') &&
    Array.isArray(v.kinds) &&
    v.kinds.every((k) => typeof k === 'string')
  );
}

/**
 * Parses and validates one server message, checking its shape deeply enough that the client can
 * index into rows without further checks. Returns null for anything malformed.
 */
export function decodeServerMessage(raw: string): ServerMessage | null {
  const m = parse(raw);
  if (!m) return null;
  switch (m.t) {
    case 'welcome':
      if (
        isInt(m.v) &&
        isInt(m.id) &&
        isNum(m.tickRate) &&
        isNum(m.snapRate) &&
        isNum(m.mapSize) &&
        isNum(m.interpMs) &&
        isNum(m.roundLengthSec) &&
        isNum(m.intermissionSec) &&
        isNum(m.idleKickSec)
      ) {
        return m as unknown as WelcomeMsg;
      }
      return null;
    case 'reject':
      if (m.reason === 'version' || m.reason === 'full' || m.reason === 'malformed') {
        const reject: RejectMsg = { t: 'reject', reason: m.reason };
        if (isInt(m.humans)) reject.humans = m.humans;
        if (isInt(m.max)) reject.max = m.max;
        return reject;
      }
      return null;
    case 'meta':
      if (
        Array.isArray(m.trains) &&
        m.trains.every(isTrainMeta) &&
        Array.isArray(m.gone) &&
        m.gone.every(isInt)
      ) {
        return m as unknown as MetaMsg;
      }
      return null;
    case 'snap':
      if (
        isInt(m.k) &&
        isNum(m.st) &&
        isInt(m.ack) &&
        (m.me === null || isOwnTrain(m.me)) &&
        numRows(m.tr, 8) &&
        numRows(m.en, 7) &&
        numRows(m.tl, 4) &&
        numRows(m.dr, 5) &&
        numRows(m.pr, 6) &&
        Array.isArray(m.ev) &&
        m.ev.every((e) => isObject(e) && typeof e.type === 'string')
      ) {
        return m as unknown as SnapshotMsg;
      }
      return null;
    case 'ov':
      if (
        Array.isArray(m.h) &&
        m.h.every(
          (r) =>
            Array.isArray(r) &&
            isInt(r[0]) &&
            isNum(r[1]) &&
            isNum(r[2]) &&
            typeof r[3] === 'string' &&
            typeof r[4] === 'string',
        ) &&
        Array.isArray(m.lb) &&
        m.lb.every(isLeaderRow) &&
        isInt(m.rk)
      ) {
        return m as unknown as OverviewMsg;
      }
      return null;
    case 'round':
      if (
        (m.phase === 'playing' || m.phase === 'intermission') &&
        isInt(m.roundId) &&
        isNum(m.endsAt)
      ) {
        return { t: 'round', phase: m.phase, roundId: m.roundId, endsAt: m.endsAt };
      }
      return null;
    case 'roundEnd':
      if (
        isInt(m.roundId) &&
        Array.isArray(m.standings) &&
        m.standings.every(isStandingRow) &&
        (m.winnerId === null || isInt(m.winnerId)) &&
        isNum(m.nextRoundAt)
      ) {
        return m as unknown as RoundEndMsg;
      }
      return null;
    case 'idleWarn':
      if (isNum(m.secondsLeft)) return { t: 'idleWarn', secondsLeft: m.secondsLeft };
      return null;
    case 'idleClear':
      return { t: 'idleClear' };
    case 'kicked':
      if (m.reason === 'idle') return { t: 'kicked', reason: 'idle' };
      return null;
    case 'pong':
      if (isNum(m.c) && isNum(m.st)) return { t: 'pong', c: m.c, st: m.st };
      return null;
    case 'hsEligible':
      if (typeof m.token === 'string' && isInt(m.rank) && isNum(m.score)) {
        return { t: 'hsEligible', token: m.token, rank: m.rank, score: m.score };
      }
      return null;
    case 'hsResult':
      if (typeof m.ok === 'boolean') {
        const reason = HS_FAIL_REASONS.find((r) => r === m.reason);
        return reason ? { t: 'hsResult', ok: m.ok, reason } : { t: 'hsResult', ok: m.ok };
      }
      return null;
    case 'highscores':
      if (
        Array.isArray(m.entries) &&
        m.entries.every(isHighScoreRow) &&
        Array.isArray(m.highlightIds) &&
        m.highlightIds.every((id) => typeof id === 'string')
      ) {
        return { t: 'highscores', entries: m.entries, highlightIds: m.highlightIds };
      }
      return null;
    default:
      return null;
  }
}
