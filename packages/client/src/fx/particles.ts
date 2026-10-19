import { wrapPos } from '@lw/shared';
import type { TrainView } from '@lw/shared';
import type { DrawEnv } from '../render/canvas.ts';
import { onScreen, screenX, screenY } from '../render/canvas.ts';
import { traceHeart } from '../render/hearts.ts';

/**
 * Client-side particles. They are purely cosmetic and use `Math.random`; nothing here can
 * influence the simulation, which keeps the shared rules deterministic.
 */

export type ParticleType = 'smoke' | 'heat' | 'spark' | 'heart';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Seconds remaining. */
  life: number;
  color: string;
  size: number;
  type: ParticleType;
}

/** Hard cap on live particles so a long session in a busy world stays cheap. */
export const MAX_PARTICLES = 1500;
/** When the cap is hit, this many of the oldest particles are dropped at once. */
const TRIM_BATCH = 100;

export type Rand = () => number;

function between(rand: Rand, min: number, max: number): number {
  return rand() * (max - min) + min;
}

export interface ParticleSink {
  emit(p: Particle): void;
}

export class ParticleSystem implements ParticleSink {
  readonly particles: Particle[] = [];

  constructor(
    readonly max: number = MAX_PARTICLES,
    private readonly worldSize: number = 0,
  ) {}

  emit(p: Particle): void {
    if (this.particles.length >= this.max) {
      this.particles.splice(0, Math.min(TRIM_BATCH, this.particles.length));
    }
    this.particles.push(p);
  }

  clear(): void {
    this.particles.length = 0;
  }

  /** Moves particles, applies drag (the reference's 0.93 per 1/60 s), and removes dead ones. */
  update(dt: number): void {
    const drag = Math.pow(0.93, dt * 60);
    const list = this.particles;
    let w = 0;
    for (let r = 0; r < list.length; r++) {
      const p = list[r] as Particle;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= drag;
      p.vy *= drag;
      p.life -= dt;
      if (p.life <= 0) continue;
      if (this.worldSize > 0) {
        p.x = wrapPos(p.x, this.worldSize);
        p.y = wrapPos(p.y, this.worldSize);
      }
      list[w++] = p;
    }
    list.length = w;
  }

  draw(env: DrawEnv): void {
    const { ctx } = env;
    for (const p of this.particles) {
      const px = screenX(env, p.x);
      const py = screenY(env, p.y);
      if (!onScreen(env, px, py, 10)) continue;
      if (p.type === 'heat') {
        ctx.globalAlpha = Math.min(1, Math.max(0, p.life * 1.2)) * 0.4;
        const r = (1 - p.life / 0.7) * 8 + p.size;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === 'heart') {
        ctx.globalAlpha = Math.min(1, Math.max(0, p.life * 1.5));
        ctx.fillStyle = p.color;
        traceHeart(ctx, px, py, p.size);
        ctx.fill();
      } else {
        const k = p.type === 'spark' ? 2.5 : 1.5;
        ctx.globalAlpha = Math.min(1, Math.max(0, p.life * k));
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(px, py, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}

// ===== One-shot effects =====

export interface BurstOptions {
  count: number;
  speed: [number, number];
  life: number | [number, number];
  color: string | readonly string[];
  size: [number, number];
  type: ParticleType;
  /** Random offset applied to each particle's start position. */
  jitter?: number;
}

/** Radial burst of particles from a point. */
export function burst(
  sink: ParticleSink,
  x: number,
  y: number,
  o: BurstOptions,
  rand: Rand = Math.random,
): void {
  for (let i = 0; i < o.count; i++) {
    const a = rand() * Math.PI * 2;
    const s = between(rand, o.speed[0], o.speed[1]);
    const life = typeof o.life === 'number' ? o.life : between(rand, o.life[0], o.life[1]);
    const color =
      typeof o.color === 'string'
        ? o.color
        : (o.color[Math.floor(rand() * o.color.length)] as string);
    const j = o.jitter ?? 0;
    sink.emit({
      x: x + (j ? between(rand, -j, j) : 0),
      y: y + (j ? between(rand, -j, j) : 0),
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life,
      color,
      size: between(rand, o.size[0], o.size[1]),
      type: o.type,
    });
  }
}

/** A few sparks thrown forward from a muzzle. */
export function muzzleSparks(
  sink: ParticleSink,
  x: number,
  y: number,
  angle: number,
  color: string,
  rand: Rand = Math.random,
): void {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  for (let i = 0; i < 3; i++) {
    sink.emit({
      x,
      y,
      vx: dx * between(rand, 80, 200) + between(rand, -50, 50),
      vy: dy * between(rand, 80, 200) + between(rand, -50, 50),
      life: 0.2,
      color,
      size: between(rand, 2, 4),
      type: 'spark',
    });
  }
}

// ===== Ambient train effects =====

interface TrainTimers {
  heat: number;
  spark: number;
}

/**
 * Emits the smoke, heat shimmer, sparks and boost trail that surround running trains, derived
 * from the view alone. Only trains passing `visible` emit, which keeps the load bounded when
 * many trains are far off screen.
 */
export class TrainEmitter {
  private readonly timers = new Map<number, TrainTimers>();

  constructor(private readonly rand: Rand = Math.random) {}

  update(
    sink: ParticleSink,
    trains: readonly TrainView[],
    dt: number,
    visible: (x: number, y: number) => boolean,
  ): void {
    const rand = this.rand;
    const seen = new Set<number>();
    for (const t of trains) {
      seen.add(t.id);
      if (!t.alive) continue;
      let timers = this.timers.get(t.id);
      if (!timers) {
        timers = { heat: rand() * 0.12, spark: between(rand, 0.3, 1.2) };
        this.timers.set(t.id, timers);
      }
      timers.heat -= dt;
      timers.spark -= dt;
      if (!visible(t.x, t.y)) {
        // Keep the timers from banking up a burst for when the train comes back into view.
        timers.heat = Math.max(timers.heat, 0);
        timers.spark = Math.max(timers.spark, 0);
        continue;
      }
      const bx = Math.cos(t.angle + Math.PI);
      const by = Math.sin(t.angle + Math.PI);

      if (t.boosting) {
        // Reference emitted two puffs per 60 Hz frame while boosting.
        const puffs = Math.max(1, Math.round(dt * 60)) * 2;
        for (let i = 0; i < puffs; i++) {
          sink.emit({
            x: t.x + bx * -14 + between(rand, -3, 3),
            y: t.y + by * -14 + between(rand, -3, 3),
            vx: between(rand, -20, 20),
            vy: between(rand, -20, 20),
            life: 0.6,
            color: i % 2 ? '#aaaaaa' : '#ff8800',
            size: between(rand, 3, 6),
            type: 'smoke',
          });
        }
      }
      if (rand() < Math.min(1, dt * 18)) {
        sink.emit({
          x: t.x + bx * -10 + between(rand, -2, 2),
          y: t.y + by * -10 + between(rand, -2, 2),
          vx: between(rand, -10, 10),
          vy: between(rand, -10, 10),
          life: 0.4,
          color: '#888888',
          size: between(rand, 2, 4),
          type: 'smoke',
        });
      }
      if (timers.heat <= 0) {
        timers.heat = 0.12;
        sink.emit({
          x: t.x + bx * -10 + between(rand, -3, 3),
          y: t.y + by * -10 + between(rand, -3, 3),
          vx: between(rand, -15, 15),
          vy: between(rand, -60, -30),
          life: 0.7,
          color: 'rgba(255,180,100,0.5)',
          size: between(rand, 3, 6),
          type: 'heat',
        });
      }
      if (timers.spark <= 0 && t.carriages.length > 1) {
        timers.spark = between(rand, 0.3, 1.2);
        const c = t.carriages[Math.floor(rand() * t.carriages.length)];
        if (c) {
          sink.emit({
            x: c.x + between(rand, -4, 4),
            y: c.y + between(rand, -4, 4),
            vx: between(rand, -80, 80),
            vy: between(rand, -80, 80),
            life: 0.3,
            color: '#ffff88',
            size: between(rand, 1, 2),
            type: 'spark',
          });
        }
      }
    }
    for (const id of this.timers.keys()) {
      if (!seen.has(id)) this.timers.delete(id);
    }
  }
}
