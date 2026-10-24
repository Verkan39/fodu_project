import type { Move } from './types.ts';

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
