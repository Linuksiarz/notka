/** `fflate` is only needed for a `.zip`, so it is fetched when one is written or read. */
const zipLibrary = () => import('fflate');

/**
 * Files in and out of the browser: the Markdown export (one `.md`, or a `.zip` of them) and reading
 * what the reader picks for the import. Nothing is sent anywhere from here; the server only ever
 * sees the notes the import then creates through the ordinary REST calls.
 */

const MAX_NAME_LENGTH = 60;

/** A single file larger than this is not a note; reading it would only freeze the tab. */
const MAX_FILE_BYTES = 1024 * 1024;

/** The most a picked `.zip` may unpack to, all files together. */
const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;

const NOTE_FILE = /\.(md|markdown|txt)$/i;

/** A name the common file systems all accept: no path separators or reserved characters. */
export function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '-').trim().slice(0, MAX_NAME_LENGTH);
}

function save(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function saveMarkdownFile(name: string, markdown: string): void {
  save(`${safeFileName(name)}.md`, new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
}

/**
 * Several notes as one `.zip` of `.md` files — one download, which a browser allows without asking,
 * and one file per note, which is what an importer (ours or another app's) wants. Two notes with the
 * same title get " (2)", " (3)"… rather than overwriting each other in the archive.
 */
export async function saveMarkdownZip(
  name: string,
  files: ReadonlyArray<{ name: string; markdown: string }>
): Promise<void> {
  const { strToU8, zipSync } = await zipLibrary();
  const entries: Record<string, Uint8Array> = {};
  for (const file of files) {
    const base = safeFileName(file.name) || 'note';
    let candidate = `${base}.md`;
    for (let copy = 2; candidate in entries; copy += 1) candidate = `${base} (${copy}).md`;
    entries[candidate] = strToU8(file.markdown);
  }
  const zipped = zipSync(entries);
  save(`${safeFileName(name)}.zip`, new Blob([zipped.slice().buffer], { type: 'application/zip' }));
}

/** A file the import can read, and why one it cannot was skipped. */
export interface PickedFiles {
  texts: Array<{ name: string; text: string }>;
  skipped: string[];
}

/**
 * Reads what the reader picked: Markdown (or plain text) files as they are, and the Markdown files
 * inside a `.zip`. Anything else, and anything too large, is skipped and named.
 */
export async function readPickedFiles(files: Iterable<File>): Promise<PickedFiles> {
  const result: PickedFiles = { texts: [], skipped: [] };
  for (const file of files) {
    if (/\.zip$/i.test(file.name)) {
      if (file.size > MAX_ARCHIVE_BYTES) {
        result.skipped.push(file.name);
        continue;
      }
      try {
        const { strFromU8, unzipSync } = await zipLibrary();
        let unpacked = 0;
        const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {
          filter: (entry) => {
            unpacked += entry.originalSize;
            return NOTE_FILE.test(entry.name) && entry.originalSize <= MAX_FILE_BYTES && unpacked <= MAX_ARCHIVE_BYTES;
          }
        });
        for (const [name, bytes] of Object.entries(entries)) {
          if (!name.split('/').some((part) => part.startsWith('.') || part === '__MACOSX')) {
            result.texts.push({ name, text: strFromU8(bytes) });
          }
        }
      } catch {
        result.skipped.push(file.name);
      }
    } else if (NOTE_FILE.test(file.name) && file.size <= MAX_FILE_BYTES) {
      result.texts.push({ name: file.name, text: await file.text() });
    } else {
      result.skipped.push(file.name);
    }
  }
  return result;
}
