import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import solutions from './data/solutions.json';
import { EXAMPLE_LEVEL, LEVELS, levelById } from '../src/engine/levels.ts';
import { apply, step, whyIllegal } from '../src/engine/moves.ts';
import { differing, run, type Outcome } from '../src/engine/run.ts';
import { illegalMessage } from '../src/engine/messages.ts';
import { clearedCount, emptyProgress, isCleared, loadProgress, recordClear, saveProgress } from '../src/engine/progress.ts';
import { facing, type Color, type Level, type LevelId, type Move } from '../src/engine/types.ts';

const swap = (a: number, b: number): Move => ({ kind: 'swap', a, b });
const paint = (cell: number, color: Color): Move => ({ kind: 'paint', cell, color });
const rotate = (cell: number): Move => ({ kind: 'rotate', cell });

const L2 = levelById('L2');

describe('the moves', () => {
  it('rejects a locked cell, a missing cell and a colour outside the palette, in that order', () => {
    expect(whyIllegal(L2, L2.start, swap(2, 5))).toEqual({ kind: 'locked', cells: [5] });
    expect(whyIllegal(L2, L2.start, swap(1, 12))).toEqual({ kind: 'noSuchCell', cells: [12] });
    expect(whyIllegal(L2, L2.start, rotate(0))).toEqual({ kind: 'noSuchCell', cells: [0] });
    expect(whyIllegal(L2, L2.start, paint(2, 'pink'))).toEqual({ kind: 'colorNotAllowed', color: 'pink' });
    // A missing cell is reported before a locked one.
    expect(whyIllegal(L2, L2.start, swap(5, 12))).toEqual({ kind: 'noSuchCell', cells: [12] });
  });

  it('treats a pointless move as legal', () => {
    expect(whyIllegal(L2, L2.start, swap(3, 3))).toBeUndefined();
  });

  it('never changes the board it is given', () => {
    const before = JSON.stringify(L2.start);
    apply(swap(1, 2), L2.start);
    apply(rotate(1), L2.start);
    apply(paint(1, 'blue'), L2.start);
    expect(JSON.stringify(L2.start)).toBe(before);
  });

  it('swap moves blocks (ids travel), paint keeps the facing, rotate wraps from left to up', () => {
    const swapped = apply(swap(1, 2), L2.start);
    expect(swapped[0]!.id).toBe(L2.start[1]!.id);
    expect(swapped[1]!.id).toBe(L2.start[0]!.id);

    const painted = apply(paint(1, 'blue'), L2.start);
    expect(painted[0]!.color).toBe('blue');
    expect(facing(painted[0]!)).toBe(facing(L2.start[0]!));

    // cell 3 of L2 faces left (3); one rotate makes it face up (0), with turns still counting up
    const rotated = apply(rotate(3), L2.start);
    expect(facing(rotated[2]!)).toBe(0);
    expect(rotated[2]!.turns).toBe(L2.start[2]!.turns + 1);
  });

  it('step refuses an illegal move and gives the reason', () => {
    const r = step(L2, L2.start, swap(2, 5));
    expect(r.ok).toBe(false);
  });
});

describe('the levels (same checks as lean/LevelTests.lean)', () => {
  it('has six levels with square, same-sized boards', () => {
    expect(LEVELS.map((l) => l.id)).toEqual(['L1', 'L2', 'L3', 'L4', 'L5', 'L6']);
    for (const l of LEVELS) {
      expect(l.start.length).toBe(l.width * l.width);
      expect(l.target.length).toBe(l.start.length);
      expect(differing(l.start, l.target).length).toBeGreaterThan(0);
    }
  });

  it('keeps every locked block identical in the target (otherwise the level is unsolvable)', () => {
    for (const l of LEVELS) {
      for (const c of l.locked) {
        expect(l.start[c - 1]).toBeDefined();
        expect(differing([l.start[c - 1]!], [l.target[c - 1]!])).toEqual([]);
      }
    }
  });

  it('gives block ids that are unique', () => {
    for (const l of LEVELS) expect(new Set(l.start.map((b) => b.id)).size).toBe(l.start.length);
  });
});

describe("Lean's reference solutions", () => {
  const toMove = (m: (string | number)[]): Move =>
    m[0] === 'swap'
      ? { kind: 'swap', a: m[1] as number, b: m[2] as number }
      : m[0] === 'rotate'
        ? { kind: 'rotate', cell: m[1] as number }
        : { kind: 'paint', cell: m[1] as number, color: m[2] as never };

  for (const id of Object.keys(solutions) as LevelId[]) {
    it(`${id}: every move is legal and the board ends up as the target`, () => {
      const level = levelById(id);
      const moves = (solutions as Record<string, (string | number)[][]>)[id]!.map(toMove);
      let board = level.start;
      for (const m of moves) {
        const r = step(level, board, m);
        expect(r.ok, `move ${JSON.stringify(m)}`).toBe(true);
        if (r.ok) board = r.board;
      }
      expect(differing(board, level.target)).toEqual([]);
    });
  }
});

/** "illegal 2", "invalid helper 1", "cleared", ... the same words `run-fixtures.ts` uses. */
function describeOutcome(o: Outcome): string {
  if (o.status === 'invalid') return o.editor === 'helpers' ? `invalid helper ${o.line}` : `invalid ${o.line}`;
  return 'line' in o ? `${o.status} ${o.line}` : o.status;
}

describe("the teammates' Lean fixtures, played by our simulator", () => {
  const dir = fileURLToPath(new URL('../../../lean/fixtures/', import.meta.url));
  const files = readdirSync(dir).filter((f) => f.endsWith('.txt')).sort();

  it('finds the fixtures', () => expect(files.length).toBeGreaterThan(40));

  for (const f of files) {
    const lines = readFileSync(dir + f, 'utf8').split('\n');
    const headers: Record<string, string> = {};
    const helpers: string[] = [];
    let i = 0;
    for (; i < lines.length; i++) {
      const m = lines[i]!.match(/^# (\w+): (.*)$/);
      if (m === null) break;
      if (m[1] === 'helper') helpers.push(m[2]!);
      else headers[m[1]!] = m[2]!.trim();
    }
    it(`${f.replace('.txt', '')} → ${headers.expect}`, () => {
      const base: Level = headers.level === undefined || headers.level === 'example' ? EXAMPLE_LEVEL : levelById(headers.level as LevelId);
      const level: Level = headers.target === 'start' ? { ...base, target: base.start } : base;
      const result = run(level, helpers.join('\n'), lines.slice(i).join('\n'));
      expect(describeOutcome(result.outcome)).toBe(headers.expect);
    });
  }
});

describe('what the player is told', () => {
  it('says the same thing Lean says', () => {
    const board = L2.start;
    expect(illegalMessage(L2, board, { kind: 'noSuchCell', cells: [12] })).toBe("Cell 12 doesn't exist. This board has cells 1–9.");
    expect(illegalMessage(L2, board, { kind: 'locked', cells: [5] })).toBe("Cell 5 is locked and can't be moved, painted or rotated.");
    expect(illegalMessage(L2, board, { kind: 'colorNotAllowed', color: 'pink' })).toBe("Pink isn't available here. You can use green or blue.");
  });

  it('reports an illegal move inside a helper on the line that calls it, and flags only cells that exist', () => {
    const r = run(L2, 'macro "bad" : tactic => `(tactic| (rotate 3; swap 2 5))', 'bad');
    expect(r.outcome).toMatchObject({ status: 'illegal', line: 1, cells: [2, 5] });
    // The board is shown as it was before that line, not half-way through the helper.
    expect(r.final).toBe(L2.start);
  });

  it('counts a helper as its steps plus one per call (Level 3: 3 + 3 = 6, at the limit)', () => {
    const L3 = levelById('L3');
    const r = run(L3, 'macro "spin3" : tactic => `(tactic| (rotate 1; rotate 2; rotate 3))', 'spin3\nspin3\nspin3');
    expect(r.outcome).toEqual({ status: 'cleared', lines: 6 });
  });

  it('passes a helper its number and applies it in the right place (Level 5 uses `fix i`)', () => {
    const L5 = levelById('L5');
    const helper = 'macro "fix " i:num : tactic => `(tactic| (paint $i green; rotate $i; rotate $i))';
    expect(run(L5, helper, 'swap 2 7\nfix 7\nfix 1\nfix 4\nfix 13\nfix 16').outcome).toEqual({ status: 'cleared', lines: 9 });
  });
});

describe('progress', () => {
  it('keeps the best (fewest) lines and counts cleared levels', () => {
    let p = recordClear(emptyProgress, 'L1', 5);
    p = recordClear(p, 'L1', 3);
    p = recordClear(p, 'L1', 4);
    expect(p.best.L1).toBe(3);
    expect(isCleared(p, 'L1')).toBe(true);
    expect(isCleared(p, 'L2')).toBe(false);
    expect(clearedCount(recordClear(p, 'L3', 6))).toBe(2);
  });

  it('survives a round trip through storage, and garbage in storage', () => {
    const store = new Map<string, string>();
    const fake = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    const p = recordClear(emptyProgress, 'L4', 5);
    saveProgress(fake, p);
    expect(loadProgress(fake)).toEqual(p);
    store.set('tactile.progress.v1', '{"best":{"L1":-3,"L9":2,"L2":"x"}}');
    expect(loadProgress(fake)).toEqual(emptyProgress);
    store.set('tactile.progress.v1', 'not json');
    expect(loadProgress(fake)).toEqual(emptyProgress);
  });
});
