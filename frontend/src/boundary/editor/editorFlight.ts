/**
 * How an edit leaves the screen.
 *
 * Finishing a note is a small piece of choreography — the editor flies onto the card it becomes, or
 * shrinks back into the "Take a note…" box — and it lives here rather than inside the editor component.
 * Every function takes the elements it moves and gives them back untouched, so nothing in this module
 * reads application state: the component decides *whether* to animate, this decides *how*.
 */
import { MOTION, standardCurve } from './motion';

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
 * A phone's editor is the whole screen, and it grows out of the card it was opened from the way the
 * original's does: Material's container transform. Recorded on an Android emulator with the system's
 * animations slowed ten times (2026-10-17), the open note is drawn **whole and uniformly scaled** to
 * the container's width from the first frame — its bars, its text and its background picture alike,
 * nothing stretched — and the container cuts it off at its bottom edge while it grows from the card's
 * rectangle to the screen's. The bottom bar therefore appears only as the container reaches the bottom.
 * The card's own content is visible under it for the first few frames. Closing runs it backwards: what
 * is written goes first, then the container lands on the card and the card shows through it.
 *
 * Every part of it is a `transform` or an `opacity`, so the compositor runs it and nothing the page
 * does at the same time can make it stutter. A clip-path and a width animation did it before, and both
 * run on the main thread — the first open of a note (Tiptap mounting, the system bar sampling the
 * screen) dropped their frames, which is what the owner saw as choppy on a phone.
 *
 * The container is the host, scaled uniformly from its top-left corner, and its own overflow clip is
 * the container's edge. A container shorter than the scaled note is a *sliding window*: the host is
 * moved up until its bottom edge is the container's bottom, and the editor inside it is moved down by
 * the same amount, so the note stays where it is drawn and only the edge travels. The editor's offset
 * is not linear in the host's scale, so both animations are computed along the curve, frame by frame.
 */
const FRAMES = 24;

interface Flight {
  host: Keyframe[];
  editor: Keyframe[];
  /** The card's corner, in the editor's own pixels at the scale it starts from. */
  radius: number;
}

/** One frame of the container per step of `progress`, which maps time to 0 (the card) .. 1 (the screen). */
function flightOf(host: HTMLElement, card: HTMLElement, progress: (time: number) => number): Flight | null {
  const within = layoutRect(host);
  const to = layoutRect(card);
  const { width, height } = within;
  if (width === 0 || height === 0 || to.width === 0 || to.height === 0) return null;
  const left = to.left - within.left;
  const top = to.top - within.top;
  const hostFrames: Keyframe[] = [];
  const editorFrames: Keyframe[] = [];
  for (let step = 0; step <= FRAMES; step++) {
    const offset = step / FRAMES;
    const p = progress(offset);
    const scale = (to.width + (width - to.width) * p) / width;
    const container = to.height + (height - to.height) * p;
    const slide = Math.max(0, height - container / scale);
    hostFrames.push({
      offset,
      transformOrigin: '0 0',
      transform: `translate(${left * (1 - p)}px, ${top * (1 - p) - slide * scale}px) scale(${scale})`
    });
    editorFrames.push({ offset, transform: `translateY(${slide}px)` });
  }
  const corner = parseFloat(getComputedStyle(card).borderTopLeftRadius) || 0;
  return { host: hostFrames, editor: editorFrames, radius: corner / (to.width / width) };
}

/** The flight each host is on: a newer one owns the inline styles an older one would tidy away. */
const flights = new WeakMap<HTMLElement, object>();

/** Rounds the container's corners for the flight: the bottom ones on the clip, the top ones on the note. */
function board(host: HTMLElement, editor: HTMLElement, radius: number): object {
  for (const element of [host, editor, ...Array.from(editor.children)]) {
    element.getAnimations().forEach((animation) => animation.cancel());
  }
  const ticket = {};
  flights.set(host, ticket);
  host.style.overflow = 'hidden';
  host.style.borderRadius = `0 0 ${radius}px ${radius}px`;
  editor.style.borderRadius = `${radius}px ${radius}px 0 0`;
  return ticket;
}

function land(host: HTMLElement, editor: HTMLElement, ticket: object): void {
  if (flights.get(host) !== ticket) return;
  flights.delete(host);
  host.style.overflow = '';
  host.style.borderRadius = '';
  editor.style.borderRadius = '';
}

/** Keeps the card on screen, under the container, for the part of the flight it shows through. */
const SHOWN: Keyframe = { visibility: 'visible', opacity: 1 };

/** The editor grows out of the card it was opened from. */
export function growFromCard(host: HTMLElement, editor: HTMLElement, card: HTMLElement): void {
  const flight = flightOf(host, card, standardCurve);
  if (!flight) return;
  const ticket = board(host, editor, flight.radius);
  const timing: KeyframeAnimationOptions = { duration: MOTION.long, easing: 'linear' };
  const grow = host.animate(flight.host, timing);
  editor.animate(flight.editor, timing);
  // The note comes in over its card in the first fifth; the card is hidden under it from then on.
  editor.animate([{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1 }], timing);
  card.animate([SHOWN, SHOWN], { duration: MOTION.long * 0.2 });
  void grow.finished.catch(() => undefined).then(() => land(host, editor, ticket));
}

/**
 * The editor shrinks back into its card, which the list is showing again by the time it lands. The
 * card is kept on screen under it until the returned function is called — once the list has taken it
 * back.
 */
export async function shrinkIntoCard(host: HTMLElement, editor: HTMLElement, card: HTMLElement | null): Promise<() => void> {
  const flight = card ? flightOf(host, card, (time) => 1 - standardCurve(time)) : null;
  if (!card || !flight) return () => undefined;
  board(host, editor, flight.radius);
  // `forwards`: the editor stays the size of the card until the component goes away.
  const timing: KeyframeAnimationOptions = { duration: MOTION.medium, easing: 'linear', fill: 'forwards' };
  const shrink = host.animate(flight.host, timing);
  editor.animate(flight.editor, timing);
  for (const part of Array.from(editor.children)) {
    part.animate([{ opacity: 1 }, { opacity: 0, offset: 0.35 }, { opacity: 0 }], timing);
  }
  // The container is the card's colour; it lets the card through as it lands.
  editor.animate([{ opacity: 1 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }], timing);
  const shown = card.animate([SHOWN, SHOWN], { duration: MOTION.medium, fill: 'forwards' });
  await shrink.finished.catch(() => undefined);
  return () => shown.cancel();
}
