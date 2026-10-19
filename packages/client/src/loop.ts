import { SoundFX } from './audio/sound.ts';
import { DamageNumbers } from './fx/damageNumbers.ts';
import { applyEvents, NameBook } from './fx/eventFx.ts';
import type { FxTargets } from './fx/eventFx.ts';
import { HitFlash } from './fx/hitFlash.ts';
import { MAX_PARTICLES, ParticleSystem, TrainEmitter } from './fx/particles.ts';
import { ScreenShake } from './fx/shake.ts';
import { TurretMemory } from './fx/turrets.ts';
import { Zaps } from './fx/zaps.ts';
import { Banner, DamageFlash } from './hud/banner.ts';
import { bindMuteButton, Hud } from './hud/hud.ts';
import { KillFeed, KillFeedView } from './hud/killfeed.ts';
import { PickupPopup, PickupPopupView } from './hud/pickupPopup.ts';
import { DomLegendView, Legend } from './hud/legend.ts';
import {
  boardFromView,
  LeaderboardView,
  leaderboardModel,
  localScoreOf,
} from './hud/leaderboard.ts';
import { InputState } from './input.ts';
import { BridgeAnimator } from './render/bridge.ts';
import {
  createCamera,
  followCamera,
  onScreen,
  screenX,
  screenY,
  setupCanvas,
} from './render/canvas.ts';
import type { DrawEnv } from './render/canvas.ts';
import { drawMinimap, MINIMAP_SIZE } from './render/minimap.ts';
import { renderScene } from './render/scene.ts';
import { generateStars } from './render/stars.ts';
import type { GameSource } from './source.ts';
import { RoundOverlay } from './ui/roundOverlay.ts';

/** Longest frame time fed to the game, so a stalled tab does not lurch on return. */
const MAX_FRAME_SECONDS = 0.1;

function el(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing #${id} in index.html`);
  return found;
}

/**
 * The client's presentation loop: each animation frame it reads the player's input, advances
 * the `GameSource`, applies the tick's events to the effects, and draws the resulting
 * `WorldView`. It never touches simulation state, so any source that can produce views and
 * events (offline or networked) drives the same screen.
 */
export class Game {
  private readonly surface = setupCanvas(el('game') as HTMLCanvasElement);
  private readonly minimapCtx: CanvasRenderingContext2D;
  private readonly input = new InputState();
  private readonly sound = new SoundFX();
  private readonly hud = new Hud();
  private readonly leaderboard = new LeaderboardView(el('leaderboard-rows'));
  private readonly legend = new Legend(new DomLegendView(el('legend'), el('legend-rows')));
  private readonly roundOverlay = new RoundOverlay();

  private readonly camera = createCamera();
  private readonly stars = generateStars();
  private readonly particles: ParticleSystem;
  private readonly damageNumbers = new DamageNumbers();
  private readonly hitFlash = new HitFlash();
  private readonly bridges = new BridgeAnimator();
  private readonly turrets = new TurretMemory();
  private readonly zaps = new Zaps();
  private readonly shake = new ScreenShake();
  private readonly emitter = new TrainEmitter();
  private readonly names = new NameBook();
  private readonly killFeed = new KillFeed();
  private readonly killFeedView: KillFeedView;
  private readonly pickupPopup = new PickupPopup();
  private readonly pickupPopupView: PickupPopupView;
  private readonly banner: Banner;
  private readonly damageFlash: DamageFlash;
  private readonly healFlash: DamageFlash;
  private readonly fx: FxTargets;

  private lastTime = 0;
  private lastGeneration = -1;
  private lastSpawnSeq = -1;
  /** The local turrets' aim point in world coordinates, or null before the mouse moves. */
  private aim: { x: number; y: number } | null = null;

  constructor(private readonly source: GameSource) {
    const minimap = el('minimap') as HTMLCanvasElement;
    minimap.width = MINIMAP_SIZE;
    minimap.height = MINIMAP_SIZE;
    const mctx = minimap.getContext('2d');
    if (!mctx) throw new Error('2D canvas context unavailable');
    this.minimapCtx = mctx;

    this.roundOverlay.onSubmitName((name) => source.submitHighScoreName?.(name));
    this.particles = new ParticleSystem(MAX_PARTICLES, source.mapSize);
    this.killFeedView = new KillFeedView(el('killfeed'), this.killFeed);
    this.pickupPopupView = new PickupPopupView(el('pickups'), this.pickupPopup);
    this.banner = new Banner(el('banner'), el('combo'));
    this.damageFlash = new DamageFlash(el('damage-flash'));
    this.healFlash = new DamageFlash(el('heal-flash'));
    this.fx = {
      particles: this.particles,
      damageNumbers: this.damageNumbers,
      shake: this.shake,
      hitFlash: this.hitFlash,
      screenFlash: this.damageFlash,
      healFlash: this.healFlash,
      killFeed: this.killFeed,
      banner: this.banner,
      pickups: this.pickupPopup,
      sound: this.sound,
      turrets: this.turrets,
      zaps: this.zaps,
    };

    bindMuteButton(this.sound.isMuted, (muted) => this.sound.setMuted(muted));
    this.input.onLegendToggle = () => this.legend.toggle();
    this.input.attach(window, () => this.sound.unlock(), this.surface.ctx.canvas);
  }

  start(): void {
    this.lastTime = performance.now();
    requestAnimationFrame(this.frame);
  }

  private readonly frame = (now: number): void => {
    const dt = Math.min(MAX_FRAME_SECONDS, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;
    this.step(dt, now / 1000);
    requestAnimationFrame(this.frame);
  };

  /** Runs one frame. Public so tests and debugging tools can drive it directly. */
  step(dt: number, timeSeconds: number): void {
    const { width, height } = this.surface;
    const size = this.source.mapSize;
    const env: DrawEnv = {
      ctx: this.surface.ctx,
      width,
      height,
      camera: this.camera,
      size,
      time: timeSeconds,
    };

    // Input: aim is measured from where the local head currently is on screen.
    const before = this.source.view();
    const localBefore = before.trains.find((t) => t.id === before.localId);
    const headScreen = localBefore
      ? { x: screenX(env, localBefore.x), y: screenY(env, localBefore.y) }
      : { x: width / 2, y: height / 2 };
    const trainInput = this.input.toTrainInput(headScreen, localBefore?.angle ?? 0);

    const events = this.source.advance(dt, trainInput);
    const view = this.source.view();
    const local = view.trains.find((t) => t.id === view.localId);

    if (this.source.generation !== this.lastGeneration) {
      // A new world replaces the old one: drop stale effects and re-centre.
      this.resetEffects();
      this.lastGeneration = this.source.generation;
      if (local) followCamera(this.camera, local.x, local.y, size, dt, true);
      this.lastSpawnSeq = local?.spawnSeq ?? -1;
    }
    this.names.observe(view);
    if (this.source.knownTrains) {
      for (const t of this.source.knownTrains()) this.names.remember(t.id, t.name, t.color);
    }
    applyEvents(events, { view, names: this.names, size }, this.fx);

    if (local) {
      // A respawn puts the train somewhere new: jump the camera there instead of panning.
      const respawned = local.spawnSeq !== this.lastSpawnSeq;
      this.lastSpawnSeq = local.spawnSeq;
      followCamera(this.camera, local.x, local.y, size, dt, respawned);
    }

    // The camera draws one unit per pixel, so the drawn head plus the offset is under the mouse.
    this.aim =
      this.input.mouse && local
        ? { x: local.x + trainInput.aimX, y: local.y + trainInput.aimY }
        : null;

    this.emitter.update(this.particles, view.trains, dt, (x, y) =>
      onScreen(env, screenX(env, x), screenY(env, y), 150),
    );
    this.particles.update(dt);
    this.damageNumbers.update(dt);
    this.hitFlash.update(dt);
    this.turrets.update(dt);
    this.zaps.update(dt);
    this.bridges.update(view.trains, dt);
    this.shake.update(dt);
    this.killFeed.update(dt);
    this.pickupPopup.update(dt);
    this.banner.update(dt);
    this.damageFlash.update(dt);
    this.healFlash.update(dt);

    this.surface.begin();
    renderScene(
      env,
      view,
      {
        stars: this.stars,
        particles: this.particles,
        damageNumbers: this.damageNumbers,
        hitFlash: this.hitFlash,
        bridges: this.bridges,
        turrets: this.turrets,
        zaps: this.zaps,
      },
      {
        aim: this.aim,
        mouse: this.input.mouse,
        boosting: this.input.boosting,
        firing: this.input.firing,
        shake: this.shake.offset(),
      },
      dt,
    );
    drawMinimap(this.minimapCtx, view, size, { width, height });
    const round = this.source.round?.() ?? null;
    this.hud.update(view, round, this.source.idleWarning?.() ?? null);
    this.legend.render(local?.alive ? local.carriages.map((c) => c.kind) : null);
    this.leaderboard.render(
      leaderboardModel(this.source.board?.() ?? boardFromView(view), localScoreOf(view)),
    );
    this.roundOverlay.update(round, this.source.roundResult?.() ?? null, view.localId, {
      highscores: this.source.highscores?.() ?? null,
      offer: this.source.highScoreOffer?.() ?? null,
    });
    this.killFeedView.render();
    this.pickupPopupView.render();
  }

  private resetEffects(): void {
    this.particles.clear();
    this.damageNumbers.clear();
    this.hitFlash.clear();
    this.turrets.clear();
    this.zaps.clear();
    this.killFeed.clear();
    this.pickupPopup.clear();
    this.names.clear();
  }

  /** Counts of live effects, for tests and the dev console. */
  stats(): { particles: number; damageNumbers: number } {
    return {
      particles: this.particles.particles.length,
      damageNumbers: this.damageNumbers.numbers.length,
    };
  }
}
