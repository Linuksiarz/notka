import type { AnyExtension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import { ChecklistRow, FlatListItem } from './listRows';

/**
 * The extensions that make up the note body's **schema** — its nodes and marks. The editor adds its
 * behaviour (placeholder, linkify, the drag, the completed section) on top; anything that has to agree
 * with the editor about positions in a body — a step from another editor — uses exactly this schema.
 */
export function noteBodyExtensions(): AnyExtension[] {
  return [
    StarterKit.configure({
      // Our document has no place for these, so the schema must not grow them.
      blockquote: false,
      codeBlock: false,
      horizontalRule: false,
      heading: { levels: [1, 2, 3] },
      // Keep linkifies an address as it is typed, and clicking one inside the editable must not
      // navigate away from the note being written — the card beside it is what opens the page.
      link: { openOnClick: false, autolink: true },
      // Bullet and numbered rows are flat too, so the schema refuses a list inside an item.
      listItem: false,
      // Tiptap adds an empty paragraph after the last block so the caret can get below it. After a
      // checklist that paragraph was stored with every list note and drawn as an empty line on its card;
      // the original's list has nothing after it, and Enter on an empty row already leaves the list.
      // Part of the schema extensions, so every editor of a note — and its step log — agrees on it.
      trailingNode: { notAfter: ['paragraph', 'taskList'] }
    }),
    TaskList,
    // One row is one line: a second nesting level cannot be expressed, let alone stored.
    ChecklistRow,
    FlatListItem
  ];
}
