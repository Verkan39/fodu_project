/**
 * The words the player reads. The illegal-move messages are the ones in `lean/Tactile/Move.lean`
 * (`Illegal.message`), so the browser and Lean say the same thing.
 */
import type { Board, Illegal, Level, Move } from './types.ts';

/** `joinWords("or", ["a", "b", "c"]) = "a, b or c"` */
export function joinWords(conj: string, words: readonly string[]): string {
  if (words.length === 0) return '';
  if (words.length === 1) return words[0]!;
  return `${words.slice(0, -1).join(', ')} ${conj} ${words[words.length - 1]}`;
}

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export function illegalMessage(level: Level, board: Board, why: Illegal): string {
  switch (why.kind) {
    case 'noSuchCell':
      return why.cells.length === 1
        ? `Cell ${why.cells[0]} doesn't exist. This board has cells 1–${board.length}.`
        : `Cells ${joinWords('and', why.cells.map(String))} don't exist. This board has cells 1–${board.length}.`;
    case 'locked':
      return why.cells.length === 1
        ? `Cell ${why.cells[0]} is locked and can't be moved, painted or rotated.`
        : `Cells ${joinWords('and', why.cells.map(String))} are locked and can't be moved, painted or rotated.`;
    case 'colorNotAllowed':
      return `${capitalize(why.color)} isn't available here. You can use ${joinWords('or', level.palette)}.`;
  }
}

/** A move written the way the player would type it. */
export function moveText(m: Move): string {
  switch (m.kind) {
    case 'swap':
      return `swap ${m.a} ${m.b}`;
    case 'paint':
      return `paint ${m.cell} ${m.color}`;
    case 'rotate':
      return `rotate ${m.cell}`;
  }
}

/** What a move does, in a sentence, for the status line while the board plays. */
export function describeMove(m: Move): string {
  switch (m.kind) {
    case 'swap':
      return m.a === m.b ? `cell ${m.a} stays where it is.` : `cells ${m.a} and ${m.b} trade places.`;
    case 'paint':
      return `cell ${m.cell} becomes ${m.color} and keeps its facing.`;
    case 'rotate':
      return `cell ${m.cell} turns a quarter turn clockwise.`;
  }
}
