import { fileURLToPath } from 'node:url';
import { GAME_TITLE } from '@lw/shared';
import { GameServer } from './server.ts';

const port = Number(process.env.PORT ?? 8080);
// Both src/ and dist/ sit one level below packages/server, so this resolves the same way for
// `tsx` in development and the compiled build.
const clientDir = fileURLToPath(new URL('../../client/dist', import.meta.url));

const server = new GameServer({ port, clientDir });
const actual = await server.listen();
console.log(`${GAME_TITLE} server listening on http://localhost:${actual}`);

function shutdown(): void {
  console.log('shutting down');
  void server.close().then(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
