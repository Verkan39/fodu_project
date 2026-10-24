import { useReducedMotion } from 'framer-motion';
import type { CSSProperties } from 'react';
import type { Board as BoardData, Level } from '../engine/types.ts';
import { BlockView } from './Block.tsx';

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
  /** Cells being played right now: yellow ring. */
  ring?: readonly number[];
  /** The whole board gets a coloured border: red (a cell doesn't exist) or green (cleared). */
  frame?: 'error' | 'success' | null;
  /** Wrap in the rounded tray. Off for the target picture, which has its own. */
  tray?: boolean;
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
              {differing.includes(cell) && <div className="cell-diff" />}
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
