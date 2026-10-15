import { describe, expect, it } from 'vitest';
import { imageRows } from './imageLayout';

describe('imageRows', () => {
  it('fills rows of at most three, as evenly as the count allows', () => {
    // given
    const counts = [0, 1, 2, 3, 4, 5, 6, 7];

    // when
    const shapes = counts.map((count) => imageRows(Array.from({ length: count }, (_, i) => i)).map((row) => row.length));

    // then
    expect(shapes).toEqual([[], [1], [2], [3], [2, 2], [3, 2], [3, 3], [3, 2, 2]]);
  });
});
