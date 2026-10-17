import { fuelCapacityOf } from './sim/train.ts';
import type {
  CarriageKind,
  Controller,
  EnemyKind,
  PickupKind,
  ProjectileKind,
} from './sim/types.ts';
import type { World } from './sim/world.ts';

/**
 * The render model: everything a client needs to draw one frame, plus which train is the local
 * player's. It is plain data with no references into the simulation, so it can be built from a
 * live `World` (offline play, the server's snapshots) or from interpolated network snapshots.
 */

export interface CarriageView {
  kind: CarriageKind;
  x: number;
  y: number;
  angle: number;
}

export interface TrainView {
  id: number;
  name: string;
  color: string;
  controller: Controller;
  alive: boolean;
  /** Head position and heading. */
  x: number;
  y: number;
  angle: number;
  hp: number;
  maxHp: number;
  fuel: number;
  fuelMax: number;
  /** True while the head is within bridge range of its own trail. */
  bridge: boolean;
  /** True on a tick the train moved at boost speed. */
  boosting: boolean;
  /** True while spawn protection is active (the client draws a shield ring). */
  protected: boolean;
  /** Changes each time the train respawns, so interpolation never spans a respawn. */
  spawnSeq: number;
  /**
   * The longest this train has been this round (carriages behind the locomotive). Known for the
   * local train and in offline play; 0 for other trains on the network, whose ranks come from
   * the server's leaderboard.
   */
  roundBest: number;
  /** Index 0 is the locomotive. */
  carriages: CarriageView[];
  /** Orbit angle of each counter-drone around the head. */
  drones: number[];
}

export interface EnemyView {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  angle: number;
  hp: number;
  maxHp: number;
  /** Boss only; omitted for other enemies. */
  name?: string;
}

export interface TrailerView {
  id: number;
  kind: PickupKind;
  x: number;
  y: number;
}

export interface DropView {
  id: number;
  kind: PickupKind;
  x: number;
  y: number;
  /** Seconds since the pickup was dropped. */
  age: number;
}

export interface ProjectileView {
  id: number;
  kind: ProjectileKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface MinimapEntry {
  id: number;
  x: number;
  y: number;
  color: string;
  isLocal: boolean;
}

export interface WorldView {
  tick: number;
  /** Seconds simulated. */
  time: number;
  /** Id of the train this client controls. */
  localId: number;
  trains: TrainView[];
  enemies: EnemyView[];
  trailers: TrailerView[];
  drops: DropView[];
  projectiles: ProjectileView[];
  /** One entry per living train. */
  minimap: MinimapEntry[];
}

/** Builds the render model from a live world. Destroyed enemies (zero hull) are left out. */
export function viewFromWorld(world: World, localId: number): WorldView {
  const s = world.state;
  const trains: TrainView[] = s.trains.map((t) => ({
    id: t.id,
    name: t.name,
    color: t.color,
    controller: t.controller,
    alive: t.alive,
    x: t.x,
    y: t.y,
    angle: t.angle,
    hp: t.hull,
    maxHp: t.maxHull,
    fuel: t.fuel,
    fuelMax: fuelCapacityOf(t),
    bridge: t.bridgeActive,
    boosting: t.boosting,
    protected: t.protectedFor > 0,
    spawnSeq: t.spawnSeq,
    roundBest: t.roundBest,
    carriages: t.carriages.map((c) => ({ kind: c.kind, x: c.x, y: c.y, angle: c.angle })),
    drones: t.drones.map((d) => d.angle),
  }));
  const enemies: EnemyView[] = [];
  for (const e of s.enemies) {
    if (e.hull <= 0) continue;
    const view: EnemyView = {
      id: e.id,
      kind: e.kind,
      x: e.x,
      y: e.y,
      angle: e.angle,
      hp: e.hull,
      maxHp: e.maxHull,
    };
    if (e.kind === 'boss') view.name = e.name;
    enemies.push(view);
  }
  return {
    tick: s.tick,
    time: s.time,
    localId,
    trains,
    enemies,
    trailers: s.trailers.map((p) => ({ id: p.id, kind: p.kind, x: p.x, y: p.y })),
    drops: s.drops.map((p) => ({ id: p.id, kind: p.kind, x: p.x, y: p.y, age: p.age })),
    projectiles: s.projectiles.map((p) => ({
      id: p.id,
      kind: p.kind,
      x: p.x,
      y: p.y,
      vx: p.vx,
      vy: p.vy,
    })),
    minimap: s.trains
      .filter((t) => t.alive)
      .map((t) => ({ id: t.id, x: t.x, y: t.y, color: t.color, isLocal: t.id === localId })),
  };
}
