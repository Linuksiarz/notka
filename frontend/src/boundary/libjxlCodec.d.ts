/** The package ships no types; this is the part of its encoder `jpegXl.ts` uses. */
declare module '@cornerstonejs/codec-libjxl/encodewasmjs' {
  interface JpegXLEncoder {
    getJpegBuffer(length: number): Uint8Array;
    encodeJpeg(): void;
    getEncodedBuffer(): Uint8Array;
  }

  export default function createJpegXLEncoder(): Promise<{ JpegXLEncoder: new () => JpegXLEncoder }>;
}
