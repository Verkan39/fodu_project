/**
 * Turns Lean's messages for a player's proof into one verdict.
 *
 * Lean carries on after the first error, so one mistake can produce several messages
 * (see Learning Log, Entry 5). The rule below looks only at the **first bad line**:
 *
 * 1. Ignore errors outside the player's lines and our `finish` line.
 * 2. No errors left: the proof compiled. It is cleared unless it used `sorry` or an axiom
 *    that isn't on our list.
 * 3. Otherwise take the earliest line with an error.
 *    - It is our `finish` line: every move was legal but the board isn't the target.
 *    - Any error on it is NOT one of our markers: invalid command (typo, bad syntax, or a
 *      Lean tactic we don't offer). A typo makes Lean also produce a spurious marker on the
 *      same line, so one non-marker error is enough.
 *    - Otherwise every error on it is our illegal-move marker: illegal move.
 *
 * The markers are the first words of the message that `lean/Tactile/Proof.lean` produces.
 */
import type { Layout } from './template.ts';
import type { Editor } from './script.ts';

export interface LeanMessage {
  severity: 'error' | 'warning' | 'information';
  /** Lean's own label for the message, e.g. `hasSorry`. */
  kind?: string;
  data: string;
  /** 1-based line, 0-based column, as in `lean --json`. */
  pos: { line: number; column: number };
}

export type Verdict =
  /** The proof is accepted. */
  | { status: 'cleared' }
  /** Every move was legal, but the board isn't the target. */
  | { status: 'mismatch' }
  /** A move broke a rule. `line` is the editor line (1-based). */
  | { status: 'illegal'; line: number }
  /**
   * Not a command we understand. `line` is the editor line (1-based). `editor` and `reason` are
   * set when our parser rejected the text before Lean ran (`script.ts`); `editor` absent = proof.
   */
  | { status: 'invalid'; line: number; editor?: Editor; reason?: string }
  /** The proof is correct but uses more lines than the level allows. */
  | { status: 'tooLong'; lines: number; limit: number }
  /** The proof compiled but cheated (`sorry`, or an axiom we don't allow). */
  | { status: 'rejected'; reason: string }
  /** Lean said something we don't know how to read. Never counts as cleared. */
  | { status: 'error'; detail: string };

export const ILLEGAL_MARK = 'tactile:illegal';
export const MISMATCH_MARK = 'tactile:mismatch';

/** Axioms every ordinary Lean proof may use. `sorryAx` and `Lean.ofReduceBool` are not here. */
const ALLOWED_AXIOMS = new Set(['propext', 'Classical.choice', 'Quot.sound']);

export function classify(messages: LeanMessage[], layout: Layout): Verdict {
  const errors = messages.filter((m) => m.severity === 'error');
  const relevant = errors.filter(
    (m) => m.pos.line >= layout.firstLine && m.pos.line <= layout.finishLine,
  );

  if (relevant.length === 0) {
    if (errors.length > 0) {
      return {
        status: 'error',
        detail: `Lean reported an error outside the player's lines: ${errors[0].data}`,
      };
    }
    return checkCheating(messages);
  }

  const line = Math.min(...relevant.map((m) => m.pos.line));
  const onLine = relevant.filter((m) => m.pos.line === line);

  if (line === layout.finishLine) {
    if (onLine.every((m) => m.data.startsWith(MISMATCH_MARK))) {
      return { status: 'mismatch' };
    }
    // For example "no goals": the player closed the proof early with their own tactic.
    return { status: 'error', detail: `Unexpected error on the closing line: ${onLine[0].data}` };
  }

  const editorLine = line - layout.firstLine + 1;
  if (onLine.some((m) => !m.data.startsWith(ILLEGAL_MARK))) {
    return { status: 'invalid', line: editorLine };
  }
  return { status: 'illegal', line: editorLine };
}

/** The proof compiled with no errors. Make sure it didn't cheat. */
function checkCheating(messages: LeanMessage[]): Verdict {
  if (messages.some((m) => m.kind === 'hasSorry')) {
    return { status: 'rejected', reason: 'the proof uses sorry' };
  }

  // We add `#print axioms sol` to every file. Without its report we can't vouch for the proof.
  const report = messages.find(
    (m) =>
      m.severity === 'information' &&
      /depends on axioms|does not depend on any axioms/.test(m.data),
  );
  if (report === undefined) {
    return { status: 'error', detail: 'Lean did not report which axioms the proof uses' };
  }

  const list = report.data.match(/\[(.*)\]/s);
  const axioms = list === null ? [] : list[1].split(',').map((a) => a.trim()).filter(Boolean);
  const forbidden = axioms.filter((a) => !ALLOWED_AXIOMS.has(a));
  if (forbidden.length > 0) {
    return { status: 'rejected', reason: `the proof uses ${forbidden.join(', ')}` };
  }
  return { status: 'cleared' };
}
