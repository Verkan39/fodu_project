import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseScript, type Script } from '../src/script.ts';
import { expandMoves, readTrace, TRACE_MARK } from '../src/trace.ts';
import { buildFile } from '../src/template.ts';

function parse(helpers: string, proof: string): Script {
  const r = parseScript(helpers, proof);
  assert.ok(r.ok, r.ok ? '' : r.reason);
  return r.script;
}

const SPIN = 'macro "spin " n:num : tactic => `(tactic| (rotate $n; rotate $n))';
const FIX = 'macro "fix " i:num : tactic => `(tactic| (paint $i green; spin $i))';

test('helper calls expand into plain moves, each tagged with the line that called it', () => {
  const moves = expandMoves(parse(`${SPIN}\n${FIX}`, 'swap 2 7\n\nfix 7\n-- done'));
  assert.deepEqual(moves, [
    { line: 1, move: { kind: 'swap', a: 2, b: 7 } },
    { line: 3, move: { kind: 'paint', cell: 7, color: 'green' } },
    { line: 3, move: { kind: 'rotate', cell: 7 } },
    { line: 3, move: { kind: 'rotate', cell: 7 } },
  ]);
});

test('a helper without a parameter uses its own cell numbers', () => {
  const spin3 = 'macro "spin3" : tactic => `(tactic| (rotate 1; rotate 2; rotate 3))';
  assert.deepEqual(
    expandMoves(parse(spin3, 'spin3')).map((m) => m.move),
    [1, 2, 3].map((cell) => ({ kind: 'rotate', cell })),
  );
});

test('a Script that did not come from the parser cannot loop or use $i outside a helper', () => {
  const loop = { helpers: [{ name: 'a', hasParam: false, body: [{ kind: 'call', name: 'a' }] }], proof: [{ kind: 'call', name: 'a' }] };
  assert.throws(() => expandMoves(loop as Script));
  const param = { helpers: [], proof: [{ kind: 'rotate', cell: { kind: 'param' } }] };
  assert.throws(() => expandMoves(param as Script));
});

test('the trace line lists every move as a Lean term, and an empty proof still type-checks', () => {
  const line = (proof: string) => buildFile(parse(FIX.replace('spin $i', 'rotate $i'), proof)).source.split('\n').at(-2);
  assert.equal(
    line('swap 1 3\nfix 4'),
    `#eval IO.println ("${TRACE_MARK} " ++ Tactile.Trace.run level start (target) ([(1, Tactile.Move.swap 1 3), ` +
      '(2, Tactile.Move.paint 4 Tactile.Color.green), (2, Tactile.Move.rotate 4)] : List (Nat × Tactile.Move)))',
  );
  assert.match(line('') ?? '', /\(\[\] : List \(Nat × Tactile\.Move\)\)\)$/);
});

test('readTrace finds the trace among Lean messages, and gives up on anything malformed', () => {
  const info = (data: string) => ({ severity: 'information' as const, data, pos: { line: 1, column: 0 } });
  const trace = {
    steps: [{ line: 1, move: { kind: 'rotate', cell: 1 }, board: [{ id: 0, color: 'blue', turns: 1 }] }],
    stop: null,
    differing: [],
  };
  assert.deepEqual(readTrace([info('tactile:limit 0\n'), info(`${TRACE_MARK} ${JSON.stringify(trace)}\n`)]), trace);
  assert.equal(readTrace([info('tactile:limit 0')]), undefined);
  assert.equal(readTrace([info(`${TRACE_MARK} {broken`)]), undefined);
  assert.equal(readTrace([info(`${TRACE_MARK} {"stop": null}`)]), undefined);
  assert.equal(readTrace([info(`${TRACE_MARK} {"steps": [], "stop": null, "differing": 2}`)]), undefined);
});
