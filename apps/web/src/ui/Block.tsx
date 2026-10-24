import { motion } from 'framer-motion';
import type { Block } from '../engine/types.ts';

const SPRING = { type: 'spring', stiffness: 260, damping: 28 } as const;

interface Props {
  block: Block;
  locked: boolean;
  /** Skip all motion (reduced-motion players, and the small previews). */
  still?: boolean;
}

/**
 * The block's look. The arrow shows which way it faces; it rotates by `turns * 90` degrees
 * (a number that only grows, so a turn never spins back the long way).
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
        <svg className="arrow" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2 21 11.5h-5.5V22h-7V11.5H3Z" />
        </svg>
      </motion.div>
      {locked && (
        <svg className="lock" viewBox="0 0 12 14" aria-label="locked">
          <path d="M3 6V4.5a3 3 0 0 1 6 0V6h.5A1.5 1.5 0 0 1 11 7.5v5A1.5 1.5 0 0 1 9.5 14h-7A1.5 1.5 0 0 1 1 12.5v-5A1.5 1.5 0 0 1 2.5 6H3Zm1.5 0h3V4.5a1.5 1.5 0 0 0-3 0V6Z" />
        </svg>
      )}
    </motion.div>
  );
}
