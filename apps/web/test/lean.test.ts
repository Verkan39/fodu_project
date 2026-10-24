import { describe, expect, it, vi } from 'vitest';
import answers from './data/lean-answers.json';
import { levelById } from '../src/engine/levels.ts';
import { makeLeanVerifier, runFromLean, type LeanTrace } from '../src/engine/lean.ts';
import type { Outcome } from '../src/engine/run.ts';
import { facing } from '../src/engine/types.ts';

/**
 * The answers in `data/lean-answers.json` were recorded from the real server running real Lean,
 * so these tests replay what Lean actually says.
 */
type Recorded = { request: { level: string; helpers?: string; proof: string }; response: { outcome: Outcome; trace: LeanTrace | null } };
const recorded = answers as unknown as Record<string, Recorded>;

function replay(name: string) {
  const { request, response } = recorded[name]!;
  const level = levelById(request.level as 'L1');
  return { level, request, response, run: runFromLean(level, request.proof, response.outcome, response.trace) };
}

const answering = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("runFromLean: Lean's moves, regrouped by proof line", () => {
  it('a plain proof: one played line per move, ending on the target', () => {
    const { level, run } = replay('L1_cleared');
    expect(run.played.map((p) => [p.line, p.text, p.moves.length])).toEqual([
      [1, 'swap 2 8', 1],
      [2, 'rotate 4', 1],
      [3, 'paint 6 green', 1],
    ]);
    expect(run.played[0]!.before).toBe(level.start);
    expect(run.played[1]!.before).toBe(run.played[0]!.after);
    const look = run.final.map((b) => [b.color, facing(b)]);
    expect(look).toEqual(level.target.map((b) => [b.color, facing(b)]));
  });

  it('swaps move block ids, so the screen can slide them; turns only go up', () => {
    const { level, run } = replay('L1_cleared');
    const afterSwap = run.played[0]!.after;
    expect(afterSwap[1]!.id).toBe(level.start[7]!.id);
    expect(afterSwap[7]!.id).toBe(level.start[1]!.id);
    // `rotate 4` turns the green block from down (2) to left (3).
    expect(run.played[1]!.after[3]!.turns).toBe(level.start[3]!.turns + 1);
  });

  it('a helper call is one played line with all its moves', () => {
    const { run } = replay('L5_cleared_helper');
    expect(run.played.map((p) => p.moves.length)).toEqual([1, 3, 3, 3, 3, 3]);
    expect(run.played[1]!.moves).toEqual([
      { kind: 'paint', cell: 7, color: 'green' },
      { kind: 'rotate', cell: 7 },
      { kind: 'rotate', cell: 7 },
    ]);
  });

  it('the line with the illegal move is not played, and the board is the one before it', () => {
    const { run } = replay('L2_illegal');
    expect(run.played.map((p) => p.line)).toEqual([1]);
    expect(run.final).toBe(run.played[0]!.after);
    expect(run.outcome).toMatchObject({ status: 'illegal', line: 2, cells: [2, 5] });
  });

  it('a helper that breaks halfway: its first moves ran in Lean, but the line is not played', () => {
    const { response, run } = replay('L2_illegal_inside_helper');
    // Lean ran `swap 2 7` (line 2) and the helper's `rotate 3` (line 3), then stopped on line 3.
    expect(response.trace!.steps.map((s) => s.line)).toEqual([2, 3]);
    expect(run.played.map((p) => p.line)).toEqual([2]);
    expect(run.final).toBe(run.played[0]!.after);
  });

  it('no trace (the parser refused the text): nothing to play, the start board stays', () => {
    const level = levelById('L1');
    const outcome: Outcome = { status: 'invalid', editor: 'proof', line: 1, reason: 'x' };
    expect(runFromLean(level, 'swpa', outcome, null)).toEqual({ played: [], final: level.start, outcome });
  });
});

describe('the Lean verifier', () => {
  it("posts the level id and both editors, and returns Lean's outcome with a run to play", async () => {
    const { level, request, response } = replay('L5_cleared_helper');
    const post = answering(response);
    const v = await makeLeanVerifier(post)({ level, helpers: request.helpers!, proof: request.proof });
    expect(v.outcome).toEqual({ status: 'cleared', lines: 9 });
    expect(v.run!.played).toHaveLength(6);
    const [url, init] = (post as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/verify');
    expect(JSON.parse(init.body as string)).toEqual({ level: 'L5', helpers: request.helpers, proof: request.proof });
  });

  it('no network, a busy server and a broken server are all "unavailable", never a clear', async () => {
    const level = levelById('L1');
    const attempt = { level, helpers: '', proof: 'swap 2 8' };
    const down = await makeLeanVerifier((async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch)(attempt);
    expect(down.outcome.status).toBe('unavailable');
    const busy = await makeLeanVerifier(answering({ error: 'busy' }, 503))(attempt);
    expect(busy.outcome).toMatchObject({ status: 'unavailable', detail: expect.stringContaining('busy') });
    const broken = await makeLeanVerifier(answering({ error: 'internal error' }, 500))(attempt);
    expect(broken.outcome.status).toBe('unavailable');
    for (const v of [down, busy, broken]) expect(v.run!.played).toEqual([]);
  });

  it('an answer that is not what the server sends is refused, not trusted', async () => {
    const level = levelById('L1');
    const attempt = { level, helpers: '', proof: 'swap 2 8' };
    const good = recorded.L1_cleared!.response;
    const bad = [
      'not json',
      { outcome: { status: 'cleared' } }, // no line count
      { outcome: { status: 'won', lines: 1 }, trace: null }, // unknown status
      { ...good, trace: { ...good.trace, steps: [{ line: 1, move: { kind: 'jump' }, board: [] }] } },
      { ...good, trace: { ...good.trace!, steps: good.trace!.steps.map((s) => ({ ...s, board: s.board.slice(1) })) } },
      { ...good, trace: { ...good.trace!, steps: good.trace!.steps.map((s) => ({ ...s, board: s.board.map((b) => ({ ...b, color: 'red' })) })) } },
    ];
    for (const body of bad) {
      const post = vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body))) as unknown as typeof fetch;
      expect((await makeLeanVerifier(post)(attempt)).outcome.status).toBe('error');
    }
  });

  it('server-only outcomes come through as they are', async () => {
    const level = levelById('L1');
    for (const outcome of [
      { status: 'rejected', reason: 'the proof uses sorry' },
      { status: 'timeout', seconds: 15 },
      { status: 'error', detail: 'x' },
    ]) {
      const v = await makeLeanVerifier(answering({ outcome, source: 'lean', trace: null }))({ level, helpers: '', proof: '' });
      expect(v.outcome).toEqual(outcome);
    }
  });
});
