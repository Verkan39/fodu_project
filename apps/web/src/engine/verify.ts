/**
 * Who decides the verdict. The screens never decide it themselves: they ask a `Verifier`, a
 * function from an attempt to a verdict. The app uses `leanVerifier` (`lean.ts`).
 */
import type { Outcome, RunResult } from './run.ts';
import type { Level } from './types.ts';

export interface Attempt {
  readonly level: Level;
  /** The helper editor's text. */
  readonly helpers: string;
  /** The proof editor's text. */
  readonly proof: string;
}

export interface Verified {
  readonly outcome: Outcome;
  /** What the screen plays back: the board after each line. Its `outcome` is the same verdict. */
  readonly run?: RunResult;
}

export type Verifier = (attempt: Attempt) => Promise<Verified>;

