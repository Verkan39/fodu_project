/**
 * What the player has achieved: which levels are cleared and the fewest lines used on each.
 * The functions are pure (they return a new `Progress`); only `loadProgress` and `saveProgress`
 * touch the browser's storage, and they take the storage as an argument so tests can pass a fake.
 */
import { LEVEL_IDS, type LevelId } from './types.ts';

/** `best[id]` is the fewest lines the level was cleared with. Missing = not cleared yet. */
export interface Progress {
  readonly best: Readonly<Partial<Record<LevelId, number>>>;
}

export const emptyProgress: Progress = { best: {} };

export const isCleared = (p: Progress, id: LevelId): boolean => p.best[id] !== undefined;

export const clearedCount = (p: Progress): number => LEVEL_IDS.filter((id) => isCleared(p, id)).length;

/** Record a clear. The best (smallest) line count is kept. */
export function recordClear(p: Progress, id: LevelId, lines: number): Progress {
  const old = p.best[id];
  return { best: { ...p.best, [id]: old === undefined ? lines : Math.min(old, lines) } };
}

const KEY = 'tactile.progress.v1';

type ReadStorage = Pick<Storage, 'getItem'>;
type WriteStorage = Pick<Storage, 'setItem'>;

/** Anything unreadable (no storage, bad JSON, wrong shape) gives an empty progress. */
export function loadProgress(storage: ReadStorage): Progress {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(KEY) ?? 'null');
    if (typeof parsed !== 'object' || parsed === null || !('best' in parsed)) return emptyProgress;
    const best: Partial<Record<LevelId, number>> = {};
    for (const id of LEVEL_IDS) {
      const v = (parsed.best as Record<string, unknown>)[id];
      if (typeof v === 'number' && Number.isInteger(v) && v > 0) best[id] = v;
    }
    return { best };
  } catch {
    return emptyProgress;
  }
}

export function saveProgress(storage: WriteStorage, p: Progress): void {
  try {
    storage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Private mode or a full disk: the game still works, it just won't remember.
  }
}
