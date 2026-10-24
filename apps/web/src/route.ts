/**
 * Where the player is, kept in the URL hash (`#/levels`, `#/play/L3`) so reload and the back
 * button work with no router library. Both directions are pure functions.
 */
import { LEVEL_IDS, type LevelId } from './engine/types.ts';

export type Route =
  | { readonly name: 'title' }
  | { readonly name: 'levels' }
  | { readonly name: 'rules' }
  | { readonly name: 'play'; readonly level: LevelId };

const isLevelId = (s: string): s is LevelId => (LEVEL_IDS as readonly string[]).includes(s);

export function toHash(r: Route): string {
  switch (r.name) {
    case 'title':
      return '#/';
    case 'levels':
      return '#/levels';
    case 'rules':
      return '#/rules';
    case 'play':
      return `#/play/${r.level}`;
  }
}

/** Anything unknown goes to the title screen. */
export function fromHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'levels') return { name: 'levels' };
  if (parts[0] === 'rules') return { name: 'rules' };
  if (parts[0] === 'play' && parts[1] !== undefined && isLevelId(parts[1])) return { name: 'play', level: parts[1] };
  return { name: 'title' };
}
