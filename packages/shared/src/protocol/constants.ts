/** Rates, radii, and limits of the real-time protocol. Change 06 moves the tunable ones to config. */

/** Snapshots per second; every second tick of the 30 Hz simulation. */
export const SNAPSHOT_RATE = 15;
/** Minimap overviews per second. */
export const OVERVIEW_RATE = 2;
/** Entities farther than this (wrapped distance from the train head) are left out of snapshots. */
export const VIEW_RADIUS = 1600;
/** Remote entities are drawn this far in the past: two snapshot intervals. */
export const INTERP_MS = Math.round((2 * 1000) / SNAPSHOT_RATE);

/** The client sends its input at least this often while playing. */
export const INPUT_HEARTBEAT_MS = 100;
/** Input messages beyond this many per second per session are dropped. */
export const MAX_INPUT_RATE = 60;
/** The server scales an aim offset longer than this (units) down to it, keeping its direction. */
export const MAX_AIM_OFFSET = 2000;
/** A connection that sends this many malformed messages is closed. */
export const MAX_MALFORMED = 20;
/** Largest message the server accepts from a client, in bytes. */
export const MAX_CLIENT_MESSAGE_BYTES = 1024;

/** Seconds between the client's clock-sync pings. */
export const PING_INTERVAL_MS = 2000;
/** The client treats the connection as lost after this long without a snapshot. */
export const SNAPSHOT_TIMEOUT_MS = 5000;
