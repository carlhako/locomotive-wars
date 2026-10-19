import { describe, expect, it } from 'vitest';
import { viewFromWorld, World } from '@lw/shared';
import { minimapEntries } from './minimap.ts';

function world() {
  const w = new World({
    seed: 4,
    initialTrailers: 0,
    initialEnemies: 0,
    maxTrailers: 0,
    maxEnemies: 0,
    boss: false,
  });
  const me = w.addTrain({ name: 'You', x: 1000, y: 1000 });
  const bot = w.addTrain({ name: 'Bot', controller: 'bot', x: 1300, y: 1000 });
  return { w, me, bot };
}

describe('minimapEntries', () => {
  it('lists every living train while nobody is cloaked', () => {
    const { w, me, bot } = world();
    const ids = minimapEntries(viewFromWorld(w, me.id)).map((e) => e.id);
    expect(ids.sort()).toEqual([me.id, bot.id].sort());
  });

  it('hides a bot that picks up a cloak, but keeps it on the playfield', () => {
    const { w, me, bot } = world();
    w.spawnTrailer(bot.x + 10, bot.y, 'cloak');
    w.step();
    expect(bot.carriages.at(-1)?.kind).toBe('cloak');
    const view = viewFromWorld(w, me.id);
    expect(minimapEntries(view).map((e) => e.id)).toEqual([me.id]);
    expect(view.trains.some((t) => t.id === bot.id)).toBe(true);
  });

  it('always shows the local train, cloaked or not', () => {
    const { w, me } = world();
    w.addCarriage(me.id, 'cloak');
    expect(minimapEntries(viewFromWorld(w, me.id)).map((e) => e.id)).toContain(me.id);
  });
});
