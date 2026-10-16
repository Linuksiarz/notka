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

/**
 * A phone's editor is the whole screen, and the original does not scale it onto its card the way the
 * desktop's floating card is scaled: the *container* grows out of the card and shrinks back into it
 * (Material's container transform). Measured frame by frame off the Android app on an emulator: the
 * container is the card's rectangle growing to the screen, its top bar and its bottom bar ride the
 * container's edges (the bar's actions at its right edge, the bottom bar at its bottom edge), the title
 * travels with its top-left corner, and the note's text fades in once the container has nearly arrived.
 * Closing runs it backwards, the text going first. Nothing is stretched.
 *
 * The container is the editor's own box cut to the rectangle with `clip-path`; the bars follow it with
 * a `transform` and a `width`, which lays out the two bars and nothing else.
 */
interface Edges {
  top: number;
  right: number;
  bottom: number;
  left: number;
  /** The container's width at the card's size. */
  width: number;
}

function edgesOf(card: HTMLElement, within: DOMRect): Edges {
  const rect = layoutRect(card);
  const left = rect.left - within.left;
  const right = within.right - (rect.left + rect.width);
  return { top: rect.top - within.top, right, bottom: within.bottom - (rect.top + rect.height), left, width: rect.width };
}

function clipOf(edges: Edges, radius: string): string {
  return `inset(${edges.top}px ${edges.right}px ${edges.bottom}px ${edges.left}px round ${radius})`;
}

const FULL_SCREEN = 'inset(0px 0px 0px 0px round 0px)';
const BAR = /\b(editor-bar|toolbar)\b/;

interface Part {
  element: HTMLElement;
  /** Where the part is drawn while the container is the card's size, as keyframe properties. */
  atCard: Keyframe;
  /** The same part drawn where it stands in the open editor. */
  atScreen: Keyframe;
  /** The note's text: it is shown only once the container has (nearly) arrived. */
  text: boolean;
}

/** Every part of the editor, and where it stands when the container is the card's size. */
function partsOf(editor: HTMLElement, edges: Edges, within: DOMRect): Part[] {
  const parts: Part[] = [];
  for (const child of Array.from(editor.children)) {
    if (!(child instanceof HTMLElement)) continue;
    if (BAR.test(child.className)) {
      const y = child.classList.contains('toolbar') ? -edges.bottom : edges.top;
      parts.push({
        element: child,
        atCard: { transform: `translate(${edges.left}px, ${y}px)`, width: `${edges.width}px` },
        atScreen: { transform: 'none', width: `${within.width}px` },
        text: false
      });
      continue;
    }
    const corner = { transform: `translate(${edges.left}px, ${edges.top}px)` };
    const home = { transform: 'none' };
    if (child.classList.contains('body')) {
      // The title travels with the corner; what is written under it is the text.
      parts.push({ element: child, atCard: corner, atScreen: home, text: false });
      for (const inner of Array.from(child.children)) {
        if (inner instanceof HTMLElement && !inner.classList.contains('head')) {
          parts.push({ element: inner, atCard: { opacity: 0 }, atScreen: { opacity: 1 }, text: true });
        }
      }
      continue;
    }
    parts.push({ element: child, atCard: { ...corner, opacity: 0 }, atScreen: { ...home, opacity: 1 }, text: true });
  }
  return parts;
}

/** The editor grows out of the card it was opened from. */
export function growFromCard(editor: HTMLElement, card: HTMLElement): void {
  const within = editor.getBoundingClientRect();
  if (within.width === 0 || within.height === 0) return;
  const edges = edgesOf(card, within);
  const motion = { duration: MOTION.long, easing: MOTION.standard };
  editor.animate([{ clipPath: clipOf(edges, getComputedStyle(card).borderTopLeftRadius) }, { clipPath: FULL_SCREEN }], motion);
  for (const part of partsOf(editor, edges, within)) {
    part.element.animate(
      part.text
        ? [part.atCard, { ...part.atCard, offset: 0.6 }, part.atScreen]
        : [part.atCard, part.atScreen],
      motion
    );
  }
}

/** The editor shrinks back into its card, which the list is showing again by the time it lands. */
export async function shrinkIntoCard(editor: HTMLElement, card: HTMLElement | null): Promise<void> {
  const within = editor.getBoundingClientRect();
  if (!card || within.width === 0 || within.height === 0) return;
  const edges = edgesOf(card, within);
  // `forwards`: the editor stays the size of the card until the component goes away.
  const motion: KeyframeAnimationOptions = { duration: MOTION.medium, easing: MOTION.standard, fill: 'forwards' };
  for (const part of partsOf(editor, edges, within)) {
    part.element.animate(
      part.text ? [part.atScreen, { ...part.atCard, offset: 0.4 }, part.atCard] : [part.atScreen, part.atCard],
      motion
    );
  }
  const shrink = editor.animate(
    [{ clipPath: FULL_SCREEN }, { clipPath: clipOf(edges, getComputedStyle(card).borderTopLeftRadius) }],
    motion
  );
  await shrink.finished.catch(() => undefined);
}
