import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAME_TITLE } from '@lw/shared';
import { loadConfigOrExit } from './config.ts';
import { createFileStore } from './highscores/store.ts';
import { GameServer } from './server.ts';

const config = loadConfigOrExit();
// Both src/ and dist/ sit one level below packages/server, so this resolves the same way for
// `tsx` in development and the compiled build.
const clientDir = fileURLToPath(new URL('../../client/dist', import.meta.url));

// A relative high score path is read from where the config file is looked for (see loadConfig).
const highscoreFile = resolve(process.env.INIT_CWD ?? process.cwd(), config.highscores.file);
console.log(`high scores kept in ${highscoreFile}`);

const server = new GameServer({
  clientDir,
  config,
  world: { seed: Date.now() >>> 0 },
  highscoreStore: createFileStore(highscoreFile),
});
const actual = await server.listen();
console.log(`${GAME_TITLE} server listening on http://localhost:${actual}`);

function shutdown(): void {
  console.log('shutting down');
  void server.close().then(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
