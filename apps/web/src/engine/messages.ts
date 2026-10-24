/** The words the player reads while a proof plays back. */
import type { Move } from './types.ts';

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
