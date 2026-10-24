import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LeanTimeout, readOutput } from '../src/lean.ts';

const message = '{"severity":"error","data":"tactile:illegal","pos":{"line":5,"column":2}}';

test('reads one JSON message per line and skips anything else', () => {
  const out = readOutput(1, `${message}\nnot json\n\n${message}\n`, '');
  assert.equal(out.length, 2);
  assert.equal(out[0].data, 'tactile:illegal');
});

test('a clean run with nothing to say is an empty list, not a failure', () => {
  assert.deepEqual(readOutput(0, '', ''), []);
});

test('the time limit firing is a timeout, whatever was printed before it', () => {
  assert.throws(() => readOutput(124, message, ''), LeanTimeout);
  assert.throws(() => readOutput(137, '', ''), LeanTimeout);
});

test('a broken JSON line is an error, not a crash', () => {
  assert.throws(() => readOutput(1, '{"severity":', ''), /isn't JSON/);
});

test('no messages and a failing exit code means Lean never ran', () => {
  assert.throws(() => readOutput(125, '', 'no such service: lean'), /no such service/);
});
