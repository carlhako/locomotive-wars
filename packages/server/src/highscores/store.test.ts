import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createFileStore, createMemoryStore } from './store.ts';
import { entryId } from './table.ts';
import type { HighScoreEntry } from './table.ts';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tempFile(...sub: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'lw-hs-'));
  dirs.push(dir);
  return join(dir, ...sub, 'highscores.json');
}

function entry(name: string, score: number, place = 0): HighScoreEntry {
  return {
    id: entryId('run', 1, place),
    name,
    score,
    achievedAt: '2026-10-20T19:04:11.000Z',
    roundId: 1,
  };
}

describe('file store', () => {
  it('starts empty when there is no file, and creates the directory', async () => {
    const file = tempFile('nested', 'data');
    expect(await createFileStore(file).load()).toEqual([]);
    expect(existsSync(join(file, '..'))).toBe(true);
  });

  it('survives a restart', async () => {
    const file = tempFile();
    await createFileStore(file).save([entry('CARL', 64), entry('Ann', 40, 1)]);
    const reloaded = await createFileStore(file).load();
    expect(reloaded.map((e) => [e.name, e.score])).toEqual([
      ['CARL', 64],
      ['Ann', 40],
    ]);
    const onDisk = JSON.parse(readFileSync(file, 'utf8')) as { version: number };
    expect(onDisk.version).toBe(1);
  });

  it('leaves no temporary file behind', async () => {
    const file = tempFile();
    await createFileStore(file).save([entry('CARL', 64)]);
    expect(readdirSync(join(file, '..'))).toEqual(['highscores.json']);
  });

  it('keeps saves in the order they were requested', async () => {
    const file = tempFile();
    const store = createFileStore(file);
    const saves = [];
    for (let i = 1; i <= 20; i++) saves.push(store.save([entry('CARL', i)]));
    await Promise.all(saves);
    expect((await createFileStore(file).load())[0]?.score).toBe(20);
  });

  it('keeps working after a save fails', async () => {
    const file = tempFile();
    const store = createFileStore(file);
    // A directory where the temporary file must go makes the first save fail.
    const tmp = `${file}.tmp-${process.pid}`;
    mkdirSync(tmp, { recursive: true });
    await expect(store.save([entry('A', 1)])).rejects.toThrow();
    rmSync(tmp, { recursive: true });
    await store.save([entry('B', 2)]);
    expect((await store.load())[0]?.name).toBe('B');
  });

  describe('corrupt file', () => {
    async function recover(content: string) {
      const file = tempFile();
      const logs: string[] = [];
      const store = createFileStore(file, { log: (m) => logs.push(m), now: () => 1234 });
      // The directory exists once a first load has run.
      await store.load();
      writeFileSync(file, content);
      const entries = await store.load();
      return { file, logs, entries };
    }

    it('is set aside and the table starts empty for invalid JSON', async () => {
      const { file, logs, entries } = await recover('{not json');
      expect(entries).toEqual([]);
      expect(existsSync(file)).toBe(false);
      expect(readFileSync(`${file}.corrupt-1234`, 'utf8')).toBe('{not json');
      expect(logs.join('\n')).toMatch(/error:.*corrupt-1234/);
    });

    it('is set aside when it fails validation', async () => {
      const bad = JSON.stringify({ version: 1, entries: [{ id: 'x', name: 'A', score: -5 }] });
      const { file, entries } = await recover(bad);
      expect(entries).toEqual([]);
      expect(existsSync(`${file}.corrupt-1234`)).toBe(true);
    });

    it('is set aside for an unknown version', async () => {
      const { file, entries } = await recover(JSON.stringify({ version: 2, entries: [] }));
      expect(entries).toEqual([]);
      expect(existsSync(`${file}.corrupt-1234`)).toBe(true);
    });

    it('can be written again afterwards', async () => {
      const { file } = await recover('garbage');
      const store = createFileStore(file);
      await store.save([entry('CARL', 9)]);
      expect((await store.load())[0]?.name).toBe('CARL');
    });
  });

  it('is always the old or the new complete table when the process is killed mid-save', async () => {
    const file = tempFile();
    const storeUrl = new URL('./store.ts', import.meta.url).href;
    // Saves bigger and bigger tables forever, saying so after each completed one.
    const child = `
      import { createFileStore } from ${JSON.stringify(storeUrl)};
      const store = createFileStore(process.argv[1]);
      const rows = (n) => Array.from({ length: 800 }, (_, i) => ({
        id: 'run-r1-' + i, name: 'gen' + n, score: 1000 - i, achievedAt: '2026-10-20T19:04:11.000Z', roundId: 1,
      }));
      for (let n = 1; ; n++) {
        await store.save(rows(n));
        console.log('saved ' + n);
      }
    `;
    const kills = 6;
    for (let k = 0; k < kills; k++) {
      const proc = spawn(process.execPath, ['--input-type=module', '-e', child, file], {
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      let saved = 0;
      await new Promise<void>((resolve, reject) => {
        proc.once('error', reject);
        proc.stdout.on('data', (chunk: Buffer) => {
          saved = Number(String(chunk).trim().split('\n').pop()?.replace('saved ', ''));
          // Let a few saves complete, then kill while the next is in flight.
          if (saved >= 3 + k) {
            setTimeout(() => proc.kill('SIGKILL'), k * 2);
          }
        });
        proc.once('exit', () => resolve());
      });
      expect(saved).toBeGreaterThanOrEqual(3);

      const text = readFileSync(file, 'utf8');
      const parsed = JSON.parse(text) as { entries: HighScoreEntry[] };
      expect(parsed.entries).toHaveLength(800);
      const generations = new Set(parsed.entries.map((e) => e.name));
      expect(generations.size).toBe(1);
      const names = [...generations];
      expect(names[0]).toMatch(/^gen\d+$/);
      expect(readdirSync(join(file, '..')).some((f) => f.includes('.corrupt-'))).toBe(false);
    }
  }, 30_000);
});

describe('memory store', () => {
  it('round-trips and ranks', async () => {
    const store = createMemoryStore();
    await store.save([entry('Low', 5, 1), entry('High', 50, 0)]);
    expect((await store.load()).map((e) => e.name)).toEqual(['High', 'Low']);
  });
});
