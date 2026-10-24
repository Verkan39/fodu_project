/**
 * The levels. The boards come from `data/levels.json`, which Lean prints (`lean/Export.lean`),
 * so there is one source of truth. Only the names and short descriptions live here.
 */
import raw from '../data/levels.json';
import { COLORS } from '../../../server/src/script.ts';
import { LEVEL_IDS, type Board, type Color, type Level, type LevelId, type PlayLevel } from './types.ts';

type RawBlock = [color: string, facing: number];
interface RawLevel {
  width: number;
  locked: number[];
  palette: string[];
  lineLimit: number | null;
  start: RawBlock[];
  target: RawBlock[];
}

const isColor = (s: string): s is Color => (COLORS as readonly string[]).includes(s);

function colorOf(s: string): Color {
  if (!isColor(s)) throw new Error(`levels.json: "${s}" is not a colour`);
  return s;
}

function decodeBoard(rows: RawBlock[], width: number): Board {
  if (rows.length !== width * width) throw new Error('levels.json: a board is not square');
  return rows.map(([color, facing], i) => {
    if (!Number.isInteger(facing) || facing < 0 || facing > 3) throw new Error('levels.json: bad facing');
    return { id: i, color: colorOf(color), turns: facing };
  });
}

function decodeLevel(id: Level['id'], r: RawLevel): Level {
  return {
    id,
    width: r.width,
    locked: r.locked,
    palette: r.palette.map(colorOf),
    lineLimit: r.lineLimit,
    start: decodeBoard(r.start, r.width),
    target: decodeBoard(r.target, r.width),
  };
}

const data = raw as unknown as Record<string, RawLevel>;

function decode(id: Level['id']): Level {
  const r = data[id];
  if (r === undefined) throw new Error(`levels.json has no level ${id}`);
  return decodeLevel(id, r);
}

export const LEVELS: readonly PlayLevel[] = LEVEL_IDS.map((id) => decode(id) as PlayLevel);

export const levelById = (id: LevelId): PlayLevel => LEVELS.find((l) => l.id === id)!;

export interface LevelMeta {
  readonly name: string;
  /** Shown on the level map, in capitals: what this level introduces. */
  readonly tag: string;
  /** Does the player get a helper editor? (The levels where helpers pay off.) */
  readonly helpers: boolean;
}

/** Names come from the comments in `lean/Tactile/Levels.lean`. The tags are ours. */
export const LEVEL_META: Readonly<Record<LevelId, LevelMeta>> = {
  L1: { name: 'First Steps', tag: 'All three moves', helpers: false },
  L2: { name: 'Locked Out', tag: 'Locked blocks · paint colours', helpers: false },
  L3: { name: 'Name It', tag: 'Helpers', helpers: true },
  L4: { name: 'See the Shortcut', tag: '4 × 4 · tight line limit', helpers: true },
  L5: { name: 'Recipe', tag: 'A helper with a number', helpers: true },
  L6: { name: 'Everything', tag: 'All together', helpers: true },
};

export const nextLevel = (id: LevelId): LevelId | undefined => LEVEL_IDS[LEVEL_IDS.indexOf(id) + 1];
