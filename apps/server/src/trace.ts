/**
 * The trace: the board after each move, where the run stopped, and which cells still differ.
 *
 * Lean computes it (`lean/Tactile/Trace.lean`) with the same `Move.step` the proof uses, so the
 * frontend never needs move rules of its own. This file does the two TypeScript halves:
 *
 * - `expandMoves`: turn a parsed `Script` into plain moves, each tagged with the proof line it
 *   came from (a helper call expands into several moves with the same line).
 * - `readTrace`: read the JSON Lean prints after `TRACE_MARK`.
 */
import { LIMITS, type Cell, type Color, type Script, type Step } from './script.ts';
import type { LeanMessage } from './verdict.ts';

export type Move =
  | { kind: 'swap'; a: number; b: number }
  | { kind: 'paint'; cell: number; color: Color }
  | { kind: 'rotate'; cell: number };

export interface TaggedMove {
  /** Proof editor line, 1-based. */
  line: number;
  move: Move;
}

/**
 * A board in the trace: one block per cell, with what the screen needs to animate it. `id` follows
 * a block through swaps (the start board numbers them 0, 1, 2, … in reading order) and `turns`
 * only goes up (facing = `turns % 4`). This is the frontend's own `Block`.
 */
export type Board = { id: number; color: Color; turns: number }[];

/** The rule an illegal move broke (the frontend's own shape). */
export type Why =
  | { kind: 'noSuchCell'; cells: number[] }
  | { kind: 'locked'; cells: number[] }
  | { kind: 'colorNotAllowed'; color: Color };

export interface Trace {
  /** One entry per move that ran: the proof line it came from, the move, and the board after it. */
  steps: { line: number; move: Move; board: Board }[];
  /** The first illegal move, or `null` if every move was legal. */
  stop: null | {
    line: number;
    why: Why;
    /** The cells the move names that exist: these turn red. Missing ones are in `why.cells`. */
    cells: number[];
    message: string;
  };
  /** Cells (1-based) of the last board that differ from the target. */
  differing: number[];
}

export const TRACE_MARK = 'tactile:trace';

export function expandMoves(script: Script): TaggedMove[] {
  const helpers = new Map(script.helpers.map((h) => [h.name, h]));
  const out: TaggedMove[] = [];

  // `depth` guards against a Script that didn't come from the parser: the parser only lets a helper
  // call helpers above it, so real scripts never nest deeper than the number of helpers.
  const expand = (s: Step, arg: number | undefined, line: number, depth: number): void => {
    if (depth > script.helpers.length) throw new Error('helpers call each other in a loop');
    const cell = (c: Cell): number => {
      if (c.kind === 'num') return c.value;
      if (arg === undefined) throw new Error('$i used outside a helper with a parameter');
      return arg;
    };
    switch (s.kind) {
      case 'swap':
        out.push({ line, move: { kind: 'swap', a: cell(s.a), b: cell(s.b) } });
        break;
      case 'paint':
        out.push({ line, move: { kind: 'paint', cell: cell(s.cell), color: s.color } });
        break;
      case 'rotate':
        out.push({ line, move: { kind: 'rotate', cell: cell(s.cell) } });
        break;
      case 'call': {
        const h = helpers.get(s.name);
        if (h === undefined) throw new Error(`no helper called ${s.name}`);
        const value = s.arg === undefined ? undefined : cell(s.arg);
        for (const inner of h.body) expand(inner, value, line, depth + 1);
        break;
      }
    }
    if (out.length > LIMITS.expandedMoves) throw new Error('the script expands to too many moves');
  };

  script.proof.forEach((s, i) => {
    if (s !== null) expand(s, undefined, i + 1, 0);
  });
  return out;
}

/** The trace Lean printed, or `undefined` if it is missing or unreadable. */
export function readTrace(messages: LeanMessage[]): Trace | undefined {
  const prefix = `${TRACE_MARK} `;
  const m = messages.find((x) => x.severity === 'information' && x.data.startsWith(prefix));
  if (m === undefined) return undefined;
  try {
    const t = JSON.parse(m.data.slice(prefix.length).trim()) as Trace;
    if (!Array.isArray(t.steps) || !Array.isArray(t.differing)) return undefined;
    return t;
  } catch {
    return undefined;
  }
}
