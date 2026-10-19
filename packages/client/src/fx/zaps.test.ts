import { describe, expect, it } from 'vitest';
import { MAX_ZAPS, ZAP_LIFE, Zaps } from './zaps.ts';

describe('Zaps', () => {
  it('fades an arc out within half a second', () => {
    const zaps = new Zaps(() => 0.5);
    zaps.add([
      [0, 0],
      [100, 0],
      [100, 100],
    ]);
    expect(zaps.zaps).toHaveLength(1);
    zaps.update(ZAP_LIFE / 2);
    expect(zaps.zaps).toHaveLength(1);
    zaps.update(ZAP_LIFE / 2 + 0.01);
    expect(zaps.zaps).toHaveLength(0);
    expect(ZAP_LIFE).toBeLessThanOrEqual(0.5);
  });

  it('ignores a chain with no target and keeps a bounded number of arcs', () => {
    const zaps = new Zaps();
    zaps.add([[0, 0]]);
    expect(zaps.zaps).toHaveLength(0);
    for (let i = 0; i < MAX_ZAPS + 10; i++) {
      zaps.add([
        [i, 0],
        [i, 50],
      ]);
    }
    expect(zaps.zaps).toHaveLength(MAX_ZAPS);
    expect(zaps.zaps[0]!.points[0]).toEqual([10, 0]);
  });
});
