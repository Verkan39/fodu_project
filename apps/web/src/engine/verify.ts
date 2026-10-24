/**
 * Who decides the verdict.
 *
 * The screens never call `run` for a verdict directly: they ask a `Verifier`, which is just a
 * function from an attempt to a verdict. Today the only one is `browserVerifier`, which uses
 * our own simulator, so the app works with no server. When the API exists, a `leanVerifier`
 * (POST the attempt, read Lean's verdict) is a second function of the same type, and nothing
 * else in the app changes. This is passing behaviour as a value, the core functional idea.
 *
 * `source` is how the screen stays honest: a verdict from the browser is a preview, not Lean's
 * word (Learning Log, section 6.5).
 */
import { run, type Outcome } from './run.ts';
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
}

export type Verifier = (attempt: Attempt) => Promise<Verified>;

/** Checks with our own simulator. Fast, works offline, but it is not Lean. */
export const browserVerifier: Verifier = async ({ level, helpers, proof }) => ({
  outcome: run(level, helpers, proof).outcome,
  source: 'browser',
});
