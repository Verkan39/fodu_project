/**
 * Builds the Lean file that checks a player's proof.
 *
 * **Everything in the file is printed from data.** The player's moves arrive as a `Script`
 * (`script.ts`), the level and target are picked from fixed lists below, and nothing the player
 * typed is copied in as text. The frame, with n helpers:
 *
 *   1      import Tactile
 *   2      open Tactile <level namespace>
 *   3
 *   4      <helper 1>                <- one line per helper, printed from the Script
 *          ...
 *   3+n    <helper n>
 *   4+n    theorem sol : Reach level start (<target>) := by
 *   5+n    <player line 1>           <- `firstLine`
 *          ...
 *          <player line k>           <- `lastLine`
 *          finish                    <- `finishLine`, added by us
 *          (blank)
 *          #print axioms sol
 *          #eval ...                 <- prints the level's line limit (see `LIMIT_MARK`)
 *
 * Proof lines map one to one onto file lines, so a Lean error on file line 7 is an error on
 * editor line `7 - firstLine + 1`. Blank and comment lines become blank file lines for that reason.
 */
import type { Cell, Helper, Script, Step } from './script.ts';

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

/** The levels a file can be built for, and the Lean namespace that defines each. */
export const LEVELS = {
  example: 'Tactile.Examples',
  L1: 'Tactile.Levels.L1',
  L2: 'Tactile.Levels.L2',
  L3: 'Tactile.Levels.L3',
  L4: 'Tactile.Levels.L4',
  L5: 'Tactile.Levels.L5',
  L6: 'Tactile.Levels.L6',
} as const;
export type LevelId = keyof typeof LEVELS;

export const isLevelId = (s: string): s is LevelId => Object.hasOwn(LEVELS, s);

/** The board to reach: the level's target, or `start` (the "do nothing" check used in fixtures). */
export type Target = 'target' | 'start';

/** The file prints this word followed by the level's line limit (0 = no limit). */
export const LIMIT_MARK = 'tactile:limit';

function cell(c: Cell): string {
  return c.kind === 'num' ? String(c.value) : '$i';
}

function step(s: Step): string {
  switch (s.kind) {
    case 'swap':
      return `swap ${cell(s.a)} ${cell(s.b)}`;
    case 'paint':
      return `paint ${cell(s.cell)} ${s.color}`;
    case 'rotate':
      return `rotate ${cell(s.cell)}`;
    case 'call':
      return s.arg === undefined ? s.name : `${s.name} ${cell(s.arg)}`;
  }
}

/** The parameter is always printed as `i`, whatever the player called it. */
function helper(h: Helper): string {
  const head = h.hasParam ? `macro "${h.name} " i:num` : `macro "${h.name}"`;
  return `${head} : tactic => \`(tactic| (${h.body.map(step).join('; ')}))`;
}

export function buildFile(
  script: Script,
  options: { level?: LevelId; target?: Target } = {},
): BuiltFile {
  const namespace = LEVELS[options.level ?? 'example'];
  const target = options.target ?? 'target';

  const helperLines = script.helpers.map(helper);
  const theoremLine = 4 + helperLines.length;
  const body = script.proof.map((s) => (s === null ? '' : `  ${step(s)}`));

  const source = [
    'import Tactile',
    `open Tactile ${namespace}`,
    '',
    ...helperLines,
    `theorem sol : Reach level start (${target}) := by`,
    ...body,
    '  finish',
    '',
    '#print axioms sol',
    `#eval IO.println s!"${LIMIT_MARK} {level.lineLimit.getD 0}"`,
    '',
  ].join('\n');

  const firstLine = theoremLine + 1;
  return {
    source,
    layout: {
      firstLine,
      lastLine: theoremLine + body.length,
      finishLine: firstLine + body.length,
    },
  };
}
