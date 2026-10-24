/**
 * What `POST /api/verify` answers, in the **frontend's own shape**: the same `outcome` objects its
 * in-browser simulator produces, so swapping the simulator for the server needs no UI changes.
 *
 * Three outcomes only the server can produce, so the UI must add them:
 * `rejected` (the proof cheated), `timeout` (Lean took too long) and `error` (Lean said something
 * we can't read). None of them is ever a clear.
 */
import type { Editor } from './script.ts';
import type { Why } from './trace.ts';
import type { Checked } from './verify.ts';

export type Outcome =
  | { status: 'cleared'; lines: number }
  | { status: 'mismatch'; differing: number[] }
  | { status: 'illegal'; line: number; why: Why; cells: number[]; message: string }
  | { status: 'invalid'; editor: Editor; line: number; reason: string }
  | { status: 'tooLong'; lines: number; limit: number }
  | { status: 'rejected'; reason: string }
  | { status: 'timeout'; seconds: number }
  | { status: 'error'; detail: string };

const error = (detail: string): Outcome => ({ status: 'error', detail });

export function toOutcome(checked: Checked): Outcome {
  const { verdict, trace, lines } = checked;
  switch (verdict.status) {
    case 'cleared':
      return lines === undefined ? error('no line count for a cleared proof') : { status: 'cleared', lines };
    case 'mismatch':
      // The UI marks the differing cells, so without the trace there is nothing honest to show.
      return trace === undefined ? error('Lean gave no trace for the mismatch') : { status: 'mismatch', differing: trace.differing };
    case 'illegal': {
      const stop = trace?.stop;
      if (stop === undefined || stop === null) return error('Lean gave no trace for the illegal move');
      return { status: 'illegal', line: verdict.line, why: stop.why, cells: stop.cells, message: stop.message };
    }
    case 'invalid':
      // Our parser always says which editor and why. Lean rejecting a line the parser let through
      // is rare (the parser is stricter), and Lean's own message isn't meant for players.
      return {
        status: 'invalid',
        editor: verdict.editor ?? 'proof',
        line: verdict.line,
        reason: verdict.reason ?? "Lean couldn't read this line as a move",
      };
    case 'tooLong':
    case 'rejected':
    case 'timeout':
    case 'error':
      return verdict;
  }
}
