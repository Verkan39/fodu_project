import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp, MAX_BODY_BYTES, type Options } from '../src/server.ts';
import type { Attempt, Checked } from '../src/verify.ts';

const LEVELS = { L1: { width: 3, locked: [], palette: ['blue'], lineLimit: null, start: [], target: [] } };

const cleared: Checked = {
  verdict: { status: 'cleared' },
  lines: 3,
  limit: null,
  trace: { steps: [], stop: null, differing: [] },
  source: 'SECRET LEAN SOURCE',
  messages: [],
};

/** Starts the app on a free port and returns a `fetch` bound to it. Stops it after the test. */
async function start(t: { after: (fn: () => void) => void }, options: Partial<Options> = {}) {
  const app = createApp({ loadLevels: async () => LEVELS, verify: async () => cleared, ...options });
  await new Promise<void>((resolve) => app.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());
  const base = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
  return (path: string, init?: RequestInit) => fetch(base + path, init);
}

const post = (body: unknown, headers: Record<string, string> = { 'Content-Type': 'application/json' }) => ({
  method: 'POST',
  headers,
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

test('GET /healthz', async (t) => {
  const call = await start(t);
  const res = await call('/healthz');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});

test('GET /api/levels serves the levels JSON, or 503 if it cannot be read', async (t) => {
  const call = await start(t);
  assert.deepEqual(await (await call('/api/levels')).json(), LEVELS);

  const broken = await start(t, { loadLevels: async () => { throw new Error('ENOENT levels.json'); } });
  const res = await broken('/api/levels');
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, 'unavailable');
});

test('POST /api/verify answers in the frontend shape { outcome, source, trace }, nothing for debugging', async (t) => {
  let seen: Attempt | undefined;
  const call = await start(t, { verify: async (a) => ((seen = a), cleared) });
  const res = await call('/api/verify', post({ level: 'L3', helpers: 'h', proof: 'p', target: 'start' }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, {
    outcome: { status: 'cleared', lines: 3 },
    source: 'lean',
    trace: { steps: [], stop: null, differing: [] },
  });
  assert.doesNotMatch(JSON.stringify(body), /SECRET/);
  // The target can't be chosen by the caller: players always aim for the level's target.
  assert.deepEqual(seen, { level: 'L3', helpers: 'h', proof: 'p' });
});

test('when Lean did not run, trace is null rather than left out', async (t) => {
  const call = await start(t, { verify: async () => ({ verdict: { status: 'invalid', line: 1, editor: 'proof', reason: 'x' } }) });
  const body = await (await call('/api/verify', post({ level: 'L1', proof: 'swpa' }))).json();
  assert.deepEqual(body, { outcome: { status: 'invalid', editor: 'proof', line: 1, reason: 'x' }, source: 'lean', trace: null });
});

test('bad bodies are refused before verify runs', async (t) => {
  let calls = 0;
  const call = await start(t, { verify: async () => (calls++, cleared) });
  const status = async (init: RequestInit) => (await call('/api/verify', init)).status;

  assert.equal(await status(post('{not json')), 400);
  assert.equal(await status(post('[1, 2]')), 400);
  assert.equal(await status(post({ proof: 'swap 1 2' })), 400);
  assert.equal(await status(post({ level: 1, proof: 'swap 1 2' })), 400);
  assert.equal(await status(post({ level: 'L1' })), 400);
  assert.equal(await status(post({ level: 'L1', proof: ['swap 1 2'] })), 400);
  assert.equal(await status(post({ level: 'L1', proof: '', helpers: 5 })), 400);
  assert.equal(await status(post({ level: 'L9', proof: '' })), 404);
  assert.equal(await status(post({ level: '__proto__', proof: '' })), 404);
  assert.equal(await status(post({ level: 'L1', proof: '' }, { 'Content-Type': 'text/plain' })), 415);
  assert.equal(await status(post({ level: 'L1', proof: 'x'.repeat(MAX_BODY_BYTES) })), 413);
  assert.equal(calls, 0);
});

test('unknown paths are 404, wrong methods 405 with Allow', async (t) => {
  const call = await start(t);
  assert.equal((await call('/api/nope')).status, 404);
  const res = await call('/api/verify');
  assert.equal(res.status, 405);
  assert.equal(res.headers.get('allow'), 'POST');
  assert.equal((await call('/api/levels', post({}))).status, 405);
});

test('CORS: localhost origins are allowed, others are not, and preflight works', async (t) => {
  const call = await start(t);
  const origin = async (o: string) =>
    (await call('/healthz', { headers: { Origin: o } })).headers.get('access-control-allow-origin');
  assert.equal(await origin('http://localhost:5173'), 'http://localhost:5173');
  assert.equal(await origin('http://127.0.0.1:3000'), 'http://127.0.0.1:3000');
  assert.equal(await origin('https://evil.example'), null);
  assert.equal(await origin('http://localhost.evil.example'), null);

  const pre = await call('/api/verify', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' } });
  assert.equal(pre.status, 204);
  assert.match(pre.headers.get('access-control-allow-methods') ?? '', /POST/);
  assert.equal(pre.headers.get('access-control-allow-headers'), 'Content-Type');
});

test('when every Lean slot and the queue are taken, new requests get 503 busy', async (t) => {
  let release!: () => void;
  const blocked = new Promise<void>((r) => (release = r));
  const call = await start(t, { maxRunning: 1, maxWaiting: 0, verify: async () => (await blocked, cleared) });

  const first = call('/api/verify', post({ level: 'L1', proof: '' }));
  await new Promise((r) => setTimeout(r, 50));
  const second = await call('/api/verify', post({ level: 'L1', proof: '' }));
  assert.equal(second.status, 503);
  assert.equal((await second.json()).error, 'busy');

  release();
  assert.equal((await first).status, 200);
  // The slot is free again.
  assert.equal((await call('/api/verify', post({ level: 'L1', proof: '' }))).status, 200);
});

test('a queued request runs once a slot frees up', async (t) => {
  let release!: () => void;
  const blocked = new Promise<void>((r) => (release = r));
  let running = 0;
  let most = 0;
  const call = await start(t, {
    maxRunning: 1,
    maxWaiting: 1,
    verify: async () => {
      most = Math.max(most, ++running);
      await blocked;
      running--;
      return cleared;
    },
  });
  const a = call('/api/verify', post({ level: 'L1', proof: '' }));
  const b = call('/api/verify', post({ level: 'L1', proof: '' }));
  await new Promise((r) => setTimeout(r, 50));
  release();
  assert.deepEqual([(await a).status, (await b).status], [200, 200]);
  assert.equal(most, 1);
});

test('if Lean cannot run at all, the answer is 503 unavailable, without leaking why', async (t) => {
  const call = await start(t, { verify: async () => { throw new Error('permission denied on /var/run/docker.sock'); } });
  const res = await call('/api/verify', post({ level: 'L1', proof: '' }));
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.error, 'unavailable');
  assert.doesNotMatch(JSON.stringify(body), /docker|\/var/);
});

test('a levels read error does not leak the file path', async (t) => {
  const call = await start(t, { loadLevels: async () => { throw new Error("ENOENT: open '/home/x/levels.json'"); } });
  const body = await (await call('/api/levels')).json();
  assert.doesNotMatch(JSON.stringify(body), /home|ENOENT/);
});
