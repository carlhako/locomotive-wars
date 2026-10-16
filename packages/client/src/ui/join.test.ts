import { describe, expect, it } from 'vitest';
import { loadName, NAME_KEY, saveName } from './join.ts';
import type { KeyValueStorage } from './join.ts';

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  };
}

describe('player name storage', () => {
  it('has no name before one is saved', () => {
    expect(loadName(memoryStorage())).toBe('');
  });

  it('remembers the name across loads', () => {
    const storage = memoryStorage();
    saveName('Casey', storage);
    expect(storage.data.get(NAME_KEY)).toBe('Casey');
    expect(loadName(storage)).toBe('Casey');
  });

  it('survives storage that throws or is missing', () => {
    const broken: KeyValueStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadName(broken)).toBe('');
    expect(() => saveName('Casey', broken)).not.toThrow();
    expect(loadName(null)).toBe('');
    expect(() => saveName('Casey', null)).not.toThrow();
  });
});
