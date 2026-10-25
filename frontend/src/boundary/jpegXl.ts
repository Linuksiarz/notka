/**
 * JPEG XL in the page: an avatar is **encoded here**, before the upload, and drawn by the browser
 * itself. There is no decoder for a browser that cannot draw JPEG XL — such a browser is told at start
 * that it is not one of the recommended ones (`BrowserNotice.svelte`), and shows the initials instead.
 *
 * Why the browser encodes and not the server: the server stays one JVM process with SQLite and nothing
 * native beside it — no `cjxl` in the container, no picture decoded on the server — and it stores
 * exactly the bytes it was given, recognised by their header (`ImageFormats.sniffJpegXl`). The encoder
 * is libjxl compiled to WebAssembly (`@jsquash/jxl`, Squoosh's build), loaded only when an avatar is
 * saved. The page's CSP allows exactly that with `'wasm-unsafe-eval'`.
 */

/** The side of a stored avatar: twice the largest circle it is drawn in, for a sharp picture on a dense screen. */
export const AVATAR_SIDE = 512;

/** libjxl's quality scale, where 90 is visually lossless (distance ≈ 1). */
const AVATAR_QUALITY = 90;

/** A 1 × 1 lossless JPEG XL, `cjxl -d 0`; the browser draws it only if it draws JPEG XL. */
const PROBE = 'data:image/jxl;base64,/woAEBAJCAABACgASxiLFcJJQU5/AA==';

export interface PixelArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Crops [area] out of [image], scales it to the avatar's size and encodes it as JPEG XL. */
export async function encodeAvatar(image: CanvasImageSource, area: PixelArea): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_SIDE;
  canvas.height = AVATAR_SIDE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No 2D canvas');
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, AVATAR_SIDE, AVATAR_SIDE);
  const pixels = context.getImageData(0, 0, AVATAR_SIDE, AVATAR_SIDE);
  const { default: encode } = await import('@jsquash/jxl/encode');
  const bytes = await encode(pixels, { quality: AVATAR_QUALITY, effort: 7 });
  return new Blob([bytes], { type: 'image/jxl' });
}

let support: Promise<boolean> | null = null;

/** Whether this browser draws JPEG XL; asked once, by drawing a one-pixel picture. */
export function drawsJpegXl(): Promise<boolean> {
  support ??= new Promise((resolve) => {
    const probe = new Image();
    probe.onload = () => resolve(probe.naturalWidth === 1);
    probe.onerror = () => resolve(false);
    probe.src = PROBE;
  });
  return support;
}
