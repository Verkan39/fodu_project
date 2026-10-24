import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, type LeanMessage } from '../src/verdict.ts';
import type { Layout } from '../src/template.ts';

// A proof with three player lines: file lines 5, 6, 7. `finish` is line 8.
const layout: Layout = { firstLine: 5, lastLine: 7, finishLine: 8 };

const error = (line: number, data: string): LeanMessage => ({
  severity: 'error',
  data,
  pos: { line, column: 2 },
});
const illegal = (line: number) => error(line, 'tactile:illegal\n⊢ Move.Legal …');
const mismatch = (line: number) => error(line, 'tactile:mismatch\n⊢ …');
const axioms = (list: string): LeanMessage => ({
  severity: 'information',
  data: list === '' ? "'sol' does not depend on any axioms" : `'sol' depends on axioms: [${list}]`,
  pos: { line: 11, column: 0 },
});
const sorryWarning: LeanMessage = {
  severity: 'warning',
  kind: 'hasSorry',
  data: 'declaration uses `sorry`',
  pos: { line: 4, column: 8 },
};

test('no errors and only standard axioms: cleared', () => {
  assert.deepEqual(classify([axioms('propext')], layout), { status: 'cleared' });
  assert.deepEqual(classify([axioms('')], layout), { status: 'cleared' });
});

test('an illegal move reports its editor line (file line 6 is editor line 2)', () => {
  assert.deepEqual(classify([illegal(6)], layout), { status: 'illegal', line: 2 });
});

test('fallout after an illegal move is ignored', () => {
  // Lean also reports a mismatch on `finish` after the illegal move on line 6.
  assert.deepEqual(classify([illegal(6), mismatch(8)], layout), { status: 'illegal', line: 2 });
});

test('with two illegal moves the first one wins, even if Lean lists them out of order', () => {
  assert.deepEqual(classify([illegal(7), illegal(5)], layout), { status: 'illegal', line: 1 });
});

test('a mismatch on the closing line', () => {
  assert.deepEqual(classify([mismatch(8)], layout), { status: 'mismatch' });
});

test('a typo is an invalid command, even though Lean also adds a spurious illegal marker', () => {
  const typo = [error(6, 'unexpected token; expected numeral'), illegal(6)];
  assert.deepEqual(classify(typo, layout), { status: 'invalid', line: 2 });
});

test('errors outside the player lines (e.g. unsolved goals on the theorem line) are ignored when a player line has one', () => {
  const messages = [error(4, 'unsolved goals'), error(6, 'unknown tactic')];
  assert.deepEqual(classify(messages, layout), { status: 'invalid', line: 2 });
});

test('an error only outside the player lines is reported as unreadable, never cleared', () => {
  assert.equal(classify([error(4, 'unsolved goals')], layout).status, 'error');
});

test('a non-marker error on the closing line (the player closed the goal early) is not a mismatch', () => {
  assert.equal(classify([error(8, 'no goals to be proved')], layout).status, 'error');
});

test('sorry is rejected', () => {
  assert.equal(classify([sorryWarning, axioms('propext, sorryAx')], layout).status, 'rejected');
});

test('an axiom we do not allow is rejected even without a sorry warning', () => {
  assert.deepEqual(classify([axioms('propext, Lean.ofReduceBool')], layout), {
    status: 'rejected',
    reason: 'the proof uses Lean.ofReduceBool',
  });
});

test('without the axioms report we cannot vouch for the proof', () => {
  assert.equal(classify([], layout).status, 'error');
});

test('an empty proof has no player lines, so only the closing line can fail', () => {
  const empty: Layout = { firstLine: 5, lastLine: 4, finishLine: 5 };
  assert.deepEqual(classify([mismatch(5)], empty), { status: 'mismatch' });
  assert.deepEqual(classify([axioms('propext')], empty), { status: 'cleared' });
});
