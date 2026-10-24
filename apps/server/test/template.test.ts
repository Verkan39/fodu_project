import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFile } from '../src/template.ts';

const lineOf = (source: string, n: number) => source.split('\n')[n - 1];

test('player lines land on consecutive file lines, then finish', () => {
  const { source, layout } = buildFile('swap 1 3\npaint 3 blue\nrotate 3');
  assert.deepEqual(layout, { firstLine: 5, lastLine: 7, finishLine: 8 });
  assert.equal(lineOf(source, 4), 'theorem sol : Reach level start (target) := by');
  assert.equal(lineOf(source, 5), '  swap 1 3');
  assert.equal(lineOf(source, 7), '  rotate 3');
  assert.equal(lineOf(source, 8), '  finish');
  assert.equal(lineOf(source, 10), '#print axioms sol');
});

test('indentation is normalised, because Lean needs every tactic on the same column', () => {
  const { source } = buildFile('    swap 1 3\n\t\tpaint 3 blue  ');
  assert.equal(lineOf(source, 5), '  swap 1 3');
  assert.equal(lineOf(source, 6), '  paint 3 blue');
});

test('blank and comment lines are kept, so editor lines still match file lines', () => {
  const { source, layout } = buildFile('-- start\n\nswap 1 3');
  assert.equal(lineOf(source, 5), '  -- start');
  assert.equal(lineOf(source, 6), '');
  assert.equal(lineOf(source, 7), '  swap 1 3');
  assert.equal(layout.finishLine, 8);
});

test('trailing blank lines are dropped so finish stays right after the last real line', () => {
  const { layout } = buildFile('swap 1 3\n\n\n');
  assert.deepEqual(layout, { firstLine: 5, lastLine: 5, finishLine: 6 });
});

test('Windows line endings are handled', () => {
  const { source } = buildFile('swap 1 3\r\nrotate 3\r\n');
  assert.equal(lineOf(source, 6), '  rotate 3');
});

test('an empty proof has only the closing line', () => {
  const { layout } = buildFile('');
  assert.deepEqual(layout, { firstLine: 5, lastLine: 4, finishLine: 5 });
});

test('the target can be named', () => {
  assert.equal(lineOf(buildFile('', 'start').source, 4), 'theorem sol : Reach level start (start) := by');
});

test('a target made of several words is wrapped so Lean reads it as one board', () => {
  const line = lineOf(buildFile('', '(Move.swap 1 3).apply start').source, 4);
  assert.equal(line, 'theorem sol : Reach level start ((Move.swap 1 3).apply start) := by');
});
