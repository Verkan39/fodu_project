/**
 * The API end to end, against real Lean in Docker. Slower than `npm test` (a container per proof).
 *
 *   npm run integration
 *   LEVELS_FILE=path/to/levels.json npm run integration    to compare another copy of the JSON
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { createApp, DEFAULT_LEVELS_FILE, levelsFromFile } from '../src/server.ts';
import { LEVELS } from '../src/template.ts';
import { runLean } from '../src/lean.ts';

const LEVELS_FILE = process.env.LEVELS_FILE ?? DEFAULT_LEVELS_FILE;
const app = createApp({ loadLevels: levelsFromFile(LEVELS_FILE) });
await new Promise<void>((resolve) => app.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
test.after(() => app.close());

async function verify(body: object) {
  const res = await fetch(`${base}/api/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  assert.equal(res.status, 200);
  return res.json();
}

/** Every level as Lean sees it, in the frontend's JSON shape (`Trace.levelJson`). */
async function levelsFromLean(): Promise<Record<string, unknown>> {
  const entries = Object.entries(LEVELS).map(
    ([id, ns]) => `"\\"${id}\\":" ++ Tactile.Trace.levelJson ${ns}.level ${ns}.start ${ns}.target`,
  );
  const source = `import Tactile\n#eval IO.println ("tactile:levels {" ++ ",".intercalate [${entries.join(', ')}] ++ "}")\n`;
  const messages = await runLean(source);
  const out = messages.find((m) => m.data.startsWith('tactile:levels '));
  assert.ok(out, `Lean printed no levels: ${JSON.stringify(messages)}`);
  return JSON.parse(out.data.slice('tactile:levels '.length));
}

test('an illegal move comes back in the frontend shape, with the board after the legal line', async () => {
  const r = await verify({ level: 'L2', proof: 'swap 2 7\nswap 2 5\nrotate 3' });
  assert.equal(r.source, 'lean');
  assert.deepEqual(r.outcome, {
    status: 'illegal',
    line: 2,
    why: { kind: 'locked', cells: [5] },
    cells: [2, 5],
    message: "Cell 5 is locked and can't be moved, painted or rotated.",
  });
  assert.equal(r.trace.steps.length, 1);
});

test('a cell that does not exist is only in why.cells; the real cell is the red one', async () => {
  const r = await verify({ level: 'L1', proof: 'swap 2 12' });
  assert.deepEqual(r.outcome.why, { kind: 'noSuchCell', cells: [12] });
  assert.deepEqual(r.outcome.cells, [2]);
});

test('a helper with a parameter clears Level 5 at its limit, one step per expanded move', async () => {
  const r = await verify({
    level: 'L5',
    helpers: 'macro "fix " i:num : tactic => `(tactic| (paint $i green; rotate $i; rotate $i))',
    proof: 'swap 2 7\nfix 7\nfix 1\nfix 4\nfix 13\nfix 16',
  });
  assert.deepEqual(r.outcome, { status: 'cleared', lines: 9 });
  assert.equal(r.trace.steps.length, 16);
  assert.deepEqual([...new Set(r.trace.steps.map((s: { line: number }) => s.line))], [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(r.trace.differing, []);
  // The last board looks like the target (colour and turns % 4), and every block kept its id.
  const lean = await levelsFromLean();
  const last: { id: number; color: string; turns: number }[] = r.trace.steps.at(-1).board;
  assert.deepEqual(last.map((b) => [b.color, b.turns % 4]), (lean.L5 as { target: unknown }).target);
  assert.deepEqual(last.map((b) => b.id).sort((a, b) => a - b), [...Array(16).keys()]);
  // Each step names its move; line 2 is `fix 7`, which expands to a paint and two rotates.
  assert.deepEqual(
    r.trace.steps.filter((s: { line: number }) => s.line === 2).map((s: { move: unknown }) => s.move),
    [{ kind: 'paint', cell: 7, color: 'green' }, { kind: 'rotate', cell: 7 }, { kind: 'rotate', cell: 7 }],
  );
});

test('a correct proof over the limit is tooLong; a short wrong one is a mismatch listing the cells', async () => {
  const plain = 'rotate 1\nrotate 1\nrotate 1\nrotate 2\nrotate 2\nrotate 2\nrotate 3\nrotate 3\nrotate 3';
  const long = await verify({ level: 'L3', proof: plain });
  assert.deepEqual(long.outcome, { status: 'tooLong', lines: 9, limit: 6 });

  const short = await verify({ level: 'L1', proof: 'swap 2 8' });
  assert.deepEqual(short.outcome, { status: 'mismatch', differing: [4, 6] });
});

test('an attack is refused by the parser, so Lean never runs and there is no trace', async () => {
  const r = await verify({ level: 'L1', proof: 'run_tac (IO.println "hi" : IO Unit)' });
  assert.equal(r.outcome.status, 'invalid');
  assert.equal(r.outcome.editor, 'proof');
  assert.equal(r.trace, null);
});

test('the frontend levels JSON matches Levels.lean exactly', async (t) => {
  try {
    await access(LEVELS_FILE);
  } catch {
    t.skip(`${LEVELS_FILE} is not in this checkout`);
    return;
  }
  const json = JSON.parse(await readFile(LEVELS_FILE, 'utf8'));
  assert.deepEqual(json, await levelsFromLean());

  const served = await (await fetch(`${base}/api/levels`)).json();
  assert.deepEqual(served, json);
});
