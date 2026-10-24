/**
 * The three moves, as two pure functions each (the same split as `lean/Tactile/Move.lean`):
 *
 * - `whyIllegal`: is the move allowed? Returns the reason, or `undefined` if it is.
 * - `apply`: the new board after the move. It assumes the move is legal.
 *
 * `step` runs the check and then `apply`, so a caller can't skip the check.
 */
import type { Board, Illegal, Level, Move } from './types.ts';

/** The cells a move touches, as the player numbered them. */
export function cellsOf(m: Move): number[] {
  switch (m.kind) {
    case 'swap':
      return [m.a, m.b];
    case 'paint':
    case 'rotate':
      return [m.cell];
  }
}

const unique = (xs: readonly number[]): number[] => [...new Set(xs)];

/**
 * Rules, in Lean's order: a cell that doesn't exist, then a locked cell, then a colour that
 * isn't in the palette. Pointless moves such as `swap 3 3` are legal.
 */
export function whyIllegal(level: Level, board: Board, m: Move): Illegal | undefined {
  const touched = unique(cellsOf(m));
  // Valid cells are 1 .. board.length. Zero is a missing cell too: players count from 1.
  const missing = touched.filter((c) => c === 0 || c > board.length);
  if (missing.length > 0) return { kind: 'noSuchCell', cells: missing };

  const locked = touched.filter((c) => level.locked.includes(c));
  if (locked.length > 0) return { kind: 'locked', cells: locked };

  if (m.kind === 'paint' && !level.palette.includes(m.color)) {
    return { kind: 'colorNotAllowed', color: m.color };
  }
  return undefined;
}

/** The board after a legal move. Builds a new array and never touches the old one. */
export function apply(m: Move, board: Board): Board {
  switch (m.kind) {
    case 'swap':
      // The blocks keep their `id`, so the screen can slide them past each other.
      return board.map((blk, i) =>
        i === m.a - 1 ? board[m.b - 1]! : i === m.b - 1 ? board[m.a - 1]! : blk,
      );
    case 'paint':
      return board.map((blk, i) => (i === m.cell - 1 ? { ...blk, color: m.color } : blk));
    case 'rotate':
      return board.map((blk, i) => (i === m.cell - 1 ? { ...blk, turns: blk.turns + 1 } : blk));
  }
}

export type StepResult =
  | { readonly ok: true; readonly board: Board }
  | { readonly ok: false; readonly why: Illegal };

/** Check the move, then apply it. */
export function step(level: Level, board: Board, m: Move): StepResult {
  const why = whyIllegal(level, board, m);
  return why === undefined ? { ok: true, board: apply(m, board) } : { ok: false, why };
}
