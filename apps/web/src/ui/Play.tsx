import { useReducedMotion } from 'framer-motion';
import { useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { countLines, parseScript } from '../../../server/src/script.ts';
import { describeMove, moveText } from '../engine/messages.ts';
import { LEVEL_META, nextLevel } from '../engine/levels.ts';
import type { Progress } from '../engine/progress.ts';
import { run as simulate, type Outcome } from '../engine/run.ts';
import type { Verifier } from '../engine/verify.ts';
import type { Level, LevelId } from '../engine/types.ts';
import type { Route } from '../route.ts';
import {
  boardFrame,
  differingCells,
  helperMarks,
  initialPlay,
  playReducer,
  proofMarks,
  redCells,
  ringCells,
  shownBoard,
  type Draft,
  type Play as PlayPhase,
} from '../state.ts';
import { BoardView } from './Board.tsx';
import { Editor } from './Editor.tsx';

interface Props {
  level: Level & { id: LevelId };
  draft: Draft;
  progress: Progress;
  verifier: Verifier;
  onDraft: (field: keyof Draft, text: string) => void;
  onClear: () => void;
  onCleared: (lines: number) => void;
  go: (r: Route) => void;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function PlayScreen({ level, draft, progress, verifier, onDraft, onClear, onCleared, go }: Props) {
  const [state, dispatch] = useReducer(playReducer, initialPlay);
  const { play } = state;
  const meta = LEVEL_META[level.id];
  const reduce = useReducedMotion() ?? false;
  const running = play.phase === 'running';

  /* ---- the run: simulate now (for the animation), ask the verifier for the verdict ---- */
  const start = () => {
    if (running) return;
    const result = simulate(level, draft.helpers, draft.proof);
    const seq = state.seq + 1;
    dispatch({ type: 'run', run: result });
    void verifier({ level, helpers: draft.helpers, proof: draft.proof }).then((verified) =>
      dispatch({ type: 'verified', seq, verified }),
    );
  };
  const startRef = useRef(start);
  startRef.current = start;

  // Play the lines back one at a time. The reducer only moves forward when told to tick.
  const tickKey = play.phase === 'running' ? play.index : -1;
  useEffect(() => {
    if (play.phase !== 'running') return;
    const delay = reduce ? 120 : play.index === 0 ? 450 : 950;
    const t = setTimeout(() => dispatch({ type: 'tick' }), delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play.phase, tickKey, reduce]);

  // A cleared level is remembered once the verdict is in.
  const verifiedOutcome = play.phase === 'done' ? play.verified?.outcome : undefined;
  const clearedLines = verifiedOutcome?.status === 'cleared' ? verifiedOutcome.lines : undefined;
  const doneSeq = play.phase === 'done' ? play.seq : -1;
  useEffect(() => {
    if (clearedLines !== undefined) onCleared(clearedLines);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneSeq, clearedLines]);

  // Ctrl/Cmd + Enter runs the proof.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        startRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* ---- what to show ---- */
  const live = useMemo(() => {
    const parsed = parseScript(draft.helpers, draft.proof);
    return parsed.ok ? countLines(parsed.script) : undefined;
  }, [draft.helpers, draft.proof]);
  const lines = play.phase === 'ready' ? live : (play.run.lines ?? live);

  const board = shownBoard(level, play);
  const red = redCells(play);
  const diff = differingCells(play);
  const outcome = play.phase === 'done' ? play.run.outcome : undefined;
  const nothingToClear = draft.helpers.trim() === '' && draft.proof.trim() === '' && play.phase === 'ready';

  const onProofClick = (line: number) => {
    if (play.phase !== 'done') return;
    const i = play.run.played.findIndex((p) => p.line === line);
    dispatch({ type: 'view', index: i === -1 || i === play.view ? null : i });
  };

  return (
    <div className="screen">
      <header className="topbar">
        <div className="left">
          <button className="btn secondary small" onClick={() => go({ name: 'levels' })}>
            <span aria-hidden="true">‹</span> Levels
          </button>
          <span className="brand">Tactile</span>
        </div>
        <div className="mid">
          <span className="badge-num">{level.id.slice(1)}</span>
          <h1 className="level-title">{meta.name}</h1>
        </div>
        <div className="right">
          <span className="pill" title="Helper steps and proof lines both count">
            Lines {lines ?? '–'}
            {level.lineLimit !== null && <span className="quiet">/ {level.lineLimit} allowed</span>}
          </span>
        </div>
      </header>

      <main className="play">
        {/* ------------------------------------------------ board column */}
        <section aria-label="Board">
          <div className="panel-head">
            <div className="titles">
              <h2 className="h2">Board</h2>
              <p className="sub">Numbers show the cell. The notch shows which way a block faces.</p>
            </div>
          </div>
          <div className="board-row">
            <BoardView board={board} level={level} red={red} differing={diff} ring={ringCells(play)} frame={boardFrame(play)} />
            <div className="side">
              <div>
                <div className="label">Target</div>
                <div className="target-tray">
                  <BoardView board={level.target} level={level} size="target" numbers={false} differing={diff} red={[]} tray={false} />
                </div>
              </div>
              <div>
                <div className="label">Paint colours</div>
                <div className={`palette${outcome?.status === 'illegal' && outcome.why.kind === 'colorNotAllowed' ? ' err' : ''}`}>
                  {level.palette.map((c) => (
                    <span key={c} className={`swatch c-${c}`}>
                      <i />
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <VerdictPanel play={play} level={level} progress={progress} go={go} replay={() => dispatch({ type: 'reset' })} />
        </section>

        {/* ------------------------------------------------ editor column */}
        <section aria-label="Your proof">
          <div className="panel-head">
            <div className="titles">
              <h2 className="h2">Your proof</h2>
              <p className="sub">One line is one move: swap, paint or rotate.</p>
            </div>
            <div className="actions">
              <button className="btn secondary" disabled={nothingToClear} onClick={() => dispatch({ type: 'askReset' })}>
                <ResetIcon /> Reset
              </button>
              <button className={`btn primary${running ? ' busy' : ''}`} disabled={running} onClick={start}>
                {!running && <PlayIcon />} {running ? 'Running…' : 'Run'}
              </button>
            </div>
          </div>

          <div className="editors">
            {meta.helpers && (
              <div>
                <div className="ed-label">
                  <span className="eyebrow">Helper slot</span>
                  <span className="sub">each step costs a line</span>
                </div>
                <Editor
                  className="cm-wrap helper"
                  label="Helpers"
                  value={draft.helpers}
                  readOnly={running}
                  placeholder={'-- name a group of moves, e.g. macro "spin3" : tactic => `(tactic| (rotate 1; rotate 2))'}
                  marks={helperMarks(play)}
                  onChange={(t) => {
                    onDraft('helpers', t);
                    dispatch({ type: 'edited' });
                  }}
                />
              </div>
            )}
            <div>
              {meta.helpers && <div className="ed-label"><span className="eyebrow">Proof</span></div>}
              <Editor
                className="cm-wrap proof"
                label="Proof"
                value={draft.proof}
                readOnly={running}
                placeholder="-- one move per line, e.g. swap 1 3"
                marks={proofMarks(play)}
                onLineClick={onProofClick}
                onChange={(t) => {
                  onDraft('proof', t);
                  dispatch({ type: 'edited' });
                }}
              />
            </div>
          </div>
          <p className="hint">
            {play.phase === 'done' && play.run.played.length > 0
              ? 'Click a line to see the board after it. Click it again to go back.'
              : 'Run plays your moves back one line at a time. Ctrl + Enter also runs.'}
          </p>
        </section>
      </main>

      {state.confirmReset && (
        <ResetDialog
          onCancel={() => dispatch({ type: 'cancelReset' })}
          onConfirm={() => {
            onClear();
            dispatch({ type: 'reset' });
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ verdict panel */

interface PanelProps {
  play: PlayPhase;
  level: Level & { id: LevelId };
  progress: Progress;
  go: (r: Route) => void;
  replay: () => void;
}

function VerdictPanel({ play, level, progress, go, replay }: PanelProps) {
  const meta = LEVEL_META[level.id];
  let view: { cls: string; badge: ReactNode; title: string; text: string; note?: string; actions?: ReactNode };

  if (play.phase === 'ready') {
    view = {
      cls: 'ready',
      badge: <PlayIcon />,
      title: 'Ready when you are',
      text: `Turn the board into the target picture. Write your moves, one per line, then press Run.${meta.helpers ? ' Repeating yourself? Name the repeat in the helper slot.' : ''}`,
    };
  } else if (play.phase === 'running') {
    const line = play.run.played[play.index - 1];
    view =
      line === undefined
        ? { cls: 'running', badge: '…', title: 'Getting ready…', text: 'The board will play your proof one line at a time.' }
        : {
            cls: 'running',
            badge: '…',
            title: `Playing line ${play.index} of ${play.run.played.length}…`,
            text:
              line.moves.length === 1
                ? `${line.text}: ${describeMove(line.moves[0]!)}`
                : `${line.text}: ${line.moves.map(moveText).join(', ')}.`,
          };
  } else {
    const o: Outcome | undefined = play.verified?.outcome;
    if (o === undefined) {
      view = { cls: 'running', badge: '…', title: 'Checking…', text: 'Waiting for the verdict.' };
    } else {
      view = outcomeView(o, level, play.verified?.source === 'browser', progress, replay, go);
    }
  }

  return (
    <div className={`verdict ${view.cls}`} role="status" aria-live="polite">
      <div className="vbadge">{view.badge}</div>
      <div className="vbody">
        <div className="vtitle">{view.title}</div>
        <div className="vtext">{view.text}</div>
        {view.note !== undefined && <div className="vnote">{view.note}</div>}
        {view.actions}
      </div>
    </div>
  );
}

function outcomeView(
  o: Outcome,
  level: Level & { id: LevelId },
  preview: boolean,
  progress: Progress,
  replay: () => void,
  go: (r: Route) => void,
) {
  const meta = LEVEL_META[level.id];
  switch (o.status) {
    case 'illegal':
      return {
        cls: 'illegal',
        badge: '!',
        title: `Illegal move on line ${o.line}`,
        text: o.message,
        note: o.why.kind === 'noSuchCell' ? 'The red border shows the move left the board.' : 'The red blocks are the cells that move touched.',
      };
    case 'invalid':
      return {
        cls: 'invalid',
        badge: '!',
        title: o.editor === 'helpers' ? `Invalid helper on line ${o.line}` : `Invalid command on line ${o.line}`,
        text: `${o.reason.charAt(0).toUpperCase()}${o.reason.slice(1)}.`,
        note: 'No move happened, so no block turns red.',
      };
    case 'mismatch':
      return {
        cls: 'mismatch',
        badge: '!',
        title: 'Not quite.',
        text: `${plural(o.differing.length, 'block still differs', 'blocks still differ')} from the target. ${o.differing.length === 1 ? 'It is' : 'They are'} outlined on the board and on the target picture.`,
      };
    case 'tooLong':
      return {
        cls: 'toolong',
        badge: '+',
        title: 'Right board, too many lines',
        text: `Your proof reaches the target in ${plural(o.lines, 'line', 'lines')}, but this level allows ${o.limit}.`,
        note: meta.helpers
          ? 'Each helper step costs a line and each use of a helper costs one more, so a helper pays off when you repeat moves.'
          : undefined,
      };
    case 'cleared': {
      const best = progress.best[level.id];
      const next = nextLevel(level.id);
      return {
        cls: 'cleared',
        badge: <CheckIcon />,
        title: 'Level cleared!',
        text: `The board matches the target, in ${plural(o.lines, 'line', 'lines')}${level.lineLimit !== null ? ` (limit ${level.lineLimit})` : ''}.${best !== undefined ? ` Your best: ${plural(Math.min(best, o.lines), 'line', 'lines')}.` : ''}`,
        note: preview ? 'Checked in your browser. Real Lean will confirm it once the server is connected.' : undefined,
        actions: (
          <div className="vactions">
            <button className="btn secondary" onClick={replay}>Replay</button>
            {next !== undefined ? (
              <button className="btn primary" onClick={() => go({ name: 'play', level: next })}>Next level <span aria-hidden="true">›</span></button>
            ) : (
              <button className="btn primary" onClick={() => go({ name: 'levels' })}>All levels</button>
            )}
          </div>
        ),
      };
    }
  }
}

/* ------------------------------------------------------------------ reset dialog */

function ResetDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancel.current?.focus(); // the safe choice has the focus
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="reset-title">
        <h2 className="h2" id="reset-title">Clear your proof?</h2>
        <p>This empties the editors and puts the board back to the start. You can't undo it.</p>
        <div className="row">
          <button ref={cancel} className="btn secondary" onClick={onCancel}>Cancel</button>
          <button className="btn primary" onClick={onConfirm}>Clear</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ icons */

const PlayIcon = () => (
  <svg width="14" height="16" viewBox="0 0 14 16" aria-hidden="true"><path d="M2 1.5v13l11-6.5z" fill="currentColor" /></svg>
);
const ResetIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3 3v5h5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const CheckIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
