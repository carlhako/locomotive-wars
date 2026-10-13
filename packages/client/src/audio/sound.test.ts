import { describe, expect, it } from 'vitest';
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
