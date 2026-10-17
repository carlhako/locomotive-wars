import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultConfig, loadConfig, loadConfigOrExit, parseConfig } from './config.ts';
import type { ConfigIo, StartupIo } from './config.ts';

function io(files: Record<string, string>, env: Record<string, string> = {}): ConfigIo {
  return {
    env,
    cwd: '/srv/lw',
    exists: (p) => p in files,
    read: (p) => files[p] as string,
  };
}

const CWD_CONFIG = '/srv/lw/config.json';

describe('defaults', () => {
  it('start with no config file and say so', () => {
    const r = loadConfig(io({}));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config).toEqual(defaultConfig());
    expect(r.notes.join('\n')).toMatch(/using default settings/);
    expect(r.config).toMatchObject({
      port: 8080,
      maxPlayers: 16,
      roundLengthSec: 600,
      intermissionSec: 20,
      idleKickSec: 60,
      bots: { fillTo: 12, min: 0, max: 10 },
      maxCarriages: 150,
      tickRate: 30,
      snapshotRate: 15,
      viewRadius: 1600,
    });
  });

  it('parsing config.example.json equals the defaults', () => {
    const url = new URL('../../../config.example.json', import.meta.url);
    const example = JSON.parse(readFileSync(url, 'utf8')) as unknown;
    const r = parseConfig(example);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings).toEqual([]);
    expect(r.config).toEqual(defaultConfig());
    // Every key is spelled out in the example, not left to its default.
    expect(example).toEqual(defaultConfig());
  });
});

describe('partial config', () => {
  it('takes defaults for missing keys', () => {
    const r = parseConfig({ roundLengthSec: 300 });
    expect(r.ok && r.config).toEqual({ ...defaultConfig(), roundLengthSec: 300 });
  });

  it('fills missing bots keys', () => {
    const r = parseConfig({ bots: { fillTo: 8, max: 5 } });
    expect(r.ok && r.config.bots).toEqual({ fillTo: 8, min: 0, max: 5 });
  });
});

describe('validation', () => {
  it('reports every invalid key', () => {
    const r = parseConfig({ maxPlayers: 0, snapshotRate: 7 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => e.startsWith('maxPlayers:'))).toBe(true);
    expect(r.errors.some((e) => e.startsWith('snapshotRate:'))).toBe(true);
  });

  it('rejects wrong types and out-of-range values with key paths', () => {
    const r = parseConfig({ bots: { max: 500 }, tickRate: '30', idleKickSec: 5 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const keys = r.errors.map((e) => e.split(':')[0]);
    expect(keys).toEqual(expect.arrayContaining(['bots.max', 'tickRate', 'idleKickSec']));
  });

  it('accepts idleKickSec 0 and rejects 1 to 19', () => {
    expect(parseConfig({ idleKickSec: 0 }).ok).toBe(true);
    expect(parseConfig({ idleKickSec: 19 }).ok).toBe(false);
    expect(parseConfig({ idleKickSec: 20 }).ok).toBe(true);
  });

  it('requires bots.min <= bots.max', () => {
    const r = parseConfig({ bots: { min: 6, max: 5 } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]).toMatch(/^bots\.min:/);
  });

  it('requires snapshotRate to divide tickRate', () => {
    expect(parseConfig({ tickRate: 30, snapshotRate: 30 }).ok).toBe(true);
    expect(parseConfig({ tickRate: 30, snapshotRate: 7 }).ok).toBe(false);
    expect(parseConfig({ tickRate: 40, snapshotRate: 15 }).ok).toBe(false);
  });

  it('rejects a config that is not an object', () => {
    expect(parseConfig([]).ok).toBe(false);
    expect(parseConfig(null).ok).toBe(false);
  });
});

describe('unknown keys', () => {
  it('warns about a typo and still starts with the default', () => {
    const r = parseConfig({ maxPlayer: 8 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings).toEqual(['unknown config key "maxPlayer" (ignored)']);
    expect(r.config.maxPlayers).toBe(16);
  });

  it('warns about nested keys', () => {
    const r = parseConfig({ bots: { fil: 3 } });
    expect(r.warnings).toEqual(['unknown config key "bots.fil" (ignored)']);
  });
});

describe('file location and environment', () => {
  it('reads ./config.json from the working directory by default', () => {
    const r = loadConfig(io({ [CWD_CONFIG]: '{"maxPlayers": 4}' }));
    expect(r.ok && r.config.maxPlayers).toBe(4);
  });

  it('reads the path in LW_CONFIG', () => {
    const r = loadConfig(
      io({ '/etc/lw/beta.json': '{"maxPlayers": 8}' }, { LW_CONFIG: '/etc/lw/beta.json' }),
    );
    expect(r.ok && r.config.maxPlayers).toBe(8);
  });

  it('lets PORT override the configured port', () => {
    const r = loadConfig(io({ [CWD_CONFIG]: '{"port": 9000}' }, { PORT: '9100' }));
    expect(r.ok && r.config.port).toBe(9100);
  });

  it('rejects an invalid PORT', () => {
    expect(loadConfig(io({}, { PORT: 'abc' })).ok).toBe(false);
    expect(loadConfig(io({}, { PORT: '70000' })).ok).toBe(false);
  });

  it('reports malformed JSON', () => {
    const r = loadConfig(io({ [CWD_CONFIG]: '{nope' }));
    expect(r.ok).toBe(false);
  });
});

describe('startup', () => {
  function startup(files: Record<string, string>) {
    const out: string[] = [];
    const err: string[] = [];
    let code: number | null = null;
    const base = io(files);
    const sio: StartupIo = {
      ...base,
      log: (m) => out.push(m),
      error: (m) => err.push(m),
      exit: (c) => {
        code = c;
        throw new Error('exit');
      },
    };
    return { sio, out, err, code: () => code };
  }

  it('exits non-zero naming both bad keys', () => {
    const s = startup({ [CWD_CONFIG]: '{"maxPlayers": 0, "snapshotRate": 7}' });
    expect(() => loadConfigOrExit(s.sio)).toThrow('exit');
    expect(s.code()).toBe(1);
    const text = s.err.join('\n');
    expect(text).toContain('maxPlayers');
    expect(text).toContain('snapshotRate');
  });

  it('warns on stderr and returns the config for a typo', () => {
    const s = startup({ [CWD_CONFIG]: '{"maxPlayer": 8}' });
    const cfg = loadConfigOrExit(s.sio);
    expect(cfg.maxPlayers).toBe(16);
    expect(s.err.join('\n')).toContain('maxPlayer');
    expect(s.code()).toBeNull();
  });
});
