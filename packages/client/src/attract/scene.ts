import type { WorldView } from '@lw/shared';
import { DamageNumbers } from '../fx/damageNumbers.ts';
import { applyEvents, NameBook } from '../fx/eventFx.ts';
import type { FxTargets } from '../fx/eventFx.ts';
import { HitFlash } from '../fx/hitFlash.ts';
import { MAX_PARTICLES, ParticleSystem, TrainEmitter } from '../fx/particles.ts';
import { TurretMemory } from '../fx/turrets.ts';
import { Zaps } from '../fx/zaps.ts';
import { BridgeAnimator } from '../render/bridge.ts';
import {
  createCamera,
  followCamera,
  onScreen,
  screenX,
  screenY,
  setupCanvas,
} from '../render/canvas.ts';
import type { DrawEnv } from '../render/canvas.ts';
import { renderScene } from '../render/scene.ts';
import type { SceneOverlay } from '../render/scene.ts';
import { generateStars } from '../render/stars.ts';
import { AttractWorld } from './world.ts';

/** Fraction of the distance to the leader the camera closes per 1/60 s: a pan, not a cut. */
export const ATTRACT_CAMERA_SMOOTHING = 0.05;
/** Ticks simulated before the still frame drawn under reduced motion (about 4 s). */
export const STILL_FRAME_TICKS = 120;
/** Longest frame time fed to the scene, so a stalled tab does not lurch on return. */
const MAX_FRAME_SECONDS = 0.1;

/** No player, so no aim, cursor, boost lines or shake. */
const OVERLAY: SceneOverlay = {
  aim: null,
  mouse: null,
  boosting: false,
  firing: false,
  shake: { x: 0, y: 0 },
};

const ignore = (): void => {};
/** Sound, HUD and local-only effects the background leaves out. */
const SILENT: FxTargets['sound'] = {
  shoot: ignore,
  hit: ignore,
  damage: ignore,
  explosion: ignore,
  pickup: ignore,
  death: ignore,
  bossSpawn: ignore,
  bridgeOn: ignore,
  bridgeOff: ignore,
  zap: ignore,
  mine: ignore,
  slowHeal: ignore,
  fullHeal: ignore,
};

export interface AttractOptions {
  /** Draw one still frame instead of animating. */
  reducedMotion: boolean;
}

export interface AttractScene {
  /** The simulation behind the scene, for the dev console. */
  readonly world: AttractWorld;
  /** Stops the scene and removes its canvas. Safe to call more than once. */
  stop(): void;
}

/**
 * Runs the home screen background: a bots-only `AttractWorld` drawn on its own canvas behind
 * the join screen, with the camera following the longest train. It reads no input and makes
 * no sound.
 */
export function startAttract(options: AttractOptions): AttractScene {
  const canvas = document.createElement('canvas');
  canvas.id = 'attract';
  const game = document.getElementById('game');
  if (game) game.before(canvas);
  else document.body.prepend(canvas);
  const surface = setupCanvas(canvas);

  const attract = new AttractWorld();
  const size = attract.mapSize;
  const camera = createCamera();
  const stars = generateStars();
  const particles = new ParticleSystem(MAX_PARTICLES, size);
  const damageNumbers = new DamageNumbers();
  const hitFlash = new HitFlash();
  const bridges = new BridgeAnimator();
  const turrets = new TurretMemory();
  const zaps = new Zaps();
  const emitter = new TrainEmitter();
  const names = new NameBook();
  const sceneFx = { stars, particles, damageNumbers, hitFlash, bridges, turrets, zaps };
  const fx: FxTargets = {
    particles,
    damageNumbers: { add: ignore },
    shake: { add: ignore },
    hitFlash,
    screenFlash: { show: ignore },
    healFlash: { show: ignore },
    killFeed: { add: ignore },
    banner: { show: ignore, popup: ignore },
    sound: SILENT,
    turrets,
    zaps,
  };

  const envAt = (time: number): DrawEnv => ({
    ctx: surface.ctx,
    width: surface.width,
    height: surface.height,
    camera,
    size,
    time,
  });

  const follow = (view: WorldView, dt: number, snap: boolean): void => {
    const leader = view.trains.find((t) => t.id === attract.leaderId);
    if (leader) followCamera(camera, leader.x, leader.y, size, dt, snap, ATTRACT_CAMERA_SMOOTHING);
  };

  const draw = (env: DrawEnv, view: WorldView, dt: number): void => {
    surface.begin();
    renderScene(env, view, sceneFx, OVERLAY, dt);
  };

  let frameId = 0;
  let onResize: (() => void) | null = null;
  let stopped = false;

  if (options.reducedMotion) {
    // Let the trains meet and start firing, then hold one frame of it.
    for (let i = 0; i < STILL_FRAME_TICKS; i++) attract.advance(attract.world.dt);
    const view = attract.view();
    follow(view, 0, true);
    const still = (): void => draw(envAt(0), view, 0);
    still();
    // Resizing clears the canvas; draw the same frame again.
    onResize = still;
    window.addEventListener('resize', onResize);
  } else {
    let lastTime = performance.now();
    let first = true;
    const frame = (now: number): void => {
      const dt = Math.min(MAX_FRAME_SECONDS, Math.max(0, (now - lastTime) / 1000));
      lastTime = now;
      const env = envAt(now / 1000);

      const events = attract.advance(dt);
      const view = attract.view();
      names.observe(view);
      applyEvents(events, { view, names, size }, fx);
      follow(view, dt, first);
      first = false;

      emitter.update(particles, view.trains, dt, (x, y) =>
        onScreen(env, screenX(env, x), screenY(env, y), 150),
      );
      particles.update(dt);
      hitFlash.update(dt);
      turrets.update(dt);
      zaps.update(dt);
      bridges.update(view.trains, dt);

      draw(env, view, dt);
      frameId = requestAnimationFrame(frame);
    };
    frameId = requestAnimationFrame(frame);
  }

  return {
    world: attract,
    stop() {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(frameId);
      if (onResize) window.removeEventListener('resize', onResize);
      surface.dispose();
      canvas.remove();
    },
  };
}
