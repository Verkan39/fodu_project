/**
 * The data the game works on. Everything here is plain, read-only data: a move never edits a
 * board, it returns a new one (the same idea as `Move.apply` in `lean/Tactile/Move.lean`).
 */
import type { Color } from '../../../server/src/script.ts';

export type { Color };

/**
 * One block. `id` never changes, so the screen can follow a block as it moves (a swap slides
 * two blocks past each other instead of redrawing them).
 *
 * `turns` counts quarter turns clockwise and only ever goes up, so a rotate from "left" back to
 * "up" keeps turning the same way. The facing the rules care about is `turns mod 4`
 * (0 = up, 1 = right, 2 = down, 3 = left), as in Lean.
 */
export interface Block {
  readonly id: number;
  readonly color: Color;
  readonly turns: number;
}

/** One block per cell, in reading order. Cell numbers are 1-based, list positions 0-based. */
export type Board = readonly Block[];

export const facing = (b: Block): number => b.turns % 4;

/** Do two blocks look the same? (Ignores `id`, and how many full turns got us here.) */
export const sameLook = (a: Block, b: Block): boolean => a.color === b.color && facing(a) === facing(b);

export const LEVEL_IDS = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6'] as const;
export type LevelId = (typeof LEVEL_IDS)[number];

export interface Level {
  readonly id: LevelId | 'example';
  /** Cells per row. The boards are square. */
  readonly width: number;
  /** Cells no move may touch (1-based). */
  readonly locked: readonly number[];
  /** The colours `paint` may use here. */
  readonly palette: readonly Color[];
  /** The most lines a solution may use, or `null` for no limit. */
  readonly lineLimit: number | null;
  readonly start: Board;
  readonly target: Board;
}

/** A level the player can open (the sample level used by tests isn't one). */
export type PlayLevel = Level & { readonly id: LevelId };

/** The three moves, with cell numbers as the player typed them (1-based). */
export type Move =
  | { readonly kind: 'swap'; readonly a: number; readonly b: number }
  | { readonly kind: 'paint'; readonly cell: number; readonly color: Color }
  | { readonly kind: 'rotate'; readonly cell: number };

/** Why a move is illegal. Rules are checked in this order and the first failure wins. */
export type Illegal =
  | { readonly kind: 'noSuchCell'; readonly cells: readonly number[] }
  | { readonly kind: 'locked'; readonly cells: readonly number[] }
  | { readonly kind: 'colorNotAllowed'; readonly color: Color };
