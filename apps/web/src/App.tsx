import { useEffect, useReducer, useSyncExternalStore } from 'react';
import { levelById } from './engine/levels.ts';
import { loadProgress, saveProgress } from './engine/progress.ts';
import { leanVerifier } from './engine/lean.ts';
import type { Source } from './engine/verify.ts';
import { fromHash, toHash, type Route } from './route.ts';
import { appReducer, startDraft, type AppState } from './state.ts';
import { LevelMap } from './ui/LevelMap.tsx';
import { PlayScreen } from './ui/Play.tsx';
import { Rules } from './ui/Rules.tsx';
import { Title } from './ui/Title.tsx';

/**
 * Who decides the verdict: real Lean on the server, which also sends the boards to play back.
 * The browser simulator (`browserVerifier` in `engine/verify.ts`) is kept but not connected;
 * switching back is this one line.
 */
const verifier = leanVerifier;
const SOURCE: Source = 'lean';

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};

export default function App() {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  const route = fromHash(hash);
  const [app, dispatch] = useReducer(appReducer, undefined, (): AppState => ({
    progress: loadProgress(window.localStorage),
    drafts: {},
  }));

  // Effects must not return a value (React reads it as the clean-up function), so these use
  // braces on purpose.
  useEffect(() => {
    saveProgress(window.localStorage, app.progress);
  }, [app.progress]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [hash]);

  const go = (r: Route) => {
    window.location.hash = toHash(r);
  };

  switch (route.name) {
    case 'title':
      return <Title go={go} source={SOURCE} />;
    case 'levels':
      return <LevelMap progress={app.progress} go={go} />;
    case 'rules':
      return <Rules go={go} />;
    case 'play': {
      const level = levelById(route.level);
      return (
        <PlayScreen
          key={level.id}
          level={level}
          draft={app.drafts[level.id] ?? startDraft(level.id)}
          progress={app.progress}
          verifier={verifier}
          onDraft={(field, text) => dispatch({ type: 'draft', level: level.id, field, text })}
          onClear={() => dispatch({ type: 'clearDraft', level: level.id })}
          onCleared={(lines) => dispatch({ type: 'cleared', level: level.id, lines })}
          go={go}
        />
      );
    }
  }
}
