import { describe, expect, it } from 'vitest';
import { dashedOutline } from '../src/ui/outline.ts';

describe('dashedOutline', () => {
  for (const spec of [{ cell: 96, off: 6, sw: 3 }, { cell: 78, off: 6, sw: 3 }, { cell: 52, off: 4, sw: 2 }, { cell: 40, off: 4, sw: 2 }]) {
    it(`cuts a ${spec.cell}-unit outline into four sides with whole dash periods`, () => {
      const o = dashedOutline(spec);
      expect(o.width).toBe(spec.cell + 2 * spec.off);
      expect(o.height).toBeGreaterThan(o.width); // it also wraps the drop shadow
      expect(o.segments).toHaveLength(4);
      for (const seg of o.segments) {
        expect(seg.dash).toBeGreaterThan(seg.gap);
        expect(seg.dash).toBeGreaterThan(spec.sw); // dashes stay visible as dashes
      }
      // Opposite sides are the same length, so they get the same pattern.
      expect(o.segments[0]).toMatchObject({ dash: o.segments[2]!.dash, gap: o.segments[2]!.gap });
      expect(o.segments[1]).toMatchObject({ dash: o.segments[3]!.dash, gap: o.segments[3]!.gap });
    });
  }

  it('starts each side where the previous one ended (a closed loop)', () => {
    const o = dashedOutline({ cell: 96, off: 6, sw: 3 });
    const start = (d: string) => d.split(' ').slice(1, 3).join(' ');
    const end = (d: string) => d.split(' ').slice(-2).join(' ');
    for (let i = 0; i < 4; i++) expect(start(o.segments[(i + 1) % 4]!.d)).toBe(end(o.segments[i]!.d));
  });
});
