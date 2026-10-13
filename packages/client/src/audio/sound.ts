import type { ProjectileKind } from '@lw/shared';

/** What the effects layer asks of the audio system; tests substitute a recording fake. */
export interface SoundPlayer {
  shoot(kind: ProjectileKind): void;
  hit(): void;
  damage(): void;
  explosion(big: boolean): void;
  pickup(): void;
  death(): void;
  bossSpawn(): void;
  bridgeOn(): void;
  bridgeOff(): void;
}

// ===== Mute persistence =====

/** localStorage key holding "1" when the player has muted sound. */
export const MUTE_KEY = 'lw.muted';

export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): KeyValueStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Accessing localStorage can throw when site data is blocked.
    return null;
  }
}

/** Reads the saved mute choice; any failure falls back to unmuted. */
export function loadMuted(storage: KeyValueStorage | null = defaultStorage()): boolean {
  try {
    return storage?.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Saves the mute choice, ignoring storage that is blocked or full. */
export function saveMuted(
  muted: boolean,
  storage: KeyValueStorage | null = defaultStorage(),
): void {
  try {
    storage?.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // Not persisting is fine; the choice still applies for this page load.
  }
}

// ===== Procedural sounds (reference SoundFX, lines 305-399) =====

const MASTER_VOLUME = 0.32;

/** Minimum gap between plays of the same sound, so a crowded world cannot flood the mixer. */
const MIN_GAP_MS: Record<string, number> = {
  shoot: 45,
  hit: 40,
  damage: 80,
  explosion: 90,
  pickup: 60,
};

export class SoundFX implements SoundPlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private unavailable = false;
  private muted: boolean;
  private readonly lastPlayed = new Map<string, number>();

  constructor(private readonly storage: KeyValueStorage | null = defaultStorage()) {
    this.muted = loadMuted(storage);
  }

  get isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    saveMuted(muted, this.storage);
    if (this.master) this.master.gain.value = muted ? 0 : MASTER_VOLUME;
  }

  /**
   * Creates the audio context. Browsers only allow this after a user gesture, so call it from
   * an input handler; it is safe to call repeatedly.
   */
  unlock(): void {
    if (this.unavailable) return;
    if (!this.ctx) {
      try {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) throw new Error('WebAudio unavailable');
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : MASTER_VOLUME;
        this.master.connect(this.ctx.destination);
      } catch {
        this.unavailable = true;
        return;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private ready(key?: string): boolean {
    if (!this.ctx || !this.master || this.muted) return false;
    if (key) {
      const gap = MIN_GAP_MS[key];
      if (gap !== undefined) {
        const now = performance.now();
        if (now - (this.lastPlayed.get(key) ?? -Infinity) < gap) return false;
        this.lastPlayed.set(key, now);
      }
    }
    return true;
  }

  private later(ms: number, fn: () => void): void {
    setTimeout(() => {
      if (!this.muted) fn();
    }, ms);
  }

  blip(freq: number, dur: number, vol: number, type: OscillatorType = 'square', slide = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.01);
  }

  noise(dur: number, vol: number, filterFreq = 2000, q = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted) return;
    const sr = ctx.sampleRate;
    const buf = ctx.createBuffer(1, Math.floor(sr * dur), sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = filterFreq;
    filt.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(filt).connect(g).connect(this.master);
    src.start();
  }

  shoot(kind: ProjectileKind): void {
    if (!this.ready('shoot')) return;
    if (kind === 'missile') {
      this.blip(180, 0.18, 0.18, 'sawtooth', -100);
      this.noise(0.1, 0.1, 1500);
    } else if (kind === 'laser') {
      this.blip(900, 0.08, 0.1, 'square', -400);
      this.noise(0.06, 0.1, 4000);
    } else if (kind === 'drone') {
      this.blip(1200, 0.05, 0.06, 'square', -400);
    } else {
      this.noise(0.06, 0.18, 3500);
      this.blip(220, 0.04, 0.08, 'square', -80);
    }
  }

  hit(): void {
    if (!this.ready('hit')) return;
    this.blip(180, 0.06, 0.12, 'square', -80);
    this.noise(0.05, 0.1, 1500);
  }

  damage(): void {
    if (!this.ready('damage')) return;
    this.blip(180, 0.12, 0.25, 'sawtooth', -60);
    this.noise(0.1, 0.18, 1200);
  }

  explosion(big: boolean): void {
    if (!this.ready('explosion')) return;
    const v = big ? 0.5 : 0.3;
    this.noise(0.6, v, 700);
    this.blip(60, 0.45, v * 0.7, 'sine', -30);
    if (big) this.blip(40, 0.8, v * 0.5, 'sine', 10);
  }

  pickup(): void {
    if (!this.ready('pickup')) return;
    this.blip(523, 0.05, 0.18, 'sine', 300);
    this.later(50, () => this.blip(784, 0.07, 0.16, 'sine', 250));
  }

  death(): void {
    if (!this.ready()) return;
    for (let i = 0; i < 5; i++) {
      this.later(i * 150, () => {
        this.blip(80 + i * 15, 0.45, 0.28, 'sawtooth', -25);
        this.noise(0.45, 0.25 - i * 0.04, 500);
      });
    }
  }

  bossSpawn(): void {
    if (!this.ready()) return;
    for (let i = 0; i < 6; i++) {
      this.later(i * 100, () => this.blip(120 + i * 20, 0.3, 0.3, 'sawtooth', -20));
    }
  }

  bridgeOn(): void {
    if (!this.ready()) return;
    this.blip(880, 0.07, 0.14, 'sine', 250);
    this.later(50, () => this.blip(1320, 0.09, 0.12, 'sine', -200));
  }

  bridgeOff(): void {
    if (!this.ready()) return;
    this.blip(440, 0.06, 0.1, 'sine', -200);
  }
}
