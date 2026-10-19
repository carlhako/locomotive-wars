import type { MinimapEntry, WorldView } from '@lw/shared';
import { CARRIAGE_TYPES, LOCAL_COLOR } from './palette.ts';

/** Minimap canvas side length in pixels (reference line 2460). */
export const MINIMAP_SIZE = 180;

/**
 * The trains the minimap shows: every entry except other trains known to carry a cloak. Online
 * the server already leaves cloaked trains out of the overview; this covers offline play, and a
 * cloak picked up since the last overview.
 */
export function minimapEntries(view: WorldView): MinimapEntry[] {
  const cloaked = new Set(
    view.trains
      .filter((t) => t.id !== view.localId && t.carriages.some((c) => c.kind === 'cloak'))
      .map((t) => t.id),
  );
  return cloaked.size === 0 ? view.minimap : view.minimap.filter((e) => !cloaked.has(e.id));
}

/**
 * Draws the whole map: trailers, drops, enemies, all living uncloaked trains with the local one
 * highlighted, and the local viewport and heading (reference updateMinimap, lines 2458-2520).
 */
export function drawMinimap(
  m: CanvasRenderingContext2D,
  view: WorldView,
  mapSize: number,
  viewport: { width: number; height: number },
): void {
  const size = MINIMAP_SIZE;
  const scale = size / mapSize;
  m.clearRect(0, 0, size, size);
  m.fillStyle = 'rgba(0, 0, 0, 0.75)';
  m.fillRect(0, 0, size, size);
  m.strokeStyle = 'rgba(100, 150, 220, 0.15)';
  m.lineWidth = 1;
  m.beginPath();
  for (let i = 0; i <= 4; i++) {
    m.moveTo((i * size) / 4, 0);
    m.lineTo((i * size) / 4, size);
    m.moveTo(0, (i * size) / 4);
    m.lineTo(size, (i * size) / 4);
  }
  m.stroke();

  for (const t of view.trailers) {
    m.fillStyle = CARRIAGE_TYPES[t.kind].color;
    m.globalAlpha = 0.5;
    m.fillRect(t.x * scale - 1, t.y * scale - 1, 2, 2);
  }
  for (const p of view.drops) {
    m.fillStyle = CARRIAGE_TYPES[p.kind].color;
    m.globalAlpha = 0.7;
    m.fillRect(p.x * scale - 1, p.y * scale - 1, 2, 2);
  }
  m.globalAlpha = 1;

  for (const e of view.enemies) {
    m.fillStyle = e.kind === 'boss' ? '#ff00ff' : e.kind === 'sentry' ? '#ffaa00' : '#ff4444';
    m.beginPath();
    m.arc(
      e.x * scale,
      e.y * scale,
      e.kind === 'boss' ? 4 : e.kind === 'drone' ? 1.5 : 2,
      0,
      Math.PI * 2,
    );
    m.fill();
  }

  for (const t of minimapEntries(view)) {
    m.fillStyle = t.isLocal ? LOCAL_COLOR : t.color;
    m.beginPath();
    m.arc(t.x * scale, t.y * scale, t.isLocal ? 4 : 3, 0, Math.PI * 2);
    m.fill();
    if (t.isLocal) {
      m.strokeStyle = '#fff';
      m.lineWidth = 1;
      m.stroke();
    }
  }

  const local = view.trains.find((t) => t.id === view.localId);
  if (local?.alive) {
    m.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    m.lineWidth = 1;
    m.strokeRect(
      (local.x - viewport.width / 2) * scale,
      (local.y - viewport.height / 2) * scale,
      viewport.width * scale,
      viewport.height * scale,
    );
    m.strokeStyle = '#fff';
    m.lineWidth = 1.5;
    m.beginPath();
    m.moveTo(local.x * scale, local.y * scale);
    m.lineTo(
      local.x * scale + Math.cos(local.angle) * 8,
      local.y * scale + Math.sin(local.angle) * 8,
    );
    m.stroke();
  }
}
