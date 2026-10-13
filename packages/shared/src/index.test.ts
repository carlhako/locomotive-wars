import { describe, expect, it } from 'vitest';
import { GAME_TITLE } from './index.ts';

describe('@lw/shared', () => {
  it('exports the game title', () => {
    expect(GAME_TITLE).toBe('Locomotive Wars');
  });
});
