/**
 * Builds the Lean file that checks a player's proof.
 *
 * The player only writes the moves. We wrap them in a fixed frame:
 *
 *   1  import Tactile
 *   2  open Tactile Tactile.Examples
 *   3
 *   4  theorem sol : Reach level start (<target>) := by
 *   5  <player line 1>          <- `firstLine`
 *      ...
 *      <player line n>          <- `lastLine`
 *      finish                   <- `finishLine`, added by us
 *      (blank)
 *      #print axioms sol
 *
 * Player lines map one to one onto file lines, so a Lean error on file line 7 is an error
 * on editor line `7 - firstLine + 1`. That is why blank and comment lines are kept.
 */

/** Where things sit in the generated file. All numbers are 1-based file lines. */
export interface Layout {
  firstLine: number;
  lastLine: number;
  finishLine: number;
}

export interface BuiltFile {
  source: string;
  layout: Layout;
}

/** Line of the `theorem` in the frame above. The player's lines start on the next one. */
const THEOREM_LINE = 4;

/**
 * @param playerText the text from the editor
 * @param target a Lean expression for the target board. For now it names a board that exists
 *   in `Tactile.Examples`. Later the server will generate it from the level's JSON.
 */
export function buildFile(playerText: string, target = 'target'): BuiltFile {
  const lines = playerText.split(/\r?\n/);

  // Trailing blank lines can't hold an error, and they would only push `finish` further down.
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }

  // Lean needs every tactic on the same column. Players may indent however they like, so each
  // line is trimmed and re-indented by two spaces. Blank lines stay blank.
  const body = lines.map((line) => {
    const trimmed = line.trim();
    return trimmed === '' ? '' : `  ${trimmed}`;
  });

  const source = [
    'import Tactile',
    'open Tactile Tactile.Examples',
    '',
    // Parentheses matter: a target such as `(Move.swap 1 3).apply start` would otherwise be
    // read as extra arguments to `Reach`.
    `theorem sol : Reach level start (${target}) := by`,
    ...body,
    '  finish',
    '',
    '#print axioms sol',
    '',
  ].join('\n');

  const firstLine = THEOREM_LINE + 1;
  return {
    source,
    layout: {
      firstLine,
      lastLine: THEOREM_LINE + lines.length,
      finishLine: firstLine + lines.length,
    },
  };
}
