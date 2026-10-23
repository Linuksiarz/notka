import { describe, expect, it } from 'vitest';
import { refract } from './glassLens';

describe('refract', () => {
  it('magnifies the middle of a capsule', () => {
    // given: a 160 × 44 capsule with round ends
    const [width, height, radius] = [160, 44, 22];

    // when
    const middle = refract(80, 22, width, height, radius);
    const offCentre = refract(60, 22, width, height, radius);

    // then: the centre stays put and a point beside it looks closer to it
    expect(middle.x).toBeCloseTo(80);
    expect(middle.y).toBeCloseTo(22);
    expect(offCentre.x).toBeGreaterThan(60);
  });

  it('bends the rim outward, the most at the edge', () => {
    // given
    const [width, height, radius] = [160, 44, 22];

    // when
    const edge = refract(80, 0.5, width, height, radius);
    const nearEdge = refract(80, 6, width, height, radius);

    // then: the rim shows what lies beyond the capsule's top edge
    expect(edge.y).toBeLessThan(0);
    expect(nearEdge.y).toBeLessThan(6);
    expect(edge.y - 0.5).toBeLessThan(nearEdge.y - 6);
  });

  it('measures how far inside the capsule a point is', () => {
    // given
    const [width, height, radius] = [160, 44, 22];

    // when
    const inside = refract(80, 22, width, height, radius);
    const corner = refract(1, 1, width, height, radius);

    // then: the middle is half the height in, a corner of the box lies outside the round end
    expect(inside.inset).toBeCloseTo(22);
    expect(corner.inset).toBeLessThan(0);
  });
});
