/**
 * Builds the Lean file that checks a player's proof.
 *
 * **Everything in the file is printed from data.** The player's moves arrive as a `Script`
 * (`script.ts`), the level and target are picked from fixed lists below, and nothing the player
 * typed is copied in as text. Not even helper names: helper k is printed as the keyword
 * `tactile_hk` (see `keyword`). The frame, with n helpers:
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
import { COLORS, type Cell, type Helper, type Script, type Step } from './script.ts';

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

/**
 * The Lean keyword for the helper at `index` (0-based). A helper's keyword becomes a token for
 * the whole file, so a player's own name could clash with a Lean tactic (`grind`, `dsimp`, ...)
 * and quietly change what the line does. A name the player can't choose never clashes.
 */
export const keyword = (index: number) => `tactile_h${index + 1}`;

/** Player keywords to printed keywords, for the helpers defined so far. */
type Keywords = Map<string, string>;

/**
 * `parseScript` already guarantees everything checked below. It is checked again because these
 * values are printed into a file Lean runs, and nothing type-checks this project, so a `Script`
 * built some other way (say, from an API's JSON) must not be able to slip text in.
 */
function cell(c: Cell): string {
  if (c.kind === 'param') return '$i';
  if (!Number.isInteger(c.value) || c.value < 0) throw new Error(`not a cell number: ${c.value}`);
  return String(c.value);
}

function step(s: Step, keywords: Keywords): string {
  switch (s.kind) {
    case 'swap':
      return `swap ${cell(s.a)} ${cell(s.b)}`;
    case 'paint':
      if (!COLORS.includes(s.color)) throw new Error(`not a colour: ${s.color}`);
      return `paint ${cell(s.cell)} ${s.color}`;
    case 'rotate':
      return `rotate ${cell(s.cell)}`;
    case 'call': {
      const k = keywords.get(s.name);
      if (k === undefined) throw new Error(`no helper called ${s.name} is defined above this`);
      return s.arg === undefined ? k : `${k} ${cell(s.arg)}`;
    }
  }
}

/** The parameter is always printed as `i`, whatever the player called it. */
function helper(h: Helper, k: string, keywords: Keywords): string {
  const head = h.hasParam ? `macro "${k} " i:num` : `macro "${k}"`;
  return `${head} : tactic => \`(tactic| (${h.body.map((s) => step(s, keywords)).join('; ')}))`;
}

export function buildFile(
  script: Script,
  options: { level?: LevelId; target?: Target } = {},
): BuiltFile {
  const namespace = LEVELS[options.level ?? 'example'];
  const target = options.target ?? 'target';

  // A helper can only call helpers above it, so each keyword is added after its own line.
  const keywords: Keywords = new Map();
  const helperLines = script.helpers.map((h, index) => {
    const k = keyword(index);
    const line = helper(h, k, keywords);
    keywords.set(h.name, k);
    return line;
  });
  const theoremLine = 4 + helperLines.length;
  const body = script.proof.map((s) => (s === null ? '' : `  ${step(s, keywords)}`));

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
