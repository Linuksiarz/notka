import type { CreateNoteRequest } from './api/types';
import { createBlock } from './noteDocument';

/** What another app handed over through the system's share sheet (the manifest's `share_target`). */
export interface SharedContent {
  title: string;
  text: string;
  url: string;
}

/**
 * The note a share becomes: the subject is the title, the text is the body one line per paragraph,
 * and the link goes on a line of its own under it — unless the text already carries it, which is
 * how most Android apps share a page (the address inside `text`, `url` empty or repeating it).
 * `null` when nothing but whitespace was shared.
 */
export function sharedNoteRequest(shared: SharedContent): CreateNoteRequest | null {
  const title = shared.title.trim();
  const text = shared.text.replace(/\r\n?/g, '\n').trim();
  const url = shared.url.trim();
  const lines = text === '' ? [] : text.split('\n');
  if (url !== '' && !text.includes(url)) lines.push(url);
  if (title === '' && lines.length === 0) return null;
  const blocks = lines.length > 0 ? lines.map((line) => createBlock('paragraph', line)) : [createBlock()];
  return { kind: 'TEXT', title, content: { version: 1, blocks } };
}
