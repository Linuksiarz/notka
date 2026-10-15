import type { Editor } from '@tiptap/core';
import ListItem from '@tiptap/extension-list-item';
import TaskItem from '@tiptap/extension-task-item';
import { MAX_BLOCK_DEPTH } from '../../entity/api/types';

/**
 * A list line is a **flat row carrying its own indent** — the original's own model, and ours.
 *
 * `NoteDocument` stores one block per line with a `depth`, and it never stores a list inside a list;
 * the editor used to disagree with it, drawing a `taskList` nested inside a `taskItem` instead. That
 * tree is what every list bug came from, and the owner named them one by one: an item could be
 * inserted two levels deep (a tree has no top), deleting a nested row left its empty list behind as
 * a row with a checkbox but no text, and a row could not be detached on its own because dragging an
 * item dragged everything nested under it.
 *
 * So the schema is flat too. Two things follow, and both are properties of the schema rather than
 * guards on top of it:
 *
 * - **A second level cannot exist.** `TaskItem`'s `nested: false` content model is `paragraph+`, and
 *   `FlatListItem` below is `paragraph+` as well: there is nowhere to put a nested list, so the
 *   server's `MAX_BLOCK_DEPTH` and the editor cannot disagree. Tab and Shift-Tab change the row's own
 *   `depth` attribute instead of restructuring the document.
 * - **A row is exactly one row.** Its box is its own line (or its own several lines) — never a
 *   subtree — which is what lets the drag draw a band around the carried row alone.
 *
 * Indenting means "sits under the row above": the first row of a list has nothing above it, so Tab
 * there changes nothing. `boundary/editor/listDepthLimit.ts` used to hold the one-level rule for the
 * old tree; it is gone, because there is no longer a second level to refuse.
 */
const depthAttribute = {
  depth: {
    default: 0,
    parseHTML: (element: HTMLElement) => levelOf(element.getAttribute('data-depth')),
    renderHTML: (attributes: Record<string, unknown>) => ({ 'data-depth': String(levelOf(attributes.depth)) })
  }
};

/** A level read from an attribute or an attribute value: anything unusable is the top level. */
function levelOf(value: unknown): number {
  const depth = Number(value);
  if (!Number.isFinite(depth)) return 0;
  return Math.min(Math.max(Math.trunc(depth), 0), MAX_BLOCK_DEPTH);
}

/**
 * Moves the caret's row one level in or out. Answers `true` either way when the caret *is* in a list
 * row: the key is consumed, because the browser's own Tab would move the focus out of the note.
 */
export function changeRowDepth(editor: Editor, direction: 1 | -1): boolean {
  const { state } = editor;
  const { $from } = state.selection;

  for (let level = $from.depth; level > 0; level -= 1) {
    const row = $from.node(level);
    if (row.type.name !== 'taskItem' && row.type.name !== 'listItem') continue;

    const current = levelOf(row.attrs.depth);
    const wanted = Math.min(Math.max(current + direction, 0), MAX_BLOCK_DEPTH);
    // The first row of a list has nothing above it to indent under, so it stays where it is.
    if (wanted === current || (direction > 0 && $from.index(level - 1) === 0)) return true;

    editor.view.dispatch(
      state.tr.setNodeMarkup($from.before(level), undefined, { ...row.attrs, depth: wanted })
    );
    return true;
  }
  return false;
}

/** The keys a list row answers: Enter splits it, Tab and Shift-Tab move its own level. */
function rowKeyboardShortcuts(name: 'taskItem' | 'listItem') {
  return {
    Enter: ({ editor }: { editor: Editor }) => editor.commands.splitListItem(name),
    Tab: ({ editor }: { editor: Editor }) => changeRowDepth(editor, 1),
    'Shift-Tab': ({ editor }: { editor: Editor }) => changeRowDepth(editor, -1),
    // The original's own shortcut, which its editor advertises ("Cmd + ]"); Mod is Cmd on a Mac and
    // Ctrl elsewhere.
    'Mod-]': ({ editor }: { editor: Editor }) => changeRowDepth(editor, 1),
    'Mod-[': ({ editor }: { editor: Editor }) => changeRowDepth(editor, -1)
  };
}

/** A checklist row: Tiptap's task item, flat, with the indent as its own attribute. */
export const ChecklistRow = TaskItem.configure({ nested: false }).extend({
  addAttributes() {
    return { ...this.parent?.(), ...depthAttribute };
  },
  addKeyboardShortcuts: () => rowKeyboardShortcuts('taskItem')
});

/** A bullet or numbered row: the same shape, without the checkbox. */
export const FlatListItem = ListItem.extend({
  content: 'paragraph+',
  addAttributes() {
    return { ...this.parent?.(), ...depthAttribute };
  },
  addKeyboardShortcuts: () => rowKeyboardShortcuts('listItem')
});
