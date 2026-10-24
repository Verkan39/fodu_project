/**
 * `run(level, helpers, proof)`: play a player's attempt on a level.
 *
 * It is one pure function. Its steps:
 *
 *   1. parse both editors (the parser is the server's own `script.ts`, so the browser and the
 *      server agree on what is a valid command);
 *   2. expand every helper call into plain moves;
 *   3. apply the moves line by line, stopping at the first illegal one;
 *   4. compare with the target, then with the line limit.
 *
 * The result lists the board after each line, so the screen can play the proof back, show the
 * board after any line, and mark the line that went wrong. Same input, same output, no
 * side effects: that is what lets us test it against Lean's own fixtures.
 */
import {
  countLines,
  parseScript,
  type Cell,
  type Editor,
  type Helper,
  type Step,
} from '../../../server/src/script.ts';
import { illegalMessage } from './messages.ts';
import { cellsOf, step } from './moves.ts';
import { sameLook, type Board, type Illegal, type Level, type Move } from './types.ts';

/** One command line of the proof, played. */
export interface PlayedLine {
  /** 1-based editor line. */
  readonly line: number;
  /** What the player wrote on it, without comments. */
  readonly text: string;
  /** The plain moves it stands for (more than one when it calls a helper). */
  readonly moves: readonly Move[];
  readonly before: Board;
  readonly after: Board;
}

export type Outcome =
  /** Accepted: the board matches and the proof is within the line limit. */
  | { readonly status: 'cleared'; readonly lines: number }
  /** Every move was legal, but these cells (1-based) still differ from the target. */
  | { readonly status: 'mismatch'; readonly differing: readonly number[] }
  /** A move broke a rule. `cells` are the existing cells it touched: they turn red. */
  | {
      readonly status: 'illegal';
      readonly line: number;
      readonly why: Illegal;
      readonly cells: readonly number[];
      readonly message: string;
    }
  /** Not a command we understand. `editor` says which editor the line is in. */
  | { readonly status: 'invalid'; readonly editor: Editor; readonly line: number; readonly reason: string }
  /** Correct, but longer than the level allows. */
  | { readonly status: 'tooLong'; readonly lines: number; readonly limit: number }
  /* The four below come only from Lean (`engine/lean.ts`); this simulator never produces them. */
  /** The proof compiled but cheated (`sorry` or a forbidden axiom). Never a clear. */
  | { readonly status: 'rejected'; readonly reason: string }
  /** Lean didn't finish in time. Never a clear. */
  | { readonly status: 'timeout'; readonly seconds: number }
  /** Lean said something the server or the page couldn't read. Never a clear. */
  | { readonly status: 'error'; readonly detail: string }
  /** The page couldn't reach the proof checker (offline, busy or not started). Never a clear. */
  | { readonly status: 'unavailable'; readonly detail: string };

export interface RunResult {
  /** The lines that were played, in order. Stops before an illegal line. */
  readonly played: readonly PlayedLine[];
  /** The board to show when the run is over. */
  readonly final: Board;
  readonly outcome: Outcome;
  /** The line count the level's limit is measured against. Absent if the text didn't parse. */
  readonly lines?: number;
}

/** A cell in a script: a number, or the helper's number parameter. */
function cellValue(c: Cell, param: number | undefined): number {
  // The parser only allows the parameter inside a helper that has one, so `param` is set then.
  return c.kind === 'num' ? c.value : (param ?? 0);
}

/**
 * The plain moves a step stands for. A helper call becomes its body, with the parameter
 * replaced by the number the call passed. Helpers can only call helpers defined above them
 * (the parser checks), so this always ends.
 */
export function expandStep(s: Step, helpers: ReadonlyMap<string, Helper>, param?: number): Move[] {
  switch (s.kind) {
    case 'swap':
      return [{ kind: 'swap', a: cellValue(s.a, param), b: cellValue(s.b, param) }];
    case 'paint':
      return [{ kind: 'paint', cell: cellValue(s.cell, param), color: s.color }];
    case 'rotate':
      return [{ kind: 'rotate', cell: cellValue(s.cell, param) }];
    case 'call': {
      const helper = helpers.get(s.name);
      if (helper === undefined) return [];
      const arg = s.arg === undefined ? undefined : cellValue(s.arg, param);
      return helper.body.flatMap((inner) => expandStep(inner, helpers, arg));
    }
  }
}

const withoutComment = (line: string): string => {
  const at = line.indexOf('--');
  return (at === -1 ? line : line.slice(0, at)).trim();
};

/** 1-based cells whose block doesn't look like the target's. */
export function differing(board: Board, target: Board): number[] {
  return board.flatMap((blk, i) => (sameLook(blk, target[i]!) ? [] : [i + 1]));
}

export function run(level: Level, helperText: string, proofText: string): RunResult {
  const parsed = parseScript(helperText, proofText);
  if (!parsed.ok) {
    const { editor, line, reason } = parsed;
    return { played: [], final: level.start, outcome: { status: 'invalid', editor, line, reason } };
  }

  const { script } = parsed;
  const lines = countLines(script);
  const helpers = new Map(script.helpers.map((h) => [h.name, h]));
  const texts = proofText.split(/\r?\n/);

  const played: PlayedLine[] = [];
  let board = level.start;

  for (const [i, s] of script.proof.entries()) {
    if (s === null) continue;
    const moves = expandStep(s, helpers);
    const before = board;
    for (const m of moves) {
      const result = step(level, board, m);
      if (!result.ok) {
        // The error belongs to the line that was written, even when the bad move is inside a
        // helper (Lean reports it there too). Only cells that exist can turn red.
        const cells = cellsOf(m).filter((c) => c >= 1 && c <= board.length);
        const message = illegalMessage(level, board, result.why);
        return {
          played,
          final: before,
          lines,
          outcome: { status: 'illegal', line: i + 1, why: result.why, cells, message },
        };
      }
      board = result.board;
    }
    played.push({ line: i + 1, text: withoutComment(texts[i] ?? ''), moves, before, after: board });
  }

  const wrong = differing(board, level.target);
  if (wrong.length > 0) {
    return { played, final: board, lines, outcome: { status: 'mismatch', differing: wrong } };
  }
  if (level.lineLimit !== null && lines > level.lineLimit) {
    return { played, final: board, lines, outcome: { status: 'tooLong', lines, limit: level.lineLimit } };
  }
  return { played, final: board, lines, outcome: { status: 'cleared', lines } };
}
