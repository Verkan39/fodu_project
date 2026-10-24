/**
 * Runs every fixture in `lean/fixtures/` through real Lean and checks the verdict.
 *
 * A fixture is a text file: header lines, then the player's moves.
 *
 *   # expect: illegal 2        what the verdict should be (see `describe`)
 *   # target: start            optional: `target` (default) or `start`
 *   # level: L3                optional: a level id from `template.ts` (default `example`)
 *   # helper: macro "s" ...    optional, repeatable: one line of the helper editor each
 *   swap 1 3
 *   rotate 5
 *
 * Usage: node scripts/run-fixtures.ts [name-filter]
 */
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { isLevelId } from '../src/template.ts';
import { verify, type Attempt } from '../src/verify.ts';
import type { Verdict } from '../src/verdict.ts';

const FIXTURE_DIR = fileURLToPath(new URL('../../../lean/fixtures/', import.meta.url));
const PARALLEL = 4;

interface Fixture {
  name: string;
  expect: string;
  attempt: Attempt;
}

/** Headers are the leading lines of the form `# key: value`. Everything after is player text. */
function parseFixture(name: string, text: string): Fixture {
  const lines = text.split('\n');
  const headers: Record<string, string> = {};
  const helpers: string[] = [];
  let i = 0;
  for (; i < lines.length; i++) {
    const m = lines[i].match(/^# (\w+): (.*)$/);
    if (m === null) break;
    if (m[1] === 'helper') helpers.push(m[2]);
    else headers[m[1]] = m[2].trim();
  }
  const { expect, target, level } = headers;
  if (expect === undefined) throw new Error(`${name}: missing "# expect:" header`);
  if (target !== undefined && target !== 'target' && target !== 'start') {
    throw new Error(`${name}: "# target:" must be target or start`);
  }
  if (level !== undefined && !isLevelId(level)) throw new Error(`${name}: unknown level "${level}"`);
  return {
    name,
    expect,
    attempt: { helpers: helpers.join('\n'), proof: lines.slice(i).join('\n'), target, level },
  };
}

/** "illegal 2", "invalid helper 1", "cleared", ... */
function describe(v: Verdict): string {
  if (v.status === 'invalid' && v.editor === 'helpers') return `invalid helper ${v.line}`;
  return 'line' in v ? `${v.status} ${v.line}` : v.status;
}

async function runOne(f: Fixture): Promise<{ ok: boolean; got: string; ms: number; verdict: Verdict }> {
  const started = Date.now();
  const { verdict } = await verify(f.attempt);
  const got = describe(verdict);
  return { ok: got === f.expect, got, ms: Date.now() - started, verdict };
}

const filter = process.argv[2] ?? '';
const files = (await readdir(FIXTURE_DIR)).filter((n) => n.endsWith('.txt') && n.includes(filter)).sort();
const fixtures = await Promise.all(
  files.map(async (n) => parseFixture(n.replace(/\.txt$/, ''), await readFile(FIXTURE_DIR + n, 'utf8'))),
);

let failed = 0;
const queue = [...fixtures];
async function worker() {
  for (let f = queue.shift(); f !== undefined; f = queue.shift()) {
    const r = await runOne(f);
    if (!r.ok) failed++;
    const v = r.verdict;
    const detail = 'detail' in v ? `  (${v.detail})` : 'reason' in v && v.reason ? `  (${v.reason})` : '';
    console.log(
      `${r.ok ? '✔' : '✖'} ${f.name.padEnd(38)} ${f.expect.padEnd(11)} ${r.ok ? '' : `GOT ${r.got}${detail}`} ${r.ms}ms`,
    );
  }
}
await Promise.all(Array.from({ length: PARALLEL }, worker));

console.log(`\n${fixtures.length - failed}/${fixtures.length} fixtures gave the expected verdict`);
process.exit(failed === 0 ? 0 : 1);
