import { Extension } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorView } from '@tiptap/pm/view';
import add from '@iconify-icons/material-symbols/add';
import { buildIcon } from '@iconify/svelte';
import { checklistSections } from '../../entity/checklistSections';
import { COMPLETED_SECTION, completedChevron } from './completedSection';
import { MOTION } from './motion';

/**
 * Google Keep's completed items, inside the editor.
 *
 * The note keeps its rows in their logical order — a ticked row stays where it is, under its parent
 * when it has one — and the two sections are a way of **drawing** that order (`entity/checklistSections.ts`,
 * the one rule the editor and the card share). That is the original's own model: its items carry a
 * parent and a checked flag, and "Checked items" is how the app shows them. It is what lets a ticked
 * nested row stay its parent's, drawn under a greyed copy of the parent in the completed section, and
 * what puts an unticked row back exactly where it was.
 *
 * The drawing is CSS: the list is a flex column and every row, the "+ List item" row, the heading and
 * the greyed parents carry an `order` — so the rows themselves are never moved, the caret and the
 * history see the document as it is, and a folded section is one `display: none`.
 *
 * Ticking a top-level row ticks the rows under it, and unticking it unticks them, as the original does:
 * a group is done when its top row is.
 */
export interface ChecklistCompletionOptions {
  /** The heading's text, read from the i18n catalogue by the component that owns the editor. */
  labelFor: (count: number) => string;
  /**
   * The original's "+ List item" row under the active rows; absent, no row is drawn. Read from the
   * i18n catalogue by the component that owns the editor, like the heading.
   */
  addItemLabel?: string;
  /** Whether the section starts open: the reader's own fold, which the card shares (`Note.completedCollapsed`). */
  initiallyOpen?: () => boolean;
  /** The reader folded or unfolded the section from its heading, to be remembered. */
  onToggle?: (open: boolean) => void;
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

function depthOf(node: ProseMirrorNode): number {
  return Number(node.attrs.depth ?? 0) || 0;
}

/** A list's rows with their document positions. */
function rowsOf(list: ProseMirrorNode, listPos: number): Array<{ node: ProseMirrorNode; pos: number }> {
  const rows: Array<{ node: ProseMirrorNode; pos: number }> = [];
  list.forEach((node, offset) => rows.push({ node, pos: listPos + 1 + offset }));
  return rows;
}

/**
 * Ticking a top-level row ticks the rows under it, and unticking it unticks them: the group is done
 * when its top row is. Read off the change itself — a top row whose flag differs from the same row
 * before — so typing, pasting and undo are left alone.
 */
function cascade(before: EditorState, after: EditorState): Transaction | null {
  const tr = after.tr;
  const lists: Array<[ProseMirrorNode, number]> = [];
  after.doc.forEach((node, offset) => {
    if (node.type.name === 'taskList') lists.push([node, offset]);
  });
  const previous: ProseMirrorNode[] = [];
  before.doc.forEach((node) => {
    if (node.type.name === 'taskList') previous.push(node);
  });
  lists.forEach(([list, listPos], index) => {
    const old = previous[index];
    if (!old || old.childCount !== list.childCount) return;
    const rows = rowsOf(list, listPos);
    rows.forEach((row, at) => {
      if (depthOf(row.node) !== 0) return;
      const was = old.child(at);
      if (checkedOf(was) === checkedOf(row.node)) return;
      for (let child = at + 1; child < rows.length; child += 1) {
        const nested = rows[child];
        if (!nested || depthOf(nested.node) === 0) break;
        if (checkedOf(nested.node) !== checkedOf(row.node)) {
          tr.setNodeMarkup(nested.pos, undefined, { ...nested.node.attrs, checked: checkedOf(row.node) });
        }
      }
    });
  });
  return tr.docChanged ? tr : null;
}

/** The greyed copy of an unticked parent above its ticked rows: the row as the list draws it, inert. */
function ghostRow(text: string, depth: number, order: number, hidden: boolean): HTMLElement {
  const row = document.createElement('li');
  row.className = COMPLETED_SECTION.ghost;
  row.contentEditable = 'false';
  row.dataset.depth = String(depth);
  row.setAttribute('aria-hidden', 'true');
  row.style.order = String(order);
  if (hidden) row.classList.add(COMPLETED_SECTION.hidden);
  const label = document.createElement('label');
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.disabled = true;
  box.tabIndex = -1;
  label.append(box, document.createElement('span'));
  const content = document.createElement('div');
  const paragraph = document.createElement('p');
  paragraph.textContent = text;
  content.append(paragraph);
  row.append(label, content);
  return row;
}

/** The heading, built by hand: a widget decoration is a DOM node, not a Svelte component. */
function heading(view: EditorView, open: boolean, label: string, onToggle?: (open: boolean) => void): HTMLElement {
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
    setCompletedOpen(view, !open);
    onToggle?.(!open);
  });
  row.append(button);
  return row;
}

/** Opens or folds the section without telling anyone: how a remembered fold reaches the editor. */
export function setCompletedOpen(view: EditorView, open: boolean): void {
  if ((checklistCompletionKey.getState(view.state)?.open ?? true) === open) return;
  view.dispatch(view.state.tr.setMeta(checklistCompletionKey, { open }).setMeta('addToHistory', false));
}

/** Puts an empty row at [insertAt] — the end of the active rows — with the caret in it. */
function insertItem(view: EditorView, insertAt: number): void {
  const { schema } = view.state;
  const item = schema.nodes.taskItem?.create({ checked: false }, schema.nodes.paragraph?.create());
  if (!item) return;
  // An empty row already waiting at the end is the new row: go there instead of stacking another.
  const last = view.state.doc.resolve(insertAt).nodeBefore;
  if (last?.type.name === 'taskItem' && !last.attrs.checked && last.textContent === '') {
    const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, insertAt - 2));
    view.dispatch(tr.scrollIntoView());
    view.focus();
    return;
  }
  const tr = view.state.tr.insert(insertAt, item);
  tr.setSelection(TextSelection.create(tr.doc, insertAt + 2));
  view.dispatch(tr.scrollIntoView());
  view.focus();
}

/**
 * The original's "+ List item": a row under the active rows that starts a new one. A click puts an
 * empty row at [insertAt] — the end of the active rows, so before any ticked ones — and the caret in it.
 * The place travels on the button (`data-insert-at`) for the touch path below.
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
  button.dataset.insertAt = String(insertAt);
  button.innerHTML = `<svg ${icon}>${body}</svg>`;
  const text = document.createElement('span');
  text.textContent = label;
  button.append(text);
  button.addEventListener('click', () => insertItem(view, insertAt));
  row.append(button);
  return row;
}

/**
 * The movement past which a touch is a scroll rather than a tap — the platform's own slop, the number
 * the row's drag uses too.
 */
const TAP_SLOP = 8;

/**
 * The original's own motion when a row is ticked or unticked (recorded on the Android app): the rows
 * slide into the room it leaves, the heading with them, and the row itself fades in at its new place
 * instead of travelling across the others. Rows are never moved in the document now, so every element
 * keeps its identity and the motion is the difference between two drawings of the same elements.
 */
function animateMoves(list: HTMLElement, before: WeakMap<Element, number>, changed: Set<Element>): void {
  for (const child of Array.from(list.children)) {
    if (!(child instanceof HTMLElement)) continue;
    const was = before.get(child);
    if (changed.has(child) || was === undefined) {
      if (changed.has(child) || child.classList.contains(COMPLETED_SECTION.ghost)) {
        child.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: MOTION.medium,
          delay: MOTION.short,
          easing: MOTION.standard,
          fill: 'backwards'
        });
      }
      continue;
    }
    const by = was - child.offsetTop;
    if (Math.abs(by) < 1) continue;
    child.animate([{ transform: `translateY(${by}px)` }, { transform: 'none' }], {
      duration: MOTION.long,
      easing: MOTION.standard
    });
  }
}

function measure(view: EditorView, into: WeakMap<Element, number>): void {
  for (const list of Array.from(view.dom.querySelectorAll('ul[data-type="taskList"]'))) {
    for (const child of Array.from(list.children)) into.set(child, (child as HTMLElement).offsetTop);
  }
}

/** The rows whose tick changed between two states, as the editor draws them. */
function changedRows(view: EditorView, before: EditorState): Set<Element> {
  const changed = new Set<Element>();
  if (before.doc.eq(view.state.doc)) return changed;
  view.state.doc.forEach((list, listPos) => {
    if (list.type.name !== 'taskList') return;
    const old = before.doc.nodeAt(listPos);
    if (!old || old.type.name !== 'taskList' || old.childCount !== list.childCount) return;
    rowsOf(list, listPos).forEach((row, index) => {
      if (checkedOf(old.child(index)) === checkedOf(row.node)) return;
      const element = view.nodeDOM(row.pos);
      if (element instanceof Element) changed.add(element);
    });
  });
  return changed;
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
    const { labelFor, addItemLabel, initiallyOpen, onToggle } = this.options;
    let tapStart: { x: number; y: number } | null = null;

    return [
      new Plugin<ChecklistCompletionState>({
        key: checklistCompletionKey,

        state: {
          init: () => ({ open: initiallyOpen?.() ?? true }),
          apply: (tr, value) => {
            const next = tr.getMeta(checklistCompletionKey) as ChecklistCompletionState | undefined;
            return next ?? value;
          }
        },

        appendTransaction: (transactions, oldState, newState) => {
          if (!transactions.some((transaction) => transaction.docChanged)) return null;
          return cascade(oldState, newState);
        },

        view: (editorView) => {
          let drawn = new WeakMap<Element, number>();
          measure(editorView, drawn);
          return {
            update: (view, before) => {
              const changed = changedRows(view, before);
              if (changed.size > 0 && document.documentElement.dataset.motion !== 'reduced') {
                for (const list of Array.from(view.dom.querySelectorAll('ul[data-type="taskList"]'))) {
                  if (list instanceof HTMLElement) animateMoves(list, drawn, changed);
                }
              }
              drawn = new WeakMap();
              measure(view, drawn);
            }
          };
        },

        props: {
          // The heading is a control inside the editable: without this the click would place the
          // caret and ProseMirror would treat the button as part of the text.
          handleDOMEvents: {
            // A finger lifted over a control inside the editable makes the browser put the caret where
            // the finger was — after the click — which for "+ List item" is the start of the first
            // ticked row: the new row was made, and the next Backspace went to the completed section.
            // So a tap on the row is answered on `touchend`, with the browser's own handling (the caret,
            // the emulated mouse events and the click) cancelled.
            touchstart: (_view, event) => {
              const touch = event.touches[0];
              tapStart = touch ? { x: touch.clientX, y: touch.clientY } : null;
              return false;
            },
            touchend: (view, event) => {
              const target = event.target;
              const touch = event.changedTouches[0];
              const start = tapStart;
              tapStart = null;
              if (!(target instanceof Element) || !touch || !start) return false;
              const control = target.closest(`.${ADD_ITEM_ROW} button, .${COMPLETED_SECTION.toggle}`);
              if (!(control instanceof HTMLElement)) return false;
              if (Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > TAP_SLOP) return false;
              event.preventDefault();
              if (control.dataset.insertAt !== undefined) insertItem(view, Number(control.dataset.insertAt));
              else control.click();
              return true;
            },
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

              const rows = rowsOf(node, pos);
              const sections = checklistSections(
                rows.map((row) => ({ checked: checkedOf(row.node), depth: depthOf(row.node) }))
              );
              const end = pos + node.nodeSize - 1;
              let order = 0;
              const place = (index: number, extra?: string) => {
                const row = rows[index];
                if (!row) return;
                decorations.push(
                  Decoration.node(row.pos, row.pos + row.node.nodeSize, {
                    style: `order: ${order}`,
                    ...(extra ? { class: extra } : {})
                  })
                );
                order += 1;
              };

              for (const index of sections.active) place(index);

              if (addItemLabel) {
                // A new row goes at the end of the list: unticked and at the top level, it is drawn as
                // the last of the active rows wherever the ticked ones stand in the document.
                const at = order;
                decorations.push(
                  Decoration.widget(end, (view) => {
                    const row = addItemRow(view, end, addItemLabel);
                    row.style.order = String(at);
                    return row;
                  }, { side: 2, key: `add-item-${end}-${at}`, ignoreSelection: true })
                );
                order += 1;
              }
              if (sections.completedCount === 0) return false;

              const headingOrder = order;
              decorations.push(
                Decoration.widget(end, (view) => {
                  const row = heading(view, open, labelFor(sections.completedCount), onToggle);
                  row.style.order = String(headingOrder);
                  return row;
                }, { side: 3, key: `completed-${end}-${headingOrder}-${open}-${sections.completedCount}` })
              );
              order += 1;

              const hidden = open ? undefined : COMPLETED_SECTION.hidden;
              for (const group of sections.completed) {
                if (group.ghost !== null) {
                  const parent = rows[group.ghost];
                  if (parent) {
                    const ghostOrder = order;
                    const text = parent.node.textContent;
                    const depth = depthOf(parent.node);
                    decorations.push(
                      Decoration.widget(end, () => ghostRow(text, depth, ghostOrder, !open), {
                        side: 4 + ghostOrder,
                        key: `ghost-${parent.pos}-${ghostOrder}-${open}-${text}`
                      })
                    );
                    order += 1;
                  }
                }
                for (const index of group.rows) place(index, hidden);
              }
              return false;
            });

            return DecorationSet.create(state.doc, decorations);
          }
        }
      })
    ];
  }
});
