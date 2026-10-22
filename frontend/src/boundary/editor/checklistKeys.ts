import { Extension } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Selection } from '@tiptap/pm/state';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { checklistSections, type ChecklistRowShape } from '../../entity/checklistSections';

/**
 * What Backspace and Delete do in a checklist, which is more than the editor's general rules can say.
 *
 * A checklist is one list whose rows the app keeps in two groups: unticked rows, then the ticked ones
 * under their own heading (`checklistCompletion.ts`). The general rules know nothing of that, and
 * each of them broke it:
 *
 * - **Backspace in an empty row lifted it out of the list.** At the end of the active rows that cuts
 *   the list in two — the unticked rows in one list, the ticked ones in another — and every list draws
 *   its own "+ List item" row, which is how the editor came to show two of them. In a flat checklist
 *   an empty row is simply a row to remove.
 * - **Delete in an empty row, or at the end of a row, joined the next row into this one.** The next
 *   row of the last active row is the first ticked one, so "delete" pulled a completed item up into
 *   the active rows, unticked.
 *
 * So an empty row is removed whole, with the caret going to the row that stands next to it, and a join
 * never reaches across the line between the active rows and the ticked ones.
 */
type Dispatch = (transaction: Transaction) => void;

interface RowAtCaret {
  list: ProseMirrorNode;
  index: number;
  row: ProseMirrorNode;
  /** Position just before the row. */
  start: number;
  /** The caret is at the very start of the row's first line. */
  atStart: boolean;
  /** The caret is at the very end of the row's last line. */
  atEnd: boolean;
}

function rowAtCaret(state: EditorState): RowAtCaret | null {
  const { $from, empty } = state.selection;
  if (!empty) return null;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name !== 'taskItem') continue;
    const row = $from.node(depth);
    const lastLine = $from.index(depth) === row.childCount - 1;
    return {
      list: $from.node(depth - 1),
      index: $from.index(depth - 1),
      row,
      start: $from.before(depth),
      atStart: $from.index(depth) === 0 && $from.parentOffset === 0,
      atEnd: lastLine && $from.parentOffset === $from.parent.content.size
    };
  }
  return null;
}

/**
 * Removes the row the caret is in when it holds nothing, and puts the caret in the row drawn next to it
 * *in the same section* — the one above, or else the one below. The sections are a drawing
 * (`entity/checklistSections.ts`): a ticked row stays under its parent in the document, so the row
 * next to an active one in the document can be one drawn in the completed section. When the row is
 * the only one of its section the row still goes, and the caret leaves the note's body rather than
 * landing in the other section.
 */
export function removeEmptyRow(state: EditorState, dispatch?: Dispatch, view?: EditorView): boolean {
  const at = rowAtCaret(state);
  if (!at || at.row.textContent !== '' || at.row.childCount !== 1) return false;
  // The only row of the list stays: removing it would lift the caret out of the list.
  if (!dispatch || at.list.childCount < 2) return true;

  const listPos = at.start - positionInList(at.list, at.index);
  const shapes: ChecklistRowShape[] = [];
  at.list.forEach((row) => shapes.push({ checked: row.attrs.checked === true, depth: Number(row.attrs.depth ?? 0) || 0 }));
  const sections = checklistSections(shapes);
  const drawn = sections.active.includes(at.index) ? sections.active : sections.completed.flatMap((group) => group.rows);
  const place = drawn.indexOf(at.index);
  const above = drawn[place - 1];
  const below = drawn[place + 1];
  const neighbour = above ?? below;

  const tr = state.tr.delete(at.start, at.start + at.row.nodeSize);
  // The row below a removed first row has nothing left above it to sit under, so it is a top-level row.
  const next = at.list.maybeChild(at.index + 1);
  if (at.index === 0 && next && Number(next.attrs.depth ?? 0) > 0) {
    tr.setNodeMarkup(at.start, undefined, { ...next.attrs, depth: 0 });
  }
  if (neighbour !== undefined) {
    const rowPos = listPos + positionInList(at.list, neighbour);
    const node = at.list.child(neighbour);
    const target = above !== undefined ? rowPos + node.nodeSize - 1 : rowPos + 1;
    tr.setSelection(Selection.near(tr.doc.resolve(tr.mapping.map(target)), above !== undefined ? -1 : 1));
  }
  dispatch(tr.scrollIntoView());
  if (neighbour === undefined) view?.dom.blur();
  return true;
}

/** How far into its list a row starts, from the list's own opening. */
function positionInList(list: ProseMirrorNode, index: number): number {
  let offset = 1;
  for (let child = 0; child < index; child += 1) offset += list.child(child).nodeSize;
  return offset;
}

/**
 * Consumes a Backspace or a Delete that would join a row to a neighbour in the other group — an
 * unticked row and a ticked one — and does nothing else with it.
 */
export function keepGroupsApart(direction: 'backward' | 'forward') {
  return (state: EditorState): boolean => {
    const at = rowAtCaret(state);
    if (!at) return false;
    const reaching = direction === 'backward' ? at.atStart : at.atEnd;
    if (!reaching) return false;
    const neighbour = at.list.maybeChild(at.index + (direction === 'backward' ? -1 : 1));
    return neighbour !== null && neighbour.attrs.checked !== at.row.attrs.checked;
  };
}

export const ChecklistKeys = Extension.create({
  name: 'checklistKeys',
  // Before the list keymap, whose own Backspace and Delete are the ones that do the damage.
  priority: 1000,

  addKeyboardShortcuts() {
    const run =
      (...commands: Array<(state: EditorState, dispatch?: Dispatch, view?: EditorView) => boolean>) =>
      ({ editor }: { editor: { state: EditorState; view: EditorView } }) =>
        commands.some((command) => command(editor.state, (tr) => editor.view.dispatch(tr), editor.view));
    return {
      Backspace: run(removeEmptyRow, keepGroupsApart('backward')),
      Delete: run(removeEmptyRow, keepGroupsApart('forward'))
    };
  }
});
