/**
 * Try a proof from the command line and see the verdict.
 *
 *   npm run check -- "swap 1 3" "paint 3 blue" "rotate 3"      each argument is one line
 *   npm run check -- "swap 1 3\nrotate 5"                      or use \n inside one argument
 *   npm run check -- --file my-proof.txt
 *   echo "swap 1 3" | npm run check
 *
 * Options:
 *   --target <lean expr>   the board to reach (default: `target`; try `start`)
 *   --messages             also show what Lean said, one line per message
 *   --source               also show the Lean file we generated
 *
 * Exit code: 0 if cleared, 1 for any other verdict, 2 for a usage mistake (including a
 * --target that isn't a board).
 */
import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { buildFile } from '../src/template.ts';
import { runLean } from '../src/lean.ts';
import { classify, type Verdict } from '../src/verdict.ts';

const HELP = `Check a proof with real Lean and print the verdict.

  npm run check -- "swap 1 3" "paint 3 blue" "rotate 3"     each argument is one line
  npm run check -- "swap 1 3\\nrotate 5"                     or use \\n inside one argument
  npm run check -- --file my-proof.txt
  echo "swap 1 3" | npm run check

Options:
  --target <lean expr>   board to reach (default: target; try "start" for "do nothing")
  --messages             also show what Lean said
  --source               also show the Lean file we generated

The sample level (from lean/Tactile/Examples.lean). Cells are numbered from 1.
Locked cells are in [ ]. Colours you may paint: yellow, blue, green.
(Every run prints a key for the letters: Y yellow, B blue, P pink, G green, W white.)

   Y↑  B↑  P→      cells 1 2 3
   G↑ [W↓] Y←      cells 4 5 6
   B→  P↑  G↑      cells 7 8 9

The default target is what you get from:  swap 1 3 / paint 3 blue / rotate 3
`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    target: { type: 'string' },
    file: { type: 'string' },
    messages: { type: 'boolean' },
    source: { type: 'boolean' },
    help: { type: 'boolean', short: 'h' },
  },
});

function readStdin(): string {
  return readFileSync(0, 'utf8');
}

let text: string;
if (values.help) {
  console.log(HELP);
  process.exit(0);
} else if (values.file !== undefined) {
  text = readFileSync(values.file, 'utf8');
} else if (positionals.length > 0) {
  // A literal backslash followed by n (typed inside quotes) means "new line".
  text = positionals.join('\n').replaceAll('\\n', '\n');
} else if (!process.stdin.isTTY) {
  text = readStdin();
} else {
  console.error(HELP);
  process.exit(2);
}

const { source, layout } = buildFile(text, values.target);
// The check and the board drawing are independent, so run them side by side.
const [messages, boards] = await Promise.all([runLean(source), drawBoards(values.target ?? 'target')]);

// If the boards can't be drawn, then either --target isn't a board (the proof was then checked
// against nothing, so its verdict would be meaningless) or the sample level itself is broken.
// Either way, say so and stop instead of printing a verdict we can't stand behind.
if (!boards.ok) {
  console.error(
    values.target !== undefined
      ? `Your --target isn't a board: ${boards.reason}\n(--target takes a Lean expression for a board, such as "start" or "target".)`
      : `Could not draw the boards: ${boards.reason}`,
  );
  process.exit(2);
}

const verdict = classify(messages, layout);

console.log(boards.text);

// Show the proof with line numbers, and mark the line the verdict points at.
const lines = text.split(/\r?\n/);
while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
const flagged = 'line' in verdict ? verdict.line : undefined;
console.log('Proof:');
if (lines.length === 0) console.log('  (empty)');
lines.forEach((line, i) => {
  const mark = i + 1 === flagged ? `   <-- ${verdict.status}` : '';
  console.log(`  ${String(i + 1).padStart(2)}  ${line.trim()}${mark}`);
});

console.log(`\nVerdict: ${describe(verdict, lines)}`);

if (values.messages) {
  console.log('\nLean said:');
  if (messages.length === 0) console.log('  (nothing)');
  for (const m of messages) {
    const where = `${m.pos.line}:${m.pos.column}`;
    console.log(`  ${m.severity.padEnd(11)} @${where.padEnd(6)} ${m.data.split('\n')[0]}`);
  }
}
if (values.source) {
  console.log('\nGenerated Lean file:');
  console.log(source.split('\n').map((l, i) => `  ${String(i + 1).padStart(2)}  ${l}`).join('\n'));
}

process.exit(verdict.status === 'cleared' ? 0 : 1);

/**
 * The start board and the target board, drawn by Lean (`Board.render`, the same function the
 * demo uses) so this can't drift from the real level. Shown side by side with the cell numbers.
 */
async function drawBoards(
  target: string,
): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
  const drawn = await runLean(
    [
      'import Tactile',
      'open Tactile Tactile.Examples',
      '#eval IO.println (Board.render level start)',
      `#eval IO.println (Board.render level (${target}))`,
      '#eval IO.println Board.legend',
      '',
    ].join('\n'),
  );

  const errors = drawn.filter((m) => m.severity === 'error');
  const [start, goal, legend] = drawn
    .filter((m) => m.severity === 'information')
    .map((m) => m.data.replace(/\n+$/, '').split('\n'));
  if (errors.length > 0 || start === undefined || goal === undefined || legend === undefined) {
    // Lean's messages run over several lines. The first two usually say what is wrong.
    const reason = errors[0]?.data.split('\n').slice(0, 2).map((l) => l.trim()).join(' ');
    return { ok: false, reason: reason ?? 'Lean printed nothing' };
  }

  // Each cell is drawn 4 characters wide, so the row width tells us how many cells per row.
  const perRow = Math.round(start[0].length / 4);
  const numbers = start.map((_, row) =>
    Array.from({ length: perRow }, (_, col) => String(row * perRow + col + 1).padStart(2)).join(' '),
  );

  const column = (title: string, rows: string[]) => [title, ...rows];
  const cols = [column('Start', start), column('Target', goal), column('Cells', numbers)];
  const widths = cols.map((c) => Math.max(...c.map((line) => line.length)));
  const table = cols[0].map((_, i) => cols.map((c, k) => c[i].padEnd(widths[k])).join('    ').trimEnd());
  return { ok: true, text: [...table, '', legend.join('\n')].join('\n') + '\n' };
}

/** A plain-English sentence for each verdict. This is not the final player-facing text. */
function describe(v: Verdict, proof: string[]): string {
  const at = (line: number) => `line ${line}  (${proof[line - 1]?.trim() ?? ''})`;
  switch (v.status) {
    case 'cleared':
      return 'CLEARED. Lean accepted the proof and the board matches the target.';
    case 'mismatch':
      return "MISMATCH. Every move was legal, but the board isn't the target yet.";
    case 'illegal':
      return `ILLEGAL MOVE on ${at(v.line)}. It breaks a rule: a cell that doesn't exist, a locked cell, or a colour that isn't allowed.`;
    case 'invalid':
      return `INVALID COMMAND on ${at(v.line)}. Lean can't read it as swap, paint or rotate.`;
    case 'rejected':
      return `REJECTED. The proof compiled but cheats: ${v.reason}.`;
    case 'error':
      return `ERROR. Lean said something we can't read: ${v.detail}`;
  }
}
