import { existsSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import sirv from 'sirv';

export interface Health {
  status: 'ok';
  humans: number;
  bots: number;
  tick: number;
}

export interface HttpOptions {
  /** Directory holding the built client. */
  clientDir: string;
  health: () => Omit<Health, 'status'>;
}

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

const NOT_BUILT =
  'The game client has not been built. Run `npm run build`, or use `npm run dev` and open the Vite URL.\n';

/**
 * Serves `GET /healthz` and the built client. Files are looked up in a list taken when the
 * server starts, so a request path can never reach outside the client directory.
 */
export function createHttpHandler(opts: HttpOptions): Handler {
  const files = existsSync(opts.clientDir)
    ? sirv(opts.clientDir, { etag: true, gzip: true, brotli: true })
    : null;

  return (req, res) => {
    const path = (req.url ?? '/').split('?')[0];
    if (path === '/healthz') {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { Allow: 'GET, HEAD' }).end();
        return;
      }
      const body = JSON.stringify({ status: 'ok', ...opts.health() } satisfies Health);
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
