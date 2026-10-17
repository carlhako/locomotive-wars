/** Longest display name, in characters. */
export const MAX_NAME_LENGTH = 16;

// Control characters, and invisible formatting characters (zero-width, bidirectional overrides)
// that could hide or reorder text in a name shown to other players.
const STRIP = /[\p{Cc}\p{Cf}]/gu;

/**
 * Cleans a player-supplied display name: control characters are removed, runs of whitespace
 * become one space, the result is trimmed and cut to 16 characters. Returns `''` when nothing
 * is left (or the input is not a string).
 */
export function cleanName(raw: unknown): string {
  const text = typeof raw === 'string' ? raw : '';
  const cleaned = text.replace(/\s+/g, ' ').replace(STRIP, '').replace(/\s+/g, ' ').trim();
  return Array.from(cleaned).slice(0, MAX_NAME_LENGTH).join('').trim();
}

/** `cleanName`, except that a name left empty becomes `Player-` and four digits drawn with `random`. */
export function sanitizeName(raw: unknown, random: () => number = Math.random): string {
  const name = cleanName(raw);
  if (name.length > 0) return name;
  const digits = Math.floor(random() * 10000)
    .toString()
    .padStart(4, '0');
  return `Player-${digits}`;
}
