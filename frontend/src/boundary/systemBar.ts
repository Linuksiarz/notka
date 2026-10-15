/**
 * The system's own bar — the status bar of an installed app on a phone, the browser's toolbar in a tab,
 * the title bar of an installed app on a desktop — wears the colour of whatever is on screen right under
 * it, the way a native app's does.
 *
 * An installed web app cannot draw under the status bar (only a fullscreen one can, and that hides the
 * bar altogether), but the bar takes `theme-color`. The original's Android app colours it with the page,
 * with the open note's own colour, and dims it with a sheet or the drawer's veil; following what is
 * actually painted at the top edge gives all of those — and any screen added later — with one rule,
 * rather than a list of states that has to be kept in step with the components.
 */
export function followSystemBar(): () => void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) return () => undefined;

  let frame = 0;
  const schedule = () => {
    if (frame === 0) frame = requestAnimationFrame(sync);
  };
  const sync = () => {
    frame = 0;
    const color = colorAtTopEdge();
    if (meta.content !== color) meta.content = color;
    // Something is still on its way — a note growing out of its card, a veil fading in. Those run
    // on the Web Animations API, which reports no end event, so the bar follows them frame by frame
    // until the screen has settled.
    if (settling()) schedule();
  };

  // What is at the top changes when something opens, closes, recolours or finishes moving; the text
  // being typed never does, so character data is not watched.
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'data-theme', 'data-color', 'data-background', 'data-state', 'hidden']
  });
  const events = ['transitionend', 'animationend', 'resize'] as const;
  events.forEach((name) => window.addEventListener(name, schedule, true));
  schedule();

  return () => {
    observer.disconnect();
    events.forEach((name) => window.removeEventListener(name, schedule, true));
    cancelAnimationFrame(frame);
  };
}

/** Whether an animation that will end is running; one that never ends (a spinner) is not settling. */
function settling(): boolean {
  return document
    .getAnimations()
    .some((animation) => animation.playState === 'running' && animation.effect?.getComputedTiming().endTime !== Infinity);
}

/** The colour painted in the middle of the window's top edge, every layer there laid over the next. */
function colorAtTopEdge(): string {
  // Top-most first; the page's own background is under all of them.
  const stack = document.elementsFromPoint(window.innerWidth / 2, 0).reverse();
  let painted: Rgb = [255, 255, 255];
  const page = parseColor(getComputedStyle(document.body).backgroundColor);
  if (page) painted = over(page, painted);
  for (const element of stack) {
    const style = getComputedStyle(element);
    const color = parseColor(style.backgroundColor, Number(style.opacity));
    if (color) painted = over(color, painted);
  }
  return `#${painted.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;
}

type Rgb = [number, number, number];
type Rgba = [number, number, number, number];

/** `rgb(…)`/`rgba(…)` as the browser reports a computed colour; `null` for one that paints nothing. */
function parseColor(value: string, opacity = 1): Rgba | null {
  const channels = value.match(/[\d.]+/g)?.map(Number);
  if (!channels || channels.length < 3) return null;
  const [red = 0, green = 0, blue = 0, alpha = 1] = channels;
  const coverage = alpha * opacity;
  return coverage > 0 ? [red, green, blue, coverage] : null;
}

function over([red, green, blue, alpha]: Rgba, under: Rgb): Rgb {
  return [
    red * alpha + under[0] * (1 - alpha),
    green * alpha + under[1] * (1 - alpha),
    blue * alpha + under[2] * (1 - alpha)
  ];
}
