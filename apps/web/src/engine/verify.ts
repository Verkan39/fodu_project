/**
 * Who decides the verdict.
 *
 * The screens never call `run` for a verdict directly: they ask a `Verifier`, which is just a
 * function from an attempt to a verdict. This is passing behaviour as a value, the core
 * functional idea. There are two:
 *
 * - `leanVerifier` (`lean.ts`): the server checks the proof with real Lean, and Lean also sends
 *   the boards to play back. **This is the one the app uses** (`App.tsx`).
 * - `browserVerifier` (below): our own TypeScript simulator. It is kept, but not connected, so it
 *   can be switched back on for offline play later.
 *
 * `source` is how the screen stays honest: a verdict from the browser is a preview, not Lean's
 * word (Learning Log, section 6.5).
 */
import { run, type Outcome, type RunResult } from './run.ts';
import type { Level } from './types.ts';

export type Source = 'browser' | 'lean';

export interface Attempt {
  readonly level: Level;
  /** The helper editor's text. */
  readonly helpers: string;
  /** The proof editor's text. */
  readonly proof: string;
}

export interface Verified {
  readonly outcome: Outcome;
  readonly source: Source;
  /** What the screen plays back: the board after each line. Its `outcome` is the same verdict. */
  readonly run?: RunResult;
}

export type Verifier = (attempt: Attempt) => Promise<Verified>;

/** Checks with our own simulator. Fast, works offline, but it is not Lean. Not connected now. */
export const browserVerifier: Verifier = async ({ level, helpers, proof }) => {
  const result = run(level, helpers, proof);
  return { outcome: result.outcome, source: 'browser', run: result };
};
