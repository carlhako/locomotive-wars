import { MAX_INPUT_RATE, MAX_MALFORMED } from '@lw/shared';
import type { TrainInput } from '@lw/shared';
import type { WebSocket } from 'ws';
import { MetaTracker } from './interest.ts';

/** One connected client: its socket, its train once it has joined, and per-connection limits. */
export class Session {
  /** Null until the client's hello has been accepted. */
  trainId: number | null = null;
  name = '';
  readonly meta = new MetaTracker();
  /** Latest input received since the last tick; applied once per tick. */
  pending: { input: TrainInput; seq: number } | null = null;
  /** Sequence number of the last input applied to the train. */
  ackSeq = 0;
  private malformed = 0;
  private windowStart = -Infinity;
  private windowCount = 0;

  constructor(readonly ws: WebSocket) {}

  /** Counts an input against the per-second cap. False means drop it. */
  allowInput(nowMs: number): boolean {
    if (nowMs - this.windowStart >= 1000) {
      this.windowStart = nowMs;
      this.windowCount = 0;
    }
    this.windowCount += 1;
    return this.windowCount <= MAX_INPUT_RATE;
  }

  /** Counts a malformed message. True once the connection has sent too many. */
  recordMalformed(): boolean {
    this.malformed += 1;
    return this.malformed >= MAX_MALFORMED;
  }
}
