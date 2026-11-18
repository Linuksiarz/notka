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

/** What the server accepts (`AvatarService`). */
const AVATAR_MAX_SIDE = 1024;
const AVATAR_MAX_BYTES = 512 * 1024;

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

/**
 * The identity provider's picture as an avatar, without a crop of the reader's. A JPEG that fits the
 * server's limits keeps every coefficient: libjxl recompresses the bitstream itself, losslessly, and
 * the original JPEG could be rebuilt from the result. Anything else goes through the pixels, as its
 * middle square. A crop of the reader's always does, because a crop is new pixels.
 */
export async function encodeProviderPicture(picture: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(picture);
  try {
    const { width, height } = bitmap;
    if (picture.type === 'image/jpeg' && Math.max(width, height) <= AVATAR_MAX_SIDE) {
      const recompressed = await recompressJpeg(picture);
      if (recompressed && recompressed.size <= AVATAR_MAX_BYTES) return recompressed;
    }
    const side = Math.min(width, height);
    return await encodeAvatar(bitmap, { x: (width - side) / 2, y: (height - side) / 2, width: side, height: side });
  } finally {
    bitmap.close();
  }
}

/**
 * `@jsquash/jxl` takes only pixels, so this is the one thing another build of libjxl is here for, and
 * it is loaded only for a JPEG. `null` for a JPEG libjxl cannot keep exactly, such as a CMYK one.
 */
async function recompressJpeg(jpeg: Blob): Promise<Blob | null> {
  const { default: createEncoder } = await import('@cornerstonejs/codec-libjxl/encodewasmjs');
  const encoder = new (await createEncoder()).JpegXLEncoder();
  const bytes = new Uint8Array(await jpeg.arrayBuffer());
  try {
    encoder.getJpegBuffer(bytes.length).set(bytes);
    encoder.encodeJpeg();
    return new Blob([encoder.getEncodedBuffer().slice()], { type: 'image/jxl' });
  } catch {
    return null;
  }
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
