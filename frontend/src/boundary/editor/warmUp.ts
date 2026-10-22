import { Editor } from '@tiptap/core';
import { noteBodyExtensions } from './noteSchema';

/**
 * Builds and drops one editor off the page while the app is idle, so the first note the reader opens
 * does not pay for resolving the extensions, compiling the schema and warming ProseMirror's code paths
 * in the middle of its opening animation.
 */
export function warmUpEditor(): void {
  const editor = new Editor({
    extensions: noteBodyExtensions(),
    content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: ' ' }] }] }
  });
  editor.destroy();
}
