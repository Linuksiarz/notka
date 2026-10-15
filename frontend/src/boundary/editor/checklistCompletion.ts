import { Extension } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import type { EditorState, Selection, Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorView } from '@tiptap/pm/view';
import add from '@iconify-icons/material-symbols/add';
import { buildIcon } from '@iconify/svelte';
import { COMPLETED_SECTION, completedChevron } from './completedSection';

/**
 * Google Keep's completed items, inside the editor.
 *
 * Ticking a checklist row does two things in the original: the row travels to the bottom of its list,
 * and it collects under a "N completed items" heading that folds away. Both live here.
 *
 * The move is a real document change, not a rendering trick — that is what makes the stored order
 * and the order on screen the same thing, and what lets a folded section be one `display: none`.
 * It is applied from `appendTransaction`, so a tick *and* its move are one change from the user's
 * point of view, and every path that changes the document (typing, Tab, paste, undo) is covered by
 * one rule: unticked rows first, then ticked ones, each keeping its own order.
 *
 * A ticked row no longer carries anything with it: a list line is a flat row (`listRows.ts`), so
 * moving it moves exactly one row. Tiptap does ship a DragHandle extension, and it was considered: it
 * drags *any* block with its own floating handle and its own drop indicator, while this one has to
 * sit in the checklist row's own gutter and move list items into a list. Styling and restricting the
 * library's version into that shape is more code than the transaction below, and it would add
 * `@floating-ui/dom` and the node-range extension to the bundle.
 */
export interface ChecklistCompletionOptions {
  /** The heading's text, read from the i18n catalogue by the component that owns the editor. */
  labelFor: (count: number) => string;
  /**
   * The original's "+ List item" row under the active rows; absent, no row is drawn. Read from the
   * i18n catalogue by the component that owns the editor, like the heading.
   */
  addItemLabel?: string;
}

/** The class of the "+ List item" row, styled in `RichText.svelte`. */
export const ADD_ITEM_ROW = 'add-item-row';

interface ChecklistCompletionState {
  open: boolean;
}

export const checklistCompletionKey = new PluginKey<ChecklistCompletionState>('checklistCompletion');

function checkedOf(node: ProseMirrorNode): boolean {
  return node.attrs.checked === true;
}

/** Unticked rows first, ticked ones after them, each group in the order it already had. */
function partition(items: readonly ProseMirrorNode[]): readonly ProseMirrorNode[] {
  return [
    ...items.filter((item) => !checkedOf(item)),
    ...items.filter((item) => checkedOf(item))
  ];
}

function sameOrder(a: readonly ProseMirrorNode[], b: readonly ProseMirrorNode[]): boolean {
  return a.length === b.length && a.every((node, index) => node === b[index]);
}

interface OrderedList {
  node: ProseMirrorNode;
  /** `order[newIndex]` is the index the row had before. Empty when nothing moved. */
  order: number[];
}

/** Returns the same node when nothing moved, so a caller can tell "already in order" by identity. */
function orderList(list: ProseMirrorNode): OrderedList {
  const items: ProseMirrorNode[] = [];
  list.content.forEach((item) => items.push(item));
  const sorted = partition(items);
  if (sameOrder(sorted, items)) return { node: list, order: [] };
  const order = sorted.map((item) => items.indexOf(item));
  return { node: list.type.create(list.attrs, sorted, list.marks), order };
}

/** Where the caret sits inside a list: the row it is in, and how far into that row. */
function caretIn(listPos: number, list: ProseMirrorNode, selection: Selection): CaretSpot | null {
  if (selection.from <= listPos || selection.to >= listPos + list.nodeSize) return null;
  let pos = listPos + 1;
  for (let index = 0; index < list.childCount; index += 1) {
    const child = list.child(index);
    if (selection.from >= pos && selection.to <= pos + child.nodeSize) {
      const limit = child.nodeSize - 2;
      const clamp = (value: number) => Math.min(Math.max(value, 0), limit);
      return {
        index,
        from: clamp(selection.from - (pos + 1)),
        to: clamp(selection.to - (pos + 1))
      };
    }
    pos += child.nodeSize;
  }
  return null;
}

interface CaretSpot {
  index: number;
  from: number;
  to: number;
}

interface Replacement {
  pos: number;
  ordered: OrderedList;
  caret: CaretSpot | null;
}

/**
 * A list's own size never changes when its rows are reordered, so the positions of its siblings stay
 * valid and every top-level list can be replaced in a single transaction.
 *
 * The caret is put back by hand. Replacing a node maps everything inside it to the end of what
 * replaced it, so ProseMirror's own mapping would drop a caret that was in the list onto the line
 * *after* the list — which is where the next keystroke then landed, outside the checklist. Knowing
 * which row the caret was in, and where that row ended up, costs a few lines and keeps the caret
 * where the typist left it.
 */
function reorder(state: EditorState): Transaction | null {
  const replacements: Replacement[] = [];
  state.doc.forEach((node, offset) => {
    if (node.type.name !== 'taskList') return;
    const ordered = orderList(node);
    if (ordered.node === node) return;
    replacements.push({ pos: offset, ordered, caret: caretIn(offset, node, state.selection) });
  });
  if (replacements.length === 0) return null;

  const tr = state.tr;
  for (const replacement of replacements) {
    tr.replaceWith(
      replacement.pos,
      replacement.pos + replacement.ordered.node.nodeSize,
      replacement.ordered.node
    );
  }

  const moved = replacements.find((replacement) => replacement.caret !== null);
  if (moved?.caret) {
    const list = tr.doc.nodeAt(moved.pos);
    const index = moved.ordered.order.indexOf(moved.caret.index);
    if (list && index !== -1) {
      let itemPos = moved.pos + 1;
      for (let child = 0; child < index; child += 1) itemPos += list.child(child).nodeSize;
      tr.setSelection(
        TextSelection.create(tr.doc, itemPos + 1 + moved.caret.from, itemPos + 1 + moved.caret.to)
      );
    }
  }
  return tr;
}

/** The heading, built by hand: a widget decoration is a DOM node, not a Svelte component. */
function heading(view: EditorView, open: boolean, label: string): HTMLElement {
  const row = document.createElement('div');
  row.className = COMPLETED_SECTION.row;
  row.contentEditable = 'false';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = COMPLETED_SECTION.toggle;
  button.contentEditable = 'false';
  button.setAttribute('aria-expanded', String(open));

  const chevron = document.createElement('span');
  chevron.className = COMPLETED_SECTION.chevron;
  chevron.innerHTML = completedChevron(open);

  const text = document.createElement('span');
  text.className = COMPLETED_SECTION.label;
  text.textContent = label;

  button.append(chevron, text);
  button.addEventListener('click', () => {
    view.dispatch(view.state.tr.setMeta(checklistCompletionKey, { open: !open }));
  });
  row.append(button);
  return row;
}

/**
 * The original's "+ List item": a row under the active rows that starts a new one. A click puts an
 * empty row at [insertAt] — the end of the active rows, so before any ticked ones — and the caret in it.
 */
function addItemRow(view: EditorView, insertAt: number, label: string): HTMLElement {
  const row = document.createElement('div');
  row.className = ADD_ITEM_ROW;
  row.contentEditable = 'false';
  if (!view.editable) return row;

  const { attributes, body } = buildIcon(add, { width: 20, height: 20 });
  const icon = Object.entries(attributes).map(([name, value]) => `${name}="${value}"`).join(' ');
  const button = document.createElement('button');
  button.type = 'button';
  button.contentEditable = 'false';
  button.innerHTML = `<svg ${icon}>${body}</svg>`;
  const text = document.createElement('span');
  text.textContent = label;
  button.append(text);
  button.addEventListener('click', () => {
    const { schema } = view.state;
    const item = schema.nodes.taskItem?.create({ checked: false }, schema.nodes.paragraph?.create());
    if (!item) return;
    const tr = view.state.tr.insert(insertAt, item);
    tr.setSelection(TextSelection.create(tr.doc, insertAt + 2));
    view.dispatch(tr.scrollIntoView());
    view.focus();
  });
  row.append(button);
  return row;
}

export const ChecklistCompletion = Extension.create<ChecklistCompletionOptions>({
  name: 'checklistCompletion',

  addOptions() {
    return {
      /**
       * Required, and deliberately without a default: this module holds no user-visible string of its
       * own, because a silent English one is a string the i18n catalogues never see. The component that
       * mounts the editor passes the heading from `t()`; reaching this without one is a wiring bug, and
       * it says so rather than rendering the wrong language.
       */
      labelFor: () => {
        throw new Error('ChecklistCompletion requires labelFor: the heading is user-visible text');
      }
    };
  },

  addProseMirrorPlugins() {
    const { labelFor, addItemLabel } = this.options;

    return [
      new Plugin<ChecklistCompletionState>({
        key: checklistCompletionKey,

        state: {
          init: () => ({ open: true }),
          apply: (tr, value) => {
            const next = tr.getMeta(checklistCompletionKey) as ChecklistCompletionState | undefined;
            return next ?? value;
          }
        },

        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((transaction) => transaction.docChanged)) return null;
          return reorder(newState);
        },

        props: {
          // The heading is a control inside the editable: without this the click would place the
          // caret and ProseMirror would treat the button as part of the text.
          handleDOMEvents: {
            mousedown: (_view, event) => {
              const target = event.target;
              if (
                !(target instanceof Element) ||
                !target.closest(`.${COMPLETED_SECTION.toggle}, .${ADD_ITEM_ROW}`)
              ) {
                return false;
              }
              event.preventDefault();
              return true;
            }
          },

          decorations(state) {
            const open = checklistCompletionKey.getState(state)?.open ?? true;
            const decorations: Decoration[] = [];

            state.doc.descendants((node, pos) => {
              if (node.type.name !== 'taskList') return true;

              const completed: Array<{ pos: number; node: ProseMirrorNode }> = [];
              node.forEach((item, offset) => {
                if (checkedOf(item)) completed.push({ pos: pos + 1 + offset, node: item });
              });

              if (addItemLabel) {
                // Where the active rows end: before the first ticked row, or at the end of the list.
                const insertAt = completed[0]?.pos ?? pos + node.nodeSize - 1;
                decorations.push(
                  Decoration.widget(insertAt, (view) => addItemRow(view, insertAt, addItemLabel), {
                    side: -2,
                    key: `add-item-${insertAt}`,
                    ignoreSelection: true
                  })
                );
              }
              if (completed.length === 0) return true;

              const first = completed[0];
              if (!first) return true;
              decorations.push(
                Decoration.widget(first.pos, (view) => heading(view, open, labelFor(completed.length)), {
                  side: -1
                })
              );

              if (!open) {
                for (const item of completed) {
                  decorations.push(
                    Decoration.node(item.pos, item.pos + item.node.nodeSize, {
                      class: COMPLETED_SECTION.hidden
                    })
                  );
                }
              }
              return true;
            });

            return DecorationSet.create(state.doc, decorations);
          }
        }
      })
    ];
  }
});
