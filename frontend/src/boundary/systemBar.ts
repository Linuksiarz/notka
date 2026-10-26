import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

/**
 * The system's own bar — the status bar of an installed app on a phone, the browser's toolbar in a tab,
 * the title bar of an installed app on a desktop — wears the colour of whatever is on screen right under
 * it, the way a native app's does.
 *
 * The original's Android app colours it with the page, with the open note's own colour, and dims it
 * with a sheet or the drawer's veil; following what is actually painted at the top edge gives all of
 * those — and any screen added later — with one rule, rather than a list of states that has to be kept
 * in step with the components. How the bar is given that colour depends on what the app runs in
 * (`paintBar`).
 */
export function followSystemBar(): () => void {
  const paint = paintBar();
  if (!paint) return () => undefined;

  let frame = 0;
  let viewport = viewportKey();
  const schedule = () => {
    if (frame === 0) frame = requestAnimationFrame(sync);
  };
  const sync = () => {
    frame = 0;
    const moving = movingElements();
    paint(colorAtTopEdge(moving));
    // Something is on its way: the bar follows it frame by frame, and is read once more when it is there.
    // So is the screen itself while iOS pans it for the keyboard: the pan goes on after the last event
    // it sends, and a bar read at that event kept the colour of whatever was at the top mid-pan.
    const now = viewportKey();
    const panning = now !== viewport;
    viewport = now;
    if (moving.size > 0 || panning) schedule();
  };

  // What is at the top changes when something opens, closes, recolours, starts or finishes moving;
  // the text being typed never does, so character data is not watched. A script-driven animation
  // announces nothing when it starts, so an inline style — which a flight sets as it takes off — wakes
  // the bar as well: closing a note changes nothing else until the note has already landed.
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'data-theme', 'data-color', 'data-background', 'data-state', 'hidden']
  });
  const events = ['transitionrun', 'transitionend', 'animationstart', 'animationend', 'resize', 'scroll'] as const;
  events.forEach((name) => window.addEventListener(name, schedule, true));
  // The keyboard moves the visible part of the screen without resizing the window on iOS.
  window.visualViewport?.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('scroll', schedule);
  schedule();

  return () => {
    observer.disconnect();
    events.forEach((name) => window.removeEventListener(name, schedule, true));
    window.visualViewport?.removeEventListener('resize', schedule);
    window.visualViewport?.removeEventListener('scroll', schedule);
    cancelAnimationFrame(frame);
  };
}

/**
 * Android's app (`apk/`) draws the page under a transparent status bar, as the original does: the bar
 * shows what is under it — a note's picture included — and all it needs from us is icons that can be
 * read on it, light on a dark top edge and dark on a light one.
 *
 * An installed web app cannot draw under the status bar (only a fullscreen one can, and that hides the
 * bar altogether), but the bar takes `theme-color`, so there it is given the colour itself.
 */
function paintBar(): ((color: Rgb) => void) | null {
  if (Capacitor.isNativePlatform()) {
    let dark: boolean | null = null;
    return (color) => {
      // Until the app has published the bar's inset (`PageInsets.kt`) the page is not known to be
      // under it, and the system's default icons stay.
      if (!(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--keep-inset-top')) > 0)) return;
      const isDark = luminance(color) < 0.5;
      if (isDark === dark) return;
      dark = isDark;
      // `Dark` is the style for a dark background: light icons.
      void StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });
    };
  }
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) return null;
  return (color) => {
    const content = hex(color);
    if (meta && meta.content !== content) meta = recolor(meta, content);
  };
}

/** Relative luminance, as the status bar plugin itself judges a colour (`ColorUtils.calculateLuminance`). */
function luminance([red, green, blue]: Rgb): number {
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}

/**
 * How tall the original's status bar is, in CSS pixels: the band a note growing to the whole screen
 * slides under before it arrives. Android's own status bar is 24dp on a phone without a cut-out and
 * more with one; this is the band the bar's colour changes over, not a measurement of a particular
 * phone.
 */
const STATUS_BAR = 32;

/**
 * The original's app draws under a transparent status bar, so a note growing to the whole screen
 * slides in under the bar as it arrives, and the bar becomes the note's colour over that last stretch
 * rather than in one step; shrinking back, the note uncovers the bar as it leaves the top. A web app's
 * bar is one colour, so a surface on its way counts for as much of the status bar's band as it covers
 * at this frame — its top edge in the band, its width and its opacity — over whatever stands still.
 * Nothing about where an animation will end is predicted, and no animation is touched to find out.
 */
function coverage(element: Element): number {
  const box = element.getBoundingClientRect();
  const top = box.top - screenTop();
  const across = Math.max(0, Math.min(box.right, window.innerWidth) - Math.max(box.left, 0)) / window.innerWidth;
  const down = box.bottom <= screenTop() ? 0 : Math.min(1, Math.max(0, (STATUS_BAR - top) / STATUS_BAR));
  let opacity = 1;
  for (let node: Element | null = element; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
  return across * down * opacity;
}

/** Whether any of [element]'s box is in the status bar's band right now. */
function reachesBand(element: Element): boolean {
  const box = element.getBoundingClientRect();
  return box.bottom > screenTop() && box.top < screenTop() + STATUS_BAR && box.right > 0 && box.left < window.innerWidth;
}

/** The elements an animation that will end is moving; one that never ends (a spinner) is not on its way. */
function movingElements(): Set<Element> {
  const moving = new Set<Element>();
  for (const animation of document.getAnimations()) {
    if (animation.playState !== 'running' || animation.effect?.getComputedTiming().endTime === Infinity) continue;
    const target = animation.effect instanceof KeyframeEffect ? animation.effect.target : null;
    if (target) moving.add(target);
  }
  return moving;
}

function isMoving(element: Element, moving: Set<Element>): boolean {
  for (let node: Element | null = element; node; node = node.parentElement) if (moving.has(node)) return true;
  return false;
}

/** What a moving element paints: itself, or the first thing inside it that has a background. */
function paintedSurface(element: Element): Element | null {
  const queue = [element];
  for (let next = queue.shift(); next; next = queue.shift()) {
    if (parseColor(getComputedStyle(next).backgroundColor)) return next;
    queue.push(...Array.from(next.children));
    if (queue.length > 64) break;
  }
  return null;
}

/**
 * The browsers that paint the bar of an installed app (Samsung Internet's among them) notice a
 * `theme-color` that is *added*, but not always one whose `content` changed, and stay on the colour
 * the page was first loaded with. A fresh element each time is read by all of them.
 */
function recolor(old: HTMLMetaElement, color: string): HTMLMetaElement {
  const fresh = document.createElement('meta');
  fresh.name = 'theme-color';
  fresh.content = color;
  old.replaceWith(fresh);
  return fresh;
}

/**
 * Where the screen's top edge is in the page's coordinates. They are the same until the on-screen
 * keyboard comes up: iOS then pans the visible part over a page that keeps its height, and the page's
 * own top can be off the screen — the full-screen editor follows the visible part (`visualViewport.ts`),
 * so the page's top is then the page's background above the editor, not the note.
 */
function screenTop(): number {
  return window.visualViewport?.offsetTop ?? 0;
}

/** Where the visible part of the screen is and how big, to tell a pan that is still going on. */
function viewportKey(): string {
  const viewport = window.visualViewport;
  return viewport ? `${viewport.offsetTop}:${viewport.height}:${window.scrollY}` : `${window.scrollY}`;
}

/**
 * The colour of the status bar's band: what stands still at the middle of the window's top edge, every
 * layer there laid over the next, and every surface on its way over that by how much of the band it
 * covers (`coverage`).
 */
function colorAtTopEdge(moving: Set<Element>): Rgb {
  // Top-most first; the page's own background is under all of them.
  // One pixel into the screen: on the edge itself a surface whose top is a fraction lower than the
  // pan's offset is missed, and the page's own background shows in the bar instead of the note.
  const stack = layersAt(window.innerWidth / 2, screenTop() + 1, moving);
  let painted: Rgb = [255, 255, 255];
  const page = parseColor(getComputedStyle(document.body).backgroundColor);
  if (page) painted = over(page, painted);
  for (const element of stack) {
    if (isMoving(element, moving)) continue;
    const style = getComputedStyle(element);
    const color = parseColor(style.backgroundColor, Number(style.opacity));
    if (color) painted = over(color, painted);
  }
  for (const element of moving) {
    if (element.parentElement && isMoving(element.parentElement, moving)) continue;
    // A card coming into the grid is nowhere near the bar; only what reaches the band is weighed.
    if (!reachesBand(element)) continue;
    const surface = paintedSurface(element);
    const color = surface ? parseColor(getComputedStyle(surface).backgroundColor) : null;
    if (surface && color) painted = over([color[0], color[1], color[2], color[3] * coverage(surface)], painted);
  }
  return painted;
}

/**
 * The layers at a point that can show, bottom-most first. Usually the top-most element there — the
 * header — paints an opaque background, and nothing under it can show: that one element is the answer,
 * and finding it costs next to nothing. `elementsFromPoint` collects every layer of the page at that
 * point, which with a grid of notes was over a millisecond on every frame of a scroll, so it is asked
 * only when the top-most element lets something through or is on its way somewhere.
 */
function layersAt(x: number, y: number, moving: Set<Element>): Element[] {
  const top = document.elementFromPoint(x, y);
  if (top && !isMoving(top, moving)) {
    const style = getComputedStyle(top);
    if (Number(style.opacity) === 1 && parseColor(style.backgroundColor)?.[3] === 1) return [top];
  }
  return document.elementsFromPoint(x, y).reverse();
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

function hex(color: Rgb): string {
  return `#${color.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;
}
