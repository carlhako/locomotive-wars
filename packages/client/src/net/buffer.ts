import type { SnapshotMsg, WorldView } from '@lw/shared';
import { interpolateView } from '../interpolate.ts';
import { droneCount, droneAngles } from './view.ts';
import type { MetaBook } from './view.ts';
import { viewFromSnapshot } from './view.ts';

/** Frames kept: about two seconds at the default snapshot rate. */
const MAX_FRAMES = 32;

interface Frame {
  /** Server time of the snapshot, in milliseconds. */
  st: number;
  view: WorldView;
}

/**
 * Recent snapshots as render views, ordered by server time. `sample(t)` returns the world as it
 * was at server time `t` by blending the two views around it, with wrapped positions and short
 * angles (the same blend offline play uses between ticks). Past the newest snapshot the newest
 * view is held rather than extrapolated: remote entities are drawn in the past on purpose, so
 * this only happens when snapshots are late.
 */
export class SnapshotBuffer {
  private frames: Frame[] = [];

  constructor(private readonly size: number) {}

  get length(): number {
    return this.frames.length;
  }

  /** Server time of the newest snapshot, or null when empty. */
  get newest(): number | null {
    return this.frames.length === 0 ? null : (this.frames[this.frames.length - 1] as Frame).st;
  }

  clear(): void {
    this.frames = [];
  }

  /** Adds a snapshot. Stale or duplicate snapshots are ignored. */
  push(snap: SnapshotMsg, localId: number, meta: MetaBook): void {
    const last = this.frames[this.frames.length - 1];
    if (last && snap.st <= last.st) return;
    this.frames.push({ st: snap.st, view: viewFromSnapshot(snap, localId, meta, this.size) });
    if (this.frames.length > MAX_FRAMES) this.frames.shift();
  }

  /** The view at server time `t` (milliseconds), or null before the first snapshot. */
  sample(t: number, meta: MetaBook): WorldView | null {
    const frames = this.frames;
    const first = frames[0];
    if (!first) return null;
    let view: WorldView;
    if (t <= first.st) {
      view = first.view;
    } else {
      let i = frames.length - 1;
      while (i > 0 && (frames[i] as Frame).st > t) i--;
      const a = frames[i] as Frame;
      const b = frames[i + 1];
      view = b ? interpolateView(a.view, b.view, (t - a.st) / (b.st - a.st), this.size) : a.view;
    }
    return withDrones(view, t / 1000, meta);
  }
}

/** Gives other trains their orbiting drones, positioned by the render clock. */
function withDrones(view: WorldView, seconds: number, meta: MetaBook): WorldView {
  return {
    ...view,
    trains: view.trains.map((t) => {
      if (t.id === view.localId) return t;
      const n = droneCount(meta.get(t.id));
      return n === 0 ? t : { ...t, drones: droneAngles(n, seconds) };
    }),
  };
}
