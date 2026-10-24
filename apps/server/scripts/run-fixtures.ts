/**
 * Runs every fixture in `lean/fixtures/` through real Lean and checks the verdict.
 *
 * A fixture is a text file: header lines, then the player's moves.
 *
 *   # expect: illegal 2        what the verdict should be (see `parseExpectation`)
 *   # target: start            optional: Lean expression for the target (default `target`)
 *   swap 1 3
 *   rotate 5
 *
 * Usage: node scripts/run-fixtures.ts [name-filter]
 */
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildFile } from '../src/template.ts';
import { runLean } from '../src/lean.ts';
import { classify, type Verdict } from '../src/verdict.ts';

const FIXTURE_DIR = fileURLToPath(new URL('../../../lean/fixtures/', import.meta.url));
const PARALLEL = 4;

interface Fixture {
  name: string;
  expect: string;
  target?: string;
  playerText: string;
}

/** Headers are the leading lines of the form `# key: value`. Everything after is player text. */
function parseFixture(name: string, text: string): Fixture {
  const lines = text.split('\n');
  const headers: Record<string, string> = {};
  let i = 0;
  for (; i < lines.length; i++) {
    const m = lines[i].match(/^# (\w+): (.*)$/);
    if (m === null) break;
    headers[m[1]] = m[2].trim();
  }
  if (headers.expect === undefined) {
    throw new Error(`${name}: missing "# expect:" header`);
  }
  return { name, expect: headers.expect, target: headers.target, playerText: lines.slice(i).join('\n') };
}

/** "illegal 2" -> status and line; "cleared" -> status only. */
function describe(v: Verdict): string {
  return 'line' in v ? `${v.status} ${v.line}` : v.status;
}

async function runOne(f: Fixture): Promise<{ ok: boolean; got: string; ms: number; verdict: Verdict }> {
  const { source, layout } = buildFile(f.playerText, f.target);
  const started = Date.now();
  const messages = await runLean(source);
  const verdict = classify(messages, layout);
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
    const detail = 'detail' in r.verdict ? `  (${r.verdict.detail})` : '';
    console.log(
      `${r.ok ? '✔' : '✖'} ${f.name.padEnd(38)} ${f.expect.padEnd(11)} ${r.ok ? '' : `GOT ${r.got}${detail}`} ${r.ms}ms`,
    );
  }
}
await Promise.all(Array.from({ length: PARALLEL }, worker));

console.log(`\n${fixtures.length - failed}/${fixtures.length} fixtures gave the expected verdict`);
process.exit(failed === 0 ? 0 : 1);
