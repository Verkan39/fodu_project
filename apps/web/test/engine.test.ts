import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/engine/levels.ts';
import { clearedCount, emptyProgress, isCleared, loadProgress, recordClear, saveProgress } from '../src/engine/progress.ts';
import { sameLook } from '../src/engine/types.ts';

describe('the levels (same checks as lean/LevelTests.lean)', () => {
  it('has six levels with square, same-sized boards', () => {
    expect(LEVELS.map((l) => l.id)).toEqual(['L1', 'L2', 'L3', 'L4', 'L5', 'L6']);
    for (const l of LEVELS) {
      expect(l.start.length).toBe(l.width * l.width);
      expect(l.target.length).toBe(l.start.length);
      expect(l.start.some((b, i) => !sameLook(b, l.target[i]!))).toBe(true);
    }
  });

  it('keeps every locked block identical in the target (otherwise the level is unsolvable)', () => {
    for (const l of LEVELS) {
      for (const c of l.locked) {
        expect(l.start[c - 1]).toBeDefined();
        expect(sameLook(l.start[c - 1]!, l.target[c - 1]!)).toBe(true);
      }
    }
  });

  it('gives block ids that are unique', () => {
    for (const l of LEVELS) expect(new Set(l.start.map((b) => b.id)).size).toBe(l.start.length);
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
