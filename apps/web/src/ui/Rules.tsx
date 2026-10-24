import type { ReactNode } from 'react';
import type { Block, Color } from '../engine/types.ts';
import type { Route } from '../route.ts';
import { BlockView } from './Block.tsx';

type Spec = readonly [Color, number];

/** A row of small blocks, for the before and after pictures. */
function Blocks({ specs, locked = false }: { specs: readonly Spec[]; locked?: boolean }) {
  const blocks: Block[] = specs.map(([color, turns], id) => ({ id, color, turns }));
  return (
    <div className="row blocks">
      {blocks.map((b) => (
        <BlockView key={b.id} block={b} locked={locked} still />
      ))}
    </div>
  );
}

const Code = ({ lines }: { lines: readonly string[] }) => <div className="codechip">{lines.join('\n')}</div>;

function Section({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section>
      <div className="sec-head">
        <h2 className="h2">{title}</h2>
        {sub !== undefined && <p className="sub">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

function Card({ title, num, children }: { title: string; num?: number; children: ReactNode }) {
  return (
    <div className="card">
      <div className="ctitle">
        {num !== undefined && <span className="badge-num">{num}</span>}
        {title}
      </div>
      {children}
    </div>
  );
}

const TOP: Spec[] = [['yellow', 0], ['blue', 0], ['pink', 1]];

export function Rules({ go }: { go: (r: Route) => void }) {
  return (
    <div className="screen">
      <div className="rules">
        <header>
          <div><button className="btn secondary small" onClick={() => go({ name: 'title' })}><span aria-hidden="true">‹</span> Title</button></div>
          <div className="mid">
            <h1>How it works</h1>
            <p className="sub">Write moves. Watch the board. Match the target.</p>
          </div>
          <div className="right"><button className="btn primary small" onClick={() => go({ name: 'levels' })}>Choose a level <span aria-hidden="true">›</span></button></div>
        </header>

        <Section title="The idea" sub="You solve a level by writing a short proof. Each line of the proof is one move on the board.">
          <div className="cards c3">
            <Card num={1} title="Look"><p>Compare the board with the target picture. What has to change?</p></Card>
            <Card num={2} title="Write"><p>Type one move per line: swap, paint or rotate.</p></Card>
            <Card num={3} title="Run"><p>Press Run. The board plays your moves back, one line at a time.</p></Card>
          </div>
          <div className="strip">A level is cleared when every move is legal, the board matches the target, and the proof fits the level's line limit (if it has one).</div>
        </Section>

        <Section title="The three moves" sub="Cells are numbered from 1, in reading order. These examples use the top row of a board.">
          <div className="cards c3">
            <Card title="Swap">
              <Code lines={['swap 1 3']} />
              <div className="row"><Blocks specs={TOP} /><span className="arrow">→</span><Blocks specs={[['pink', 1], ['blue', 0], ['yellow', 0]]} /></div>
              <p>Exchange two blocks. Any two cells work. Colour and facing travel with the blocks.</p>
            </Card>
            <Card title="Paint">
              <Code lines={['paint 3 blue']} />
              <div className="row"><Blocks specs={TOP} /><span className="arrow">→</span><Blocks specs={[['yellow', 0], ['blue', 0], ['blue', 1]]} /></div>
              <p>Change a block's colour. It keeps its facing. The old colour is lost, so order matters.</p>
            </Card>
            <Card title="Rotate">
              <Code lines={['rotate 3']} />
              <div className="row"><Blocks specs={TOP} /><span className="arrow">→</span><Blocks specs={[['yellow', 0], ['blue', 0], ['pink', 2]]} /></div>
              <p>Turn a block a quarter turn clockwise: up, right, down, left, then up again.</p>
            </Card>
          </div>
        </Section>

        <Section title="Reading the board">
          <div className="cards c4">
            <Card title="Cells">
              <div className="cells-demo">{[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <span key={n}>{n}</span>)}</div>
              <p>Numbered from 1, left to right, top to bottom. On a 3×3 board cell 9 is bottom-right. A 4×4 board goes up to 16.</p>
            </Card>
            <Card title="Facing">
              <Blocks specs={[['blue', 0], ['blue', 1], ['blue', 2], ['blue', 3]]} />
              <p>The notch shows which way a block faces: up, right, down or left. Rotate turns it clockwise.</p>
            </Card>
            <Card title="Locked blocks">
              <Blocks specs={[['white', 2]]} locked />
              <p>Greyed blocks with a lock can't be swapped, painted or rotated. Touching one is an illegal move.</p>
            </Card>
            <Card title="Colours">
              <Blocks specs={[['yellow', 0], ['blue', 0], ['pink', 0], ['green', 0], ['white', 0]]} />
              <p>Each colour also has its own shape, so you never rely on colour alone. Some levels only let you paint with some colours: the Paint colours list shows which.</p>
            </Card>
          </div>
        </Section>

        <Section title="Counting lines" sub="Some levels have a line limit. The counter at the top right shows where you are.">
          <div className="cards c2">
            <Card title="What counts">
              <p>Each command line in your proof counts as one line. Blank lines and comments (after <code>--</code>) are free. Each step inside a helper costs one more.</p>
            </Card>
            <Card title="Your best">
              <p>Clearing a level saves your fewest lines. Come back and beat it: the level map shows it as "best: N lines".</p>
            </Card>
          </div>
        </Section>

        <Section title="When something goes wrong" sub="Red only ever means one thing: an illegal move.">
          <div className="cards c3">
            <Card title="Illegal move">
              <div className="row blocks"><Hatch /></div>
              <p>The move is understood but not allowed: a cell that doesn't exist, a locked block, or a colour this level doesn't allow. The block turns red and the proof stops at that line.</p>
            </Card>
            <Card title="Invalid command">
              <Code lines={['swpa 1 3']} />
              <p>The line isn't a command at all, like a typo. The line is marked and no block turns red, because no move happened.</p>
            </Card>
            <Card title="Not quite">
              <div className="row blocks"><Dashed /></div>
              <p>Your moves were fine, but the board doesn't match the target. Blocks that still differ get a dashed outline.</p>
            </Card>
            <Card title="Too many lines">
              <span className="pill">Lines 9 <span className="quiet">/ 6 allowed</span></span>
              <p>The board is right, but the proof uses more lines than the level allows. Shorten it, often with a helper.</p>
            </Card>
            <Card title="Cleared">
              <span className="marker"><i><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></svg></i>Cleared</span>
              <p>Every move was legal, the board matches and the proof fits the limit. The level gets a green check and your best is saved.</p>
            </Card>
          </div>
        </Section>

        <Section title="Making your own helpers" sub="From Level 3 you can name a group of moves and use the name instead. A helper works like a function in other languages.">
          <div className="step">
            <Card num={1} title="Spot a repeat"><p>Look for moves you write again and again. Here, three turns in a row.</p></Card>
            <Code lines={['rotate 1', 'rotate 2', 'rotate 3']} />
          </div>
          <div className="step">
            <Card num={2} title="Name it"><p>In the helper slot, pick a name (2 to 16 lowercase letters or digits) and list the moves between the brackets, separated by semicolons.</p></Card>
            <Code lines={['macro "spin3" : tactic =>', '  `(tactic| (rotate 1; rotate 2; rotate 3))']} />
          </div>
          <div className="step">
            <Card num={3} title="Use it"><p>Write the name on a line of its own in your proof, as often as you like. Use it like any other move.</p></Card>
            <Code lines={['spin3', 'spin3', 'spin3']} />
          </div>
          <div className="strip">Each step in a helper costs a line, and each use costs one more. spin3 above costs 3 + 3 = 6 lines, against 9 for the plain moves.</div>
          <div className="cards c3">
            <Card title="A helper with a number">
              <p>Write <code>i:num</code> after the name, then use <code>$i</code> inside. Call it with a cell number.</p>
              <Code lines={['macro "fix " i:num : tactic =>', '  `(tactic| (paint $i green;', '    rotate $i; rotate $i))', '', 'fix 7']} />
            </Card>
            <Card title="Helpers can use helpers">
              <p>A helper can call another helper that you wrote above it, so you can build bigger moves out of smaller ones. A helper can't call itself.</p>
            </Card>
            <Card title="When a move goes wrong">
              <p>A move that breaks a rule is reported on the line where you used the helper. A typo inside the helper is reported in the helper slot.</p>
            </Card>
          </div>
        </Section>

        <div className="footer-actions">
          <button className="btn secondary" onClick={() => go({ name: 'title' })}>Back to title</button>
          <button className="btn primary" onClick={() => go({ name: 'levels' })}>Choose a level <span aria-hidden="true">›</span></button>
        </div>
      </div>
    </div>
  );
}

/** A red-hatched block, as an illegal move draws it. */
function Hatch() {
  return (
    <div style={{ position: 'relative', width: 40, height: 40 }}>
      <BlockView block={{ id: 0, color: 'yellow', turns: 0 }} locked={false} still />
      <div className="cell-red" style={{ ['--cell' as string]: '40px' }} />
    </div>
  );
}

/** A block with the dashed outline that marks "still differs". */
function Dashed() {
  return (
    <div style={{ position: 'relative', width: 40, height: 40 }}>
      <BlockView block={{ id: 0, color: 'pink', turns: 2 }} locked={false} still />
      <div className="cell-diff" style={{ ['--cell' as string]: '40px' }} />
    </div>
  );
}
