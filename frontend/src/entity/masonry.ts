/**
 * Google Keep's grid: fixed-width columns, and every note goes to the **shortest** column in turn
 * (the leftmost of equals), so the notes read left to right in their order and no column runs far
 * ahead of the others. Measured off keep.google.com: each card is absolutely placed with a
 * `transform: translate(x, y)` on a 256px stride (240px cards, 16px between), and the next note of a
 * one-column grid sits at the previous card's height plus 16px.
 *
 * CSS multi-column layout, which this replaces, fills its columns top to bottom instead: the second
 * note went *under* the first, a note that grew pushed others into another column, and a note moving
 * between sections had to be a second element.
 */
export interface MasonryPlace {
  x: number;
  y: number;
}

export interface Masonry {
  places: MasonryPlace[];
  /** From the top of the first card to the bottom of the lowest one. */
  height: number;
}

export function masonry(heights: readonly number[], columns: number, columnWidth: number, gap: number): Masonry {
  const bottoms = new Array<number>(Math.max(1, columns)).fill(0);
  const places = heights.map((height) => {
    // The shortest column; the leftmost one when several are equally short.
    const shortest = Math.min(...bottoms);
    const column = bottoms.indexOf(shortest);
    bottoms[column] = shortest + height + gap;
    return { x: column * (columnWidth + gap), y: shortest };
  });
  return { places, height: heights.length === 0 ? 0 : Math.max(...bottoms) - gap };
}
