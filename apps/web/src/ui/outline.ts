/**
 * Geometry for the dashed "still differs" outline, as pure functions of the block size.
 *
 * All numbers are Figma units (1 unit = `var(--px)` on screen), so the SVG uses them as its
 * viewBox and the browser scales the drawing evenly with the rest of the UI.
 *
 * Why not one rounded rect with a dash pattern: the pattern starts at one point and repeats, so each
 * corner gets whatever falls there. A dash on a corner looks round, a gap there looks square. Here
 * the outline is cut into four pieces, each running from the middle of one corner to the middle of
 * the next, and each piece gets its own evenly spaced dashes with a dash centred on both corners.
 */

/** Radius and drop shadow of a block, as fractions of its size (they match `.block` in styles.css). */
const BLOCK_RADIUS = 0.1875;
const BLOCK_LIFT = 0.042;
/** Dash length as a share of one dash + gap. */
const DASH_SHARE = 0.58;

export interface OutlineSpec {
  /** Block size. */
  cell: number;
  /** How far the outline sits outside the block. */
  off: number;
  /** Stroke width. */
  sw: number;
}

export interface Segment {
  d: string;
  dash: number;
  gap: number;
}

export interface Outline {
  width: number;
  height: number;
  segments: Segment[];
}

/** How many dash + gap periods fit in `length` so each is close to `wanted` long (at least 1). */
function periods(length: number, wanted: number): number {
  return Math.max(1, Math.round(length / wanted));
}

export function dashedOutline({ cell, off, sw }: OutlineSpec): Outline {
  const width = cell + 2 * off;
  // The outline wraps the block's face and its shadow, so the gap looks the same on all sides.
  const height = cell + 2 * off + cell * BLOCK_LIFT;
  // The stroke's centre line, and a corner radius that runs parallel to the block's corner.
  const x0 = sw / 2;
  const y0 = sw / 2;
  const x1 = width - sw / 2;
  const y1 = height - sw / 2;
  const r = cell * BLOCK_RADIUS + off - sw / 2;
  const k = r * (1 - Math.SQRT1_2); // from the box edge to a corner's midpoint
  const quarterArc = (Math.PI * r) / 4; // half of a corner's 90° arc

  // Corner midpoints, clockwise from the top-left.
  const tl: [number, number] = [x0 + k, y0 + k];
  const tr: [number, number] = [x1 - k, y0 + k];
  const br: [number, number] = [x1 - k, y1 - k];
  const bl: [number, number] = [x0 + k, y1 - k];
  const arc = (x: number, y: number) => `A ${r} ${r} 0 0 1 ${x} ${y}`;

  const sides: { d: string; straight: number }[] = [
    { d: `M ${tl[0]} ${tl[1]} ${arc(x0 + r, y0)} L ${x1 - r} ${y0} ${arc(tr[0], tr[1])}`, straight: x1 - x0 - 2 * r },
    { d: `M ${tr[0]} ${tr[1]} ${arc(x1, y0 + r)} L ${x1} ${y1 - r} ${arc(br[0], br[1])}`, straight: y1 - y0 - 2 * r },
    { d: `M ${br[0]} ${br[1]} ${arc(x1 - r, y1)} L ${x0 + r} ${y1} ${arc(bl[0], bl[1])}`, straight: x1 - x0 - 2 * r },
    { d: `M ${bl[0]} ${bl[1]} ${arc(x0, y1 - r)} L ${x0} ${y0 + r} ${arc(tl[0], tl[1])}`, straight: y1 - y0 - 2 * r },
  ];

  // Aim for a dash + gap about 5.5 stroke widths long, then stretch it so a whole number fits.
  const wanted = sw * 5.5;
  const segments = sides.map(({ d, straight }) => {
    const length = straight + 2 * quarterArc;
    const period = length / periods(length, wanted);
    return { d, dash: period * DASH_SHARE, gap: period * (1 - DASH_SHARE) };
  });
  return { width, height, segments };
}
