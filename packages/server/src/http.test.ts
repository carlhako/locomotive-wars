import { afterEach, describe, expect, it } from 'vitest';
import { rawGet, startServer } from './testing.ts';
import type { GameServer } from './server.ts';

let server: GameServer | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

async function start(): Promise<number> {
  const started = await startServer();
  server = started.server;
  return started.port;
}

describe('http', () => {
  it('serves the client index at /', async () => {
    const port = await start();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Locomotive Wars');
  });

  it('makes browsers revalidate the index page, so an upgrade is picked up on the next load', async () => {
    const port = await start();
    for (const path of ['/', '/index.html']) {
      const res = await fetch(`http://127.0.0.1:${port}${path}`);
      expect(res.headers.get('cache-control')).toBe('no-cache');
      expect(res.headers.get('etag')).toBeTruthy();
    }
  });

  it('lets browsers keep content-hashed assets for good', async () => {
    const port = await start();
    const res = await fetch(`http://127.0.0.1:${port}/assets/index-AbC123.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  });

  it('answers /healthz with status, humans, bots, and tick', async () => {
    const port = await start();
    const res = await fetch(`http://127.0.0.1:${port}/healthz`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe('ok');
    expect(body.humans).toBe(0);
    expect(typeof body.bots).toBe('number');
    expect(typeof body.tick).toBe('number');
  });

  it.each(['/../secret.txt', '/..%2fsecret.txt', '/%2e%2e/secret.txt', '/../../package.json'])(
    'does not serve files outside the client directory (%s)',
    async (path) => {
      const port = await start();
      const res = await rawGet(port, path);
      expect(res.body).not.toContain('top secret');
      expect(res.body).not.toContain('"name"');
      expect(res.status).not.toBe(200);
    },
  );

  it('returns 404 for a missing file', async () => {
    const port = await start();
    expect((await fetch(`http://127.0.0.1:${port}/nope.js`)).status).toBe(404);
  });

  it('explains when the client has not been built', async () => {
    const { server: s, port } = await startServer({ clientDir: '/nonexistent/lw-client' });
    server = s;
    const res = await fetch(`http://127.0.0.1:${port}/`);
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('not been built');
    // The health check works regardless.
    expect((await fetch(`http://127.0.0.1:${port}/healthz`)).status).toBe(200);
  });
});
