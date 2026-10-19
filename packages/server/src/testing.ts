import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodeServerMessage, encodeMessage, PROTOCOL_VERSION, World } from '@lw/shared';
import type { ClientMessage, ServerMessage, WelcomeMsg } from '@lw/shared';
import { WebSocket } from 'ws';
import { parseConfig } from './config.ts';
import { GameServer } from './server.ts';
import type { GameServerOptions } from './server.ts';

/** Test helpers; excluded from the build. */

/** A world with no trailers, enemies, world hearts, replenishment, or boss, for isolated scenarios. */
export function emptyWorld(): World {
  return new World({
    seed: 1,
    initialTrailers: 0,
    initialEnemies: 0,
    maxTrailers: 0,
    maxEnemies: 0,
    boss: false,
    maxSlowHearts: 0,
    maxFullHearts: 0,
  });
}

/** A client directory holding an index page, with a secret one level above it. */
export function makeClientDir(): { dir: string; secretName: string } {
  const root = mkdtempSync(join(tmpdir(), 'lw-server-test-'));
  const dir = join(root, 'dist');
  mkdirSync(dir);
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Locomotive Wars</title>');
  writeFileSync(join(root, 'secret.txt'), 'top secret');
  return { dir, secretName: 'secret.txt' };
}

/** Starts a server on a free port. `config` holds config-file keys layered over the defaults. */
export async function startServer(
  opts: Omit<Partial<GameServerOptions>, 'config'> & { config?: Record<string, unknown> } = {},
): Promise<{ server: GameServer; port: number }> {
  const { dir } = makeClientDir();
  const { config: override, ...rest } = opts;
  const parsed = parseConfig({ port: 0, ...override });
  if (!parsed.ok) throw new Error(`bad test config: ${parsed.errors.join('; ')}`);
  const server = new GameServer({
    host: '127.0.0.1',
    clientDir: dir,
    log: () => {},
    ...rest,
    config: parsed.config,
  });
  const port = await server.listen();
  return { server, port };
}

/** GET with the path sent exactly as given (no URL normalisation), to test traversal. */
export function rawGet(port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method: 'GET' }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c: string) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

/** A WebSocket test client that records every server message. */
export class TestClient {
  readonly messages: ServerMessage[] = [];
  readonly raw: string[] = [];
  closeCode: number | null = null;
  welcome: WelcomeMsg | null = null;
  private readonly waiters: Array<() => void> = [];

  private constructor(readonly ws: WebSocket) {
    ws.on('message', (data) => {
      const text = String(data);
      this.raw.push(text);
      const msg = decodeServerMessage(text);
      if (msg) {
        this.messages.push(msg);
        if (msg.t === 'welcome') this.welcome = msg;
      }
      for (const w of this.waiters.splice(0)) w();
    });
    ws.on('close', (code) => {
      this.closeCode = code;
      for (const w of this.waiters.splice(0)) w();
    });
  }

  static async connect(port: number): Promise<TestClient> {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });
    return new TestClient(ws);
  }

  /** Connects and joins; resolves once the welcome has arrived. */
  static async join(port: number, name = 'Tester'): Promise<TestClient> {
    const c = await TestClient.connect(port);
    c.send({ t: 'hello', v: PROTOCOL_VERSION, name });
    await c.waitFor(() => c.welcome !== null);
    return c;
  }

  send(msg: ClientMessage): void {
    this.ws.send(encodeMessage(msg));
  }

  sendRaw(text: string): void {
    this.ws.send(text);
  }

  get id(): number {
    if (!this.welcome) throw new Error('not joined');
    return this.welcome.id;
  }

  of<T extends ServerMessage['t']>(type: T): Extract<ServerMessage, { t: T }>[] {
    return this.messages.filter((m): m is Extract<ServerMessage, { t: T }> => m.t === type);
  }

  /** Resolves when `done()` is true, re-checked on every message and on close. */
  async waitFor(done: () => boolean, timeoutMs = 3000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!done()) {
      const left = deadline - Date.now();
      if (left <= 0) throw new Error('timed out waiting for condition');
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, left);
        this.waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }

  close(): void {
    this.ws.close();
  }
}

/** Sleeps for real time. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
