import { LEVELS, LEVEL_META } from '../engine/levels.ts';
import { clearedCount, isCleared, type Progress } from '../engine/progress.ts';
import type { Level, LevelId } from '../engine/types.ts';
import type { Route } from '../route.ts';
import { BoardView } from './Board.tsx';

type PlayLevel = Level & { id: LevelId };

function Tile({ level, progress, current }: { level: PlayLevel; progress: Progress; current: boolean }) {
  const meta = LEVEL_META[level.id];
  const best = progress.best[level.id];
  return (
    <a className={`tile${current ? ' current' : ''}`} href={`#/play/${level.id}`} aria-label={`Level ${level.id.slice(1)}: ${meta.name}`}>
      <div className="tile-head">
        <span className="badge-num">{level.id.slice(1)}</span>
        <span className="tile-name">{meta.name}</span>
      </div>
      <span className="tag">{meta.tag}</span>
      <div className="preview">
        <BoardView board={level.start} level={level} size="mini" numbers={false} tray={false} />
      </div>
      <div className="foot">
        <div className="status">
          {isCleared(progress, level.id) ? (
            <span className="marker">
              <i><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></svg></i>
              Cleared
            </span>
          ) : (
            <span className="sub">{level.lineLimit === null ? 'No line limit' : `Line limit: ${level.lineLimit}`}</span>
          )}
          {best !== undefined && <span className="sub">best: {best} {best === 1 ? 'line' : 'lines'}</span>}
        </div>
        <span className="btn primary small">Play</span>
      </div>
    </a>
  );
}

export function LevelMap({ progress, go }: { progress: Progress; go: (r: Route) => void }) {
  const levels = LEVELS as readonly PlayLevel[];
  const current = levels.find((l) => !isCleared(progress, l.id))?.id;
  return (
    <div className="screen map-screen">
      <header className="map-head">
        <div>
          <button className="btn secondary small" onClick={() => go({ name: 'title' })}><span aria-hidden="true">‹</span> Home</button>
        </div>
        <div className="mid">
          <h1>Choose a level</h1>
          <p className="sub">Each level is a puzzle. Your proof is the solution.</p>
        </div>
        <div className="right">
          <span className="pill">{clearedCount(progress)} / {levels.length} cleared</span>
        </div>
      </header>
      <div className="map">
        <div className="map-row">
          {levels.slice(0, 3).map((l) => <Tile key={l.id} level={l} progress={progress} current={l.id === current} />)}
        </div>
        <div className="map-row">
          {levels.slice(3).map((l) => <Tile key={l.id} level={l} progress={progress} current={l.id === current} />)}
        </div>
      </div>
    </div>
  );
}
