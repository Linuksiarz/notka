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
  /** Material curve for something that changes size or moves across the screen. */
  standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
  /** Something appearing decelerates into place. */
  enter: 'cubic-bezier(0, 0, 0.2, 1)',
  /** Something leaving accelerates away. */
  exit: 'cubic-bezier(0.4, 0, 1, 1)'
} as const;

/**
 * The same curves as functions. Svelte's own transitions take an easing *function*, not a CSS
 * string, and Material's standard curve is what Svelte ships as `cubicOut` (`cubicIn` for the way
 * out) — so the two systems stay on one set of numbers instead of drifting apart.
 */
export const ENTER_EASING = cubicOut;
export const EXIT_EASING = cubicIn;
