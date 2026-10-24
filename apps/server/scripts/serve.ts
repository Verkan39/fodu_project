/**
 * Starts the API.
 *
 *   npm start
 *
 * Settings (environment variables):
 *   PORT              default 3001
 *   HOST              default 127.0.0.1 (this machine only). Use 0.0.0.0 to let other devices in.
 *   LEVELS_FILE       default apps/web/src/data/levels.json
 *   ALLOWED_ORIGINS   extra browser origins, comma-separated (localhost is always allowed)
 */
import { access } from 'node:fs/promises';
import { createApp, DEFAULT_LEVELS_FILE, levelsFromFile, LOCALHOST_ORIGIN } from '../src/server.ts';

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '127.0.0.1';
const levelsFile = process.env.LEVELS_FILE ?? DEFAULT_LEVELS_FILE;
const extraOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

try {
  await access(levelsFile);
} catch {
  console.warn(`warning: ${levelsFile} does not exist yet, so GET /api/levels will answer 503 until it does`);
}

const app = createApp({
  loadLevels: levelsFromFile(levelsFile),
  allowOrigin: (o) => LOCALHOST_ORIGIN.test(o) || extraOrigins.includes(o),
});

app.listen(port, host, () => {
  console.log(`API listening on http://${host}:${port}`);
});
