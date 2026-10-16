import type { SimEvent, TrainInput, WorldView } from '@lw/shared';

/**
 * Where the client's world comes from. Offline play steps a local simulation; the online client
 * (change 04) will implement the same interface over network snapshots. Everything downstream
 * of this interface, rendering and effects included, is shared between the two.
 */
export interface GameSource {
  /** Side length of the (square, wrapping) world. */
  readonly mapSize: number;
  /**
   * Changes whenever the world is replaced (an offline restart, a new round, a reconnect), so
   * presentation state tied to the old world can be dropped. Entity ids may repeat across worlds.
   */
  readonly generation: number;
  /**
   * Advances the session by `dt` real seconds, with `input` as the player's controls, and
   * returns the simulation events that occurred in that time.
   */
  advance(dt: number, input: TrainInput): SimEvent[];
  /** The view to draw right now (interpolated between simulation steps). */
  view(): WorldView;
  /**
   * Names and colours of trains the source knows about even when they are not in the view, so
   * events that mention a distant train (a kill) can still name it.
   */
  knownTrains?(): Iterable<{ id: number; name: string; color: string }>;
}
