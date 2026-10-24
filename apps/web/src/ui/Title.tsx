import { LEVELS } from '../engine/levels.ts';
import type { Source } from '../engine/verify.ts';
import type { Block, Color } from '../engine/types.ts';
import type { Route } from '../route.ts';
import { BlockView } from './Block.tsx';
import { BoardView } from './Board.tsx';

const SAMPLE_BLOCKS: readonly [Color, number][] = [['yellow', 0], ['blue', 1], ['pink', 2], ['green', 3], ['white', 0]];
const sample: Block[] = SAMPLE_BLOCKS.map(([color, turns], id) => ({ id, color, turns }));

export function Title({ go, source }: { go: (r: Route) => void; source: Source }) {
  const hero = LEVELS[0]!;
  return (
    <div className="screen">
      <div className="title">
        <div className="copy">
          <div className="mini-row">
            {sample.map((b) => (
              <div key={b.id} style={{ ['--cell' as string]: 'calc(44 * var(--px))' }}>
                <BlockView block={b} locked={false} still />
              </div>
            ))}
          </div>
          <h1>Tactile</h1>
          <p className="tagline">A puzzle where writing a correct proof is the same thing as solving it.</p>
          <div className="ctas">
            <button className="btn primary" onClick={() => go({ name: 'levels' })}>Play</button>
            <button className="btn secondary" onClick={() => go({ name: 'rules' })}>How it works</button>
          </div>
          <p className="foot">
            {source === 'lean'
              ? 'Every proof is checked by real Lean 4.'
              : 'Proofs are checked in your browser for now. Real Lean 4 checking comes with the server.'}
          </p>
        </div>
        <div className="hero-wrap">
          <BoardView board={hero.start} level={hero} size="hero" />
        </div>
      </div>
    </div>
  );
}
