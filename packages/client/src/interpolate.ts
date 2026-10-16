import { shortAngle, wrapDelta, wrapPos } from '@lw/shared';
import type { CarriageView, WorldView } from '@lw/shared';

/**
 * Blends two views a tick apart for smooth rendering between simulation steps. Positions move
 * by the shortest wrapped route, so an entity crossing the map seam does not streak across the
 * screen. Entities missing from `prev` (just spawned) take their `curr` values.
 */
export function interpolateView(
  prev: WorldView,
  curr: WorldView,
  alpha: number,
  size: number,
): WorldView {
  const a = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
  if (a >= 1 || prev === curr) return curr;

  const pos = (from: number, to: number): number =>
    wrapPos(from + wrapDelta(to - from, size) * a, size);
  const ang = (from: number, to: number): number => from + shortAngle(to - from) * a;

  const prevTrains = new Map(prev.trains.map((t) => [t.id, t]));
  const currTrains = new Map(curr.trains.map((t) => [t.id, t]));
  const prevEnemies = new Map(prev.enemies.map((e) => [e.id, e]));
  const prevShots = new Map(prev.projectiles.map((p) => [p.id, p]));

  const minimap = curr.minimap.map((m) => {
    const p = prevTrains.get(m.id);
    const c = currTrains.get(m.id);
    return p?.alive && p.spawnSeq === (c?.spawnSeq ?? p.spawnSeq)
      ? { ...m, x: pos(p.x, m.x), y: pos(p.y, m.y) }
      : m;
  });

  return {
    ...curr,
    time: prev.time + (curr.time - prev.time) * a,
    trains: curr.trains.map((t) => {
      const p = prevTrains.get(t.id);
      // A dead train, or one that respawned in between, has nothing meaningful to blend from:
      // blending would draw it sweeping across the map from its old position.
      if (!p || !p.alive || !t.alive || p.spawnSeq !== t.spawnSeq) return t;
      const carriages: CarriageView[] =
        p.carriages.length === t.carriages.length
          ? t.carriages.map((c, i) => {
              const pc = p.carriages[i] as CarriageView;
              return {
                kind: c.kind,
                x: pos(pc.x, c.x),
                y: pos(pc.y, c.y),
                angle: ang(pc.angle, c.angle),
              };
            })
          : t.carriages;
      return {
        ...t,
        x: pos(p.x, t.x),
        y: pos(p.y, t.y),
        angle: ang(p.angle, t.angle),
        carriages,
      };
    }),
    enemies: curr.enemies.map((e) => {
      const p = prevEnemies.get(e.id);
      if (!p) return e;
      return { ...e, x: pos(p.x, e.x), y: pos(p.y, e.y), angle: ang(p.angle, e.angle) };
    }),
    projectiles: curr.projectiles.map((s) => {
      const p = prevShots.get(s.id);
      if (!p) return s;
      return { ...s, x: pos(p.x, s.x), y: pos(p.y, s.y) };
    }),
    minimap,
  };
}
