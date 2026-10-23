<script lang="ts" module>
  /**
   * What the phone's formatting bar shows: the line's kind, and the marks at the caret — Tiptap's own
   * answer, so a mark switched on at a collapsed caret (a stored mark) counts as well. Whether the body
   * has the caret at all is the stylesheet's to know (`:has(.note-body:focus)`), not state: the
   * browser reports a blur while Svelte is removing the editor, and state written then is refused
   * (`state_unsafe_mutation`).
   */
  export interface Formatting {
    heading: 0 | 1 | 2 | 3;
    /** A list row cannot become a heading; the bar disables the line kinds there. */
    canHeading: boolean;
    bold: boolean;
    italic: boolean;
    underline: boolean;
  }
</script>

<script lang="ts">
  import { untrack } from 'svelte';
  import { Editor } from 'svelte-tiptap';
  import { Extension } from '@tiptap/core';
  import { Placeholder } from '@tiptap/extensions';
  import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
  import { TextSelection } from '@tiptap/pm/state';
  import type { EditorView } from '@tiptap/pm/view';
  import { MAX_BLOCK_DEPTH } from '../../entity/api/types';
  import type { NoteDocument } from '../../entity/api/types';
  import { fromProseMirror, toProseMirror } from '../../entity/tiptapDocument';
  import { ui } from '../../control/state/ui.svelte';
  import { t } from '../i18n';
  import { Linkify } from '../editor/linkify';
  import { CARRIED_Y, DRAGGING_ROW, DraggingRow } from '../editor/draggingRow';
  import { checklistSections, type ChecklistRowShape } from '../../entity/checklistSections';
  import type { DragGeometry } from '../editor/draggingRow';
  import { noteBodyExtensions } from '../editor/noteSchema';
  import { CollabSync, COLLAB_PLUGIN_NAME, collabPlugin, diffSteps, newClientId } from '../editor/collabSync';
  import type { Outgoing } from '../editor/collabSync';
  import { ChecklistCompletion } from '../editor/checklistCompletion';
  import { ChecklistKeys } from '../editor/checklistKeys';
  import { LabelSuggestion } from '../editor/labelSuggestion';
  import type { LabelChoice, LabelSuggestionState } from '../editor/labelSuggestion';
  import type { Label } from '../../entity/api/types';
  import Icon from './Icon.svelte';

  /** Less of the screen than this taken away is a browser's toolbar coming and going, not a keyboard. */
  const KEYBOARD_MIN_HEIGHT = 120;

  /**
   * The note body, edited with Tiptap.
   *
   * Everything the editor does — splitting and merging lines, list behaviour, checkboxes, keyboard
   * shortcuts, Markdown input rules, undo history, paste handling and the caret — belongs to the
   * library. This component only binds it to our stored document, to the Keep look, and to the two
   * things Keep adds on top of a plain checklist: the completed-items section
   * (`boundary/editor/checklistCompletion.ts`) and the six-dot handle that carries a row.
   *
   * `NoteDocument` remains the shape we persist; `entity/tiptapDocument.ts` translates. A list line is
   * one **flat row carrying its own indent** on both sides (`boundary/editor/listRows.ts`), which is
   * what makes the drag below a move of one row rather than of a subtree.
   */
  interface Props {
    /** The body the editor starts with; afterwards it changes only through the methods below. */
    document: NoteDocument;
    /** That body's version in the server's step log (`docs/COLLABORATION.md`). */
    docVersion: number;
    editable?: boolean;
    /** The accessible name of the editable. */
    label?: string;
    /** Shown in an empty note, the original's "Take a note…" (Tiptap's own `Placeholder`). */
    placeholder?: string;
    onupdate: (document: NoteDocument) => void;
    /**
     * The note's own card. The carried row's band runs from that card's left edge to its right, the
     * way the original's does, so this component has to know where the card is rather than guess a
     * padding. Read at the moment a drag starts, so it may be `null` while the editor mounts.
     */
    frame?: HTMLElement | null;
    /** The reader's labels, which a `#` in the text offers (`boundary/editor/labelSuggestion.ts`). */
    labels?: Label[];
    /** The reader picked one of them, or asked for a new one, after a `#`. */
    onlabel?: (choice: LabelChoice) => void;
  }

  let {
    document,
    docVersion,
    editable = true,
    label = '',
    placeholder = '',
    onupdate,
    frame = null,
    labels = [],
    onlabel
  }: Props = $props();

  /** The `#` list while one is open. */
  let labelMenu = $state<LabelSuggestionState | null>(null);
  /** Set while the editor is taken down: its plugins close their lists then, and that is not the reader's. */
  let tearingDown = false;

  const clientId = newClientId();

  const editor = new Editor({
    extensions: [
      ...noteBodyExtensions(),
      // The body's place in the server's step log; replaced, never reconfigured, when another note
      // is loaded (`CollabSync.load`).
      Extension.create({
        name: COLLAB_PLUGIN_NAME,
        addProseMirrorPlugins: () => [collabPlugin(untrack(() => docVersion), clientId)]
      }),
      Placeholder.configure({ placeholder: untrack(() => placeholder) }),
      Linkify,
      DraggingRow,
      LabelSuggestion.configure({
        labels: () => labels,
        onChoose: (choice) => onlabel?.(choice),
        onChange: (state) => {
          if (!tearingDown) labelMenu = state;
        }
      }),
      ChecklistKeys,
      ChecklistCompletion.configure({
        labelFor: (count) => t('notes.completedItems', { count }),
        addItemLabel: t('editor.addListItem')
      })
    ],
    // Read once, on purpose: everything after this is handled by the effects below.
    content: untrack(() => toProseMirror(document)),
    editable: untrack(() => editable),
    editorProps: {
      attributes: {
        class: 'note-body',
        'aria-label': untrack(() => label)
      }
    },
    onUpdate: ({ editor: instance }) => {
      onupdate(fromProseMirror(instance.getJSON()));
    },
    onFocus: ({ editor: instance }) => {
      requestAnimationFrame(() => adoptBrowserCaret(instance.view));
    }
  });

  /**
   * A phone opens a note without the caret (the keyboard stays down), so the first tap is what focuses
   * the editor. A tap on the empty part of a row — right of its words — makes the browser put the caret
   * at that row's end, but ProseMirror keeps the selection it already held (the end of the note, where
   * loading the note left it), and the next keystroke, Tab or Backspace went to the note's last row.
   * Once the editor has focus the browser's caret is the one the reader sees, so it is taken over.
   */
  function adoptBrowserCaret(view: EditorView): void {
    const selection = window.getSelection();
    const anchor = selection?.anchorNode;
    if (!selection || !anchor || !selection.isCollapsed || !view.dom.contains(anchor)) return;
    let pos: number;
    try {
      pos = view.posAtDOM(anchor, selection.anchorOffset);
    } catch {
      return;
    }
    if (pos === view.state.selection.from && view.state.selection.empty) return;
    view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(pos))));
  }

  /**
   * A phone's tap on a checklist's checkbox **ticks its row without raising the keyboard**.
   *
   * Tiptap's task item answers the checkbox's `change` by focusing the editor, which on a phone opens
   * the on-screen keyboard: ticking something off while reading pulled the keyboard up over the note,
   * as if the reader had asked to edit it. Ticking is not typing. The browser has already toggled the
   * box when this runs; the row is written to the document here instead, and the `change` is kept from
   * reaching the task item's own handler. The focus stays exactly where it was: down, when the note is
   * being read. The text of an active row is untouched by this, so tapping it still focuses the editor,
   * because that tap is the browser's own.
   *
   * It is listened for in the **capture** phase, because the task item's handler sits on the checkbox
   * itself: a listener that ran after it would be too late, the keyboard already asked for.
   */
  function tickRowWithoutKeyboard(view: EditorView, event: Event): void {
    if (!ui.phone || !view.editable) return;
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox') return;
    const row = target.closest('li[data-checked]');
    if (!row || !view.dom.contains(row)) return;
    // The row's own content starts one position inside the row, which is where `posAtDOM` lands.
    const pos = view.posAtDOM(row, 0) - 1;
    const node = view.state.doc.nodeAt(pos);
    if (node?.type.name !== 'taskItem') return;
    event.stopPropagation();
    view.dispatch(
      view.state.tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        checked: target.checked
      })
    );
  }

  /**
   * Puts the editable into the page **the moment its host is**, and takes the editor down with it.
   *
   * `svelte-tiptap`'s `EditorContent` moves the editor in after an `await tick()` of its own, and the
   * note's "focus on open" waits for a tick of its own too: which of the two came first depended on the
   * order the effects happened to run in, and when the focus came first it landed on an editable that
   * was not on the page yet — the keystrokes typed right after opening went to the page, and the first
   * letters of a new note were lost (measured: 7 times in 30). Done here, synchronously with the host,
   * the editable is in the document before anything can try to focus it.
   *
   * It is also where the editor is destroyed; nothing did before, so every note opened left the last
   * editor behind, plugins and listeners included.
   */
  function mountEditor(host: HTMLElement): () => void {
    host.append(editor.view.dom);
    editor.setOptions({ element: host });
    // The checkbox's own handler sits on the input, so this has to run before it (capture).
    const onChange = (event: Event) => tickRowWithoutKeyboard(editor.view, event);
    editor.view.dom.addEventListener('change', onChange, true);
    // **The caret stays in sight when the keyboard comes up.** A new row is scrolled into view as it
    // is made, while the screen is still whole; the keyboard then takes the bottom of it, the phone's
    // editor shrinks to what is left (`visualViewport.ts`) and its scroll position stays where it was —
    // so the row being typed into ended up under the keyboard. Android's browser happens to scroll the
    // focused field back itself; Safari does not. Once the new size is laid out, scroll to the caret.
    const keepCaretInSight = () => {
      if (!editor.view.hasFocus()) return;
      requestAnimationFrame(() => {
        if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.scrollIntoView());
      });
    };
    window.visualViewport?.addEventListener('resize', keepCaretInSight);
    // **Putting the keyboard away ends the typing**, as it does in the original's app: no caret is
    // left blinking in the note. Android's Back takes the keyboard down and leaves the editable
    // focused; iOS's ✓ blurs it but leaves the selection in it, where WebKit drew a caret again — at
    // the end of the document, under the completed rows, as if one of them were being edited. So the
    // keyboard leaving lets go of the focus, and a blur lets go of the selection too.
    //
    // **An editor without the focus keeps no selection in the page**, on any device. A ⋮ menu or a
    // picker takes the focus when it opens, and its trigger keeps the browser from moving the selection
    // (bits-ui prevents the press's default), so a caret was left inside the note's editable text while
    // the menu had the focus — and Firefox drew it at the start of the open menu. The original never
    // gets there: measured on keep.google.com, its selection is out of the note once the menu is open.
    // ProseMirror keeps its own selection, so focusing the note again (or undo) puts the caret back.
    let keyboardUp = false;
    const followKeyboard = () => {
      const covered = parseFloat(getComputedStyle(window.document.documentElement).getPropertyValue('--vv-covered')) || 0;
      const up = covered > KEYBOARD_MIN_HEIGHT;
      if (keyboardUp && !up) releaseCaret();
      keyboardUp = up;
    };
    const onBlur = () => releaseCaret();
    window.visualViewport?.addEventListener('resize', followKeyboard);
    editor.view.dom.addEventListener('blur', onBlur);
    return () => {
      window.visualViewport?.removeEventListener('resize', keepCaretInSight);
      window.visualViewport?.removeEventListener('resize', followKeyboard);
      editor.view.dom.removeEventListener('blur', onBlur);
      editor.view.dom.removeEventListener('change', onChange, true);
      tearingDown = true;
      editor.destroy();
    };
  }

  /**
   * A closing note **takes its caret with it**. The browser keeps the selection when the editable
   * leaves the page, collapsed onto whatever held it — the left edge of the notes column — and a caret
   * blinked there after the note had closed. Called while the editable is still on the page.
   */
  export function releaseCaret(): void {
    const selection = window.getSelection();
    if (!selection?.anchorNode || !editor.view.dom.contains(selection.anchorNode)) return;
    // Focus first: while the editable has it, ProseMirror puts the selection straight back.
    if (window.document.activeElement === editor.view.dom) editor.view.dom.blur();
    selection.removeAllRanges();
  }

  const collab = new CollabSync(
    {
      get state() {
        return editor.state;
      },
      dispatch: (transaction) => editor.view.dispatch(transaction),
      setCollabPlugin: (plugin) => {
        editor.unregisterPlugin(COLLAB_PLUGIN_NAME);
        editor.registerPlugin(plugin);
      }
    },
    clientId
  );


  $effect(() => {
    editor.setEditable(editable);
  });

  /**
   * The completed-items heading is drawn by a ProseMirror decoration, which is rebuilt when the
   * editor's state changes — and switching the language is not an editor change. This nudges it, so
   * the heading is in the language the rest of the app just switched to.
   */
  $effect(() => {
    ui.locale;
    editor.view.dispatch(editor.state.tr.setMeta('locale', ui.locale));
  });

  /* ------------------------------------------------------------------- the six-dot handle */

  /**
   * Keep puts a six-dot handle in the left margin of every **active** row while the note is being
   * edited, and dragging it carries that row — that row alone — somewhere else in the list. Active,
   * not "under the pointer": the original's own screenshot shows a handle on each unchecked row and
   * none on the completed ones, and a handle that appears and disappears with the pointer cannot be
   * grabbed at all — it hangs in the margin, so travelling onto it leaves the region that was
   * tracking the pointer and it vanishes under the cursor.
   *
   * The handle is a plain button beside the editable rather than a decoration inside it, so
   * ProseMirror never sees its pointer events.
   */
  /**
   * The checklist's horizontal geometry, one set per original, all in px:
   * - `handle` — the handle's width, the size of its icon, and half of what places it;
   * - `handleOffset` — how far left of the row's checkbox the handle's centre sits;
   * - `inset` — the list's own padding, which with the note's puts the checkbox where the original's is;
   * - `indent` — one nesting level.
   * The desktop's are the web original's (rule 21), in px. **The phone's are in em of the note's own
   * text**, taken from the owner's screenshot of Keep on iOS (16pt text, 2026-10-22, `docs/METRICS.md`):
   * the checkbox 35pt in from the note's text, the handle centred 21pt left of it with a 24pt glyph; one
   * level keeps the Android app's 38dp. In em the list grows and shrinks with the reader's text size
   * (Dynamic Type, the APK's `textZoom`), so the checkbox stays level with the text it belongs to. The
   * stylesheet takes `inset`, `indent` and `handleOffset` from here (as custom properties on the
   * wrapper), and the script converts them with the text's measured size, so the drag and the rows
   * cannot drift.
   */
  const DESKTOP_LIST = { handle: 18, handleOffset: 16, inset: 10, indent: 25 };
  const PHONE_LIST_EM = { handle: 1.5, handleOffset: 1.3125, inset: 2.1875, indent: 2.375 };
  /** The note's text size in px, read off the editor so the phone's em geometry can be placed in px. */
  let bodyFontPx = $state(16);
  const list = $derived(
    ui.phone
      ? {
          handle: PHONE_LIST_EM.handle * bodyFontPx,
          handleOffset: PHONE_LIST_EM.handleOffset * bodyFontPx,
          inset: PHONE_LIST_EM.inset * bodyFontPx,
          indent: PHONE_LIST_EM.indent * bodyFontPx
        }
      : DESKTOP_LIST
  );
  const listStyle = $derived(
    ui.phone
      ? `--list-inset: ${PHONE_LIST_EM.inset}em; --list-indent: ${PHONE_LIST_EM.indent}em; --list-handle-offset: ${PHONE_LIST_EM.handleOffset}em`
      : `--list-inset: ${list.inset}px; --list-indent: ${list.indent}px; --list-handle-offset: ${list.handleOffset}px`
  );
  /** The row's own ✕: the button's size, and how far its edge stays inside the row's. */
  const ROW_DELETE_SIZE = 32;
  const ROW_DELETE_INSET = 4;

  /**
   * How far the hand must travel before the gesture means *anything*. A still screenshot cannot show
   * a threshold, so this is not a measurement of the original: it is the platform's own slop,
   * Material's `ViewConfiguration.getScaledTouchSlop()` (8dp), which is also what tells a click from
   * a drag inside a browser. Below it the row is not highlighted and does not move, so a plain click
   * on the handle is harmless.
   */
  const DRAG_SLOP = 8;


  /** One handle: the row it moves and where it hangs, in the wrapper's coordinates. */
  interface Handle {
    row: HTMLElement;
    top: number;
    left: number;
    /** The handle of the row the drag is carrying, which sits on the band rather than in the margin. */
    held: boolean;
  }

  let wrapper = $state<HTMLElement | null>(null);
  let handles = $state<Handle[]>([]);
  /** Bumped whenever the document or the layout changes, so the handles are measured again. */
  let revision = $state(0);
  let dragging = $state(false);

  /** What the editor's own history could take back or put back; the bar's buttons follow it. */
  let history = $state({ undo: false, redo: false });

  /*
   * What can be undone changes only with the document. A transaction that does not change it — the
   * blur Tiptap dispatches when the editor's element leaves the page, which happens in the middle of
   * Svelte's own DOM update — must not write state: Svelte refuses that (`state_unsafe_mutation`).
   */
  $effect(() => {
    const sync = () => {
      const undo = editor.can().undo();
      const redo = editor.can().redo();
      if (undo !== history.undo || redo !== history.redo) history = { undo, redo };
    };
    const onTransaction = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (transaction.docChanged) sync();
    };
    sync();
    editor.on('transaction', onTransaction);
    return () => editor.off('transaction', onTransaction);
  });

  const IDLE_FORMATTING: Formatting = {
    heading: 0,
    canHeading: false,
    bold: false,
    italic: false,
    underline: false
  };

  let formatting = $state<Formatting>(IDLE_FORMATTING);

  /*
   * It follows the reader's own moves only — a change to the text, the caret or the stored marks —
   * none of which can happen while the editor is being taken off the page.
   */
  $effect(() => {
    const sync = () => {
      const level = [1, 2, 3].find((candidate) => editor.isActive('heading', { level: candidate })) ?? 0;
      formatting = {
        heading: level as Formatting['heading'],
        canHeading: editor.can().setHeading({ level: 1 }) || level > 0,
        bold: editor.isActive('bold'),
        italic: editor.isActive('italic'),
        underline: editor.isActive('underline')
      };
    };
    const onTransaction = ({
      transaction
    }: {
      transaction: { docChanged: boolean; selectionSet: boolean; storedMarksSet: boolean };
    }) => {
      if (transaction.docChanged || transaction.selectionSet || transaction.storedMarksSet) sync();
    };
    editor.on('transaction', onTransaction);
    return () => editor.off('transaction', onTransaction);
  });

  /** A checklist row in the document: the item node and the position it starts at. */
  interface RowSlot {
    pos: number;
    node: ProseMirrorNode;
    /** The list the row is a child of: where a row that is dropped outside its list would land. */
    listPos: number;
  }

  /** The checklist row a document position sits in, walking outwards. */
  function rowAt(pos: number): RowSlot | null {
    // `posAtDOM` answers -1 for a node it cannot place, and resolving that threw `Position -1 out of
    // range` out of the drag handler, which is what broke moving a row at all.
    if (pos < 0) return null;
    const resolved = editor.state.doc.resolve(pos);
    for (let depth = resolved.depth; depth > 0; depth -= 1) {
      if (resolved.node(depth).type.name !== 'taskItem') continue;
      if (resolved.node(depth - 1).type.name !== 'taskList') return null;
      return { pos: resolved.before(depth), node: resolved.node(depth), listPos: resolved.before(depth - 1) };
    }
    return null;
  }

  /**
   * Every checklist row of the document, in document order.
   *
   * The target is read off the **document** rather than looked up from the pointer: `posAtCoords`
   * answers with a position outside the list when the pointer is in the note's margin — which is
   * exactly where a handle drag keeps it. A row is one flat item, so this walk is the whole list.
   */
  function rowSlots(): RowSlot[] {
    const slots: RowSlot[] = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name !== 'taskItem') return true;
      const resolved = editor.state.doc.resolve(pos);
      if (resolved.node(resolved.depth).type.name !== 'taskList') return true;
      slots.push({ pos, node, listPos: resolved.before(resolved.depth) });
      return true;
    });
    return slots;
  }

  /** The rows the editor has drawn, in document order — every row, carried or not. */
  function rowElements(): HTMLElement[] {
    return [...(wrapper?.querySelectorAll('li[data-checked]') ?? [])].filter(
      (row): row is HTMLElement => row instanceof HTMLElement
    );
  }

  /**
   * The drawn rows and the document rows, paired **whole** — before anything is filtered from either
   * side. Filtering one side only is what once shifted every target below the carried row by one.
   */
  function rowsAndSlots(): Array<{ el: HTMLElement; slot: RowSlot }> {
    const elements = rowElements();
    const slots = rowSlots();
    if (elements.length !== slots.length) return [];
    const pairs: Array<{ el: HTMLElement; slot: RowSlot }> = [];
    for (let index = 0; index < elements.length; index += 1) {
      const el = elements[index];
      const slot = slots[index];
      if (el && slot) pairs.push({ el, slot });
    }
    return pairs;
  }

  /**
   * Where an element is laid out inside the wrapper, from the offsets of each box on the way up. A row
   * that is sliding into its place carries a `transform`, and that makes it the offset parent of its
   * own label — so a single `offsetTop` read during a tick's motion was the label's place in its row,
   * and every moving row's handle landed at the top of the list. Offsets ignore transforms, and the
   * sum does not depend on which box happens to be the offset parent.
   */
  function offsetWithin(element: HTMLElement, host: HTMLElement): { top: number; left: number } {
    let top = 0;
    let left = 0;
    let node: Element | null = element;
    while (node instanceof HTMLElement && node !== host) {
      top += node.offsetTop;
      left += node.offsetLeft;
      node = node.offsetParent;
    }
    return { top, left };
  }

  /**
   * Where every active row's handle belongs, read off the rows the editor has actually drawn.
   *
   * `offsetLeft`/`offsetTop` are relative to the positioned wrapper these handles are absolutely
   * placed in, so there is no rectangle of the container to subtract — subtracting one measured while
   * the editor was still animating in is what once put every handle in the corner.
   */
  function measureHandles(): void {
    const host = wrapper;
    if (!host || !editable) {
      handles = [];
      return;
    }
    const body = host.querySelector('.note-body');
    const fontPx = body ? Number.parseFloat(getComputedStyle(body).fontSize) : NaN;
    if (Number.isFinite(fontPx) && fontPx !== bodyFontPx) bodyFontPx = fontPx;
    // **Not while a row is being carried.** The carried row is positioned so its band can cover the
    // rows that give way to it, and that makes it the offset parent of its own label — so measuring
    // now would place its handle from the row instead of from the note, which is the owner's "the
    // handle flies off to the beginning of the list". Nothing moves during a drag anyway: the
    // document is only changed when the row is dropped, and that re-measures.
    if (dragging) {
      measureRowDelete();
      return;
    }

    const found: Handle[] = [];
    const carried = drag ? drag.rows[drag.carried] : null;
    for (const { el } of rowsAndSlots()) {
      if (!el.matches('li[data-checked="false"]')) continue;
      const line = el.querySelector('label') ?? el;
      // The row's own content start is where its checkbox sits — not the list's box, which carries
      // the checklist's own padding, and not another row's, which is a different row.
      const place = offsetWithin(line, host);
      const left = place.left - list.handleOffset - list.handle / 2;
      found.push({
        row: el,
        // **The row's own line, not its box**: a row of three lines is three lines tall, and the
        // original puts its handle level with the first of them.
        top: place.top + line.offsetHeight / 2,
        left,
        held: carried?.el === el
      });
    }
    handles = found;
    measureRowDelete();
  }

  /**
   * Where the ✕ of the row the pointer is over (or the caret is in) belongs: at that row's own right
   * edge, level with its line. Measured from the row the editor drew, so it cannot drift from it.
   */
  function measureRowDelete(): void {
    const target = deleteTarget;
    const host = wrapper;
    if (!target || !host || !host.contains(target) || target.getBoundingClientRect().height === 0) {
      rowDelete = null;
      return;
    }
    const line = target.querySelector('label') ?? target;
    // The button sits **inside** the row's right edge rather than centred on it: half a target
    // outside the note is half a target that is not there.
    rowDelete = {
      top: offsetWithin(line, host).top + line.offsetHeight / 2,
      left: offsetWithin(target, host).left + target.offsetWidth - ROW_DELETE_SIZE - ROW_DELETE_INSET
    };
  }

  /** Where a row is drawn right now, as the offset added to the place it holds in the list. */
  function shiftOf(row: HTMLElement): number {
    const current = drag;
    if (!current) return 0;
    for (let index = 0; index < current.rows.length; index += 1) {
      const entry = current.rows[index];
      if (entry?.el !== row) continue;
      return drawnTopOf(current, index) - entry.top;
    }
    return 0;
  }

  /** A control's `top` beside a row: the carried row's follows the hand through `CARRIED_Y`. */
  function placedTop(top: number, row: HTMLElement | null): string {
    return row && dragging && isCarried(row) ? `calc(${top}px + var(${CARRIED_Y}, 0px))` : `${top + (row ? shiftOf(row) : 0)}px`;
  }

  /** Where the band is drawn, in the wrapper's coordinates: the carried row's box, at the hand. */
  function bandTop(): number {
    const current = drag;
    const row = current ? current.rows[current.carried] : undefined;
    return row && current ? row.top : 0;
  }

  /** How far a row's content is drawn out of its own indent right now: the carried row's level. */
  function indentOf(row: HTMLElement): number {
    return isCarried(row) ? (drag?.carriedIndent ?? 0) : 0;
  }

  /** Whether this row is the one the drag is carrying. */
  function isCarried(row: HTMLElement | null): boolean {
    const current = drag;
    return current !== null && row !== null && current.rows[current.carried]?.el === row;
  }

  /**
   * Takes a row out of the note — the original's own ✕ on a selected row, one transaction, so undo
   * and the autosave see a single change. The row **is** the item, so the row and its text go
   * together; there is no list nested under it to leave behind.
   */
  function deleteRow(row: HTMLElement): void {
    const pair = rowsAndSlots().find((entry) => entry.el === row);
    if (!pair) return;
    editor.view.dispatch(
      editor.state.tr.delete(pair.slot.pos, pair.slot.pos + pair.slot.node.nodeSize)
    );
    hoveredRow = null;
    caretRow = null;
    rowDelete = null;
  }

  /** The row the pointer is over, and the row the caret is in: the ✕ belongs to those. */
  let hoveredRow = $state<HTMLElement | null>(null);
  let caretRow = $state<HTMLElement | null>(null);
  /** Where that row's ✕ goes, in the wrapper's coordinates — or null when there is no such row. */
  let rowDelete = $state<{ top: number; left: number } | null>(null);
  const deleteTarget = $derived(hoveredRow ?? caretRow);

  $effect(() => {
    // The row under the pointer, tracked here rather than in the markup: a bare `<div>` carrying
    // pointer handlers is an accessibility warning, and this container is not a widget to give a role.
    const host = wrapper;
    if (!host) return;
    const over = (event: PointerEvent) => {
      const li = (event.target as HTMLElement | null)?.closest?.('li[data-checked="false"]');
      // Only a row changes the target, and a pointer that is on neither a row nor anything else does
      // not take it away: reaching for the ✕ puts the pointer *on the button*, and a target cleared
      // there sends it to whatever row the caret is in — which is how the ✕ deleted the wrong row.
      if (li instanceof HTMLElement) hoveredRow = li;
    };
    const leave = () => (hoveredRow = null);
    host.addEventListener('pointerover', over);
    host.addEventListener('pointerleave', leave);
    return () => {
      host.removeEventListener('pointerover', over);
      host.removeEventListener('pointerleave', leave);
    };
  });

  $effect(() => {
    // The ✕ belongs to the row the caret is in as well as to the row under the pointer: touch has no
    // hover, and a reader who has tapped into a row should still be able to delete it.
    const instance = editor;
    const update = () => {
      const at = instance.state.selection.from;
      const node = instance.view.domAtPos(at).node;
      const element = node instanceof HTMLElement ? node : node.parentElement;
      const li = element?.closest('li[data-checked="false"]') ?? null;
      caretRow = li instanceof HTMLElement ? li : null;
    };
    update();
    instance.on('selectionUpdate', update);
    return () => instance.off('selectionUpdate', update);
  });

  $effect(() => {
    // Read so the effect re-runs when any of them changes: a row added or removed (the document
    // the parent hands down), an editor made read-only, or a resize (the observer below).
    document;
    revision;
    editable;
    wrapper;
    measureHandles();
  });

  $effect(() => {
    const element = wrapper;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      revision += 1;
    });
    observer.observe(element);
    return () => observer.disconnect();
  });

  /* ---------------------------------------------------------------------------- carrying a row */

  /** One row of the list a drag works in, as it was laid out when the hand took hold of it. */
  interface DragRow {
    el: HTMLElement;
    pos: number;
    /** Its place in the list, in the wrapper's own coordinates, and how tall it is. */
    top: number;
    height: number;
  }

  /**
   * A drag in progress.
   *
   * **The list is laid out once, and nothing moves it until the row is dropped.** The rows keep the
   * places they had when the hand took hold, and the drawing is worked out from that one frame: the
   * carried row is drawn under the hand, and the rows that give way are drawn a row further along.
   * The document is not touched at all while the hand moves, so there is nothing to feed back into
   * the next pointer position — which is what every earlier attempt got wrong, in one way or another:
   * a live reorder per pointer move made the place depend on the place it had just been given, and
   * the row walked off on its own.
   *
   * It also makes the gesture's end trivial: the drop writes the arrangement that is already on
   * screen, exactly one transaction, one undo step; Escape writes nothing at all.
   */
  interface Drag {
    rows: DragRow[];
    /** The carried row, as an index into `rows`. */
    carried: number;
    /** The list it belongs to, in document positions. */
    listPos: number;
    /** Where inside the row the hand took hold, so the row does not jump under it. */
    grabOffsetY: number;
    startX: number;
    startY: number;
    startDepth: number;
    /** The note's own edges and the row's own box, in the wrapper's coordinates: the band's shape. */
    bandLeft: number;
    bandRight: number;
    bandHeight: number;
    /** The list's own top and bottom, so the carried row cannot be drawn outside it. */
    listTop: number;
    listBottom: number;
    /** What the hand is asking for right now: the place, the level, and where the row is drawn. */
    gap: number;
    depth: number;
    carriedShift: number;
    /** How far the carried row's own content is drawn out of its indent: its level, previewed. */
    carriedIndent: number;
  }

  let drag = $state<Drag | null>(null);
  /** The last pointer position, applied once a frame: a hand can move faster than the screen. */
  let pending: PointerEvent | null = null;
  let frameRequest = 0;

  /** How many rows stand before this one once the carried row is taken out of the list. */
  function collapsedIndexOf(current: Drag, index: number): number {
    return index - (index > current.carried ? 1 : 0);
  }

  /** Where a row stands in that same frame — the list closed up over the row in the hand. */
  function collapsedTop(current: Drag, index: number): number {
    const height = current.rows[current.carried]?.height ?? 0;
    return (current.rows[index]?.top ?? 0) - (index > current.carried ? height : 0);
  }

  /**
   * Where a row is drawn right now.
   *
   * The carried row follows the hand. Every other row stands in the closed-up list, pushed one row
   * further along when it is at or past the place the carried row is asking for — so the rows part
   * around the gap the row will land in, and the gap is a real, visible space in the list.
   */
  function drawnTopOf(current: Drag, index: number): number {
    if (index === current.carried) {
      return (current.rows[index]?.top ?? 0) + current.carriedShift;
    }
    const height = current.rows[current.carried]?.height ?? 0;
    const pushed = collapsedIndexOf(current, index) >= current.gap ? height : 0;
    return collapsedTop(current, index) + pushed;
  }

  /**
   * What the hand is asking for: the place the row lands in, and the level it lands at.
   *
   * - **The place is the gap nearest to where the row is drawn**, each gap of the closed-up list
   *   starting where the row before it ends. The list is read *closed
   *   up* — the frame that does not move for the whole gesture — and never from where the carried row
   *   happens to be drawn: a rule that compared the hand against the rows as they move has two answers
   *   for one hand position (the rows move *because* of the answer), and the row then walks away on
   *   its own.
   * - **The level is the one the gesture started at, moved by the hand's sideways travel**, half a
   *   level a side. A drag that keeps the hand still keeps the row's level; a row at the very top of
   *   the list is at the top level, because there is nothing above it to sit under.
   */
  function placeFor(
    current: Drag,
    pointerY: number,
    pointerX: number
  ): { gap: number; depth: number; shift: number; indent: number } {
    const height = current.rows[current.carried]?.height ?? 0;
    // Where the hand is asking for the row, and where it is drawn — the same place, except that the
    // drawing stays inside the list while the hand may travel past either end.
    const wanted = pointerY - current.grabOffsetY;
    const drawn = Math.min(
      Math.max(wanted, current.listTop),
      Math.max(current.listBottom - height, current.listTop)
    );

    // The gap nearest to where the row is drawn: each gap of the closed-up list starts where the row
    // before it ends. At the start of the gesture the row is exactly over its own gap, and it stays there
    // until it is drawn half a row closer to another — a rule that compared middles had the next row's
    // middle exactly at the carried row's own, so the first pixel of downward wobble in a sideways
    // (indenting) pull put the row after its neighbour.
    let gap = 0;
    let nearest = Infinity;
    let slot = 0;
    let slotTop = current.listTop;
    const consider = () => {
      const distance = Math.abs(wanted - slotTop);
      if (distance < nearest) {
        nearest = distance;
        gap = slot;
      }
    };
    consider();
    for (let index = 0; index < current.rows.length; index += 1) {
      if (index === current.carried) continue;
      const row = current.rows[index];
      if (!row) continue;
      slot += 1;
      slotTop = collapsedTop(current, index) + row.height;
      consider();
    }

    // The hand travels **half** a level to the side to ask for the other one — the same "has the hand
    // actually gone somewhere?" question the slop answers, which is why a still hand keeps the level.
    const sideways = Math.round((pointerX - current.startX) / list.indent);
    const level = Math.min(Math.max(current.startDepth + sideways, 0), MAX_BLOCK_DEPTH);
    const depth = gap === 0 ? 0 : level;
    return {
      gap,
      depth,
      shift: drawn - (current.rows[current.carried]?.top ?? 0),
      // The row is **drawn at the level it will land at**, the way the original's carried row is: its
      // own indent is the one it started with, so what is left to draw is the difference.
      indent: (depth - current.startDepth) * list.indent
    };
  }

  /** Draws the drag as it stands: the band, and the rows giving way to it. */
  function drawDrag(): void {
    const current = drag;
    if (!current) return;
    const carried = current.rows[current.carried];
    if (!carried) return;

    const shifts: Array<{ pos: number; by: number }> = [];
    for (let index = 0; index < current.rows.length; index += 1) {
      if (index === current.carried) continue;
      const row = current.rows[index];
      if (!row) continue;
      const by = Math.round(drawnTopOf(current, index) - row.top);
      if (by !== 0) shifts.push({ pos: row.pos, by });
    }

    const geometry: DragGeometry = {
      row: carried.pos,
      carriedShift: Math.round(current.carriedShift),
      carriedIndent: Math.round(current.carriedIndent),
      shifts
    };
    editor.view.dispatch(
      editor.state.tr.setMeta(DRAGGING_ROW, geometry).setMeta('addToHistory', false)
    );
  }

  /** Takes the drawing away, leaving the document exactly as it was. */
  function clearDragDrawing(): void {
    editor.view.dispatch(editor.state.tr.setMeta(DRAGGING_ROW, null).setMeta('addToHistory', false));
  }

  function startDrag(event: PointerEvent, row: HTMLElement): void {
    if (!editable || drag) return;
    const source = rowAt(editor.view.posAtDOM(row, 0));
    const listElement = row.parentElement;
    const list = source ? editor.state.doc.nodeAt(source.listPos) : null;
    if (!source || !list || !listElement) return;

    // The list's own rows, in the order the document has them, paired with the elements the editor
    // drew for them. Both sides are the whole list, so an index means the same thing on either side.
    const elements = [...listElement.children].filter(
      (child): child is HTMLElement => child instanceof HTMLElement && child.matches('li[data-checked]')
    );
    if (elements.length !== list.childCount) return;

    // The rows the hand moves among are the **active** ones, in the order they are drawn: the ticked rows
    // stand in the document among them (a ticked row stays under its parent) but are drawn in the
    // completed section, and a drag never carries a row into or across that section.
    const all: DragRow[] = [];
    const shapes: ChecklistRowShape[] = [];
    let offset = 0;
    for (let index = 0; index < list.childCount; index += 1) {
      const child = list.child(index);
      const element = elements[index];
      if (element) all.push({ el: element, pos: source.listPos + 1 + offset, top: wrapper ? offsetWithin(element, wrapper).top : element.offsetTop, height: element.offsetHeight });
      shapes.push({ checked: child.attrs.checked === true, depth: Number(child.attrs.depth ?? 0) || 0 });
      offset += child.nodeSize;
    }
    const rows = checklistSections(shapes)
      .active.map((index) => all[index])
      .filter((entry): entry is DragRow => entry !== undefined);

    const carried = rows.findIndex((entry) => entry.el === row);
    const grabbed = rows[carried];
    const last = rows[rows.length - 1];
    if (!grabbed || !last) return;

    const host = wrapper;
    if (!host) return;
    const card = frame ?? host;
    const cardRect = card.getBoundingClientRect();
    const rowRect = grabbed.el.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    const hostTop = hostRect.top;

    drag = {
      rows,
      carried,
      listPos: source.listPos,
      grabOffsetY: event.clientY - (hostTop + grabbed.top),
      startX: event.clientX,
      startY: event.clientY,
      startDepth: Number(source.node.attrs.depth ?? 0) || 0,
      // To the note's own edges, measured rather than guessed: the card's padding and the list's
      // indent are not ours to know from here.
      bandLeft: Math.round(cardRect.left + card.clientLeft - hostRect.left),
      bandRight: Math.round(hostRect.right - (cardRect.right - card.clientLeft)),
      bandHeight: Math.round(rowRect.height),
      listTop: rows[0]?.top ?? grabbed.top,
      listBottom: last.top + last.height,
      gap: carried,
      depth: Math.min(Math.max(Number(source.node.attrs.depth ?? 0) || 0, 0), MAX_BLOCK_DEPTH),
      carriedShift: 0,
      carriedIndent: 0
    };

    event.preventDefault();
    // The pointer belongs to the handle for the whole drag: without this a re-render — or the pointer
    // wandering off the note — ends the gesture, which is what made dragging only sometimes take.
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDrop);
    window.addEventListener('pointercancel', cancelDrag);
    window.addEventListener('keydown', onDragKeyDown);
  }

  function onDragMove(event: PointerEvent): void {
    const current = drag;
    if (!current) return;

    // The row comes under the band only once the hand has said it is moving: below the platform's
    // slop a press is still just a press, and a plain click on the handle leaves the note untouched.
    if (!dragging) {
      const dx = event.clientX - current.startX;
      const dy = event.clientY - current.startY;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < DRAG_SLOP) return;
      dragging = true;
      drawDrag();
    }

    pending = event;
    if (frameRequest === 0) {
      frameRequest = requestAnimationFrame(flushDrag);
    }
  }

  /** One update per frame, however fast the pointer reports. */
  function flushDrag(): void {
    frameRequest = 0;
    const event = pending;
    pending = null;
    const current = drag;
    const host = wrapper;
    if (!event || !current || !host) return;

    const place = placeFor(current, event.clientY - host.getBoundingClientRect().top, event.clientX);
    // The row under the hand moves every frame, and that is a single custom property on the wrapper:
    // the carried row, its band, its handle and its ✕ all read it, so a frame of following the finger
    // costs the compositor and nothing else. Dispatching a transaction per frame — which is what this
    // did — recomputed every plugin's decorations and re-rendered the component, and a phone dropped
    // frames under the finger. The editor only hears about the drag when the arrangement changes.
    host.style.setProperty(CARRIED_Y, `${Math.round(place.shift)}px`);
    if (
      place.gap === current.gap &&
      place.depth === current.depth &&
      Math.round(place.indent) === Math.round(current.carriedIndent)
    ) {
      return;
    }
    current.gap = place.gap;
    current.depth = place.depth;
    current.carriedShift = place.shift;
    current.carriedIndent = place.indent;
    drawDrag();
  }

  function onDrop(): void {
    const current = drag;
    // Read before letting go: releasing the gesture is what puts the flag down, and the drop has to
    // know whether there was anything to drop.
    const carried = dragging;
    releaseDrag();
    if (current && carried) commitDrag(current);
    revision += 1;
  }

  function cancelDrag(): void {
    const current = drag;
    releaseDrag();
    if (current) clearDragDrawing();
    revision += 1;
  }

  function onDragKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    // Nothing has been written yet, so letting go of the gesture is the same as abandoning it.
    cancelDrag();
  }

  function releaseDrag(): void {
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDrop);
    window.removeEventListener('pointercancel', cancelDrag);
    window.removeEventListener('keydown', onDragKeyDown);
    if (frameRequest !== 0) {
      cancelAnimationFrame(frameRequest);
      frameRequest = 0;
    }
    pending = null;
    wrapper?.style.removeProperty(CARRIED_Y);
    drag = null;
    dragging = false;
  }

  /**
   * Writes the arrangement the drag is showing: the carried row goes to the gap it is over, at the
   * level the hand asked for. One transaction, so undo takes the whole gesture back in one step, and
   * the drawing goes away in the same change — the rows are already where the document is about to
   * put them, so nothing moves at the moment of the drop.
   */
  function commitDrag(current: Drag): void {
    const carried = current.rows[current.carried];
    const list = editor.state.doc.nodeAt(current.listPos);
    if (!carried || !list) return;
    const item = editor.state.doc.nodeAt(carried.pos);
    if (!item) return;

    const from = collapsedIndexOf(current, current.carried);
    const to = Math.min(Math.max(current.gap, 0), current.rows.length - 1);
    if (from === to && current.depth === current.startDepth) {
      clearDragDrawing();
      return;
    }

    // Where the row goes: just after the active row it is dropped under (or before the first active
    // row), and past the ticked rows nested under that one — they are drawn in the completed section,
    // but in the document they are its parent's, and a row put in front of them would become their
    // parent instead.
    const staying = current.rows.filter((_, index) => index !== current.carried);
    const before = staying[to - 1];
    let insertAt = staying[0]?.pos ?? current.listPos + 1;
    if (before) {
      insertAt = before.pos + (editor.state.doc.nodeAt(before.pos)?.nodeSize ?? 0);
      let next = editor.state.doc.nodeAt(insertAt);
      while (
        next &&
        next.type.name === 'taskItem' &&
        next.attrs.checked === true &&
        (Number(next.attrs.depth ?? 0) || 0) > 0 &&
        insertAt !== carried.pos
      ) {
        insertAt += next.nodeSize;
        next = editor.state.doc.nodeAt(insertAt);
      }
    }

    const state = editor.state;
    const inside = state.selection.from > carried.pos && state.selection.to < carried.pos + item.nodeSize;
    const caret = inside ? state.selection.from - (carried.pos + 1) : null;

    // A top-level row takes the ticked rows nested under it along: they are drawn in the completed
    // section under its greyed copy, and left behind they would belong to the row above instead.
    const along: ProseMirrorNode[] = [];
    let end = carried.pos + item.nodeSize;
    if ((Number(item.attrs.depth ?? 0) || 0) === 0) {
      let next = state.doc.nodeAt(end);
      while (next && next.type.name === 'taskItem' && next.attrs.checked === true && (Number(next.attrs.depth ?? 0) || 0) > 0) {
        along.push(next);
        end += next.nodeSize;
        next = state.doc.nodeAt(end);
      }
    }
    if (insertAt > carried.pos && insertAt < end) return clearDragDrawing();

    const tr = state.tr;
    tr.delete(carried.pos, end);
    const at = tr.mapping.map(insertAt, -1);
    tr.insert(at, [item.type.create({ ...item.attrs, depth: current.depth }, item.content, item.marks), ...along]);
    if (caret !== null) {
      const paragraph = tr.doc.nodeAt(at);
      const limit = Math.max((paragraph?.content.size ?? 0) + 1, 1);
      const target = at + 1 + Math.min(Math.max(caret, 0), limit);
      tr.setSelection(TextSelection.create(tr.doc, target));
    }
    tr.setMeta(DRAGGING_ROW, null);
    editor.view.dispatch(tr);
  }

  /**
   * Whether a row is under the hand right now.
   *
   * The editor around this one answers Escape by finishing the note, and it listens on the window in
   * the **capture** phase — so it hears the key before anything here can, and a drag abandoned with
   * Escape would close the note instead. It asks this first (rule 24's Escape, minus the part that
   * belongs to a gesture in flight).
   */
  export function isCarrying(): boolean {
    return dragging;
  }

  /** The original's Undo and Redo: the body's own history, the same one Ctrl+Z walks. */
  export function canUndo(): boolean {
    return history.undo;
  }

  export function canRedo(): boolean {
    return history.redo;
  }

  export function undo(): void {
    editor.chain().focus().undo().run();
  }

  export function redo(): void {
    editor.chain().focus().redo().run();
  }

  /* ------------------------------------------------------------- the body's step log */

  /** This editor's name in the step log, and the body version it has. */
  export function collabClient(): string {
    return clientId;
  }

  export function collabVersion(): number {
    return collab.version;
  }

  /** Whether anything typed here has not been taken by the server yet. */
  export function hasUnsent(): boolean {
    return collab.hasUnsent;
  }

  /** The steps to send, and the body they produce. */
  export function outgoing(): (Outgoing & { content: NoteDocument }) | null {
    const steps = collab.outgoing();
    return steps && { ...steps, content: fromProseMirror(editor.getJSON()) };
  }

  export function confirm(sent: Outgoing): boolean {
    return collab.confirm(sent);
  }

  /** Somebody else's steps, in the server's order; false when they do not fit this body. */
  export function receive(steps: readonly unknown[], clientIds: readonly string[]): boolean {
    return collab.receive(steps, clientIds);
  }

  /** The server's body written as a whole, at [version], with what was typed here laid over it. */
  export function restart(body: NoteDocument, version: number): void {
    collab.restart(editor.schema.nodeFromJSON(toProseMirror(body)), version);
  }

  /** The server created the note with a body this editor had typed, at [version]; the rest is still to send. */
  export function settle(body: NoteDocument, version: number): void {
    collab.settle(editor.schema.nodeFromJSON(toProseMirror(body)), version);
  }

  /**
   * Another note's body, taken over entirely. **It is not the reader's edit, so it is never
   * undoable**: recorded in the history, opening a note left Undo enabled with nothing typed, and
   * pressing it took the editor back to the empty document it held before — which the autosave then
   * stored over the note.
   */
  export function load(body: NoteDocument, version: number): void {
    collab.load(editor.schema.nodeFromJSON(toProseMirror(body)), version);
  }

  /**
   * A change the reader asked for that rewrites the body — "uncheck all", "delete checked items",
   * showing or hiding the checkboxes. It is an edit like typing: undoable, and sent as steps.
   */
  export function replaceBody(body: NoteDocument): void {
    const next = editor.schema.nodeFromJSON(toProseMirror(body));
    const steps = diffSteps(editor.state.doc, next);
    if (steps.length === 0) return;
    const transaction = editor.state.tr;
    steps.forEach((step) => transaction.step(step));
    editor.view.dispatch(transaction);
  }

  /** The phone's formatting bar reads this; it changes only with the reader's own moves. */
  export function currentFormatting(): Formatting {
    return formatting;
  }

  /** The line under the caret as a heading of that level, or `0` for plain text ("Aa"). */
  export function setLineKind(level: 0 | 1 | 2): void {
    const chain = editor.chain().focus();
    if (level === 0) chain.setParagraph().run();
    else chain.toggleHeading({ level }).run();
  }

  export function toggleMark(mark: 'bold' | 'italic' | 'underline'): void {
    editor.chain().focus().toggleMark(mark).run();
  }

  /**
   * Put the caret on the first line, which is where the title hands over to the body.
   *
   * Tiptap's own focus command runs in an animation frame, and a handover that waits a frame loses
   * whatever is typed in the meantime — the first letters landed back in the title. Focusing the
   * element here is immediate; the command still decides where the caret goes.
   */
  export function focusStart(): void {
    editor.commands.focus('start');
    editor.view.dom.focus();
  }
</script>

<div
  class="rich-text"
  class:readonly={!editable}
  class:dragging
  bind:this={wrapper}
  style={listStyle}
>
  <!-- The wrapper takes a class so it can be made to fill the note body; without it the editable
       stops at the last line and a click below it lands on the container instead. -->
  <div class="note-body-host" {@attach mountEditor}></div>

  {#if labelMenu && labelMenu.rect}
    <!-- Under the typed `#…`, the original's way. Fixed to the window, so the note's own scrolling
         cannot clip it; a press keeps the caret in the text (`mousedown` is cancelled). -->
    <ul
      class="label-suggestions"
      role="listbox"
      aria-label={t('labels.suggestions')}
      style="left: {labelMenu.rect.left}px; top: {labelMenu.rect.bottom + 4}px"
    >
      {#each labelMenu.choices as choice, index (choice.kind === 'label' ? choice.label.id : `new-${choice.name}`)}
        <li role="option" aria-selected={index === labelMenu.active}>
          <button
            type="button"
            class:active={index === labelMenu.active}
            onmousedown={(event) => event.preventDefault()}
            onclick={() => labelMenu?.pick(choice)}
          >
            <Icon name={choice.kind === 'label' ? 'label' : 'plus'} size={18} />
            <span>{choice.kind === 'label' ? choice.label.name : t('labels.suggestCreate', { name: choice.name })}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  {#if editable && rowDelete && deleteTarget}
    <!-- The original's ✕: it belongs to the row the reader is on and takes that row out of the note.
         A drag has no ✕ — a drag is abandoned with Escape or by dropping the row where it was.
         It never takes the focus (`mousedown` is cancelled, as for any editor toolbar button): the
         editor keeps it, so the caret ProseMirror maps through the deletion is the one on screen. A
         focused button left the browser's own caret where the row had been, between two checkboxes. -->
    <button
      type="button"
      class="row-delete"
      class:on-band={dragging && isCarried(deleteTarget)}
      style="top: {placedTop(rowDelete.top, deleteTarget)}; left: {rowDelete.left}px"
      aria-label={t('editor.deleteItem')}
      title={t('editor.deleteItem')}
      onmousedown={(event) => event.preventDefault()}
      onclick={() => deleteRow(deleteTarget)}
    >
      <Icon name="close" size={18} />
    </button>
  {/if}

  {#if dragging && drag}
    <!-- **The band is the row's own box**, drawn at the note's own width and following the row: one
         opaque, neutral surface with the row's handle, checkbox, text and ✕ on it, which is the whole
         of what the original draws around a row in the hand (`keep-drag-3-move.webp`). It
         is its own element rather than a shadow of the row because the row is drawn at the level it
         will land at, and a shadow would travel with it and leave a strip of the note beside it. -->
    <div
      class="drag-band"
      style="top: calc({bandTop()}px + var({CARRIED_Y}, 0px)); height: {drag.bandHeight}px; left: {drag.bandLeft}px; right: {drag
        .bandRight}px"
    ></div>
  {/if}

  {#if editable}
    {#each handles as handle (handle.row)}
      <button
        type="button"
        class="drag-handle"
        class:held={handle.held}
        style="top: {placedTop(handle.top, handle.row)}; left: {handle.left +
          indentOf(handle.row)}px; width: {list.handle}px"
        aria-label={t('editor.reorderItem')}
        title={t('editor.reorderItem')}
        onpointerdown={(event) => startDrag(event, handle.row)}
      >
        <Icon name="drag-indicator" size={list.handle} />
      </button>
    {/each}
  {/if}

</div>

<style>
  /* Fills the body around it: the editable has to cover the whole area a note shows, or a click
     under the last line lands on the container and nothing happens. */
  .rich-text {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 24px;
  }

  :global(.note-body-host) {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
  }

  /* Tiptap renders its own DOM, so the note typography is global to this component. */
  :global(.note-body) {
    outline: none;
    flex: 1 1 auto;
    color: inherit;
    font-size: 0.875rem;
    line-height: 1.5rem;
    word-break: break-word;
  }

  :global(.note-body p) {
    margin: 0;
    min-height: 24px;
  }

  /* Only a note with nothing in it: Tiptap marks the empty editor's one paragraph. */
  :global(.note-body p.is-editor-empty:first-child::before) {
    content: attr(data-placeholder);
    float: left;
    height: 0;
    pointer-events: none;
    color: var(--note-fg-secondary, var(--keep-text-secondary));
  }

  :global(.note-body h1),
  :global(.note-body h2),
  :global(.note-body h3) {
    margin: 0;
    font-weight: 500;
    line-height: 1.4;
  }

  :global(.note-body h1) {
    font-size: 1.375rem;
  }

  :global(.note-body h2) {
    font-size: 1.125rem;
  }

  :global(.note-body h3) {
    font-size: 1rem;
  }

  :global(.note-body ul),
  :global(.note-body ol) {
    margin: 0;
    padding-left: 24px;
  }

  :global(.note-body li) {
    /* Measured off the original's own screenshot: its checklist rows stand **38px** apart, where ours
       stood 24. The owner reads that as "the distances in Google Keep between the elements are
       bigger". */
    min-height: 38px;
  }

  :global(.note-body li p) {
    min-height: 0;
  }

  /*
   * **A level is 25px (2.375em on a phone, `PHONE_LIST_EM`), and it is the row's own.** Measured off the original: a nested row's checkbox
   * sits at x=51 where the row above it sits at x=26. The line carries the indent, so nothing about it
   * depends on a list inside a list — and there is no list inside a list to depend on.
   */
  :global(.note-body li[data-depth='1']) {
    margin-left: var(--list-indent);
  }

  /* **The checkbox sits 26px from the note's own edge**, measured off the original — and the note's
     body already carries 16px of padding for the title and the paragraphs, so the list adds the
     remaining **10px** (on a phone the Android app's checkbox is 66px in, so the list adds 45).
     (Spelling the 26px here instead put the checkbox at 42px from the card's edge and every row 16px
     right of the original's, which is what the side-by-side showed.) The indent is also what leaves
     the handle a margin to hang in rather than a strip of the note's edge.
     A flex column, so the sections are drawn by each row's `order` and the rows themselves stay where
     the document has them (`checklistCompletion.ts`). */
  :global(.note-body ul[data-type='taskList']) {
    display: flex;
    flex-direction: column;
    list-style: none;
    padding-left: var(--list-inset);
  }

  /* A row is its line — 24px — with the original's own 7px of air above and below it, so its text sits
     in the middle of its box and a second line makes the row 24px taller rather than shifting what is
     already written. Measured: a three-line row there is 84px tall, and 3 x 24 + 14 = 86 here. */
  :global(.note-body li[data-checked]),
  :global(.note-body li.completed-ghost) {
    display: flex;
    align-items: flex-start;
    gap: 13px;
    padding: 7px 0;
  }

  :global(.note-body li[data-checked] > label),
  :global(.note-body li.completed-ghost > label) {
    display: inline-flex;
    align-items: center;
    height: 24px;
  }

  /*
   * The checkbox, drawn rather than left to the browser: a rounded square with a light border, filled
   * in with a white tick once it is ticked — the original's own treatment. `accent-color` alone left
   * the platform's control there, which is what looked wrong next to it.
   */
  :global(.note-body li[data-checked] > label > input),
  :global(.note-body li.completed-ghost > label > input) {
    appearance: none;
    position: relative;
    /* Measured off the original: the box is **14x14** with a thin outline, where ours was 18. */
    width: 14px;
    height: 14px;
    margin: 0;
    border: 1.5px solid var(--note-fg-secondary, var(--keep-text-secondary));
    border-radius: 3px;
    background: transparent;
    cursor: pointer;
    transition:
      background-color var(--keep-duration-short) var(--keep-ease-standard),
      border-color var(--keep-duration-short) var(--keep-ease-standard);
  }

  /*
   * Ticked: the box fills with the note's own foreground and the tick is cut out of that fill with
   * the note's background colour — the original's own inversion, and the reason a hard-coded white
   * tick was wrong: on a dark card the fill is light, so the tick has to be dark.
   */
  :global(.note-body li[data-checked] > label > input:checked) {
    border-color: var(--note-fg, var(--keep-text));
    background-color: var(--note-fg, var(--keep-text));
  }

  :global(.note-body li[data-checked] > label > input:checked::after) {
    content: '';
    position: absolute;
    inset: 2px;
    background-color: var(--note-bg, var(--keep-bg));
    mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M5 13l4 4L19 7'/%3E%3C/svg%3E");
    mask-size: contain;
    mask-position: center;
    mask-repeat: no-repeat;
  }

  :global(.note-body li[data-checked] > div),
  :global(.note-body li.completed-ghost > div) {
    flex: 1 1 auto;
    min-width: 0;
  }

  :global(.note-body li[data-checked='true'] > div) {
    text-decoration: line-through;
    opacity: 0.6;
  }

  /* The original's "+ List item": a 39px row under the active rows, its plus in the checkboxes'
     column and its words where a row's text starts, in the secondary ink. */
  :global(.note-body .add-item-row button) {
    display: flex;
    align-items: center;
    gap: 13px;
    width: 100%;
    height: 39px;
    padding: 0;
    color: var(--note-fg-secondary, var(--keep-text-secondary));
    text-align: left;
    cursor: text;
  }

  :global(.note-body .add-item-row svg) {
    flex: 0 0 auto;
    margin-left: -3px;
  }

  /*
   * The completed-items heading, drawn by the editor's own extension. Keep sets it apart from the
   * rows with a little air and puts the chevron where the checkboxes are.
   *
   * A stylesheet cannot import TypeScript, so these four names are also written down in
   * `boundary/editor/completedSection.ts`, which is where the extension reads them from.
   * `completedSection.test.ts` fails if the two spellings drift apart.
   */
  /* The original draws a 1px line at 10% ink over the completed section, in the editor as on a card. */
  :global(.note-body .completed-row) {
    display: flex;
    margin-top: 4px;
    border-top: 1px solid var(--keep-completed-rule);
  }

  :global(.note-body .completed-toggle) {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 0;
    color: var(--note-fg-secondary, var(--keep-text-secondary));
    text-align: left;
  }

  :global(.note-body .completed-chevron) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    /* The box the decoration draws the shared chevron into; the size itself lives in the module. */
    width: 20px;
    height: 20px;
  }

  /* The greyed copy of an unticked parent above its ticked rows in the section — the row as the list
     draws it, unticked and inert, the way the Android app draws it. */
  :global(.note-body li.completed-ghost) {
    opacity: 0.38;
    pointer-events: none;
    user-select: none;
  }

  /* The Android app draws no line over its "Checked items" (recorded on an emulator); the web
     original's 1px line is the desktop's. */
  @media (max-width: 600px) {
    :global(.note-body .completed-row) {
      border-top: 0;
    }

    /* The Android app's "Checked items" stands to the left of the rows (measured 2026-10-17): its
       chevron is centred in the handles' column and its words start where the checkboxes do. The
       20px chevron box is pulled out of the list's inset by the handle's own offset. */
    :global(.note-body .completed-toggle) {
      margin-left: calc(-1 * (var(--list-handle-offset) + 10px));
      gap: calc(var(--list-handle-offset) - 10px);
    }
  }

  /* A folded section still has its heading; only the rows go. Declared after the flex rule on a
     row, which has the same specificity, so `display: none` wins. */
  :global(.note-body li.completed-hidden) {
    display: none;
  }

  :global(.note-body code) {
    padding: 1px 4px;
    border-radius: 3px;
    background: var(--keep-note-code);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.92em;
  }

  /* The same treatment the card gives a link: the original's link colour, underlined (in the dark
     theme the note's own ink, underlined — `--keep-note-link` is unset there). */
  :global(.note-body a),
  /* What the linkify decoration draws: the same colour and underline, on text the document never
     marked. It is not an anchor — clicking it must not take the writer away from the note. */
  :global(.note-body .auto-link) {
    color: var(--keep-note-link, var(--note-fg, var(--keep-text)));
    text-decoration: underline;
  }

  :global(.note-body s) {
    text-decoration: line-through;
  }

  .readonly :global(.note-body) {
    cursor: default;
  }

  /* The six-dot handle sits in the margin of its own row, outside the editable so ProseMirror never
     sees its pointer events. Its width is not set here: `left` is calculated from `list.handle`, so
     the element takes that same number as an inline style and the two cannot drift apart. */
  .drag-handle {
    position: absolute;
    z-index: 3;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 24px;
    /* `top` is the row's centre, `left` the handle's own left edge. */
    transform: translateY(-50%);
    color: var(--note-fg-secondary, var(--keep-text-secondary));
    cursor: grab;
    touch-action: none;
  }

  .drag-handle.held {
    cursor: grabbing;
    /* The carried row's own handle sits on the band, so its dots are the band's light ink. */
    background: var(--keep-drag-band);
    color: var(--keep-drag-ink-secondary);
  }

  /*
   * The rows giving way to the carried one slide rather than jump. Material's short duration and
   * standard curve, the same pair the rest of the app moves with — the movement is the only thing
   * that tells the reader which row is making room.
   */
  :global(.note-body li.drag-shift) {
    transition: transform var(--keep-duration-short) var(--keep-ease-standard);
  }

  /*
   * The carried row: **one opaque, neutral, full-width band**, and nothing else.
   *
   * Measured off the owner's own screenshots of the original (`keep-drag-3-move.webp`):
   * the band is `rgb(31,33,37)` — a neutral dark that does not take the note's colour — it runs from
   * the note's left edge to its right, and the row's handle, checkbox, text (however many lines it
   * has) and ✕ all sit **on** it in light ink. Its height is exactly the row's own: 84px for a
   * three-line row, measured. That is the whole of what a drag draws, and it is the row itself — a gap
   * widget standing in for it, a floating copy of it and a "shadow" copy at the landing place were all
   * built and thrown away, each named by the owner as the thing that was wrong.
   *
   * The band reaches the note's edges by measurement (`bandLeft`/`bandRight`, read off the card's
   * rectangle), not by a guessed indent: a 22px shadow that stopped short of the note's edge left a
   * strip of the note beside the band, and the handle's own dark box poked out of it as a vertical line.
   */
  :global(.note-body li.dragging-row) {
    /* **Positioned, so the row paints over the rows sliding under it** — the rows below it in the
       document are the ones that give way, and without this they would be drawn on top of the row in
       the hand. Nothing is measured from this row's own label while it is carried (see
       `measureHandles`), which is what a positioned row costs. */
    position: relative;
    z-index: 2;
    /* The theme on the band: light ink on the band's own dark surface, so the checkbox's tick is cut
       out in the band's colour rather than the note's. The band itself is `.drag-band`. */
    --note-fg: var(--keep-drag-ink);
    --note-fg-secondary: var(--keep-drag-ink-secondary);
    --note-bg: var(--keep-drag-band);
    color: var(--keep-drag-ink);
  }

  /* The carried row's own box, as the note paints it: opaque and neutral, from the note's left edge
     to its right, under the row it belongs to and over the rows that give way to it. */
  .drag-band {
    position: absolute;
    z-index: 1;
    background: var(--keep-drag-band);
    pointer-events: none;
  }

  /* The row's own ✕, level with its line at its right edge, the way the handles hang at its left. */
  .row-delete {
    position: absolute;
    z-index: 3;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border-radius: 50%;
    transform: translateY(-50%);
    color: var(--note-fg-secondary, var(--keep-text-secondary));
  }

  .row-delete:hover {
    background: color-mix(in srgb, var(--note-fg, var(--keep-text)) 12%, transparent);
    color: var(--note-fg, var(--keep-text));
  }

  /* The ✕ belongs to the row in the hand, so it rides the band and wears the band's ink. */
  .row-delete.on-band {
    color: var(--keep-drag-ink-secondary);
  }

  /* While a row is being carried the pointer must not paint a selection through the note. */
  .dragging :global(.note-body) {
    user-select: none;
  }

  /*
   * A phone's checklist, from the owner's screenshot of Keep on iOS (2026-10-22, `docs/METRICS.md`),
   * **in em of the note's text** so that it follows the reader's text size: the text 16pt on a 1.5em
   * line, the rows **2.25em** apart (36pt — the line with 0.375em above and below), the checkbox
   * **1.125em** (18pt) with a 0.125em outline and **1.375em** (22pt) before the text, and the box centred
   * on the line, which is where the text's capitals are centred too. In px, a phone whose text is
   * scaled (Dynamic Type, the APK's `textZoom`) scaled the words but not the box or the line they share,
   * and the checkbox stood off the text. The desktop's 14px box and 38px rows are the web original's.
   */
  @media (max-width: 600px) {
    :global(.note-body) {
      font-size: 1rem;
      line-height: 1.5em;
    }

    :global(.note-body p) {
      min-height: 1.5em;
    }

    :global(.note-body li[data-checked]),
    :global(.note-body li.completed-ghost) {
      min-height: 2.25em;
      padding: 0.375em 0;
      gap: 1.375em;
    }

    :global(.note-body li[data-checked] > label),
    :global(.note-body li.completed-ghost > label) {
      height: 1.5em;
    }

    :global(.note-body li[data-checked] > label > input),
    :global(.note-body li.completed-ghost > label > input) {
      width: 1.125em;
      height: 1.125em;
      border-width: 0.125em;
      border-radius: 0.1875em;
    }

    /* "+ List item" is a row like the others: the same pitch, its 20px plus centred on the checkboxes'
       column and its words where a row's text starts (checkbox 1.125em + 1.375em). */
    :global(.note-body .add-item-row button) {
      height: 2.25em;
      gap: calc(1.9375em - 10px);
    }

    :global(.note-body .add-item-row svg) {
      margin-left: calc((1.125em - 20px) / 2);
    }
  }

  /* The `#` list: the original's own menu look — a raised panel of 32px rows, the matching one lit. */
  .label-suggestions {
    position: fixed;
    z-index: 100;
    min-width: 200px;
    max-width: 280px;
    margin: 0;
    padding: 6px 0;
    list-style: none;
    border-radius: 4px;
    background: var(--keep-surface);
    color: var(--keep-text);
    box-shadow: var(--keep-shadow-popover);
  }

  .label-suggestions button {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 32px;
    padding: 4px 16px;
    color: inherit;
    font-size: 0.875rem;
    text-align: left;
  }

  .label-suggestions button span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .label-suggestions button.active,
  .label-suggestions button:hover {
    background: var(--keep-hover);
  }
</style>
