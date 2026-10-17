import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { GameServer } from './server.ts';
import { createFileStore, createMemoryStore } from './highscores/store.ts';
import type { HighScoreStore } from './highscores/store.ts';
import { entryId } from './highscores/table.ts';
import type { HighScoreEntry } from './highscores/table.ts';
import { sleep, startServer, TestClient } from './testing.ts';

/**
 * Integration tests for the all-time high score table, run like the lifecycle tests: the real
 * server over WebSocket with its tick driven by hand so a 30-second round takes milliseconds.
 */

let server: GameServer | null = null;
const clients: TestClient[] = [];
const dirs: string[] = [];

afterEach(async () => {
  for (const c of clients.splice(0)) c.close();
  await server?.close();
  server = null;
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const EMPTY_WORLD = {
  initialTrailers: 0,
  initialEnemies: 0,
  maxTrailers: 0,
  maxEnemies: 0,
  boss: false,
};
const SECOND = 30;
const ROUND = { roundLengthSec: 30, intermissionSec: 5 };

function tempFile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'lw-hs-int-'));
  dirs.push(dir);
  return join(dir, 'data', 'highscores.json');
}

async function start(store: HighScoreStore, config: Record<string, unknown> = {}): Promise<number> {
  const started = await startServer({
    config: { bots: { fillTo: 0 }, ...ROUND, ...config },
    world: EMPTY_WORLD,
    highscoreStore: store,
  });
  server = started.server;
  server.loop.stop();
  return started.port;
}

async function joinAs(port: number, name: string): Promise<TestClient> {
  const c = await TestClient.join(port, name);
  clients.push(c);
  return c;
}

async function ticks(n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    server!.tick();
    if (i % 20 === 19) await new Promise((r) => setImmediate(r));
  }
  await sleep(30);
}

/** Plays out a round and waits until everyone has the resulting table. */
async function endRound(...players: TestClient[]): Promise<void> {
  const before = players.map((p) => p.of('highscores').length);
  await ticks(30 * SECOND);
  for (const [i, p] of players.entries()) {
    await p.waitFor(() => p.of('highscores').length > before[i]!);
  }
}

function table(c: TestClient): Array<[string, number]> {
  const msg = c.of('highscores').at(-1)!;
  return msg.entries.map((e) => [e[1], e[2]]);
}

function onDisk(file: string): Array<[string, number]> {
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as { entries: HighScoreEntry[] };
  return parsed.entries.map((e) => [e.name, e.score]);
}

async function api(port: number) {
  const res = await fetch(`http://127.0.0.1:${port}/api/highscores`);
  return { res, body: (await res.json()) as { entries: unknown[] } };
}

function seeded(...scores: number[]): HighScoreEntry[] {
  return scores.map((score, i) => ({
    id: entryId('old', 1, i),
    name: `Old${score}`,
    score,
    achievedAt: '2026-01-01T00:00:00.000Z',
    roundId: 1,
  }));
}

describe('round end', () => {
  it('saves a qualifying result under the join name and tells the player', async () => {
    const file = tempFile();
    const port = await start(createFileStore(file));
    const c = await joinAs(port, 'Casey');
    server!.world.addCarriage(c.id, 'armor');
    server!.world.addCarriage(c.id, 'armor');
    await endRound(c);

    const eligible = c.of('hsEligible');
    expect(eligible).toHaveLength(1);
    expect(eligible[0]).toMatchObject({ rank: 1, score: 3 });
    expect(eligible[0]!.token).toMatch(/^[0-9a-f-]{36}$/);
    expect(onDisk(file)).toEqual([['Casey', 3]]);

    const msg = c.of('highscores').at(-1)!;
    expect(msg.entries.map((e) => e[1])).toEqual(['Casey']);
    expect(msg.highlightIds).toEqual([msg.entries[0]![0]]);
  });

  it('inserts two qualifiers at their ranks and tells each their own rank', async () => {
    const port = await start(createMemoryStore());
    const a = await joinAs(port, 'Alpha');
    const b = await joinAs(port, 'Bravo');
    for (let i = 0; i < 4; i++) server!.world.addCarriage(a.id, 'armor');
    for (let i = 0; i < 8; i++) server!.world.addCarriage(b.id, 'armor');
    await endRound(a, b);
    expect(table(a)).toEqual([
      ['Bravo', 9],
      ['Alpha', 5],
    ]);
    expect(a.of('hsEligible')[0]).toMatchObject({ rank: 2, score: 5 });
    expect(b.of('hsEligible')[0]).toMatchObject({ rank: 1, score: 9 });
    expect(a.of('hsEligible')[0]!.token).not.toBe(b.of('hsEligible')[0]!.token);
  });

  it('still shows the table, with no highlight, to a player who does not qualify', async () => {
    const port = await start(createMemoryStore(seeded(50, 40, 30)), {
      highscores: { size: 3 },
    });
    const c = await joinAs(port, 'Casey');
    await endRound(c);
    expect(c.of('hsEligible')).toHaveLength(0);
    expect(table(c).map((r) => r[0])).toEqual(['Old50', 'Old40', 'Old30']);
    expect(c.of('highscores').at(-1)!.highlightIds).toEqual([]);
  });

  it('lets a result beat the lowest entry, which drops off', async () => {
    const port = await start(createMemoryStore(seeded(50, 40, 1)), { highscores: { size: 3 } });
    const c = await joinAs(port, 'Casey');
    server!.world.addCarriage(c.id, 'armor');
    await endRound(c);
    expect(table(c)).toEqual([
      ['Old50', 50],
      ['Old40', 40],
      ['Casey', 2],
    ]);
  });

  it('never enters a bot', async () => {
    const port = await start(createMemoryStore(), { bots: { fillTo: 3, min: 3, max: 3 } });
    const c = await joinAs(port, 'Casey');
    for (const t of server!.world.state.trains) {
      if (t.controller === 'bot')
        for (let i = 0; i < 5; i++) server!.world.addCarriage(t.id, 'armor');
    }
    await endRound(c);
    expect(table(c)).toEqual([['Casey', 1]]);
    expect(server!.world.state.trains.filter((t) => t.controller === 'bot').length).toBeGreaterThan(
      0,
    );
  });
});

describe('naming an entry', () => {
  it('renames the entry for everyone and saves it', async () => {
    const file = tempFile();
    const port = await start(createFileStore(file));
    const a = await joinAs(port, 'Alpha');
    const b = await joinAs(port, 'Bravo');
    server!.world.addCarriage(a.id, 'armor');
    await endRound(a, b);

    const before = b.of('highscores').length;
    a.send({ t: 'hsName', token: a.of('hsEligible')[0]!.token, name: '  CARL  ' });
    await a.waitFor(() => a.of('hsResult').length > 0);
    expect(a.of('hsResult')[0]).toEqual({ t: 'hsResult', ok: true });
    await b.waitFor(() => b.of('highscores').length > before);
    expect(table(b)[0]).toEqual(['CARL', 2]);
    expect(table(a)[0]).toEqual(['CARL', 2]);
    expect(onDisk(file).map((r) => r[0])).toContain('CARL');
    // The new entry stays highlighted.
    expect(b.of('highscores').at(-1)!.highlightIds).toHaveLength(2);
  });

  it('sanitises the name like a join name', async () => {
    const port = await start(createMemoryStore());
    const c = await joinAs(port, 'Casey');
    await endRound(c);
    c.send({
      t: 'hsName',
      token: c.of('hsEligible')[0]!.token,
      name: 'Iron\u0007   Wolf the Magnificent Engine',
    });
    await c.waitFor(() => c.of('hsResult').length > 0);
    expect(table(c)[0]![0]).toBe('Iron Wolf the Ma');
  });

  it('keeps the join name when the submitted name is empty after sanitising', async () => {
    const port = await start(createMemoryStore());
    const c = await joinAs(port, 'Casey');
    await endRound(c);
    c.send({ t: 'hsName', token: c.of('hsEligible')[0]!.token, name: ' ​ ' });
    await c.waitFor(() => c.of('hsResult').length > 0);
    expect(c.of('hsResult')[0]).toEqual({ t: 'hsResult', ok: true });
    expect(table(c)[0]![0]).toBe('Casey');
  });

  it('keeps the join name when the prompt is ignored or the player leaves', async () => {
    const file = tempFile();
    const port = await start(createFileStore(file));
    const a = await joinAs(port, 'Ignorer');
    const b = await joinAs(port, 'Leaver');
    await endRound(a, b);
    b.close();
    await sleep(50);
    await ticks(5 * SECOND);
    await a.waitFor(() => a.of('round').some((r) => r.roundId === 2));
    expect(
      onDisk(file)
        .map((r) => r[0])
        .sort(),
    ).toEqual(['Ignorer', 'Leaver']);
  });

  it('rejects a token the client was not issued, leaving the table unchanged', async () => {
    const port = await start(createMemoryStore());
    const c = await joinAs(port, 'Casey');
    await endRound(c);
    c.send({ t: 'hsName', token: '00000000-0000-4000-8000-000000000000', name: 'HACKER' });
    await c.waitFor(() => c.of('hsResult').length > 0);
    expect(c.of('hsResult')[0]).toEqual({ t: 'hsResult', ok: false, reason: 'invalid' });
    expect(table(c)[0]![0]).toBe('Casey');
  });

  it("rejects another session's token without using it up", async () => {
    const port = await start(createMemoryStore());
    const a = await joinAs(port, 'Alpha');
    const b = await joinAs(port, 'Bravo');
    await endRound(a, b);
    b.send({ t: 'hsName', token: a.of('hsEligible')[0]!.token, name: 'STOLEN' });
    await b.waitFor(() => b.of('hsResult').length > 0);
    expect(b.of('hsResult')[0]).toEqual({ t: 'hsResult', ok: false, reason: 'invalid' });
    expect(
      table(a)
        .map((r) => r[0])
        .sort(),
    ).toEqual(['Alpha', 'Bravo']);
    // The rightful owner can still use it.
    a.send({ t: 'hsName', token: a.of('hsEligible')[0]!.token, name: 'Mine' });
    await a.waitFor(() => a.of('hsResult').length > 0);
    expect(a.of('hsResult')[0]).toEqual({ t: 'hsResult', ok: true });
  });

  it('rejects a second submission with the same token', async () => {
    const port = await start(createMemoryStore());
    const c = await joinAs(port, 'Casey');
    await endRound(c);
    const token = c.of('hsEligible')[0]!.token;
    c.send({ t: 'hsName', token, name: 'First' });
    await c.waitFor(() => c.of('hsResult').length > 0);
    c.send({ t: 'hsName', token, name: 'Second' });
    await c.waitFor(() => c.of('hsResult').length > 1);
    expect(c.of('hsResult')[1]).toEqual({ t: 'hsResult', ok: false, reason: 'used' });
    expect(table(c)[0]![0]).toBe('First');
  });

  it('rejects a token once the next round has started', async () => {
    const port = await start(createMemoryStore());
    const c = await joinAs(port, 'Casey');
    await endRound(c);
    const token = c.of('hsEligible')[0]!.token;
    await ticks(5 * SECOND);
    await c.waitFor(() => c.of('round').some((r) => r.roundId === 2));
    c.send({ t: 'hsName', token, name: 'TooLate' });
    await c.waitFor(() => c.of('hsResult').length > 0);
    expect(c.of('hsResult')[0]).toEqual({ t: 'hsResult', ok: false, reason: 'expired' });
    expect(table(c)[0]![0]).toBe('Casey');
  });

  it('refuses hsName from a client that has not joined', async () => {
    const port = await start(createMemoryStore());
    const raw = await TestClient.connect(port);
    clients.push(raw);
    raw.send({ t: 'hsName', token: 'abc', name: 'x' });
    await sleep(50);
    expect(raw.of('hsResult')).toHaveLength(0);
  });
});

describe('persistence and the join screen', () => {
  it('serves the ranked table at /api/highscores with no caching', async () => {
    const port = await start(createMemoryStore(seeded(10, 30, 20)));
    const { res, body } = await api(port);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(body).toEqual({
      entries: [
        { rank: 1, name: 'Old30', score: 30, achievedAt: '2026-01-01T00:00:00.000Z' },
        { rank: 2, name: 'Old20', score: 20, achievedAt: '2026-01-01T00:00:00.000Z' },
        { rank: 3, name: 'Old10', score: 10, achievedAt: '2026-01-01T00:00:00.000Z' },
      ],
    });
  });

  it('serves an empty table and only allows GET and HEAD', async () => {
    const port = await start(createMemoryStore());
    expect((await api(port)).body).toEqual({ entries: [] });
    const post = await fetch(`http://127.0.0.1:${port}/api/highscores`, { method: 'POST' });
    expect(post.status).toBe(405);
  });

  it('keeps the table across a restart', async () => {
    const file = tempFile();
    let port = await start(createFileStore(file));
    const c = await joinAs(port, 'Casey');
    await endRound(c);
    c.send({ t: 'hsName', token: c.of('hsEligible')[0]!.token, name: 'CARL' });
    await c.waitFor(() => c.of('hsResult').length > 0);
    await server!.close();

    port = await start(createFileStore(file));
    const { body } = await api(port);
    expect(body.entries).toMatchObject([{ rank: 1, name: 'CARL', score: 1 }]);
  });

  it('starts with an empty table and keeps the bad file when it is corrupt', async () => {
    const file = tempFile();
    await createFileStore(file, { log: () => {} }).load();
    const { writeFileSync, readdirSync } = await import('node:fs');
    writeFileSync(file, '{broken');
    const port = await start(createFileStore(file, { log: () => {} }));
    expect((await api(port)).body).toEqual({ entries: [] });
    expect(
      readdirSync(join(file, '..')).some((f) => f.startsWith('highscores.json.corrupt-')),
    ).toBe(true);
  });

  it('sends the table to a player who joins during the intermission', async () => {
    const port = await start(createMemoryStore());
    const a = await joinAs(port, 'Alpha');
    await endRound(a);
    const late = await joinAs(port, 'Late');
    await late.waitFor(() => late.of('highscores').length > 0);
    expect(table(late)).toEqual([['Alpha', 1]]);
    expect(late.of('hsEligible')).toHaveLength(0);
  });

  it('keeps going when the file cannot be written', async () => {
    const failing: HighScoreStore = {
      load: () => Promise.resolve([]),
      save: () => Promise.reject(new Error('disk full')),
    };
    const port = await start(failing);
    const c = await joinAs(port, 'Casey');
    await endRound(c);
    expect(c.of('hsEligible')).toHaveLength(1);
    c.send({ t: 'hsName', token: c.of('hsEligible')[0]!.token, name: 'CARL' });
    await c.waitFor(() => c.of('hsResult').length > 0);
    expect(c.of('hsResult')[0]).toEqual({ t: 'hsResult', ok: false, reason: 'error' });
    expect(table(c)[0]![0]).toBe('Casey');
  });
});
