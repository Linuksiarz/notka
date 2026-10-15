/** What a picture may be: the formats the server accepts (it checks the bytes, this only filters the picker). */
export const IMAGE_TYPES = 'image/png,image/jpeg,image/gif,image/webp';

/**
 * How a note's pictures are laid out, the way the original does it: in rows of at most three, the
 * rows as even as the count allows (four is two and two, five is three and two), each row as tall
 * as its pictures need to fill the width together without cropping any of them.
 */
export const MAX_PER_ROW = 3;

export function imageRows<T>(images: readonly T[]): T[][] {
  if (images.length === 0) return [];
  const rows = Math.ceil(images.length / MAX_PER_ROW);
  const base = Math.floor(images.length / rows);
  const longer = images.length % rows;
  const result: T[][] = [];
  let at = 0;
  for (let row = 0; row < rows; row += 1) {
    const size = base + (row < longer ? 1 : 0);
    result.push(images.slice(at, at + size));
    at += size;
  }
  return result;
}
