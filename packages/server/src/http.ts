import { existsSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import sirv from 'sirv';
import type { HighScoreApiRow } from './highscores/service.ts';

export interface Health {
  status: 'ok';
  humans: number;
  bots: number;
  tick: number;
  /** `idle` (no humans, world paused), `playing`, or `intermission`. */
  phase: string;
  /** Id of the current or most recent round; 0 before the first. */
  round: number;
}

export interface HttpOptions {
  /** Directory holding the built client. */
  clientDir: string;
  health: () => Omit<Health, 'status'>;
  /** The ranked high score table. */
  highscores: () => HighScoreApiRow[];
}

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

const NOT_BUILT =
  'The game client has not been built. Run `npm run build`, or use `npm run dev` and open the Vite URL.\n';

/**
 * Caching for the built client. Vite names everything under `/assets/` by its content hash, so
 * those files never change and can be kept for good. Everything else, the index page above all,
 * must be checked with the server (by ETag) on every load; otherwise a browser can keep the old
 * index after an upgrade and go on loading the old bundle.
 */
export function cacheControlFor(pathname: string): string {
  return pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
}

/**
 * Serves `GET /healthz`, `GET /api/highscores`, and the built client. Files are looked up in a list taken when the
 * server starts, so a request path can never reach outside the client directory.
 */
export function createHttpHandler(opts: HttpOptions): Handler {
  const files = existsSync(opts.clientDir)
    ? sirv(opts.clientDir, {
        etag: true,
        gzip: true,
        brotli: true,
        setHeaders: (res, pathname) => res.setHeader('Cache-Control', cacheControlFor(pathname)),
      })
    : null;

  return (req, res) => {
    const path = (req.url ?? '/').split('?')[0];
    if (path === '/healthz' || path === '/api/highscores') {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { Allow: 'GET, HEAD' }).end();
        return;
      }
      const body = JSON.stringify(
        path === '/healthz'
          ? ({ status: 'ok', ...opts.health() } satisfies Health)
          : { entries: opts.highscores() },
      );
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      });
      res.end(req.method === 'HEAD' ? undefined : body);
      return;
    }
    if (!files) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end(NOT_BUILT);
      return;
    }
    files(req, res, () => {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found\n');
    });
  };
}
