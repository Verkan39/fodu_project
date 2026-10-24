import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { levelById, LEVELS } from '../src/engine/levels.ts';
import { emptyProgress, recordClear } from '../src/engine/progress.ts';
import { run } from '../src/engine/run.ts';
import { browserVerifier } from '../src/engine/verify.ts';
import { fromHash, toHash, type Route } from '../src/route.ts';
import {
  appReducer,
  boardFrame,
  differingCells,
  emptyDraft,
  initialPlay,
  playReducer,
  proofMarks,
  redCells,
  ringCells,
  shownBoard,
  startDraft,
  type PlayAction,
  type PlayState,
} from '../src/state.ts';
import { LevelMap } from '../src/ui/LevelMap.tsx';
import { PlayScreen } from '../src/ui/Play.tsx';
import { Rules } from '../src/ui/Rules.tsx';
import { Title } from '../src/ui/Title.tsx';
import { countLines, parseScript } from '../../server/src/script.ts';

const L1 = levelById('L1');
const L2 = levelById('L2');
const SOLUTION = 'swap 2 8\nrotate 4\npaint 6 green';
const feed = (s: PlayState, ...actions: PlayAction[]) => actions.reduce(playReducer, s);

describe('the play state machine', () => {
  it('walks ready → running → done, one tick per line, and ends on the final board', () => {
    const r = run(L1, '', SOLUTION);
    let s = feed(initialPlay, { type: 'run', run: r });
    expect(s.play.phase).toBe('running');
    expect(shownBoard(L1, s.play)).toBe(L1.start);

    s = feed(s, { type: 'tick' });
    expect(s.play).toMatchObject({ phase: 'running', index: 1 });
    expect(shownBoard(L1, s.play)).toBe(r.played[0]!.after);
    expect(ringCells(s.play)).toEqual([2, 8]);
    expect(proofMarks(s.play)).toEqual([{ line: 1, kind: 'current' }]);

    s = feed(s, { type: 'tick' }, { type: 'tick' }, { type: 'tick' });
    expect(s.play.phase).toBe('done');
    expect(shownBoard(L1, s.play)).toBe(r.final);
    expect(proofMarks(s.play).map((m) => m.kind)).toEqual(['ok', 'ok', 'ok']);
  });

  it('ignores a late verdict from an older run, and a run while running', () => {
    const r = run(L1, '', SOLUTION);
    let s = feed(initialPlay, { type: 'run', run: r });
    const again = feed(s, { type: 'run', run: r });
    expect(again).toBe(s);
    const verified = { outcome: r.outcome, source: 'browser' as const };
    expect(feed(s, { type: 'verified', seq: 99, verified }).play).toBe(s.play);
    s = feed(s, { type: 'verified', seq: s.seq, verified });
    expect(s.play).toMatchObject({ verified });
  });

  it('editing after a result goes back to the start board, and a stale verdict is dropped', () => {
    const r = run(L1, '', SOLUTION);
    let s = feed(initialPlay, { type: 'run', run: r }, { type: 'tick' }, { type: 'tick' }, { type: 'tick' }, { type: 'tick' });
    expect(s.play.phase).toBe('done');
    s = feed(s, { type: 'edited' });
    expect(s.play.phase).toBe('ready');
    const late = feed(s, { type: 'verified', seq: s.seq, verified: { outcome: r.outcome, source: 'browser' } });
    expect(late.play.phase).toBe('ready');
  });

  it('a proof with nothing to play finishes at once, showing the start board', () => {
    const r = run(L1, '', '-- nothing here');
    const s = feed(initialPlay, { type: 'run', run: r });
    expect(s.play.phase).toBe('done');
    expect(shownBoard(L1, s.play)).toBe(L1.start);
    expect(r.outcome.status).toBe('mismatch');
  });

  it('marks the illegal line, reddens only the touched cells, and frames a missing cell', () => {
    const r = run(L2, '', 'rotate 1\nswap 1 12');
    let s = feed(initialPlay, { type: 'run', run: r });
    s = feed(s, { type: 'tick' }, { type: 'tick' }, { type: 'tick' });
    expect(s.play.phase).toBe('done');
    expect(redCells(s.play)).toEqual([1]);
    expect(boardFrame(s.play)).toBe('error');
    expect(proofMarks(s.play)).toContainEqual({ line: 2, kind: 'error', label: 'illegal' });
    // the board stays as it was before the bad line
    expect(shownBoard(L2, s.play)).toBe(r.played[0]!.after);
  });

  it('lets the player look at the board after any line, then go back', () => {
    const r = run(L1, '', SOLUTION);
    let s = feed(initialPlay, { type: 'run', run: r }, { type: 'tick' }, { type: 'tick' }, { type: 'tick' }, { type: 'tick' });
    s = feed(s, { type: 'view', index: 0 });
    expect(shownBoard(L1, s.play)).toBe(r.played[0]!.after);
    expect(differingCells(s.play)).toEqual([]);
    s = feed(s, { type: 'view', index: null });
    expect(shownBoard(L1, s.play)).toBe(r.final);
  });

  it('asks before resetting, and Cancel changes nothing', () => {
    let s = feed(initialPlay, { type: 'askReset' });
    expect(s.confirmReset).toBe(true);
    expect(feed(s, { type: 'cancelReset' })).toEqual(initialPlay);
    expect(feed(s, { type: 'reset' })).toEqual(initialPlay);
  });
});

describe('the app state', () => {
  it('keeps a draft per level and clears only that level', () => {
    let a = appReducer({ progress: emptyProgress, drafts: {} }, { type: 'draft', level: 'L1', field: 'proof', text: 'swap 1 2' });
    a = appReducer(a, { type: 'draft', level: 'L3', field: 'helpers', text: 'macro ...' });
    a = appReducer(a, { type: 'clearDraft', level: 'L1' });
    expect(a.drafts.L1).toEqual(emptyDraft);
    expect(a.drafts.L3?.helpers).toBe('macro ...');
  });

  it('starts helper levels with a syntax comment that costs no lines, and Reset brings it back', () => {
    expect(startDraft('L1')).toEqual(emptyDraft);
    const hint = startDraft('L3').helpers;
    expect(hint).toContain('macro "name"');
    const spin = 'macro "spin3" : tactic => `(tactic| (rotate 1; rotate 2; rotate 3))';
    const lines = (helpers: string) => {
      const p = parseScript(helpers, 'spin3');
      return p.ok ? countLines(p.script) : undefined;
    };
    expect(lines(hint + spin)).toBe(lines(spin));
    const a = appReducer({ progress: emptyProgress, drafts: { L3: { helpers: spin, proof: '' } } }, { type: 'clearDraft', level: 'L3' });
    expect(a.drafts.L3?.helpers).toBe(hint);
  });

  it('records a clear in the progress', () => {
    const a = appReducer({ progress: emptyProgress, drafts: {} }, { type: 'cleared', level: 'L2', lines: 3 });
    expect(a.progress).toEqual(recordClear(emptyProgress, 'L2', 3));
  });
});

describe('routes', () => {
  const routes: Route[] = [{ name: 'title' }, { name: 'levels' }, { name: 'rules' }, { name: 'play', level: 'L5' }];
  it('round-trips through the URL hash', () => {
    for (const r of routes) expect(fromHash(toHash(r))).toEqual(r);
  });
  it('sends anything unknown to the title screen', () => {
    expect(fromHash('#/play/L9')).toEqual({ name: 'title' });
    expect(fromHash('#/nonsense')).toEqual({ name: 'title' });
    expect(fromHash('')).toEqual({ name: 'title' });
  });
});

describe('the browser verifier', () => {
  it('says it is a preview, not Lean', async () => {
    const v = await browserVerifier({ level: L1, helpers: '', proof: SOLUTION });
    expect(v).toMatchObject({ outcome: { status: 'cleared', lines: 3 }, source: 'browser' });
    expect(v.run?.outcome).toEqual(v.outcome);
  });
});

describe('every screen renders without crashing', () => {
  const noop = () => {};
  it('title, level map, rules', () => {
    const title = renderToString(<Title go={noop} source="browser" />);
    expect(title).toContain('Tactile');
    // removed in the Figma file: the "Syntax Error 2026" chip and the black code box over the board
    expect(title).not.toMatch(/syntax/i);
    expect(title).not.toContain('code-peek');
    // React's server renderer puts <!-- --> between text pieces; drop them before comparing.
    const map = renderToString(<LevelMap progress={recordClear(emptyProgress, 'L1', 3)} go={noop} />).replace(/<!-- -->/g, '');
    expect(map).toContain('1 / 6 cleared');
    expect(map).toContain('See the Shortcut');
    const rules = renderToString(<Rules go={noop} />);
    expect(rules).toContain('Making your own helpers');
  });

  for (const level of LEVELS) {
    it(`play screen for ${level.id}`, () => {
      const html = renderToString(
        <PlayScreen level={level} draft={emptyDraft} progress={emptyProgress} verifier={browserVerifier}
          onDraft={noop} onClear={noop} onCleared={noop} go={noop} />,
      );
      expect(html).not.toContain('class="verdict');
      expect(html).toContain('Reset');
      // the helper slot only exists where helpers are taught
      expect(html.includes('Helper slot')).toBe(level.id !== 'L1' && level.id !== 'L2');
      expect(html.includes('allowed')).toBe(level.lineLimit !== null);
    });
  }
});
