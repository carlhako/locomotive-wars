import { describe, expect, it } from 'vitest';
import type { TrainInput } from '@lw/shared';
import { OfflineSession } from '../offline.ts';
import { DamageNumbers, MAX_DAMAGE_NUMBERS } from './damageNumbers.ts';
import { applyEvents, NameBook } from './eventFx.ts';
import type { FxTargets } from './eventFx.ts';
import { HitFlash } from './hitFlash.ts';
import { MAX_PARTICLES, ParticleSystem, TrainEmitter } from './particles.ts';
import { ScreenShake } from './shake.ts';
import { KillFeed, KILL_FEED_MAX } from '../hud/killfeed.ts';

describe('effects soak', () => {
  it('keeps particle and number counts bounded over two minutes of busy play', () => {
    const session = new OfflineSession({ seed: 2024, bots: 10 });
    const particles = new ParticleSystem(MAX_PARTICLES, session.mapSize);
    const numbers = new DamageNumbers();
    const killFeed = new KillFeed();
    const fx: FxTargets = {
      particles,
      damageNumbers: numbers,
      shake: new ScreenShake(),
      hitFlash: new HitFlash(),
      screenFlash: { show: () => {} },
      killFeed,
      banner: { show: () => {}, popup: () => {} },
      sound: {
        shoot: () => {},
        hit: () => {},
        damage: () => {},
        explosion: () => {},
        pickup: () => {},
        death: () => {},
        bossSpawn: () => {},
        bridgeOn: () => {},
        bridgeOff: () => {},
        zap: () => {},
        mine: () => {},
      },
      turrets: { aim: () => {} },
      zaps: { add: () => {} },
    };
    const emitter = new TrainEmitter();
    const names = new NameBook();

    const frames = 60 * 120;
    const dt = 1 / 60;
    let peakParticles = 0;
    let peakNumbers = 0;
    let peakFeed = 0;
    for (let f = 0; f < frames; f++) {
      const input: TrainInput = {
        turn: Math.sin(f / 90),
        boost: f % 300 < 60,
        brake: false,
        fire: f % 200 < 120,
        aim: f / 40,
      };
      const events = session.advance(dt, input);
      const view = session.view();
      names.observe(view);
      applyEvents(events, { view, names, size: session.mapSize }, fx);
      // Every train counts as visible: the worst case for emission.
      emitter.update(particles, view.trains, dt, () => true);
      particles.update(dt);
      numbers.update(dt);
      killFeed.update(dt);
      peakParticles = Math.max(peakParticles, particles.particles.length);
      peakNumbers = Math.max(peakNumbers, numbers.numbers.length);
      peakFeed = Math.max(peakFeed, killFeed.entries.length);
    }

    expect(peakParticles).toBeGreaterThan(50);
    expect(peakParticles).toBeLessThanOrEqual(MAX_PARTICLES);
    expect(peakNumbers).toBeLessThanOrEqual(MAX_DAMAGE_NUMBERS);
    expect(peakFeed).toBeLessThanOrEqual(KILL_FEED_MAX);
  }, 60_000);

  it('drops the oldest particles first at the cap', () => {
    const system = new ParticleSystem(10);
    for (let i = 0; i < 25; i++) {
      system.emit({ x: i, y: 0, vx: 0, vy: 0, life: 5, color: '#fff', size: 1, type: 'spark' });
    }
    expect(system.particles.length).toBeLessThanOrEqual(10);
    // The newest particle is always kept.
    expect(system.particles.at(-1)?.x).toBe(24);
  });

  it('expires particles by lifetime', () => {
    const system = new ParticleSystem(100);
    system.emit({ x: 0, y: 0, vx: 10, vy: 0, life: 0.3, color: '#fff', size: 1, type: 'smoke' });
    system.update(0.2);
    expect(system.particles).toHaveLength(1);
    system.update(0.2);
    expect(system.particles).toHaveLength(0);
  });
});
