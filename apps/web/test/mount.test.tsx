// @vitest-environment jsdom
import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorView } from '@codemirror/view';
import App from '../src/App.tsx';
import answers from './data/lean-answers.json';

/**
 * Mounts the real app in a simulated browser, the way `main.tsx` does (StrictMode, which runs
 * every effect twice). Server rendering never runs effects, so a crash inside one (a blank page)
 * can only be caught here.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
let errors: unknown[][];

beforeEach(() => {
  errors = [];
  vi.spyOn(console, 'error').mockImplementation((...args) => void errors.push(args));
  window.localStorage.clear();
  window.scrollTo = () => {}; // jsdom doesn't implement it
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

async function visit(hash: string) {
  window.location.hash = hash;
  await act(async () => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
}

describe('the app mounts without errors (this is what a blank page would break)', () => {
  const routes: [string, string][] = [
    ['#/', 'Tactile'],
    ['#/levels', 'Choose a level'],
    ['#/rules', 'How it works'],
    ['#/play/L1', 'Ready when you are'],
    ['#/play/L3', 'Helper slot'],
    ['#/play/L6', 'Everything'],
  ];
  for (const [hash, text] of routes) {
    it(`${hash} shows "${text}"`, async () => {
      await visit(hash);
      expect(errors).toEqual([]);
      expect(host.textContent).toContain(text);
    });
  }

  it('runs a proof from the play screen: asks Lean, plays its boards back, shows the verdict', async () => {
    // The server's real answer for this proof, recorded from Lean (`test/data/lean-answers.json`).
    const answer = answers.L1_cleared.response;
    const post = vi.fn(async () => new Response(JSON.stringify(answer), { status: 200 }));
    vi.stubGlobal('fetch', post);
    await visit('#/play/L1');
    // type into the proof editor, then press Run
    const dom = host.querySelector('.cm-editor') as HTMLElement;
    const view = EditorView.findFromDOM(dom)!;
    await act(async () => {
      view.dispatch({ changes: { from: 0, insert: 'swap 2 8\nrotate 4\npaint 6 green' } });
    });
    const run = [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Run')!;
    vi.useFakeTimers();
    await act(async () => run.click());
    // Step the clock in slices: React applies each tick's state change only when `act` ends.
    for (let i = 0; i < 8; i++) await act(async () => { await vi.advanceTimersByTimeAsync(700); });
    vi.useRealTimers();
    vi.unstubAllGlobals();
    expect(errors).toEqual([]);
    expect(host.textContent).toContain('Level cleared!');
    expect(JSON.parse(window.localStorage.getItem('tactile.progress.v1')!)).toEqual({ best: { L1: 3 } });
    // It asked the server, once, with the level and the editors' text.
    expect(post).toHaveBeenCalledTimes(1);
    const [url, init] = post.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/verify');
    expect(JSON.parse(init.body as string)).toEqual({ level: 'L1', helpers: '', proof: 'swap 2 8\nrotate 4\npaint 6 green' });
  });

  it('says the checker is offline when the server cannot be reached, and saves nothing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    await visit('#/play/L1');
    const dom = host.querySelector('.cm-editor') as HTMLElement;
    await act(async () => {
      EditorView.findFromDOM(dom)!.dispatch({ changes: { from: 0, insert: 'swap 2 8\nrotate 4\npaint 6 green' } });
    });
    const run = [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Run')!;
    await act(async () => run.click());
    vi.unstubAllGlobals();
    expect(errors).toEqual([]);
    expect(host.textContent).toContain('Proof checker offline');
    const saved = JSON.parse(window.localStorage.getItem('tactile.progress.v1') ?? '{"best":{}}');
    expect(saved.best.L1).toBeUndefined();
  });
});
