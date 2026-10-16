import { describe, expect, it } from 'vitest';
import { MAX_NAME_LENGTH, sanitizeName } from './names.ts';

describe('sanitizeName', () => {
  it('strips control characters, collapses whitespace, and limits to 16 characters', () => {
    expect(sanitizeName('  Iron\u0007   Wolf the Magnificent Engine ')).toBe('Iron Wolf the Ma');
  });

  it('leaves an ordinary name alone', () => {
    expect(sanitizeName('Casey')).toBe('Casey');
  });

  it('treats tabs and newlines as spaces', () => {
    expect(sanitizeName('a\tb\nc')).toBe('a b c');
  });

  it('removes invisible direction and zero-width characters', () => {
    expect(sanitizeName('Bo‮b​!')).toBe('Bob!');
  });

  it('never ends in a space after truncation', () => {
    const name = sanitizeName('fifteen letters x and more');
    expect(name.length).toBeLessThanOrEqual(MAX_NAME_LENGTH);
    expect(name).toBe(name.trim());
  });

  it('does not split a surrogate pair', () => {
    const name = sanitizeName('🚂'.repeat(20));
    expect(Array.from(name)).toHaveLength(MAX_NAME_LENGTH);
  });

  it.each(['', '   ', '\u0007\u0001', '\t\n', undefined, null, 42, {}])(
    'replaces %j with Player- and four digits',
    (raw) => {
      expect(sanitizeName(raw)).toMatch(/^Player-\d{4}$/);
    },
  );

  it('pads the default number to four digits', () => {
    expect(sanitizeName('', () => 0.0042)).toBe('Player-0042');
    expect(sanitizeName('', () => 0.9999)).toBe('Player-9999');
  });
});
