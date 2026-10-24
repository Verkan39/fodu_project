/**
 * `leanVerifier`: real Lean decides the verdict, **and** supplies the boards to animate.
 *
 * The page posts the attempt to the server (`POST /api/verify`). Lean checks the proof and also
 * runs it with the same `Move.step`, sending the board after every move, with each block's `id`
 * (so a swap can slide two blocks past each other) and `turns` (so a rotation always turns
 * clockwise). This file only regroups those moves by proof line into the `RunResult` the screen
 * already knows how to play back. **It contains no game rules**: nothing here decides whether a
 * move is legal or what a move does to a board.
 *
 * Every answer is checked before use: it comes over the network, so it is untrusted data.
 */
import { COLORS } from '../../../server/src/script.ts';
import type { Outcome, PlayedLine, RunResult } from './run.ts';
import type { Block, Board, Level, Move } from './types.ts';
import type { Verified, Verifier } from './verify.ts';

/** Vite forwards `/api` to the server in `dev` and `preview` (`vite.config.ts`). */
export const VERIFY_URL = '/api/verify';

/** One move Lean ran: the proof line it came from, the move, and the board after it. */
export interface LeanStep {
  readonly line: number;
  readonly move: Move;
  readonly board: Board;
}

export interface LeanTrace {
  readonly steps: readonly LeanStep[];
  /** The line of the first illegal move, if any. */
  readonly stop: { readonly line: number } | null;
}

const withoutComment = (line: string): string => {
  const at = line.indexOf('--');
  return (at === -1 ? line : line.slice(0, at)).trim();
};

/**
 * Lean's moves, regrouped by proof line. A helper call is one line with several moves. The line
 * with the illegal move isn't "played" (the screen shows the board before it, and marks it red),
 * even if a helper got halfway through it.
 */
export function runFromLean(level: Level, proofText: string, outcome: Outcome, trace: LeanTrace | null): RunResult {
  const texts = proofText.split(/\r?\n/);
  const played: PlayedLine[] = [];
  let board = level.start;
  for (const s of trace?.steps ?? []) {
    if (s.line === trace?.stop?.line) break;
    const last = played.at(-1);
    if (last !== undefined && last.line === s.line) {
      played[played.length - 1] = { ...last, moves: [...last.moves, s.move], after: s.board };
    } else {
      played.push({ line: s.line, text: withoutComment(texts[s.line - 1] ?? ''), moves: [s.move], before: board, after: s.board });
    }
    board = s.board;
  }
  return { played, final: played.at(-1)?.after ?? level.start, outcome };
}

/* ------------------------------------------------------------------ checking the answer */

type Json = Record<string, unknown>;
const isObject = (x: unknown): x is Json => typeof x === 'object' && x !== null && !Array.isArray(x);
const isCell = (x: unknown): x is number => Number.isInteger(x) && (x as number) >= 0;
const isColor = (x: unknown): boolean => typeof x === 'string' && (COLORS as readonly string[]).includes(x);
const isCells = (x: unknown): x is number[] => Array.isArray(x) && x.every(isCell);

function isMove(x: unknown): x is Move {
  if (!isObject(x)) return false;
  switch (x.kind) {
    case 'swap':
      return isCell(x.a) && isCell(x.b);
    case 'paint':
      return isCell(x.cell) && isColor(x.color);
    case 'rotate':
      return isCell(x.cell);
    default:
      return false;
  }
}

const isBlock = (x: unknown): x is Block =>
  isObject(x) && isCell(x.id) && isColor(x.color) && Number.isInteger(x.turns) && (x.turns as number) >= 0;

function isTrace(x: unknown, size: number): x is LeanTrace {
  if (!isObject(x) || !Array.isArray(x.steps)) return false;
  const stepsOk = x.steps.every(
    (s) => isObject(s) && isCell(s.line) && isMove(s.move) && Array.isArray(s.board) && s.board.length === size && s.board.every(isBlock),
  );
  return stepsOk && (x.stop === null || (isObject(x.stop) && isCell(x.stop.line)));
}

/** Only the outcomes the screen knows, with the fields it reads. */
function isOutcome(x: unknown): x is Outcome {
  if (!isObject(x)) return false;
  switch (x.status) {
    case 'cleared':
      return isCell(x.lines);
    case 'mismatch':
      return isCells(x.differing);
    case 'illegal':
      return isCell(x.line) && isObject(x.why) && isCells(x.cells) && typeof x.message === 'string';
    case 'invalid':
      return (x.editor === 'proof' || x.editor === 'helpers') && isCell(x.line) && typeof x.reason === 'string';
    case 'tooLong':
      return isCell(x.lines) && isCell(x.limit);
    case 'rejected':
      return typeof x.reason === 'string';
    case 'timeout':
      return isCell(x.seconds);
    case 'error':
      return typeof x.detail === 'string';
    default:
      return false;
  }
}

/* ------------------------------------------------------------------ the verifier */

/** An outcome the page made up itself (no answer from Lean): nothing to play back. */
function noAnswer(level: Level, outcome: Outcome): Verified {
  return { outcome, source: 'lean', run: { played: [], final: level.start, outcome } };
}

export function makeLeanVerifier(post: typeof fetch = (...args) => fetch(...args)): Verifier {
  return async ({ level, helpers, proof }) => {
    let res: Response;
    try {
      res = await post(VERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: level.id, helpers, proof }),
      });
    } catch {
      return noAnswer(level, { status: 'unavailable', detail: "Can't reach the proof checker. Is the server running?" });
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = undefined;
    }

    if (!res.ok) {
      const busy = isObject(body) && body.error === 'busy';
      return noAnswer(level, {
        status: 'unavailable',
        detail: busy ? 'The proof checker is busy. Try again in a moment.' : 'The proof checker is offline right now.',
      });
    }
    if (!isObject(body) || !isOutcome(body.outcome) || !(body.trace === null || isTrace(body.trace, level.start.length))) {
      return noAnswer(level, { status: 'error', detail: "The proof checker's answer couldn't be read." });
    }
    const trace = body.trace as LeanTrace | null;
    return { outcome: body.outcome, source: 'lean', run: runFromLean(level, proof, body.outcome, trace) };
  };
}

/** The verifier the app uses: real Lean on the server. */
export const leanVerifier: Verifier = makeLeanVerifier();
