import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toOutcome } from '../src/outcome.ts';
import type { Trace } from '../src/trace.ts';

const trace = (t: Partial<Trace>): Trace => ({ steps: [], stop: null, differing: [], ...t });
const lockedStop = {
  line: 2,
  why: { kind: 'locked' as const, cells: [5] },
  cells: [2, 5],
  message: "Cell 5 is locked and can't be moved, painted or rotated.",
};

test('cleared carries the line count', () => {
  assert.deepEqual(toOutcome({ verdict: { status: 'cleared' }, lines: 3, trace: trace({}) }), { status: 'cleared', lines: 3 });
});

test('mismatch lists the differing cells from the trace', () => {
  assert.deepEqual(toOutcome({ verdict: { status: 'mismatch' }, lines: 1, trace: trace({ differing: [3, 9] }) }), {
    status: 'mismatch',
    differing: [3, 9],
  });
});

test('illegal combines the verdict line with the trace stop, in the frontend shape', () => {
  assert.deepEqual(toOutcome({ verdict: { status: 'illegal', line: 2 }, lines: 3, trace: trace({ stop: lockedStop }) }), {
    status: 'illegal',
    line: 2,
    why: { kind: 'locked', cells: [5] },
    cells: [2, 5],
    message: "Cell 5 is locked and can't be moved, painted or rotated.",
  });
});

test('without a trace, mismatch and illegal become errors instead of guessing', () => {
  assert.equal(toOutcome({ verdict: { status: 'mismatch' }, lines: 1 }).status, 'error');
  assert.equal(toOutcome({ verdict: { status: 'illegal', line: 1 }, lines: 1 }).status, 'error');
  assert.equal(toOutcome({ verdict: { status: 'illegal', line: 1 }, lines: 1, trace: trace({}) }).status, 'error');
});

test('invalid always says which editor and why, even when Lean (not our parser) refused the line', () => {
  assert.deepEqual(toOutcome({ verdict: { status: 'invalid', line: 4, editor: 'helpers', reason: 'bad name' } }), {
    status: 'invalid',
    editor: 'helpers',
    line: 4,
    reason: 'bad name',
  });
  const fromLean = toOutcome({ verdict: { status: 'invalid', line: 2 }, lines: 2, trace: trace({}) });
  assert.equal(fromLean.status, 'invalid');
  assert.ok(fromLean.status === 'invalid' && fromLean.editor === 'proof' && fromLean.reason.length > 0);
});

test('tooLong, rejected, timeout and error pass through unchanged', () => {
  for (const verdict of [
    { status: 'tooLong' as const, lines: 9, limit: 6 },
    { status: 'rejected' as const, reason: 'the proof uses sorry' },
    { status: 'timeout' as const, seconds: 15 },
    { status: 'error' as const, detail: 'x' },
  ]) {
    assert.deepEqual(toOutcome({ verdict }), verdict);
  }
});
