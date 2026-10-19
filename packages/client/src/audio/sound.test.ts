import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadMuted, MUTE_KEY, saveMuted, SoundFX } from './sound.ts';
import type { KeyValueStorage } from './sound.ts';

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
  };
}

const blocked: KeyValueStorage = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
};

describe('mute persistence', () => {
  it('defaults to unmuted with nothing saved', () => {
    expect(loadMuted(memoryStorage())).toBe(false);
  });

  it('round-trips the choice', () => {
    const storage = memoryStorage();
    saveMuted(true, storage);
    expect(storage.data.get(MUTE_KEY)).toBe('1');
    expect(loadMuted(storage)).toBe(true);
    saveMuted(false, storage);
    expect(loadMuted(storage)).toBe(false);
  });

  it('falls back to unmuted when storage is blocked', () => {
    expect(loadMuted(blocked)).toBe(false);
    expect(() => saveMuted(true, blocked)).not.toThrow();
    expect(loadMuted(null)).toBe(false);
    expect(() => saveMuted(true, null)).not.toThrow();
  });

  it('survives a reload: a new SoundFX reads what the old one saved', () => {
    const storage = memoryStorage();
    const first = new SoundFX(storage);
    expect(first.isMuted).toBe(false);
    first.setMuted(true);

    const afterReload = new SoundFX(storage);
    expect(afterReload.isMuted).toBe(true);
  });

  it('still mutes for the session when storage is blocked', () => {
    const fx = new SoundFX(blocked);
    fx.setMuted(true);
    expect(fx.isMuted).toBe(true);
  });

  it('plays nothing before the audio context is unlocked', () => {
    const fx = new SoundFX(memoryStorage());
    expect(() => {
      fx.shoot('bullet');
      fx.explosion(true);
      fx.death();
      fx.bossSpawn();
    }).not.toThrow();
  });
});

/** Just enough of WebAudio to count the voices each sound starts. */
class FakeAudioContext {
  static started = 0;
  currentTime = 0;
  sampleRate = 8000;
  state = 'running';
  destination = {};
  private node(extra: object = {}) {
    const param = () => ({
      value: 0,
      setValueAtTime: () => {},
      exponentialRampToValueAtTime: () => {},
    });
    return {
      gain: param(),
      frequency: param(),
      Q: param(),
      connect: (next: unknown) => next,
      start: () => {
        FakeAudioContext.started += 1;
      },
      stop: () => {},
      ...extra,
    };
  }
  createGain() {
    return this.node();
  }
  createOscillator() {
    return this.node();
  }
  createBiquadFilter() {
    return this.node();
  }
  createBufferSource() {
    return this.node();
  }
  createBuffer(_channels: number, length: number) {
    return { getChannelData: () => new Float32Array(length) };
  }
  resume() {
    return Promise.resolve();
  }
}

describe('rate limits', () => {
  function unlocked(): SoundFX {
    vi.stubGlobal('window', { AudioContext: FakeAudioContext });
    const fx = new SoundFX(memoryStorage());
    fx.unlock();
    FakeAudioContext.started = 0;
    return fx;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it.each([
    ['zap', 70],
    ['mine', 90],
  ] as const)('plays %s at most once per %d ms', (name, gap) => {
    vi.useFakeTimers();
    const fx = unlocked();
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    fx[name]();
    vi.runAllTimers();
    const once = FakeAudioContext.started;
    expect(once).toBeGreaterThan(0);
    now += gap - 1;
    fx[name]();
    vi.runAllTimers();
    expect(FakeAudioContext.started).toBe(once);
    now += 2;
    fx[name]();
    vi.runAllTimers();
    expect(FakeAudioContext.started).toBe(once * 2);
  });

  it('gives flak its own shot sound, sharing the shot rate limit', () => {
    const fx = unlocked();
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    fx.shoot('flak');
    expect(FakeAudioContext.started).toBeGreaterThan(0);
    const after = FakeAudioContext.started;
    fx.shoot('bullet');
    expect(FakeAudioContext.started).toBe(after);
    now += 100;
    fx.shoot('bullet');
    expect(FakeAudioContext.started).toBeGreaterThan(after);
  });

  it('is silent while muted', () => {
    const fx = unlocked();
    fx.setMuted(true);
    fx.zap();
    fx.mine();
    fx.shoot('flak');
    expect(FakeAudioContext.started).toBe(0);
  });
});
