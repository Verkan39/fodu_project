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

  if (verdict.status === 'cleared') {
    const limit = readLimit(messages);
    if (limit === undefined) {
      return { verdict: { status: 'error', detail: "Lean didn't report the level's line limit" }, source, messages };
    }
    const lines = countLines(parsed.script);
    if (limit > 0 && lines > limit) {
      return { verdict: { status: 'tooLong', lines, limit }, source, messages };
    }
  }
  return { verdict, source, messages };
}

/** The limit printed by the file's last line. 0 means the level has no limit. */
function readLimit(messages: LeanMessage[]): number | undefined {
  for (const m of messages) {
    const found = m.severity === 'information' && m.data.match(new RegExp(`^${LIMIT_MARK} (\\d+)`));
    if (found) return Number(found[1]);
  }
  return undefined;
}
