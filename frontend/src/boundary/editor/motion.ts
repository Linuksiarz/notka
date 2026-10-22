import { cubicIn, cubicOut } from 'svelte/easing';

/**
 * The Material motion values the stylesheet uses, for the animations that have to run in script —
 * a FLIP cannot be expressed in CSS.
 *
 * Both sides mirror the published Material tokens (`mdc-animation/_animation.scss`, MIT, and
 * `material-web`'s motion tokens, Apache-2.0); keep them in step with `tokens.css`.
 */
export const MOTION = {
  /** Material `duration-short3`. */
  short: 150,
  /** Material `duration-short4`. */
  medium: 200,
  /** Material `duration-medium1`. */
  long: 250,
  /** Material `duration-medium2`. */
  emphasized: 300,
  /**
   * The original's own grid: every card carries `transition: transform 0.218s`, so a note that is
   * pinned or unpinned, and every note making room for it, slides there in one 218ms move
   * (measured off keep.google.com, 2026-10-14). Not a Material token.
   */
  regrid: 218,
  /** The Android app's speed dial: each kind of note follows the one below it this much later. */
  speedDialStagger: 35,
  /** Material curve for something that changes size or moves across the screen. */
  standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
  /** Something appearing decelerates into place. */
  enter: 'cubic-bezier(0, 0, 0.2, 1)',
  /** Something leaving accelerates away. */
  exit: 'cubic-bezier(0.4, 0, 1, 1)'
} as const;

/**
 * A CSS `cubic-bezier(x1, y1, x2, y2)` as a function of time, for an animation whose keyframes have
 * to be computed along the curve (two elements that must agree on every frame, where one of them moves
 * by a value that is not linear in the other's). Newton's method on x, then bisection where it stalls.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (time: number) => number {
  const at = (a: number, b: number, t: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  const slope = (a: number, b: number, t: number) => 3 * a * (1 - t) ** 2 + 6 * (b - a) * t * (1 - t) + 3 * (1 - b) * t * t;
  return (time) => {
    if (time <= 0) return 0;
    if (time >= 1) return 1;
    let t = time;
    for (let i = 0; i < 8; i++) {
      const error = at(x1, x2, t) - time;
      const d = slope(x1, x2, t);
      if (Math.abs(error) < 1e-6) return at(y1, y2, t);
      if (Math.abs(d) < 1e-6) break;
      t -= error / d;
    }
    let low = 0;
    let high = 1;
    t = time;
    while (high - low > 1e-6) {
      if (at(x1, x2, t) < time) low = t;
      else high = t;
      t = (low + high) / 2;
    }
    return at(y1, y2, t);
  };
}

/** `MOTION.standard` as a function. */
export const standardCurve = cubicBezier(0.4, 0, 0.2, 1);

/**
 * The same curves as functions. Svelte's own transitions take an easing *function*, not a CSS
 * string, and Material's standard curve is what Svelte ships as `cubicOut` (`cubicIn` for the way
 * out) — so the two systems stay on one set of numbers instead of drifting apart.
 */
export const ENTER_EASING = cubicOut;
export const EXIT_EASING = cubicIn;
