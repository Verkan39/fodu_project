/**
 * The HTTP API (Node's built-in `http`, no dependencies).
 *
 *   GET  /healthz       { "ok": true }
 *   GET  /api/levels    the levels JSON the frontend uses (no reference solutions in it)
 *   POST /api/verify    { "level": "L3", "helpers": "...", "proof": "..." }
 *                       -> 200 { "outcome": {...}, "source": "lean", "trace": {...} | null }
 *                       `outcome` has the frontend's own shape (`outcome.ts`).
 *
 * A game outcome (cleared, illegal, invalid, ...) is always a 200: the request worked, the proof
 * just didn't. Any other status means the request itself failed, with a body `{ "error", "detail"? }`.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { isLevelId } from './template.ts';
import { verify as realVerify, type Attempt, type Checked } from './verify.ts';
import { toOutcome } from './outcome.ts';

/** Where the frontend keeps the levels. The server reads the same file, so there is one copy. */
export const DEFAULT_LEVELS_FILE = fileURLToPath(new URL('../../web/src/data/levels.json', import.meta.url));

/** A request body is two texts of at most 10 000 characters each (`script.ts`), plus a little. */
export const MAX_BODY_BYTES = 64 * 1024;

/** Origins of a local dev server, e.g. Vite's `http://localhost:5173`. */
export const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/;

export interface Options {
  verify?: (attempt: Attempt) => Promise<Checked>;
  /** Returns the levels JSON. Throwing means the levels can't be served right now (503). */
  loadLevels: () => Promise<unknown>;
  /** Lean runs at the same time. Each run is a container, so keep this small. */
  maxRunning?: number;
  /** Requests waiting for a free run before new ones get 503 busy. */
  maxWaiting?: number;
  /** Which browser origins may call the API. */
  allowOrigin?: (origin: string) => boolean;
}

/** Reads the levels file once and keeps it. A failed read isn't kept, so the next request retries. */
export function levelsFromFile(path: string): () => Promise<unknown> {
  let cached: unknown;
  return async () => {
    if (cached === undefined) {
      const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error(`${path} is not a JSON object of levels`);
      }
      cached = parsed;
    }
    return cached;
  };
}

const BUSY = Symbol('busy');

/** Lets `max` jobs run at once and queues up to `maxWaiting` more. Beyond that, returns BUSY. */
function limiter(max: number, maxWaiting: number) {
  let running = 0;
  const waiting: (() => void)[] = [];
  return async <T>(job: () => Promise<T>): Promise<T | typeof BUSY> => {
    if (running < max) {
      running++;
    } else {
      if (waiting.length >= maxWaiting) return BUSY;
      // The job that finishes hands its slot straight to us, so `running` doesn't change.
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    try {
      return await job();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else running--;
    }
  };
}

// Fields are written out: Node runs this file by stripping types, which can't handle
// constructor parameter properties (`constructor(readonly status: number)`).
class HttpError extends Error {
  readonly status: number;
  readonly error: string;
  readonly detail?: string;
  constructor(status: number, error: string, detail?: string) {
    super(error);
    this.status = status;
    this.error = error;
    this.detail = detail;
  }
}

function send(res: ServerResponse, status: number, body?: unknown): void {
  res.statusCode = status;
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  if (body === undefined) {
    res.end();
    return;
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) {
    throw new HttpError(415, 'the body must be JSON (Content-Type: application/json)');
  }
  if (Number(req.headers['content-length'] ?? 0) > MAX_BODY_BYTES) {
    throw new HttpError(413, `the body is larger than ${MAX_BODY_BYTES} bytes`);
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, `the body is larger than ${MAX_BODY_BYTES} bytes`);
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** The request body as an `Attempt`. The texts themselves are checked by `parseScript`. */
function toAttempt(text: string): Attempt {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new HttpError(400, 'the body is not valid JSON');
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new HttpError(400, 'the body must be a JSON object');
  }
  const { level, helpers, proof } = body as Record<string, unknown>;
  if (typeof level !== 'string') throw new HttpError(400, '"level" must be a string, e.g. "L1"');
  if (!isLevelId(level)) throw new HttpError(404, `there is no level "${level}"`);
  if (typeof proof !== 'string') throw new HttpError(400, '"proof" must be a string');
  if (helpers !== undefined && typeof helpers !== 'string') {
    throw new HttpError(400, '"helpers" must be a string if given');
  }
  // `target` is deliberately not taken from the request: players always aim for the level's target.
  return { level, proof, helpers };
}

export function createApp(options: Options): Server {
  const verify = options.verify ?? realVerify;
  const allowOrigin = options.allowOrigin ?? ((o: string) => LOCALHOST_ORIGIN.test(o));
  const run = limiter(options.maxRunning ?? 2, options.maxWaiting ?? 8);

  const routes: Record<string, Partial<Record<string, (req: IncomingMessage, res: ServerResponse) => Promise<void>>>> = {
    '/healthz': {
      GET: async (_req, res) => send(res, 200, { ok: true }),
    },
    '/api/levels': {
      GET: async (_req, res) => {
        let levels: unknown;
        try {
          levels = await options.loadLevels();
        } catch (err) {
          // The reason (a file path, a JSON error) stays in the server log, not in the answer.
          console.error('GET /api/levels:', (err as Error).message);
          throw new HttpError(503, 'unavailable', 'the levels could not be read');
        }
        send(res, 200, levels);
      },
    },
    '/api/verify': {
      POST: async (req, res) => {
        const attempt = toAttempt(await readBody(req));
        let checked: Checked | typeof BUSY;
        try {
          checked = await run(() => verify(attempt));
        } catch (err) {
          // Lean or Docker couldn't run at all. That is our problem, not a verdict. Docker's own
          // message can name paths and settings, so it goes to the log only.
          console.error('POST /api/verify:', (err as Error).message);
          throw new HttpError(503, 'unavailable', 'the proof checker could not run, try again later');
        }
        if (checked === BUSY) throw new HttpError(503, 'busy', 'too many proofs are being checked, try again');
        // `source` and Lean's raw `messages` stay on the server: they are for debugging only.
        send(res, 200, { outcome: toOutcome(checked), source: 'lean', trace: checked.trace ?? null });
      },
    },
  };

  const server = createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (origin !== undefined && allowOrigin(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }

    try {
      const path = new URL(req.url ?? '/', 'http://localhost').pathname;
      const route = routes[path];
      if (route === undefined) throw new HttpError(404, 'not found');

      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', [...Object.keys(route), 'OPTIONS'].join(', '));
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Access-Control-Max-Age', '600');
        send(res, 204);
        return;
      }
      const handler = route[req.method ?? ''];
      if (handler === undefined) {
        res.setHeader('Allow', Object.keys(route).join(', '));
        throw new HttpError(405, `use ${Object.keys(route).join(' or ')} for ${path}`);
      }
      await handler(req, res);
    } catch (err) {
      if (err instanceof HttpError) {
        // A body we refused to read must not be left in the connection for the next request.
        if (err.status === 413) res.setHeader('Connection', 'close');
        send(res, err.status, err.detail === undefined ? { error: err.error } : { error: err.error, detail: err.detail });
      } else {
        console.error(err);
        send(res, 500, { error: 'internal error' });
      }
    }
  });

  // Headers must arrive quickly; a whole request may wait for Lean (15 s) plus a queue.
  server.headersTimeout = 10_000;
  server.requestTimeout = 120_000;
  return server;
}
