/**
 * Publishes the part of the screen the reader can actually see — what is left when the on-screen
 * keyboard is up — as `--vv-top` and `--vv-height`, for the full-screen phone editor to stand in.
 *
 * `interactive-widget=resizes-content` (in `index.html`) asks the browser to shrink the layout for the
 * keyboard, and the browsers that honour it need nothing more. The others keep the layout as tall as
 * the whole screen and only shrink and pan the *visual* viewport: a `position: fixed; inset: 0` editor
 * then runs on underneath the keyboard, its bottom bar out of sight, and the page pans under the
 * finger. Following the visual viewport itself gives the same result in every browser.
 *
 * `--vv-tallest` is the tallest the visible part has been since it last changed width (a rotation):
 * the screen without the keyboard. A note's background picture is sized by it, so the picture keeps its
 * scale and place while the keyboard comes and goes, and the keyboard simply covers its lower part.
 */
export function followVisualViewport(): () => void {
  const viewport = window.visualViewport;
  if (!viewport) return () => undefined;

  const root = document.documentElement;
  let tallest = viewport.height;
  let width = viewport.width;
  const sync = () => {
    if (viewport.width !== width) {
      width = viewport.width;
      tallest = viewport.height;
    }
    tallest = Math.max(tallest, viewport.height);
    root.style.setProperty('--vv-tallest', `${tallest}px`);
    root.style.setProperty('--vv-top', `${viewport.offsetTop}px`);
    root.style.setProperty('--vv-height', `${viewport.height}px`);
  };
  viewport.addEventListener('resize', sync);
  viewport.addEventListener('scroll', sync);
  sync();

  return () => {
    viewport.removeEventListener('resize', sync);
    viewport.removeEventListener('scroll', sync);
    root.style.removeProperty('--vv-top');
    root.style.removeProperty('--vv-height');
    root.style.removeProperty('--vv-tallest');
  };
}
