import { mkdir, open, readFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import { compareEntries } from './table.ts';
import type { HighScoreEntry } from './table.ts';

const entrySchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  score: z.number().int().min(0),
  achievedAt: z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'not a date'),
  roundId: z.number().int().min(0),
});

const fileSchema = z.object({
  version: z.literal(1),
  entries: z.array(entrySchema),
});

/** Where the table lives between server runs. */
export interface HighScoreStore {
  /** The saved entries, ranked; empty when there is nothing saved or the file was unusable. */
  load(): Promise<HighScoreEntry[]>;
  /** Replaces the saved table. Saves complete in the order they were requested. */
  save(entries: readonly HighScoreEntry[]): Promise<void>;
}

/** A store that keeps the table in memory only: for tests and servers started without a file. */
export function createMemoryStore(initial: readonly HighScoreEntry[] = []): HighScoreStore {
  let saved = [...initial];
  return {
    load: () => Promise.resolve([...saved].sort(compareEntries)),
    save: (entries) => {
      saved = [...entries];
      return Promise.resolve();
    },
  };
}

export interface FileStoreOptions {
  log?: (message: string) => void;
  /** Time source for the `.corrupt-<timestamp>` name. */
  now?: () => number;
}

/**
 * Keeps the table in a JSON file. A save writes a temporary file, flushes it to disk, renames it
 * over the real one (atomic on one filesystem), then flushes the directory, so a crash leaves
 * either the old complete file or the new one. A file that cannot be read back is set aside as
 * `<file>.corrupt-<timestamp>` and the table starts empty.
 */
export function createFileStore(file: string, opts: FileStoreOptions = {}): HighScoreStore {
  const log = opts.log ?? ((m) => console.error(m));
  const now = opts.now ?? Date.now;
  // Every save waits for the one before it, so two can never write the same temporary file.
  let chain: Promise<void> = Promise.resolve();

  async function setAside(reason: string): Promise<void> {
    const aside = `${file}.corrupt-${now()}`;
    try {
      await rename(file, aside);
      log(
        `error: high score file ${file} is unusable (${reason}); moved to ${aside}, starting empty`,
      );
    } catch (e) {
      log(
        `error: high score file ${file} is unusable (${reason}) and could not be moved: ${errText(e)}`,
      );
    }
  }

  async function load(): Promise<HighScoreEntry[]> {
    await mkdir(dirname(file), { recursive: true });
    let text: string;
    try {
      text = await readFile(file, 'utf8');
    } catch (e) {
      if (isCode(e, 'ENOENT')) return [];
      throw e;
    }
    let parsed: ReturnType<typeof fileSchema.safeParse>;
    try {
      parsed = fileSchema.safeParse(JSON.parse(text));
    } catch (e) {
      await setAside(errText(e));
      return [];
    }
    if (!parsed.success) {
      await setAside(parsed.error.issues[0]?.message ?? 'invalid');
      return [];
    }
    return parsed.data.entries.sort(compareEntries);
  }

  async function write(entries: readonly HighScoreEntry[]): Promise<void> {
    await mkdir(dirname(file), { recursive: true });
    const tmp = `${file}.tmp-${process.pid}`;
    const body = JSON.stringify({ version: 1, entries }, null, 2) + '\n';
    const handle = await open(tmp, 'w');
    try {
      await handle.writeFile(body);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(tmp, file);
    await syncDir(dirname(file));
  }

  return {
    load,
    save(entries) {
      const snapshot = [...entries];
      const next = chain.then(() => write(snapshot));
      // A failed save must not block the ones after it; the caller still sees the failure.
      chain = next.catch(() => {});
      return next;
    },
  };
}

/** Flushes a directory entry to disk. Some platforms cannot open a directory; that is not an error. */
async function syncDir(dir: string): Promise<void> {
  let handle;
  try {
    handle = await open(dir, 'r');
    await handle.sync();
  } catch (e) {
    if (!isCode(e, 'EPERM', 'EISDIR', 'EINVAL', 'ENOTSUP')) throw e;
  } finally {
    await handle?.close();
  }
}

function isCode(e: unknown, ...codes: string[]): boolean {
  return typeof e === 'object' && e !== null && codes.includes((e as { code?: string }).code ?? '');
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
