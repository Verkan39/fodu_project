/**
 * Checks one attempt from start to finish: parse, build the Lean file, run Lean, read the verdict,
 * then apply the level's line limit.
 *
 * If the text doesn't parse, Lean never runs (`script.ts` explains why that is the security
 * boundary).
 */
import { countLines, parseScript } from './script.ts';
import { buildFile, LIMIT_MARK, type LevelId, type Target } from './template.ts';
import { LeanTimeout, runLean, TIME_LIMIT_SECONDS } from './lean.ts';
import { classify, type LeanMessage, type Verdict } from './verdict.ts';
import { readTrace, type Trace } from './trace.ts';

export interface Attempt {
  /** The helper editor's text. */
  helpers?: string;
  /** The proof editor's text. */
  proof: string;
  level?: LevelId;
  target?: Target;
}

export interface Checked {
  verdict: Verdict;
  /** Lines counted against the limit. Absent when the text didn't parse. */
  lines?: number;
  /** The level's line limit, `null` for none. Absent when Lean didn't run or didn't say. */
  limit?: number | null;
  /** The board after each move, and where the run stopped. Absent when Lean didn't run. */
  trace?: Trace;
  /** Only when Lean ran, for debugging tools. */
  source?: string;
  messages?: LeanMessage[];
}

export async function verify(attempt: Attempt): Promise<Checked> {
  const parsed = parseScript(attempt.helpers ?? '', attempt.proof);
  if (!parsed.ok) {
    const { editor, line, reason } = parsed;
    return { verdict: { status: 'invalid', editor, line, reason } };
  }

  const { source, layout } = buildFile(parsed.script, { level: attempt.level, target: attempt.target });
  let messages: LeanMessage[];
  try {
    messages = await runLean(source);
  } catch (err) {
    // Any other failure means Lean couldn't run at all, which is our problem, not a verdict.
    if (err instanceof LeanTimeout) return { verdict: { status: 'timeout', seconds: TIME_LIMIT_SECONDS }, source };
    throw err;
  }
  const verdict = classify(messages, layout);
  const lines = countLines(parsed.script);
  const rawLimit = readLimit(messages);
  const limit = rawLimit === undefined ? undefined : rawLimit === 0 ? null : rawLimit;
  const trace = readTrace(messages);
  const extra = { lines, limit, trace, source, messages };

  const disagreement = trace === undefined ? undefined : disagrees(verdict, trace);
  if (disagreement !== undefined) {
    return { verdict: { status: 'error', detail: `the proof check and the trace disagree: ${disagreement}` }, ...extra };
  }

  if (verdict.status === 'cleared') {
    if (limit === undefined) {
      return { verdict: { status: 'error', detail: "Lean didn't report the level's line limit" }, ...extra };
    }
    if (limit !== null && lines > limit) {
      return { verdict: { status: 'tooLong', lines, limit }, ...extra };
    }
  }
  return { verdict, ...extra };
}

/**
 * The verdict comes from Lean checking the proof, the trace from Lean running `Move.step`. Both
 * use the same rules, so they should always agree; if they don't, neither can be trusted.
 */
function disagrees(verdict: Verdict, trace: Trace): string | undefined {
  switch (verdict.status) {
    case 'cleared':
      return trace.stop === null && trace.differing.length === 0 ? undefined : 'cleared, but the trace does not reach the target';
    case 'mismatch':
      return trace.stop === null && trace.differing.length > 0 ? undefined : 'mismatch, but the trace stopped or reached the target';
    case 'illegal':
      return trace.stop?.line === verdict.line ? undefined : `illegal on line ${verdict.line}, trace stopped on ${trace.stop?.line ?? 'no line'}`;
    default:
      return undefined;
  }
}

/** The limit printed by the file's last line. 0 means the level has no limit. */
function readLimit(messages: LeanMessage[]): number | undefined {
  for (const m of messages) {
    const found = m.severity === 'information' && m.data.match(new RegExp(`^${LIMIT_MARK} (\\d+)`));
    if (found) return Number(found[1]);
  }
  return undefined;
}
