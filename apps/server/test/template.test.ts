import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFile, type LevelId, type Target } from '../src/template.ts';
import { parseScript, type Script } from '../src/script.ts';

const lineOf = (source: string, n: number) => source.split('\n')[n - 1];

/** Parse, failing the test if the text is rejected, then build. */
function build(proof: string, helpers = '', options: { level?: LevelId; target?: Target } = {}) {
  const parsed = parseScript(helpers, proof);
  assert.ok(parsed.ok, parsed.ok ? '' : parsed.reason);
  return buildFile(parsed.script, options);
}

test('player lines land on consecutive file lines, then finish', () => {
  const { source, layout } = build('swap 1 3\npaint 3 blue\nrotate 3');
  assert.deepEqual(layout, { firstLine: 5, lastLine: 7, finishLine: 8 });
  assert.equal(lineOf(source, 2), 'open Tactile Tactile.Examples');
  assert.equal(lineOf(source, 4), 'theorem sol : Reach level start (target) := by');
  assert.equal(lineOf(source, 5), '  swap 1 3');
  assert.equal(lineOf(source, 7), '  rotate 3');
  assert.equal(lineOf(source, 8), '  finish');
  assert.equal(lineOf(source, 10), '#print axioms sol');
  assert.equal(lineOf(source, 11), '#eval IO.println s!"tactile:limit {level.lineLimit.getD 0}"');
});

test('indentation is normalised, because Lean needs every tactic on the same column', () => {
  const { source } = build('    swap 1 3\n\t\tpaint 3 blue  ');
  assert.equal(lineOf(source, 5), '  swap 1 3');
  assert.equal(lineOf(source, 6), '  paint 3 blue');
});

test('blank and comment lines become blank file lines, so editor lines still match', () => {
  const { source, layout } = build('-- start\n\nswap 1 3 -- the corners');
  assert.equal(lineOf(source, 5), '');
  assert.equal(lineOf(source, 6), '');
  assert.equal(lineOf(source, 7), '  swap 1 3');
  assert.equal(layout.finishLine, 8);
});

test('trailing blank lines are dropped so finish stays right after the last real line', () => {
  assert.deepEqual(build('swap 1 3\n\n\n').layout, { firstLine: 5, lastLine: 5, finishLine: 6 });
});

test('Windows line endings are handled', () => {
  assert.equal(lineOf(build('swap 1 3\r\nrotate 3\r\n').source, 6), '  rotate 3');
});

test('an empty proof has only the closing line', () => {
  assert.deepEqual(build('').layout, { firstLine: 5, lastLine: 4, finishLine: 5 });
});

test('the target can be start', () => {
  assert.equal(lineOf(build('', '', { target: 'start' }).source, 4), 'theorem sol : Reach level start (start) := by');
});

test('the level picks the namespace that is opened', () => {
  assert.equal(lineOf(build('', '', { level: 'L3' }).source, 2), 'open Tactile Tactile.Levels.L3');
});

test('helpers are printed from data above the theorem, and push the proof down', () => {
  const helpers = [
    'macro "spin3" : tactic => `(tactic| (rotate 1; rotate 2; rotate 3))',
    '',
    'macro "fix" cell:num : tactic => `(tactic| (paint $cell green; rotate $cell))',
  ].join('\n');
  const { source, layout } = build('spin3\nfix 7', helpers);
  // Helpers get our own keywords, in order. The parameter is renamed to `i`, and the keyword gets
  // the trailing space Lean expects before an argument.
  assert.equal(lineOf(source, 4), 'macro "tactile_h1" : tactic => `(tactic| (rotate 1; rotate 2; rotate 3))');
  assert.equal(lineOf(source, 5), 'macro "tactile_h2 " i:num : tactic => `(tactic| (paint $i green; rotate $i))');
  assert.equal(lineOf(source, 6), 'theorem sol : Reach level start (target) := by');
  assert.equal(lineOf(source, 7), '  tactile_h1');
  assert.equal(lineOf(source, 8), '  tactile_h2 7');
  assert.deepEqual(layout, { firstLine: 7, lastLine: 8, finishLine: 9 });
});

test('helper names never reach Lean, so a name that is also a Lean tactic is harmless', () => {
  const helpers = [
    'macro "grind" : tactic => `(tactic| (rotate 1))',
    'macro "sorry" n:num : tactic => `(tactic| (grind; rotate $n))',
  ].join('\n');
  const { source } = build('grind\nsorry 4', helpers);
  assert.doesNotMatch(source, /grind|sorry/);
  assert.equal(lineOf(source, 5), 'macro "tactile_h2 " i:num : tactic => `(tactic| (tactile_h1; rotate $i))');
  assert.equal(lineOf(source, 8), '  tactile_h2 4');
});

test('a Script that did not come from the parser cannot slip text into the file', () => {
  const bad = (proof: unknown[]) => () => buildFile({ helpers: [], proof } as unknown as Script);
  assert.throws(bad([{ kind: 'paint', cell: { kind: 'num', value: 1 }, color: 'blue\n#eval 1' }]));
  assert.throws(bad([{ kind: 'rotate', cell: { kind: 'num', value: '1)\n#eval 1' } }]));
  assert.throws(bad([{ kind: 'rotate', cell: { kind: 'num', value: -1 } }]));
  assert.throws(bad([{ kind: 'call', name: 'nothere' }]));
});
