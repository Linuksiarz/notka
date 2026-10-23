/** How much the middle of a capsule magnifies what is under it: it shows 92% of the area it covers. */
const MAGNIFY = 0.92;
/** The width of the rim that bends the picture, in CSS pixels. */
const BEZEL = 12;
/** How far beyond its own edge the rim reaches for what it shows, at the very edge. */
const RIM_REACH = 10;

/**
 * The lensing of iOS's Liquid Glass under the phone editor's capsules (`:root[data-glass]`).
 *
 * No browser hands a page the pixels under an element. `backdrop-filter: url(#svg)` is the one way to
 * bend them, and WebKit does not draw it — so, as every working web version of the effect does, the
 * lens bends a **copy** of what is under it. In the editor that copy is easy to make and never goes
 * stale: under the bars there is nothing but the note's own colour and background picture (the text
 * scrolls in `.body`, between them), so the picture is drawn again here, aligned with the note, and bent
 * pixel by pixel into a `<canvas>` under the capsule's glyphs. The libraries that do this for any page
 * re-render the DOM behind the glass, which is far heavier than one picture.
 *
 * It draws only when something changes (the capsule's or the note's box, the picture, the theme), so
 * the work is done on the CPU. A note with no picture — or a picture the canvas may not read — keeps
 * the plain frosted glass of the stylesheet; `data-lens` says the lens is drawn.
 */
export function glassLens(capsule: HTMLElement): (() => void) | undefined {
  const editor = capsule.closest<HTMLElement>('.editor');
  if (!editor) return undefined;

  const canvas = document.createElement('canvas');
  canvas.className = 'glass-lens';
  canvas.setAttribute('aria-hidden', 'true');
  capsule.prepend(canvas);

  let source = '';
  let picture: HTMLImageElement | null = null;
  let frame = 0;
  const schedule = () => {
    if (frame === 0) frame = requestAnimationFrame(render);
  };

  const render = () => {
    frame = 0;
    const style = getComputedStyle(editor);
    // A computed `url()` is always quoted, and the address itself may hold parentheses.
    const url = /^url\("(.+)"\)$/.exec(style.backgroundImage)?.[1] ?? '';
    if (url !== source) {
      source = url;
      picture = null;
      if (url) {
        const image = new Image();
        image.onload = () => {
          if (source !== url) return;
          picture = image;
          schedule();
        };
        image.src = url;
      }
    }
    try {
      if (picture && draw(canvas, capsule, editor, picture, style)) {
        capsule.setAttribute('data-lens', '');
        return;
      }
    } catch {
      // A picture from another origin taints the canvas; the frosted glass stays.
    }
    capsule.removeAttribute('data-lens');
  };

  const resized = new ResizeObserver(schedule);
  resized.observe(capsule);
  resized.observe(editor);
  const restyled = new MutationObserver(schedule);
  restyled.observe(editor, { attributes: true, attributeFilter: ['data-color', 'data-background'] });
  restyled.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style'] });
  const scroller = editor.parentElement;
  scroller?.addEventListener('scroll', schedule, { passive: true });
  schedule();

  return () => {
    resized.disconnect();
    restyled.disconnect();
    scroller?.removeEventListener('scroll', schedule);
    cancelAnimationFrame(frame);
    canvas.remove();
    capsule.removeAttribute('data-lens');
  };
}

function draw(
  canvas: HTMLCanvasElement,
  capsule: HTMLElement,
  editor: HTMLElement,
  picture: HTMLImageElement,
  editorStyle: CSSStyleDeclaration
): boolean {
  const scale = window.devicePixelRatio || 1;
  const box = placeIn(editor, capsule);
  const note = { width: editor.offsetWidth, height: editor.offsetHeight };
  if (box.width === 0 || box.height === 0) return false;

  // What the note paints around the capsule, with room for the rim to reach out.
  const margin = RIM_REACH + 2;
  const under = document.createElement('canvas');
  under.width = Math.ceil((box.width + 2 * margin) * scale);
  under.height = Math.ceil((box.height + 2 * margin) * scale);
  const underContext = under.getContext('2d');
  if (!underContext) return false;
  underContext.fillStyle = editorStyle.backgroundColor;
  underContext.fillRect(0, 0, under.width, under.height);
  const art = pictureBox(note, picture);
  underContext.drawImage(
    picture,
    (art.left - (box.left - margin)) * scale,
    (art.top - (box.top - margin)) * scale,
    art.width * scale,
    art.height * scale
  );
  const pixels = underContext.getImageData(0, 0, under.width, under.height).data;

  canvas.width = Math.round(box.width * scale);
  canvas.height = Math.round(box.height * scale);
  const context = canvas.getContext('2d');
  if (!context) return false;
  const output = context.createImageData(canvas.width, canvas.height);
  const radius = Math.min(parseFloat(getComputedStyle(capsule).borderTopLeftRadius) || 0, box.height / 2);
  const [tintRed, tintGreen, tintBlue, tintAlpha] = parseRgba(getComputedStyle(capsule).getPropertyValue('--keep-glass-tint'));
  const tint = [tintRed * tintAlpha, tintGreen * tintAlpha, tintBlue * tintAlpha] as const;

  for (let row = 0; row < canvas.height; row++) {
    for (let column = 0; column < canvas.width; column++) {
      const x = (column + 0.5) / scale;
      const y = (row + 0.5) / scale;
      const lens = refract(x, y, box.width, box.height, radius);
      const at = (row * canvas.width + column) * 4;
      const coverage = Math.min(1, Math.max(0, lens.inset * scale + 0.5));
      if (coverage === 0) continue;
      const sx = (lens.x + margin) * scale;
      const sy = (lens.y + margin) * scale;
      tint.forEach((tinted, channel) => {
        output.data[at + channel] = sample(pixels, under.width, under.height, sx, sy, channel) * (1 - tintAlpha) + tinted;
      });
      output.data[at + 3] = 255 * coverage;
    }
  }
  context.putImageData(output, 0, 0);
  return true;
}

/**
 * The capsule's box in the note's own layout pixels. A note opened from the grid grows out of its card
 * with a scale, and a lens measured from the screen in the middle of that would be drawn for the
 * shrunken box and never again — no observer hears of a transform.
 */
function placeIn(editor: HTMLElement, capsule: HTMLElement): { left: number; top: number; width: number; height: number } {
  const note = editor.getBoundingClientRect();
  const box = capsule.getBoundingClientRect();
  const zoom = note.width / (editor.offsetWidth || 1) || 1;
  return {
    left: (box.left - note.left) / zoom,
    top: (box.top - note.top) / zoom,
    width: capsule.offsetWidth,
    height: capsule.offsetHeight
  };
}

/**
 * Where the note's picture lies, in the note's own coordinates: the phone editor's
 * `background-size: max(100%, var(--vv-tallest)) auto` from the right top (`NoteEditor.svelte`).
 * The pictures are square (`docs/THEMES.md`); one with no size of its own is taken as such.
 */
function pictureBox(note: { width: number }, picture: HTMLImageElement): { left: number; top: number; width: number; height: number } {
  const tallest = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--vv-tallest')) || 0;
  const width = Math.max(note.width, tallest);
  const ratio = picture.naturalWidth > 0 ? picture.naturalHeight / picture.naturalWidth : 1;
  return { left: note.width - width, top: 0, width, height: width * ratio };
}

/**
 * Where the glass at (`x`, `y`) of a `width` × `height` capsule with corners of `radius` looks: its
 * middle magnifies (`MAGNIFY`), and its rim bends outward, the more the closer to the edge (`BEZEL`,
 * `RIM_REACH`), so the edge shows what lies just beyond it, squeezed — the look of a thick, rounded
 * pane. `inset` is how far inside the capsule the point is (negative outside it).
 */
export function refract(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): { x: number; y: number; inset: number } {
  const centerX = width / 2;
  const centerY = height / 2;
  const dx = x - centerX;
  const dy = y - centerY;
  // The signed distance to a rounded rectangle, and the outward normal at the nearest edge.
  const qx = Math.abs(dx) - (centerX - radius);
  const qy = Math.abs(dy) - (centerY - radius);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inset = -(outside + Math.min(Math.max(qx, qy), 0) - radius);
  let normalX = 0;
  let normalY = 0;
  if (qx > 0 && qy > 0) {
    normalX = (qx / outside) * Math.sign(dx);
    normalY = (qy / outside) * Math.sign(dy);
  } else if (qx > qy) {
    normalX = Math.sign(dx);
  } else {
    normalY = Math.sign(dy);
  }
  const closeness = Math.max(0, 1 - inset / BEZEL);
  const reach = RIM_REACH * closeness * closeness;
  return {
    x: centerX + dx * MAGNIFY + normalX * reach,
    y: centerY + dy * MAGNIFY + normalY * reach,
    inset
  };
}

/** One channel of the picture at (`x`, `y`), in device pixels, blended from the four around it. */
function sample(pixels: Uint8ClampedArray, width: number, height: number, x: number, y: number, channel: number): number {
  const left = Math.min(width - 2, Math.max(0, Math.floor(x - 0.5)));
  const top = Math.min(height - 2, Math.max(0, Math.floor(y - 0.5)));
  const fx = Math.min(1, Math.max(0, x - 0.5 - left));
  const fy = Math.min(1, Math.max(0, y - 0.5 - top));
  const at = (column: number, row: number) => pixels[(row * width + column) * 4 + channel] ?? 0;
  return (at(left, top) * (1 - fx) + at(left + 1, top) * fx) * (1 - fy) + (at(left, top + 1) * (1 - fx) + at(left + 1, top + 1) * fx) * fy;
}

function parseRgba(value: string): [number, number, number, number] {
  const [red = 255, green = 255, blue = 255, alpha = 0] = value.match(/[\d.]+/g)?.map(Number) ?? [];
  return [red, green, blue, alpha];
}
