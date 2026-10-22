import type { Editor } from '@tiptap/core';
import ListItem from '@tiptap/extension-list-item';
import TaskItem from '@tiptap/extension-task-item';
import { TextSelection } from '@tiptap/pm/state';
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

/**
 * Enter in a checklist row. Tiptap's own split is not enough here, for three reasons:
 *
 * - on an empty row it lifts the row out of the list, leaving the caret in a paragraph under it — an
 *   empty row stays a row (Backspace removes it);
 * - it gives the new row the *default* tick, so Enter in a ticked row sent the caret to a row drawn
 *   at the end of the active section;
 * - the new row goes straight under the old one, which takes the rows nested under the old one for
 *   its own — a nested row's only link to its parent is the row above it (rule 4). At the end of a
 *   row the new row therefore goes after the rows nested under it.
 *
 * Both halves keep the row's tick and level.
 */
function splitChecklistRow(editor: Editor): boolean {
  if (!editor.state.selection.empty) editor.commands.deleteSelection();
  const { state } = editor;
  const { $from } = state.selection;

  let level = $from.depth;
  while (level > 0 && $from.node(level).type.name !== 'taskItem') level -= 1;
  if (level === 0) return false;

  const row = $from.node(level);
  if (row.childCount !== 1) return editor.commands.splitListItem('taskItem');
  if (row.textContent === '') return true;

  const tr = state.tr;
  if ($from.parentOffset < $from.parent.content.size) {
    tr.split($from.pos, 2);
    tr.setSelection(TextSelection.create(tr.doc, $from.pos + 4));
  } else {
    const list = $from.node(level - 1);
    let at = $from.after(level);
    for (let next = $from.index(level - 1) + 1; next < list.childCount; next += 1) {
      const sibling = list.child(next);
      if (levelOf(sibling.attrs.depth) <= levelOf(row.attrs.depth)) break;
      at += sibling.nodeSize;
    }
    const { taskItem, paragraph } = state.schema.nodes;
    if (!taskItem || !paragraph) return false;
    tr.insert(at, taskItem.create(row.attrs, paragraph.create()));
    tr.setSelection(TextSelection.create(tr.doc, at + 2));
  }
  editor.view.dispatch(tr.scrollIntoView());
  return true;
}

/** The keys a list row answers: Enter splits it, Tab and Shift-Tab move its own level. */
function rowKeyboardShortcuts(name: 'taskItem' | 'listItem') {
  return {
    Enter: ({ editor }: { editor: Editor }) =>
      name === 'taskItem' ? splitChecklistRow(editor) : editor.commands.splitListItem(name),
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
