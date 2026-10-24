/**
 * Parses what the player typed into a `Script`: plain data that can only describe our moves
 * and helpers. This is the security boundary.
 *
 * The Lean file is printed from the `Script` (see `template.ts`), never from the player's text.
 * Anything that isn't one of our moves, a helper call, a blank line or a `--` comment is rejected
 * here, before Lean runs. So `#eval`, `run_tac`, `sorry`, `simp`, `macro_rules`, `repeat`, ... have
 * nowhere to go: there is no field in a `Script` that could hold them.
 *
 * Grammar (one command per line):
 *
 *   proof line   swap N N | paint N COLOUR | rotate N | HELPER | HELPER N
 *   helper line  macro "NAME" [P:num] : tactic => `(tactic| (STEP; STEP; ...))
 *                where each STEP is a proof command, and `$P` may stand for a cell number
 */

export const COLORS = ['yellow', 'blue', 'pink', 'green', 'white'] as const;
export type Color = (typeof COLORS)[number];

export type Editor = 'proof' | 'helpers';

/** A cell number, or the helper's parameter (only allowed inside a helper body). */
export type Cell = { kind: 'num'; value: number } | { kind: 'param' };

export type Step =
  | { kind: 'swap'; a: Cell; b: Cell }
  | { kind: 'paint'; cell: Cell; color: Color }
  | { kind: 'rotate'; cell: Cell }
  | { kind: 'call'; name: string; arg?: Cell };

export interface Helper {
  name: string;
  hasParam: boolean;
  body: Step[];
}

export interface Script {
  helpers: Helper[];
  /** One entry per editor line. `null` is a blank or comment line, kept so line numbers match. */
  proof: (Step | null)[];
}

export type ParseResult =
  | { ok: true; script: Script }
  | { ok: false; editor: Editor; line: number; reason: string };

/** Limits that keep a script small enough for Lean to check quickly. */
export const LIMITS = {
  textLength: 10_000,
  lineLength: 200,
  proofLines: 100,
  helpers: 8,
  bodySteps: 16,
  /** Moves after expanding every helper. Stops nested helpers from doubling up exponentially. */
  expandedMoves: 300,
};

const NAME = /^[a-z][a-z0-9]{1,15}$/;
const PARAM = /^[a-z][a-z0-9]{0,15}$/;
const NUMBER = /^[0-9]{1,4}$/;
const HELPER =
  /^macro\s+"([^"]*)"\s+(?:([^\s:]+)\s*:\s*num\s+)?:\s*tactic\s*=>\s*`\(tactic\|\s*(.*?)\s*\)$/;

/**
 * Names a helper may not take. A helper name becomes a Lean keyword, so it must not clash with
 * our moves, the colours, the words in our file frame, or common Lean tactics. If something is
 * missed here, the clash makes Lean report an error outside the player's lines, and that is
 * never cleared (`verdict.ts`).
 */
const RESERVED = new Set<string>([
  'swap', 'paint', 'rotate', 'finish', ...COLORS,
  'import', 'open', 'theorem', 'example', 'def', 'by', 'at', 'macro', 'syntax', 'tactic', 'num',
  'print', 'axioms', 'eval', 'sol', 'level', 'start', 'target',
  'sorry', 'admit', 'decide', 'fail', 'first', 'exact', 'refine', 'apply', 'intro', 'intros',
  'rfl', 'trivial', 'done', 'skip', 'repeat', 'try', 'simp', 'rw', 'have', 'show', 'calc',
  'fun', 'let', 'in', 'do', 'then', 'else', 'if', 'match', 'with', 'where', 'end', 'from',
  'this', 'only', 'using', 'case', 'next', 'all', 'any', 'focus', 'omega', 'constructor',
  'exists', 'induction', 'cases', 'unfold', 'change', 'assumption', 'contradiction', 'exfalso',
  'left', 'right', 'split', 'ext', 'funext', 'congr', 'namespace', 'section',
]);

type Problem = { reason: string };
const problem = (reason: string): Problem => ({ reason });
const isProblem = (x: unknown): x is Problem =>
  typeof x === 'object' && x !== null && 'reason' in x;

/** Removes a `--` comment and surrounding spaces. */
function stripComment(line: string): string {
  const at = line.indexOf('--');
  return (at === -1 ? line : line.slice(0, at)).trim();
}

interface Context {
  /** Helpers defined so far. A helper can only call helpers defined above it. */
  helpers: Map<string, Helper>;
  /** The parameter's name while parsing a helper body that has one. */
  param?: string;
}

function parseCell(token: string | undefined, ctx: Context): Cell | Problem {
  if (token === undefined) return problem('a cell number is missing');
  if (NUMBER.test(token)) return { kind: 'num', value: Number(token) };
  if (ctx.param !== undefined && token === `$${ctx.param}`) return { kind: 'param' };
  return problem(`"${token}" isn't a cell number`);
}

/** One command, already split into words. */
function parseStep(words: string[], ctx: Context): Step | Problem {
  const [command, ...args] = words;
  const arity = (n: number): Problem | undefined =>
    args.length === n
      ? undefined
      : problem(`${command} takes ${n === 1 ? '1 number' : `${n} words`} after it`);

  switch (command) {
    case 'swap': {
      const bad = arity(2);
      if (bad) return bad;
      const a = parseCell(args[0], ctx);
      const b = parseCell(args[1], ctx);
      if (isProblem(a)) return a;
      if (isProblem(b)) return b;
      return { kind: 'swap', a, b };
    }
    case 'paint': {
      const bad = arity(2);
      if (bad) return bad;
      const cell = parseCell(args[0], ctx);
      if (isProblem(cell)) return cell;
      const color = COLORS.find((c) => c === args[1]);
      if (color === undefined) {
        return problem(`"${args[1]}" isn't a colour. Colours are ${COLORS.join(', ')}`);
      }
      return { kind: 'paint', cell, color };
    }
    case 'rotate': {
      const bad = arity(1);
      if (bad) return bad;
      const cell = parseCell(args[0], ctx);
      if (isProblem(cell)) return cell;
      return { kind: 'rotate', cell };
    }
    default: {
      const helper = command === undefined ? undefined : ctx.helpers.get(command);
      if (helper === undefined) return problem(`"${command}" isn't a move or a helper defined above`);
      if (!helper.hasParam) {
        return args.length === 0 ? { kind: 'call', name: helper.name } : problem(`${command} takes no number`);
      }
      if (args.length !== 1) return problem(`${command} takes 1 cell number`);
      const arg = parseCell(args[0], ctx);
      if (isProblem(arg)) return arg;
      return { kind: 'call', name: helper.name, arg };
    }
  }
}

/** Number of plain moves a step stands for once every helper is expanded. */
function expandedSize(step: Step, sizes: Map<string, number>): number {
  return step.kind === 'call' ? (sizes.get(step.name) ?? 0) : 1;
}

function parseHelper(text: string, ctx: Context): Helper | Problem {
  const m = text.match(HELPER);
  if (m === null) {
    return problem('a helper must look like: macro "name" : tactic => `(tactic| (rotate 1; rotate 2))');
  }
  const name = m[1].trim();
  const paramName = m[2];
  let body = m[3];

  if (!NAME.test(name)) {
    return problem('a helper name is 2 to 16 lowercase letters or digits, starting with a letter');
  }
  if (RESERVED.has(name)) return problem(`"${name}" is a reserved word, pick another helper name`);
  if (ctx.helpers.has(name)) return problem(`there is already a helper called "${name}"`);
  if (paramName !== undefined && !PARAM.test(paramName)) {
    return problem(`"${paramName}" isn't a valid parameter name`);
  }

  if (body.startsWith('(') && body.endsWith(')')) body = body.slice(1, -1);
  if (/[()]/.test(body)) return problem('a helper body is a list of moves separated by ";"');

  const parts = body.split(';').map((s) => s.trim());
  if (parts.some((p) => p === '')) return problem('a helper body has an empty step');
  if (parts.length > LIMITS.bodySteps) {
    return problem(`a helper may have at most ${LIMITS.bodySteps} steps`);
  }

  const inner: Context = { helpers: ctx.helpers, param: paramName };
  const steps: Step[] = [];
  for (const part of parts) {
    const words = part.split(/\s+/);
    if (words[0] === name) return problem("a helper can't call itself");
    const step = parseStep(words, inner);
    if (isProblem(step)) return step;
    steps.push(step);
  }
  return { name, hasParam: paramName !== undefined, body: steps };
}

export function parseScript(helperText: string, proofText: string): ParseResult {
  const fail = (editor: Editor, line: number, reason: string): ParseResult => ({
    ok: false,
    editor,
    line,
    reason,
  });

  if (helperText.length > LIMITS.textLength) return fail('helpers', 1, 'the helpers are too long');
  if (proofText.length > LIMITS.textLength) return fail('proof', 1, 'the proof is too long');

  const ctx: Context = { helpers: new Map() };
  const sizes = new Map<string, number>();
  const helpers: Helper[] = [];

  const helperLines = helperText.split(/\r?\n/);
  for (const [i, raw] of helperLines.entries()) {
    const line = i + 1;
    if (raw.length > LIMITS.lineLength) return fail('helpers', line, 'this line is too long');
    const text = stripComment(raw);
    if (text === '') continue;
    if (helpers.length === LIMITS.helpers) {
      return fail('helpers', line, `at most ${LIMITS.helpers} helpers are allowed`);
    }
    const helper = parseHelper(text, ctx);
    if (isProblem(helper)) return fail('helpers', line, helper.reason);
    const size = helper.body.reduce((n, s) => n + expandedSize(s, sizes), 0);
    if (size > LIMITS.expandedMoves) {
      return fail('helpers', line, `this helper expands to ${size} moves, the most is ${LIMITS.expandedMoves}`);
    }
    helpers.push(helper);
    ctx.helpers.set(helper.name, helper);
    sizes.set(helper.name, size);
  }

  const proofLines = proofText.split(/\r?\n/);
  while (proofLines.length > 0 && stripComment(proofLines[proofLines.length - 1]) === '') {
    proofLines.pop();
  }
  if (proofLines.length > LIMITS.proofLines) {
    return fail('proof', LIMITS.proofLines + 1, `a proof may have at most ${LIMITS.proofLines} lines`);
  }

  const proof: (Step | null)[] = [];
  let expanded = 0;
  for (const [i, raw] of proofLines.entries()) {
    const line = i + 1;
    if (raw.length > LIMITS.lineLength) return fail('proof', line, 'this line is too long');
    const text = stripComment(raw);
    if (text === '') {
      proof.push(null);
      continue;
    }
    const step = parseStep(text.split(/\s+/), ctx);
    if (isProblem(step)) return fail('proof', line, step.reason);
    expanded += expandedSize(step, sizes);
    if (expanded > LIMITS.expandedMoves) {
      return fail('proof', line, `the proof expands to more than ${LIMITS.expandedMoves} moves`);
    }
    proof.push(step);
  }

  return { ok: true, script: { helpers, proof } };
}

/**
 * Lines counted against a level's line limit (Learning Log, Entry 6): a helper costs its number
 * of steps, and each proof line costs 1 whether it is a move or a helper call.
 */
export function countLines(script: Script): number {
  const helperCost = script.helpers.reduce((n, h) => n + h.body.length, 0);
  return helperCost + script.proof.filter((s) => s !== null).length;
}
