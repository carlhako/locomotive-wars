import { expect, it } from 'vitest';
import { GAME_TITLE } from '@lw/shared';

it('imports @lw/shared (workspace source resolution)', () => {
  expect(GAME_TITLE).toBe('Locomotive Wars');
});
