import { describe, expect, it } from 'vitest';
import { masonry } from './masonry';

describe('masonry', () => {
  it('reads left to right before it goes down', () => {
    // given: three notes of one height, three columns of 240 with 16 between
    const heights = [100, 100, 100];

    // when
    const { places } = masonry(heights, 3, 240, 16);

    // then: one per column, side by side
    expect(places).toEqual([
      { x: 0, y: 0 },
      { x: 256, y: 0 },
      { x: 512, y: 0 }
    ]);
  });

  it('puts the next note in the shortest column', () => {
    // given: a tall first note and two short ones in two columns
    const heights = [300, 100, 100, 100];

    // when
    const { places, height } = masonry(heights, 2, 240, 16);

    // then: the short notes stack in the second column until it is the taller one
    expect(places).toEqual([
      { x: 0, y: 0 },
      { x: 256, y: 0 },
      { x: 256, y: 116 },
      { x: 256, y: 232 }
    ]);
    expect(height).toBe(332);
  });

  it('prefers the leftmost of two equal columns', () => {
    // given
    const heights = [100, 100, 50];

    // when
    const { places } = masonry(heights, 2, 240, 16);

    // then
    expect(places[2]).toEqual({ x: 0, y: 116 });
  });

  it('has no height without notes', () => {
    // given: no notes

    // when
    const { places, height } = masonry([], 4, 240, 16);

    // then
    expect(places).toEqual([]);
    expect(height).toBe(0);
  });
});
