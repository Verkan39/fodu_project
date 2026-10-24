/**
 * The app's state, as pure reducers: `(state, action) → new state`. Nothing in here sets a
 * timer, calls a function that decides a verdict, or touches the page. The screens do that and
 * then dispatch what happened, so every state change can be tested by calling a function.
 */
import type { LineMark } from './ui/Editor.tsx';
import { cellsOf } from './engine/moves.ts';
import type { RunResult } from './engine/run.ts';
import type { Verified } from './engine/verify.ts';
import { LEVEL_META } from './engine/levels.ts';
import { recordClear, type Progress } from './engine/progress.ts';
import type { Board, Level, LevelId } from './engine/types.ts';

/* ------------------------------------------------------------------ app: progress + drafts */

export interface Draft {
  helpers: string;
  proof: string;
}
export type Drafts = Readonly<Partial<Record<LevelId, Draft>>>;

export interface AppState {
  readonly progress: Progress;
  /** What the player has typed on each level, kept while they move around the app. */
  readonly drafts: Drafts;
}

export type AppAction =
  | { type: 'draft'; level: LevelId; field: keyof Draft; text: string }
  | { type: 'clearDraft'; level: LevelId }
  | { type: 'cleared'; level: LevelId; lines: number };

export const emptyDraft: Draft = { helpers: '', proof: '' };

/** Comment lines start a level's helper slot, so the syntax is in view while writing one. */
const HELPER_HINT = [
  '-- One helper per line:',
  '-- macro "name" : tactic => `(tactic| (move; move))',
  '-- With a cell number, use $i in the moves:',
  '-- macro "name " i:num : tactic => `(tactic| (move $i))',
  '',
].join('\n');

/** What a level's editors hold before the player types anything. */
export const startDraft = (level: LevelId): Draft => (LEVEL_META[level].helpers ? { helpers: HELPER_HINT, proof: '' } : emptyDraft);

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'draft': {
      const old = state.drafts[action.level] ?? startDraft(action.level);
      return { ...state, drafts: { ...state.drafts, [action.level]: { ...old, [action.field]: action.text } } };
    }
    case 'clearDraft':
      return { ...state, drafts: { ...state.drafts, [action.level]: startDraft(action.level) } };
    case 'cleared':
      return { ...state, progress: recordClear(state.progress, action.level, action.lines) };
  }
}

/* ------------------------------------------------------------------ play screen */

/** Which attempt a result belongs to, so a late answer for an old attempt can be ignored. */
export type Seq = number;

export type Play =
  | { readonly phase: 'ready' }
  /** Waiting for Lean. Its answer brings the verdict and the boards to play back. */
  | { readonly phase: 'checking'; readonly seq: Seq }
  /** `index` lines have been shown so far. */
  | { readonly phase: 'running'; readonly seq: Seq; readonly run: RunResult; readonly index: number; readonly verified?: Verified }
  /** `view`: which played line the player is looking at (an index into `run.played`), or the end. */
  | { readonly phase: 'done'; readonly seq: Seq; readonly run: RunResult; readonly verified?: Verified; readonly view: number | null };

export interface PlayState {
  readonly play: Play;
  readonly seq: Seq;
  readonly confirmReset: boolean;
}

export type PlayAction =
  /** Run pressed: ask Lean, and wait. */
  | { type: 'check' }
  /** Lean answered: the verdict, and the run to play back. Ignored if it's for an older attempt. */
  | { type: 'checked'; seq: Seq; run: RunResult; verified: Verified }
  | { type: 'tick' }
  /** The player changed the text, so the old result no longer describes it. */
  | { type: 'edited' }
  | { type: 'view'; index: number | null }
  | { type: 'askReset' }
  | { type: 'cancelReset' }
  /** The texts were cleared (the app does that); go back to the start. */
  | { type: 'reset' };

export const initialPlay: PlayState = { play: { phase: 'ready' }, seq: 0, confirmReset: false };

export function playReducer(state: PlayState, action: PlayAction): PlayState {
  const { play } = state;
  switch (action.type) {
    case 'check': {
      if (play.phase === 'running' || play.phase === 'checking') return state;
      const seq = state.seq + 1;
      return { ...state, seq, play: { phase: 'checking', seq } };
    }
    case 'checked': {
      if (play.phase !== 'checking' || play.seq !== action.seq) return state;
      const { run, verified } = action;
      const next: Play =
        run.played.length === 0
          ? { phase: 'done', seq: play.seq, run, verified, view: null }
          : { phase: 'running', seq: play.seq, run, verified, index: 0 };
      return { ...state, play: next };
    }
    case 'tick': {
      if (play.phase !== 'running') return state;
      if (play.index < play.run.played.length) return { ...state, play: { ...play, index: play.index + 1 } };
      return { ...state, play: { phase: 'done', seq: play.seq, run: play.run, verified: play.verified, view: null } };
    }
    case 'edited':
      return play.phase === 'done' ? { ...state, play: { phase: 'ready' } } : state;
    case 'view':
      return play.phase === 'done' ? { ...state, play: { ...play, view: action.index } } : state;
    case 'askReset':
      return { ...state, confirmReset: true };
    case 'cancelReset':
      return { ...state, confirmReset: false };
    case 'reset':
      return { ...state, play: { phase: 'ready' }, confirmReset: false };
  }
}

/* ------------------------------------------------------------------ what the screen shows */

/** The board on screen: the start, or the board after the line being shown. */
export function shownBoard(level: Level, play: Play): Board {
  switch (play.phase) {
    case 'ready':
    case 'checking':
      return level.start;
    case 'running':
      return play.index === 0 ? level.start : play.run.played[play.index - 1]!.after;
    case 'done':
      if (play.view !== null) return play.run.played[play.view]?.after ?? play.run.final;
      return play.run.final;
  }
}

/** The line being played (running) or looked at (done, after a click): its cells get a ring. */
export function ringCells(play: Play): number[] {
  const line =
    play.phase === 'running'
      ? play.run.played[play.index - 1]
      : play.phase === 'done' && play.view !== null
        ? play.run.played[play.view]
        : undefined;
  return line === undefined ? [] : [...new Set(line.moves.flatMap(cellsOf))];
}

export function redCells(play: Play): readonly number[] {
  const o = play.phase === 'done' ? play.run.outcome : undefined;
  return o?.status === 'illegal' ? o.cells : [];
}

export function differingCells(play: Play): readonly number[] {
  const o = play.phase === 'done' && play.view === null ? play.run.outcome : undefined;
  return o?.status === 'mismatch' ? o.differing : [];
}

/** A red border round the board (a cell that doesn't exist) or a green one (cleared). */
export function boardFrame(play: Play): 'error' | 'success' | null {
  if (play.phase !== 'done' || play.view !== null) return null;
  const o = play.run.outcome;
  if (o.status === 'illegal' && o.why.kind === 'noSuchCell') return 'error';
  return o.status === 'cleared' && play.verified?.outcome.status === 'cleared' ? 'success' : null;
}

/** What each line of the proof editor shows, as the run goes on. */
export function proofMarks(play: Play): LineMark[] {
  if (play.phase === 'ready' || play.phase === 'checking') return [];
  const played = play.run.played;
  if (play.phase === 'running') {
    return played.slice(0, play.index).map((p, i) => ({
      line: p.line,
      kind: i === play.index - 1 ? ('current' as const) : ('ok' as const),
    }));
  }
  const marks: LineMark[] = played.map((p, i) => ({
    line: p.line,
    kind: i === play.view ? ('viewing' as const) : ('ok' as const),
  }));
  const o = play.run.outcome;
  if (o.status === 'illegal') marks.push({ line: o.line, kind: 'error', label: 'illegal' });
  if (o.status === 'invalid' && o.editor === 'proof') {
    marks.push({ line: o.line, kind: 'error', label: 'invalid', underlineFirstWord: true });
  }
  return marks;
}

/** The same for the helper editor: only a bad helper line is ever marked. */
export function helperMarks(play: Play): LineMark[] {
  if (play.phase !== 'done') return [];
  const o = play.run.outcome;
  return o.status === 'invalid' && o.editor === 'helpers'
    ? [{ line: o.line, kind: 'error', label: 'invalid', underlineFirstWord: true }]
    : [];
}
