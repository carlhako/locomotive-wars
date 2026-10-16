/**
 * Estimates the server's clock from ping/pong exchanges. Each exchange gives the round-trip time
 * and an offset (server time minus client time, assuming the reply took half the round trip).
 * Samples with the lowest round trips are the least distorted by queueing, so the estimate is the
 * median offset of the few best samples among the recent ones.
 */

/** Recent samples considered. */
const WINDOW = 20;
/** Lowest-RTT samples whose median offset is used. */
const BEST = 5;

interface Sample {
  rtt: number;
  offset: number;
}

export class ClockSync {
  private samples: Sample[] = [];
  private estimate: number | null = null;

  get synced(): boolean {
    return this.estimate !== null;
  }

  /** Round trip of the best recent sample, in milliseconds, or null before any. */
  get rtt(): number | null {
    if (this.samples.length === 0) return null;
    return Math.min(...this.samples.map((s) => s.rtt));
  }

  /**
   * Seeds the estimate from a one-way observation (a snapshot's server time against the arrival
   * time) so a clock exists before the first pong. Ignored once a real sample has arrived.
   */
  seed(serverMs: number, clientMs: number): void {
    if (this.samples.length === 0) this.estimate = serverMs - clientMs;
  }

  /** Records a pong. `sentAt` and `receivedAt` are client times; `serverMs` is from the pong. */
  addSample(sentAt: number, receivedAt: number, serverMs: number): void {
    const rtt = receivedAt - sentAt;
    if (!(rtt >= 0) || !Number.isFinite(serverMs)) return;
    this.samples.push({ rtt, offset: serverMs + rtt / 2 - receivedAt });
    if (this.samples.length > WINDOW) this.samples.shift();
    const best = [...this.samples].sort((a, b) => a.rtt - b.rtt).slice(0, BEST);
    const offsets = best.map((s) => s.offset).sort((a, b) => a - b);
    const mid = offsets.length >> 1;
    this.estimate =
      offsets.length % 2 === 1
        ? (offsets[mid] as number)
        : ((offsets[mid - 1] as number) + (offsets[mid] as number)) / 2;
  }

  /** Estimated server time, in milliseconds, at client time `clientMs`. */
  serverTime(clientMs: number): number {
    return clientMs + (this.estimate ?? 0);
  }
}
