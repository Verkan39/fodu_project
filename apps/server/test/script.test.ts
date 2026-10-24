import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countLines, LIMITS, parseScript, type ParseResult } from '../src/script.ts';

const SPIN3 = 'macro "spin3" : tactic => `(tactic| (rotate 1; rotate 2; rotate 3))';
const FIX = 'macro "fix " i:num : tactic => `(tactic| (paint $i green; rotate $i; rotate $i))';

function rejected(r: ParseResult): { editor: string; line: number; reason: string } {
  assert.equal(r.ok, false, 'expected the text to be rejected');
  if (r.ok) throw new Error('unreachable');
  return r;
}

const proofLine = (proof: string) => {
  const r = rejected(parseScript('', proof));
  assert.equal(r.editor, 'proof');
  return r.line;
};
const helperLine = (helpers: string) => {
  const r = rejected(parseScript(helpers, ''));
  assert.equal(r.editor, 'helpers');
  return r.line;
};

test('the three moves, blank lines and comments parse', () => {
  const r = parseScript('', 'swap 1 3\n\n-- note\npaint 3 blue -- why\nrotate 0');
  assert.ok(r.ok);
  assert.deepEqual(r.script.proof, [
    { kind: 'swap', a: { kind: 'num', value: 1 }, b: { kind: 'num', value: 3 } },
    null,
    null,
    { kind: 'paint', cell: { kind: 'num', value: 3 }, color: 'blue' },
    // Cell 0 parses: whether it exists is a game rule, so Lean reports it as an illegal move.
    { kind: 'rotate', cell: { kind: 'num', value: 0 } },
  ]);
});

test('typos and malformed moves are rejected on their line', () => {
  assert.equal(proofLine('swap 1 3\nswpa 1 2'), 2);
  assert.equal(proofLine('swap (1+1) 3'), 1);
  assert.equal(proofLine('swap 1'), 1);
  assert.equal(proofLine('swap 1 2 3'), 1);
  assert.equal(proofLine('paint 3 bule'), 1);
  assert.equal(proofLine('paint 3 5'), 1);
  assert.equal(proofLine('rotate x'), 1);
  assert.equal(proofLine('rotate 99999'), 1);
  assert.equal(proofLine('Swap 1 2'), 1);
});

test('anything that is not one of our commands never reaches Lean', () => {
  for (const attack of [
    'sorry',
    'simp',
    'decide',
    'exact Reach.done (by decide)',
    'have h : (1 : Nat) = 1 := sorry',
    'run_tac (IO.println "hi" : IO Unit)',
    '#eval IO.Process.run { cmd := "ls" }',
    'swap 1 3; sorry',
    'swap 1 3 <;> sorry',
    'all_goals sorry',
    'rotate 1)\n#eval 1',
    '$i',
  ]) {
    assert.equal(parseScript('', attack).ok, false, attack);
  }
});

test('a helper without and with a parameter, called from the proof', () => {
  const r = parseScript(`${SPIN3}\n${FIX}`, 'spin3\nfix 7');
  assert.ok(r.ok);
  assert.equal(r.script.helpers.length, 2);
  assert.deepEqual(r.script.helpers[1], {
    name: 'fix',
    hasParam: true,
    body: [
      { kind: 'paint', cell: { kind: 'param' }, color: 'green' },
      { kind: 'rotate', cell: { kind: 'param' } },
      { kind: 'rotate', cell: { kind: 'param' } },
    ],
  });
  assert.deepEqual(r.script.proof[1], { kind: 'call', name: 'fix', arg: { kind: 'num', value: 7 } });
});

test('a helper may call a helper defined above it', () => {
  const twice = 'macro "twice" : tactic => `(tactic| (spin3; spin3))';
  assert.ok(parseScript(`${SPIN3}\n${twice}`, 'twice').ok);
  // ...but not one defined below it, and not itself, so a helper can never loop forever.
  assert.equal(helperLine(`${twice}\n${SPIN3}`), 1);
  assert.equal(helperLine('macro "loop" : tactic => `(tactic| (rotate 1; loop))'), 1);
});

test('calling a helper wrongly is rejected', () => {
  assert.equal(rejected(parseScript(SPIN3, 'spin3 4')).line, 1);
  assert.equal(rejected(parseScript(FIX, 'fix')).line, 1);
  assert.equal(rejected(parseScript(FIX, 'fix $i')).line, 1);
  assert.equal(rejected(parseScript('', 'spin3')).line, 1);
});

test('helper text that is not exactly our helper shape is rejected', () => {
  for (const attack of [
    '#eval IO.Process.run { cmd := "ls" }',
    'macro_rules | `(tactic| finish) => `(tactic| sorry)',
    'macro "auto" : tactic => `(tactic| repeat (rotate 1))',
    'macro "auto" : tactic => `(tactic| (first | rotate 1 | rotate 2))',
    'macro "cheat" : tactic => `(tactic| (sorry))',
    'macro "cheat" : tactic => `(tactic| (decide))',
    'macro "x" : tactic => `(tactic| (rotate 1))',
    'macro "Big" : tactic => `(tactic| (rotate 1))',
    'macro "a b" : tactic => `(tactic| (rotate 1))',
    'macro "spin" : tactic => `(tactic| ())',
    'macro "spin" : tactic => `(tactic| (rotate 1;; rotate 2))',
    'macro "spin" : term => `(term| 1)',
    'syntax "spin" : tactic',
    'set_option maxHeartbeats 0',
    'import Mathlib',
  ]) {
    assert.equal(parseScript(attack, '').ok, false, attack);
  }
});

test('helper names that would read as our moves, colours or finish are refused', () => {
  for (const name of ['swap', 'paint', 'rotate', 'finish', 'blue']) {
    assert.equal(helperLine(`macro "${name}" : tactic => \`(tactic| (rotate 1))`), 1, name);
  }
  assert.equal(helperLine(`${SPIN3}\n${SPIN3}`), 2);
});

test('names that are Lean words are fine, because they never reach Lean (template.ts)', () => {
  for (const name of ['grind', 'decide', 'sorry', 'target', 'by', 'sol']) {
    const r = parseScript(`macro "${name}" : tactic => \`(tactic| (rotate 1))`, name);
    assert.ok(r.ok, name);
  }
});

test('the helper shape allows spacing variations', () => {
  for (const text of [
    'macro "spin3": tactic => `(tactic| (rotate 1))',
    'macro "spin3":tactic=>`(tactic|(rotate 1))',
    'macro "fix" i:num: tactic => `(tactic| (rotate $i))',
    'macro "fix "i : num : tactic => `(tactic| (rotate $i))',
  ]) {
    assert.ok(parseScript(text, '').ok, text);
  }
  // ...but the parameter must still be a `num`.
  assert.equal(helperLine('macro "fix" i:numx : tactic => `(tactic| (rotate $i))'), 1);
});

test('nested helpers that would expand to too many moves are refused', () => {
  const sixteen = (call: string) => Array(16).fill(call).join('; ');
  const h1 = `macro "hone" : tactic => \`(tactic| (${sixteen('rotate 1')}))`;
  const h2 = `macro "htwo" : tactic => \`(tactic| (${sixteen('hone')}))`;
  // 16 × 16 = 256 moves is allowed, 16 × 256 is not.
  assert.ok(parseScript(`${h1}\n${h2}`, '').ok);
  const h3 = `macro "hthree" : tactic => \`(tactic| (${sixteen('htwo')}))`;
  assert.equal(helperLine(`${h1}\n${h2}\n${h3}`), 3);
  // Calling an allowed helper too often is caught on the proof side.
  assert.equal(rejected(parseScript(`${h1}\n${h2}`, 'htwo\nhtwo')).line, 2);
});

test('size limits', () => {
  assert.equal(proofLine('rotate 1\n'.repeat(LIMITS.proofLines + 1)), LIMITS.proofLines + 1);
  // Blank and comment lines don't count towards the limit, but the line number is the editor's.
  const commented = '-- note\n\nrotate 1\n'.repeat(LIMITS.proofLines);
  assert.ok(parseScript('', commented).ok);
  assert.equal(proofLine(`${commented}rotate 1`), 3 * LIMITS.proofLines + 1);
  assert.equal(proofLine(`rotate 1 -- ${'x'.repeat(LIMITS.lineLength)}`), 1);
  const tooMany = Array.from({ length: LIMITS.helpers + 1 }, (_, i) =>
    `macro "h${i}x" : tactic => \`(tactic| (rotate 1))`,
  ).join('\n');
  assert.equal(helperLine(tooMany), LIMITS.helpers + 1);
});

test('line count: a helper costs its steps, every proof line costs 1, blanks cost nothing', () => {
  const r = parseScript(`${SPIN3}\n${FIX}`, 'spin3\n\n-- comment\nfix 7\nswap 1 2');
  assert.ok(r.ok);
  assert.equal(countLines(r.script), 3 + 3 + 3);
});
