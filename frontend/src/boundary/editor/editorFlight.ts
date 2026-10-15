/**
 * How an edit leaves the screen.
 *
 * Finishing a note is a small piece of choreography — the editor flies onto the card it becomes, or
 * shrinks back into the "Take a note…" box — and it lives here rather than inside the editor component.
 * Every function takes the elements it moves and gives them back untouched, so nothing in this module
 * reads application state: the component decides *whether* to animate, this decides *how*.
 */
import { MOTION } from './motion';

/**
 * Where an element *sits*, not where it is being drawn: a card that is still animating in carries a
 * scale, and `getBoundingClientRect` folds that into the rectangle — a flight aimed at that box stops
 * a few pixels short of the card.
 */
export function layoutRect(element: HTMLElement): { left: number; top: number; width: number; height: number } {
  const box = element.getBoundingClientRect();
  const transform = new DOMMatrixReadOnly(getComputedStyle(element).transform);
  return {
    left: box.left - transform.m41,
    top: box.top - transform.m42,
    width: box.width / (transform.a || 1),
    height: box.height / (transform.d || 1)
  };
}

/**
 * The way back: the editor travels to the place its card is about to occupy, then hands over.
 *
 * `from` is the editor's rectangle from before the layout changed — by the time this runs the grid is
 * already in its final arrangement, so the card is measured where it will really be and the flight is
 * a straight line to it.
 */
export async function flyToCard(
  card: HTMLElement | null,
  from: DOMRect | null,
  target: HTMLElement | null
): Promise<void> {
  if (!card || !from || !target) return;
  const to = layoutRect(target);
  if (to.width === 0 || from.width === 0) return;

  const flight = card.animate(
    [
      { transformOrigin: 'top left', transform: 'none', opacity: 1 },
      {
        transformOrigin: 'top left',
        transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.width / from.width}, ${to.height / from.height})`,
        opacity: 0
      }
    ],
    // `standard`, not the exit curve: this element is arriving somewhere, and an accelerating curve
    // covers most of the distance in its last few frames — the note appeared to slam into the grid.
    // `forwards` keeps it where it landed until the component goes away, or it flashes back to full
    // size over the grid for the frames in between.
    { duration: MOTION.medium, easing: MOTION.standard, fill: 'forwards' }
  );
  await flight.finished.catch(() => undefined);
}
