/**
 * What a checked attempt looks like: the verdict, and the board after each proof line so the
 * screen can play it back. Lean produces both (`lean.ts`).
 */
import type { Editor } from '../../../server/src/script.ts';
import type { Board, Illegal, Move } from './types.ts';

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
}
