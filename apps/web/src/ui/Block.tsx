import { motion } from 'framer-motion';
import type { Block, Color } from '../engine/types.ts';

/**
 * One glyph per colour, so the colours also work for colour-blind players and projectors
 * (Learning Log, Entry 7): yellow = dot, blue = bar, pink = ring, green = diamond, white = plus.
 */
function Glyph({ color }: { color: Color }) {
  return (
    <svg className="glyph" viewBox="0 0 30 30" aria-hidden="true">
      {color === 'yellow' && <circle cx="15" cy="15" r="12" />}
      {color === 'blue' && <rect x="1" y="10" width="28" height="10" rx="5" />}
      {color === 'pink' && <circle cx="15" cy="15" r="10" fill="none" stroke="currentColor" strokeWidth="5" />}
      {color === 'green' && <path d="M15 1 29 15 15 29 1 15Z" />}
      {color === 'white' && <path d="M12 2h6v10h10v6H18v10h-6V18H2v-6h10z" />}
    </svg>
  );
}

const SPRING = { type: 'spring', stiffness: 260, damping: 28 } as const;

interface Props {
  block: Block;
  locked: boolean;
  /** Skip all motion (reduced-motion players, and the small previews). */
  still?: boolean;
}

/**
 * The block's look. The notch shows which way it faces. The turning group rotates by
 * `turns * 90` degrees (a number that only grows, so a turn never spins back the long way);
 * the glyph inside turns the opposite way so it stays upright, as in the Figma blocks.
 */
export function BlockView({ block, locked, still }: Props) {
  const angle = block.turns * 90;
  const t = still ? { duration: 0 } : SPRING;
  return (
    <motion.div
      layout={!still}
      transition={t}
      className={`block c-${block.color}${locked ? ' locked' : ''}`}
      data-color={block.color}
      data-facing={block.turns % 4}
    >
      <motion.div className="orient" initial={false} animate={{ rotate: angle }} transition={t}>
        <svg className="notch" viewBox="0 0 28 16" aria-hidden="true">
          <path d="M14 0 28 16H0Z" />
        </svg>
        <div className="glyph-pos">
          <motion.div style={{ width: '100%', height: '100%' }} initial={false} animate={{ rotate: -angle }} transition={t}>
            <Glyph color={block.color} />
          </motion.div>
        </div>
      </motion.div>
      {locked && (
        <svg className="lock" viewBox="0 0 12 14" aria-label="locked">
          <path d="M3 6V4.5a3 3 0 0 1 6 0V6h.5A1.5 1.5 0 0 1 11 7.5v5A1.5 1.5 0 0 1 9.5 14h-7A1.5 1.5 0 0 1 1 12.5v-5A1.5 1.5 0 0 1 2.5 6H3Zm1.5 0h3V4.5a1.5 1.5 0 0 0-3 0V6Z" />
        </svg>
      )}
    </motion.div>
  );
}
