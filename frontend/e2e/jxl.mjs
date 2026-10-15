/**
 * Stores a screenshot as lossless JPEG XL (`AGENTS.md`: JPEG XL is the preferred image format).
 *
 * Playwright only encodes PNG, so the capture goes through a temporary PNG and `cjxl -d 0`, which
 * keeps every pixel. Needs the encoder on the PATH: `brew install jpeg-xl`.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function writeLosslessJxl(png, out) {
  const dir = mkdtempSync(join(tmpdir(), 'notka-jxl-'));
  const source = join(dir, 'capture.png');
  try {
    writeFileSync(source, png);
    execFileSync('cjxl', [source, out, '-d', '0'], { stdio: ['ignore', 'ignore', 'inherit'] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return out;
}
