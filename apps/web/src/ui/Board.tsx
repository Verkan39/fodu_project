import { useReducedMotion } from 'framer-motion';
import type { CSSProperties } from 'react';
import type { Board as BoardData, Level } from '../engine/types.ts';
import { BlockView } from './Block.tsx';
import { dashedOutline } from './outline.ts';

export interface BoardProps {
  board: BoardData;
  level: Pick<Level, 'width' | 'locked'>;
  size?: 'normal' | 'target' | 'mini' | 'hero';
  /** Print the cell numbers (1-based) on the blocks. */
  numbers?: boolean;
  /** Cells (1-based) hit by an illegal move: red hatch. */
  red?: readonly number[];
  /** Cells that still differ from the target: dashed outline. */
  differing?: readonly number[];
  /** Cells being played right now: orange ring. */
  ring?: readonly number[];
  /** The whole board gets a coloured border: red (a cell doesn't exist) or green (cleared). */
  frame?: 'error' | 'success' | null;
  /** Wrap in the rounded tray. Off for the target picture, which has its own. */
  tray?: boolean;
}

/** Block size per board size, in Figma units. Must match `--cell` for `.board.<size>` in styles.css. */
const CELL: Record<NonNullable<BoardProps['size']>, { n3: number; n4: number }> = {
  normal: { n3: 96, n4: 78 },
  target: { n3: 52, n4: 40 },
  mini: { n3: 48, n4: 36 },
  hero: { n3: 128, n4: 128 },
};

/** The dashed "still differs" outline around one block. Sizes are Figma units; see outline.ts for the shape. */
export function DiffOutline({ cell, small = false }: { cell: number; small?: boolean }) {
  const off = small ? 4 : 6;
  const sw = small ? 2 : 3;
  const o = dashedOutline({ cell, off, sw });
  const u = (v: number) => `calc(${v} * var(--px))`;
  return (
    <svg
      className="cell-diff"
      viewBox={`0 0 ${o.width} ${o.height}`}
      style={{ left: u(-off), top: u(-off), width: u(o.width), height: u(o.height) }}
      aria-hidden="true"
    >
      {o.segments.map((seg, i) => (
        // Start half a dash early, so a dash is centred on each corner.
        <path key={i} d={seg.d} strokeWidth={sw} strokeDasharray={`${seg.dash} ${seg.gap}`} strokeDashoffset={seg.dash / 2} />
      ))}
    </svg>
  );
}

/**
 * Draws a board. The blocks sit in one layer, keyed by their `id`, so when the board changes
 * the same block elements move to their new cells and Framer Motion slides them there. The cell
 * numbers and marks sit in a second layer that is tied to the cells, not to the blocks.
 */
export function BoardView({ board, level, size = 'normal', numbers = true, red = [], differing = [], ring = [], frame = null, tray = true }: BoardProps) {
  const reduce = useReducedMotion() ?? false;
  const small = size === 'mini' || size === 'target';
  const n = level.width;
  const style = { '--n': n } as CSSProperties;

  const grid = (
    <div className={`board n${n} ${size}`} style={style} role="img" aria-label={`${n} by ${n} board`}>
      <div className="layer blocks">
        {board.map((blk, i) => (
          <BlockView key={blk.id} block={blk} locked={level.locked.includes(i + 1)} still={reduce || small} />
        ))}
      </div>
      <div className="layer marks">
        {board.map((_, i) => {
          const cell = i + 1;
          return (
            <div className="cell-mark" key={cell}>
              {red.includes(cell) && <div className="cell-red" />}
              {differing.includes(cell) && <DiffOutline cell={CELL[size][n === 4 ? 'n4' : 'n3']} small={small} />}
              {ring.includes(cell) && <div className="cell-ring" />}
              {numbers && <span className="cell-num">{cell}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );

  if (!tray) return grid;
  return <div className={`tray${frame === 'error' ? ' err' : frame === 'success' ? ' ok' : ''}`}>{grid}</div>;
}
