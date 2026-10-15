<script lang="ts">
  import { fade } from 'svelte/transition';
  import { tick, untrack } from 'svelte';
  import type { BlockType, Note, NoteBackground, NoteColor, NoteDocument, NoteImage, NoteKind } from '../../entity/api/types';
  import { ApiError } from '../../control/api/client';
  import { notesApi } from '../../control/api/notes';
  import { notes as notesState } from '../../control/state/notes.svelte';
  import { labels as labelsState } from '../../control/state/labels.svelte';
  import { ui } from '../../control/state/ui.svelte';
  import { toast } from 'svelte-sonner';
  import RichText from './RichText.svelte';
  import LinkCards from './LinkCards.svelte';
  import type { ReminderRepeat } from '../../entity/api/types';
  import ReminderChip from './ReminderChip.svelte';
  import ReminderPicker from './ReminderPicker.svelte';
  import NoteImages from './NoteImages.svelte';
  import ImageViewer from './ImageViewer.svelte';
  import { IMAGE_TYPES } from '../../entity/imageLayout';
  import { noteFileName, noteToFile } from '../../entity/noteFile';
  import { saveMarkdownFile } from '../download';
  import { t, tError } from '../i18n';
  import { formatEditedAt } from '../i18n/format';
  import { createEmptyDocument, createEmptyListDocument, documentsEqual, newBlockId, withKind, uncheckAll, withoutChecked } from '../../entity/noteDocument';
  import { DropdownMenu, Popover } from 'bits-ui';
  import { ENTER_EASING, EXIT_EASING, MOTION } from '../editor/motion';
import { flyToCard } from '../editor/editorFlight';
import { NoteDraft } from '../editor/noteDraft.svelte';
  import AppearancePicker from './AppearancePicker.svelte';
  import Sheet from './Sheet.svelte';
  import type { LabelChoice } from '../editor/labelSuggestion';
  import Icon from './Icon.svelte';
  import type { IconName } from './Icon.svelte';
  import LabelPicker from './LabelPicker.svelte';
  import VersionHistoryDialog from './VersionHistoryDialog.svelte';

  /** How often a write meets somebody else's steps before it gives up until the next keystroke. */
  const MAX_SEND_ATTEMPTS = 5;

  const draft = new NoteDraft();

  let richText = $state<RichText | null>(null);
  // The body's unsent steps are the editor's to know; the draft asks it.
  draft.hasUnsentBody = () => richText?.hasUnsent() ?? false;

  /**
   * The cards for this note's links, read from the store rather than from the draft: the server
   * fetches a page after the write that mentioned it, and the store is what the live channel
   * refreshes when it does.
   */
  const linkPreviews = $derived(
    (draft.noteId === null ? undefined : notesState.byId(draft.noteId)?.linkPreviews) ?? []
  );
  let titleInput = $state<HTMLTextAreaElement | null>(null);

  /**
   * The target the draft in the editor belongs to: a note's id as a string, or `'new'` for one that
   * does not exist on the server yet. A draft has no id to compare against, and `null` would mean
   * both "closed" and "brand new" — which is what the old `0` sentinel did.
   */
  let loadedTarget = $state<string | null>(null);

  /** bits-ui owns each panel's open state; this only makes sure one is open at a time. */
  let openPanel = $state<'label' | 'appearance' | 'reminder' | 'menu' | null>(null);

  const openFor = (panel: 'label' | 'appearance' | 'reminder' | 'menu') => ({
    open: openPanel === panel,
    // A panel closing only clears the state while it is still the open one: the menu closes *after*
    // its "Add label" item has handed the open panel to the label picker.
    onOpenChange: (next: boolean) => {
      if (next) openPanel = panel;
      else if (openPanel === panel) openPanel = null;
    }
  });
  let historyOpen = $state(false);
  /**
   * On a phone the bottom bar's buttons open the original's bottom sheets instead of menus hanging
   * off the button: "add" (camera, picture), the colours, the overflow menu, and the labels from it.
   */
  let sheet = $state<'add' | 'appearance' | 'menu' | 'label' | 'list' | null>(null);
  /**
   * The original's "A": on a phone the bottom bar gives way to a formatting bar — H1, H2 and plain
   * text, then bold, italic and underline, then a ✕ that brings the bar back. It is greyed out while
   * the body does not have the caret, because there is nothing for it to format.
   */
  let formatBar = $state(false);
  const formatting = $derived(richText?.currentFormatting() ?? null);
  let cameraInput = $state<HTMLInputElement | null>(null);

  /** Runs one of the overflow menu's actions from its sheet, which goes away first. */
  function fromSheet(action: () => void): () => void {
    return () => {
      sheet = null;
      action();
    };
  }
  /**
   * The bottom bar's glyphs: 18px as the desktop's are, and on a phone the 26px the original's
   * Android app draws in its round buttons (measured off the owner's screenshots at 412px).
   */
  const barIcon = $derived(ui.phone ? 26 : 18);

  function openCollaborators(): void {
    void save().then(() => {
      if (draft.noteId !== null) ui.openShare(draft.noteId);
    });
  }

  let editorHost: HTMLElement | null = $state(null);
  let editorCard: HTMLElement | null = $state(null);
  let closing = false;
  /** Bumped whenever a *different* note is opened, so an in-flight close can tell a switch from a save. */
  let session = 0;

  const isNew = $derived(draft.isNew);
  /** The stored note while it exists, for the things the editor shows but does not own. */
  const currentNote = $derived(draft.noteId === null ? null : (notesState.byId(draft.noteId) ?? null));

  $effect(() => {
    if (!ui.editorOpen) {
      loadedTarget = null;
      return;
    }
    const requested = ui.editorNoteId;
    const target = requested === null ? 'new' : String(requested);
    if (target === loadedTarget) return;
    session += 1;
    // Moving from one note to another has to store what has not been stored yet. `save()` captures
    // the note the draft belongs to before it awaits, so the reply cannot land in the note that is
    // being opened.
    void save();
    load(requested, ui.editorKind);
    loadedTarget = target;
    // After the load, not inside it: reloading the draft because somebody else typed must not move
    // the caret the user is working with.
    void tick().then(focusOnOpen);
  });

  /** Every way the editor closes goes through here, so the note takes its caret with it. */
  function closeEditor(): void {
    richText?.releaseCaret();
    ui.closeEditor();
  }

  // Somebody else changed the note on screen: take their steps in. What is being typed here is
  // rebased over them, never replaced, and the caret stays where it is.
  $effect(() => {
    const { revision, noteIds } = notesState.remoteChange;
    const openNoteId = draft.noteId;
    if (!ui.editorOpen || revision === 0 || openNoteId === null || !noteIds.has(openNoteId)) return;

    untrack(() => {
      const opened = session;
      void serially(() => catchUp(opened, openNoteId)).catch(() => undefined);
    });
  });

  // A note opened from the grid grows out of its own card. A new note does not grow at all: the
  // original turns its "Take a note…" box into the editor in a single frame — measured, the box is
  // 600x46 in one frame and 600x137 in the next, with no transform, no fade, and the notes below
  // moving down at once. Growing ours out of the box scaled the editor's text vertically for a
  // quarter of a second, which is what looked wrong.
  $effect(() => {
    if (!ui.editorOpen) return;
    // Read here so the effect re-runs when they change. The first autosave turns a draft into a
    // stored note, and that must not replay this — it also scaled any popover open at the time,
    // because it lives inside the card.
    const opened = ui.editorNoteId;
    if (!ui.floatingEditor || opened === null || !ui.animationsAllowed) return;

    untrack(() => {
      void tick().then(() => {
        if (!editorCard) return;
        const to = editorCard.getBoundingClientRect();
        if (to.width === 0 || to.height === 0) return;
        const from = document.querySelector(`.card[data-note-id="${opened}"]`)?.getBoundingClientRect();
        if (!from || from.width === 0 || from.height === 0) return;

        editorCard.animate(
          [
            {
              transformOrigin: 'top left',
              transform: `translate(${from.x - to.x}px, ${from.y - to.y}px) scale(${from.width / to.width}, ${from.height / to.height})`,
              opacity: 0.4
            },
            { transformOrigin: 'top left', transform: 'none', opacity: 1 }
          ],
          { duration: MOTION.long, easing: MOTION.enter }
        );
      });
    });
  });

  // Editing is inline, the way Keep does it: the note being edited sits above the grid and the
  // rest of the notes stay usable, so losing focus is the signal to finish. A click inside the
  // editor, in one of its own popovers, or in a dialog opened from it is not a loss of focus.
  $effect(() => {
    if (!ui.editorOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      // The *card*, not the host: the host spans the notes column, and treating the empty space
      // beside the card as "inside the editor" made clicking there do nothing at all.
      if (target.closest('.editor')) return;
      // Clicking a card moves the editor to that note instead of dismissing it.
      if (target.closest('.card')) return;
      if (target.closest('[data-overlay]')) return;
      if (target.closest('[data-sonner-toaster]')) return;
      void close();
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  });

  /**
   * Keep's editor holds the page still: with a note open, the wheel does nothing to the notes — only
   * the note itself scrolls. The floating editor hangs over the notes, so a page that still scrolled
   * carried the note being edited off the screen.
   */
  $effect(() => {
    if (!ui.editorOpen || !ui.floatingEditor) return;

    const block = (event: Event): void => {
      const target = event.target;
      if (target instanceof Element) {
        const body = target.closest('.editor .body');
        if (body instanceof HTMLElement && body.scrollHeight > body.clientHeight + 1) return;
      }
      event.preventDefault();
    };

    document.addEventListener('wheel', block, { passive: false, capture: true });
    document.addEventListener('touchmove', block, { passive: false, capture: true });
    return () => {
      document.removeEventListener('wheel', block, { capture: true });
      document.removeEventListener('touchmove', block, { capture: true });
    };
  });

  let imageInput = $state<HTMLInputElement | null>(null);
  let viewerIndex = $state<number | null>(null);

  /** A picture moved the note on; the "Edited" line follows. */
  function followVersion(note: Note | null): void {
    if (!note || draft.noteId !== note.id) return;
    draft.updatedAt = note.updatedAt;
  }

  /** Pictures from the picker, a paste or a drop: the note is stored first if it is still a draft. */
  async function attachImages(files: readonly File[]): Promise<void> {
    const pictures = files.filter((file) => file.type.startsWith('image/'));
    if (pictures.length === 0 || !draft.canEdit) return;
    await guard(async () => {
      if (draft.noteId === null) await save(true);
      if (draft.noteId === null) return;
      followVersion(await notesState.addImages(draft.noteId, pictures));
    });
  }

  async function removeImage(image: NoteImage): Promise<void> {
    const noteId = draft.noteId;
    if (noteId === null) return;
    await guard(async () => {
      const remaining = (currentNote?.images?.length ?? 1) - 1;
      followVersion(await notesState.removeImage(noteId, image.id));
      if (viewerIndex !== null) viewerIndex = remaining > 0 ? Math.min(viewerIndex, remaining - 1) : null;
    });
  }

  /** A picture pasted or dropped into the note is attached, the way the original takes one. */
  function picturesIn(data: DataTransfer | null): File[] {
    return Array.from(data?.files ?? []).filter((file) => file.type.startsWith('image/'));
  }

  // The composer's "New note with image" hands its pictures over before the editor opens.
  $effect(() => {
    if (ui.editorOrigin === null || ui.pendingImages.length === 0) return;
    const pictures = ui.pendingImages;
    ui.pendingImages = [];
    void attachImages(pictures);
  });

  /** The body the open note started from in this editor: what a new note is created with. */
  let initialBody: NoteDocument = draft.content;

  function load(requested: number | null, requestedKind: NoteKind): void {
    formatBar = false;
    discarding = false;
    if (requested === null) {
      draft.startNew(requestedKind);
    } else {
      const note = notesState.byId(requested);
      if (!note) {
        closeEditor();
        return;
      }
      draft.adopt(note);
    }
    initialBody = draft.content;
    // A body already on screen is replaced; one that is not is created with these, as its props.
    richText?.load(draft.content, draft.docVersion);
  }

  /*
   * The body is written as ProseMirror steps against the version the server numbered it at
   * (`docs/COLLABORATION.md`, `boundary/editor/collabSync.ts`). Every exchange with the step log runs
   * one after another: a catch-up that landed in the middle of a send would confirm the same steps
   * twice.
   */
  let syncing: Promise<unknown> = Promise.resolve();

  function serially<T>(task: () => Promise<T>): Promise<T> {
    const next = syncing.then(task, task);
    syncing = next.catch(() => undefined);
    return next;
  }

  /**
   * Stores the draft. [force] stores a new note even when nothing has been typed — a picture needs
   * a note to hang off, and the original lets a note be nothing but a picture.
   */
  function save(force = false): Promise<void> {
    // What the draft is *now*: by the time the queue gets to it, another note may be open.
    const opened = session;
    return serially(() => store(opened, force));
  }

  async function store(opened: number, force: boolean): Promise<void> {
    if (opened !== session || !draft.canEdit) return;
    draft.cancelAutosave();
    if (!draft.isDirty() && !(force && draft.isNew)) return;
    if (draft.isNew && !draft.hasContent && !force) return;
    draft.saving = true;
    try {
      if (draft.noteId === null) await create();
      if (opened !== session || draft.noteId === null) return;
      await sendSteps(opened, draft.noteId);
      if (opened !== session) return;
      release();
      if (closeWhenStored) void close();
    } catch (error) {
      // Without a connection the store queues the write (`pendingWrites`) and this never throws; what
      // lands here is a refusal — the note is gone, or no longer ours to edit — and the text is only
      // in this editor.
      if (opened === session) hold(t('editor.notSaved', { reason: tError(error as Error) }));
    } finally {
      draft.saving = false;
    }
  }

  /**
   * Creates the note with the body the editor **started from** — its step log's version 0 — so the
   * steps typed since then go out after it like any other edit.
   */
  async function create(): Promise<void> {
    const created = await notesState.create({ kind: draft.kind, title: draft.title.trim(), content: initialBody });
    if (draft.noteId !== null) return;
    draft.noteId = created.id;
    draft.updatedAt = created.updatedAt;
    // The editor now owns a real note. The effect above compares the target against `loadedTarget`;
    // leaving the two out of step made it decide it had to load the note again, which wiped the draft
    // mid-typing.
    ui.editorNoteId = created.id;
    loadedTarget = String(created.id);
    // Composing from a label's view makes a note of that label. Without it the new note would not
    // match the view it was written in and would vanish the moment it was stored.
    const viewLabel = notesState.labelId;
    if (viewLabel !== null) {
      await notesState.setLabels(created.id, [viewLabel]);
      draft.labelIds = [viewLabel];
    }
    // Only now does it enter the list, so the grid never draws a card it is about to hide.
    notesState.add(notesState.byId(created.id) ?? created);
  }

  /**
   * Sends the steps typed here, with the title and kind. When somebody else's steps came first the
   * server says so, the editor takes them in — its own are rebased over them — and sends again.
   */
  async function sendSteps(opened: number, noteId: number): Promise<void> {
    for (let attempt = 0; attempt < MAX_SEND_ATTEMPTS; attempt += 1) {
      const body = richText;
      if (!body) return;
      const outgoing = body.outgoing();
      if (!outgoing && !draft.headerChanged) return;
      const header = draft.serialize();
      // The title and kind go only when they changed: an unchanged title sent along would overwrite
      // one somebody else wrote meanwhile.
      const headerChanged = draft.headerChanged;
      try {
        const stored = await notesState.sendSteps(noteId, {
          docVersion: outgoing?.version ?? body.collabVersion(),
          clientId: body.collabClient(),
          steps: outgoing?.steps ?? [],
          content: outgoing?.content ?? draft.content,
          ...(headerChanged ? { title: draft.title.trim(), kind: draft.kind } : {})
        });
        // Queued without a connection (or the note exists only here): the steps stay unsent.
        if (stored === null || opened !== session) return;
        if (outgoing) body.confirm(outgoing);
        draft.markStored(header);
        draft.updatedAt = stored.updatedAt;
        return;
      } catch (error) {
        if (!(error instanceof ApiError && error.key === 'note.steps_behind')) throw error;
        await catchUp(opened, noteId);
      }
    }
  }

  /**
   * Takes in what the server has and this editor does not: the steps after its version, in order, or
   * — when the log no longer reaches back that far, or the steps do not fit — the server's body as a
   * whole, with what was typed here laid over it. Nothing typed here is lost either way.
   */
  async function catchUp(opened: number, noteId: number): Promise<void> {
    const body = richText;
    if (!body || noteId < 0) return;
    const log = await notesApi.stepsSince(noteId, body.collabVersion());
    if (opened !== session) return;
    const taken =
      !log.reset &&
      body.receive(
        log.steps.map((entry) => entry.step),
        log.steps.map((entry) => entry.clientId)
      );
    if (!taken) {
      const fresh = await notesApi.get(noteId);
      if (opened !== session) return;
      notesState.replace(fresh);
      body.restart(fresh.content, fresh.docVersion);
    }
    const stored = notesState.byId(noteId);
    if (stored) draft.follow(stored);
  }

  /** The user asked to finish the note while it could not be stored; it finishes once it is. */
  let closeWhenStored = false;
  /** The user gave up what could not be stored: closing must not try to store it again. */
  let discarding = false;
  const UNSAVED_TOAST = 'note-unsaved';

  /**
   * A write was refused and the draft is the only copy of what was typed: keep it
   * (`ui.editorHoldsUnsaved`) and say so, with the one way out that gives it up on purpose.
   */
  function hold(message: string): void {
    ui.editorHoldsUnsaved = true;
    toast.error(message, {
      id: UNSAVED_TOAST,
      duration: Number.POSITIVE_INFINITY,
      action: { label: t('editor.discardChanges'), onClick: () => void discardChanges() }
    });
  }

  /** The draft is stored, or given up: nothing is held any more. */
  function release(): void {
    if (!ui.editorHoldsUnsaved) return;
    ui.editorHoldsUnsaved = false;
    toast.dismiss(UNSAVED_TOAST);
  }

  async function discardChanges(): Promise<void> {
    discarding = true;
    draft.cancelAutosave();
    draft.markStored();
    release();
    await close();
  }

  // A note written without a connection got its server id when the queue was sent: follow it. The
  // body the queue created it with is the one the server confirmed, and whatever was typed after it
  // stays to be sent as steps.
  $effect(() => {
    const local = draft.noteId;
    if (local === null || local > 0) return;
    const stored = notesState.renamed.get(local);
    if (stored === undefined) return;
    untrack(() => {
      draft.noteId = stored;
      ui.editorNoteId = stored;
      loadedTarget = String(stored);
      const note = notesState.byId(stored);
      if (note) {
        richText?.settle(note.content, note.docVersion);
        draft.follow(note);
      }
    });
  });

  // The open note and this editor's name in the step log, for the offline queue (`notes.editing`).
  $effect(() => {
    const noteId = draft.noteId;
    const clientId = richText?.collabClient();
    notesState.editing = ui.editorOpen && noteId !== null && clientId ? { noteId, clientId } : null;
  });

  async function close(): Promise<void> {
    if (closing) return;
    const opening = session;
    closing = true;
    try {
      if (draft.canEdit && draft.isDirty() && !discarding) {
        await save();
      }
      // Not stored: the draft is the only copy, so the note stays open — and finishes by itself once
      // the write goes through (`save`), or when the user discards it.
      if (ui.editorHoldsUnsaved) {
        closeWhenStored = true;
        return;
      }
      closeWhenStored = false;
      // Clicking another note switches the editor to it instead of dismissing editing — and storing
      // a brand new note moves it from "unsaved" to a real id, which is not a switch either. Only
      // the session counter can tell those apart.
      if (session !== opening) return;

      if (draft.noteId === null) {
        // Nothing was stored, so there is no card to land on. The original's empty composer turns
        // back into the "Take a note…" box in a single frame, as it opened.
        closeEditor();
        return;
      }

      // Where the editor is now, before the layout moves under it: the flight starts there.
      const from = editorCard?.getBoundingClientRect() ?? null;

      // The end state, in one go: a note being composed is left out of the grid, so its slot is
      // revealed now — and with it the room the composer takes back, in the same flush. That matters:
      // the grid animates every card that moved, and with two separate layout changes the notes slide
      // down for the new card and straight back up for the composer's room, which reads as a bounce.
      ui.settling = true;
      try {
        await tick();
        if (session !== opening) return;
        const target = document.querySelector(`.card[data-note-id="${draft.noteId}"]`);
        await flyToCard(editorCard, from, target instanceof HTMLElement ? target : null);
      } finally {
        ui.settling = false;
      }
      if (session === opening) closeEditor();
    } finally {
      closing = false;
    }
  }

  function onWindowKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !ui.editorOpen) return;
    // Escape belongs to whatever is on top: a row in the hand, a dialog opened from the editor, or
    // one of its own popovers and menus. bits-ui closes those itself, and the drag lets the row go.
    if (richText?.isCarrying()) return;
    if (openPanel !== null || sheet !== null) return;
    if (event.target instanceof Element && event.target.closest('[data-overlay]')) return;
    event.preventDefault();
    void close();
  }

  function onTitleInput(): void {
    resizeTitle();
    draft.autosave(() => save());
  }

  /**
   * The title is a one-line field; Enter belongs to the note, not to the title. Without this the
   * caret stayed in the title and everything typed after Enter became another line of the title.
   */
  function onTitleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      focusFirstBlock();
      return;
    }
    if (event.key === 'ArrowDown' && isCaretAtEndOfTitle()) {
      event.preventDefault();
      focusFirstBlock();
    }
  }

  function isCaretAtEndOfTitle(): boolean {
    const element = titleInput;
    if (!element) return false;
    return (element.selectionStart ?? 0) >= element.value.length;
  }

  /** The title hands the caret to the first line of the body. */
  function focusFirstBlock(): void {
    richText?.focusStart();
  }

  /**
   * Where the typing should start: the body, for a new note as much as for an existing one. The
   * original's "Take a note…" *is* its body's placeholder, so clicking it leaves the caret there
   * (measured on keep.google.com, 2026-10-14). Without
   * this the editor opens with nothing focused and the first keystrokes are simply lost.
   */
  function focusOnOpen(): void {
    if (!ui.editorOpen) return;
    richText?.focusStart();
  }

  function resizeTitle(): void {
    const element = titleInput;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  }

  /* ---------------------------------------------------------------------- note actions */

  async function guard(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      toast.error(tError(error as Error));
    }
  }

  function writeReminder(at: number | null, repeat: ReminderRepeat | null): void {
    openPanel = null;
    void guard(async () => {
      if (draft.noteId === null) {
        // A reminder can only hang off a stored note, so an empty draft has to be stored first —
        // exactly like the appearance it is picked alongside.
        if (draft.hasContent) await save();
        if (draft.noteId === null) return;
      }
      const updated = await notesState.patch(draft.noteId, {
        // `0` is the API's own way of saying "take it away"; `null` would mean "leave it alone".
        reminderAt: at === null ? 0 : at,
        reminderRepeat: at === null ? null : repeat
      });
      if (updated) draft.updatedAt = updated.updatedAt;
    });
  }

  function selectAppearance(nextColor: NoteColor, nextBackground: NoteBackground | null): void {
    draft.color = nextColor;
    draft.background = nextBackground;
    openPanel = null;
    sheet = null;
    void guard(async () => {
      if (draft.noteId === null) {
        // Storing the draft creates the note; only then does it have an id the appearance can be
        // attached to. Skipping this quietly dropped whatever was picked while composing.
        if (draft.hasContent) await save();
        if (draft.noteId === null) return;
      }
      const updated = await notesState.patch(draft.noteId, { color: nextColor, background: nextBackground });
      if (updated) draft.updatedAt = updated.updatedAt;
    });
  }

  function toggleLabel(labelId: number): void {
    const next = draft.labelIds.includes(labelId)
      ? draft.labelIds.filter((id) => id !== labelId)
      : [...draft.labelIds, labelId];
    draft.labelIds = next;
    void guard(async () => {
      if (draft.noteId === null) {
        if (draft.hasContent) await save();
        return;
      }
      await notesState.setLabels(draft.noteId, next);
    });
  }

  /** A label picked after a `#` in the text: the note takes it, a new one is created first. */
  function chooseLabel(choice: LabelChoice): void {
    if (choice.kind === 'create') {
      void createLabel(choice.name);
      return;
    }
    if (!draft.labelIds.includes(choice.label.id)) toggleLabel(choice.label.id);
  }

  async function createLabel(name: string): Promise<void> {
    await guard(async () => {
      const label = await labelsState.create(name);
      toggleLabel(label.id);
    });
  }

  function togglePin(): void {
    openPanel = null;
    draft.pinned = !draft.pinned;
    void guard(async () => {
      if (draft.noteId === null) return;
      await notesState.patch(draft.noteId, { pinned: draft.pinned });
      toast(draft.pinned ? t('card.notePinned') : t('card.noteUnpinned'));
    });
  }

  function toggleArchive(): void {
    openPanel = null;
    draft.archived = !draft.archived;
    void guard(async () => {
      if (draft.noteId === null) return;
      const id = draft.noteId;
      await notesState.patch(id, { archived: draft.archived });
      toast(
        draft.archived ? t('card.noteArchived') : t('card.noteUnarchived'),
        draft.archived
          ? { action: { label: t('card.undo'), onClick: () => void notesState.patch(id, { archived: false }) } }
          : undefined
      );
      if (draft.archived) closeEditor();
    });
  }

  function toggleCheckboxes(): void {
    openPanel = null;
    const nextKind: NoteKind = draft.kind === 'LIST' ? 'TEXT' : 'LIST';
    // One rule for the format change, in the entity: a line that stops being a list line loses its
    // indent and its tick, or the server refuses the whole document (`withKind`).
    // It is an edit of the body like any other — undoable, and sent as steps with the new kind.
    draft.kind = nextKind;
    rewriteBody(withKind(draft.content, nextKind));
  }

  /** The list note's own actions, from the ⋮ beside its title on a phone. */
  function uncheckAllItems(): void {
    rewriteBody(uncheckAll(draft.content));
  }

  function deleteCheckedItems(): void {
    rewriteBody(withoutChecked(draft.content));
  }

  function rewriteBody(next: NoteDocument): void {
    richText?.replaceBody(next);
    draft.autosave(() => save());
  }

  /** What is on screen, saved or not: the reader exports the note they are looking at. */
  function downloadMarkdown(): void {
    openPanel = null;
    const stored = currentNote;
    const now = Date.now();
    const file = noteToFile(
      {
        title: draft.title,
        content: draft.content,
        kind: draft.kind,
        color: draft.color,
        background: draft.background,
        pinned: draft.pinned,
        archived: draft.archived,
        reminderAt: stored?.reminderAt,
        reminderRepeat: stored?.reminderRepeat,
        createdAt: stored?.createdAt ?? now,
        updatedAt: draft.updatedAt ?? now
      },
      selectedLabels.map((label) => label.name)
    );
    saveMarkdownFile(noteFileName(draft.title, t('card.note')), file);
  }

  function copyNote(): void {
    openPanel = null;
    void guard(async () => {
      await save();
      if (draft.noteId === null) return;
      await notesState.copy(draft.noteId);
      toast(t('card.copyCreated'));
      closeEditor();
    });
  }

  function deleteNote(): void {
    openPanel = null;
    void guard(async () => {
      if (draft.noteId === null) {
        closeEditor();
        return;
      }
      await notesState.trash(draft.noteId);
      toast(t('card.noteMovedToTrash'));
      closeEditor();
    });
  }

  const selectedLabels = $derived(labelsState.labels.filter((label) => draft.labelIds.includes(label.id)));
  const dialogTitle = $derived(isNew ? t('editor.newNoteTitle') : draft.title || t('card.note'));
  const editedLabel = $derived(
    draft.updatedAt !== null && !isNew ? formatEditedAt(draft.updatedAt, ui.locale) : null
  );
</script>

<!-- Capture phase on purpose: bits-ui listens on `document` for Escape, so by the time a listener
     on `window` runs, an open popover has already closed itself and the editor would look like the
     thing Escape was aimed at. -->
<svelte:window onkeydowncapture={onWindowKeyDown} />

{#if ui.editorOpen}
  {#if ui.floatingEditor}
    <div
      class="editor-scrim"
      aria-hidden="true"
      in:fade={{ duration: MOTION.medium, easing: ENTER_EASING }}
      out:fade={{ duration: MOTION.short, easing: EXIT_EASING }}
    ></div>
  {/if}

  <section
    class="editor-host"
    class:floating={ui.floatingEditor}
    class:settling={ui.settling && ui.inComposer}
    aria-label={dialogTitle}
    bind:this={editorHost}
  >
    <div
      class="editor note-surface"
      class:from-composer={ui.inComposer}
      bind:this={editorCard}
      role="region"
      aria-label={dialogTitle}
      data-color={draft.color}
      data-background={draft.background ?? undefined}
      onpaste={(event) => {
        const pictures = picturesIn(event.clipboardData);
        if (pictures.length === 0) return;
        event.preventDefault();
        void attachImages(pictures);
      }}
      ondragover={(event) => {
        if (draft.canEdit && event.dataTransfer?.types.includes('Files')) event.preventDefault();
      }}
      ondrop={(event) => {
        const pictures = picturesIn(event.dataTransfer);
        if (pictures.length === 0) return;
        event.preventDefault();
        void attachImages(pictures);
      }}
    >
  {#snippet formatButton(icon: IconName, label: string, active: boolean, disabled: boolean, apply: () => void)}
    <button
      type="button"
      class="icon-button on-surface format-button needs-caret"
      class:active
      title={label}
      aria-label={label}
      aria-pressed={active}
      {disabled}
      onmousedown={(event) => event.preventDefault()}
      onclick={apply}
    >
      <Icon name={icon} size={barIcon} />
    </button>
  {/snippet}

  {#snippet undoRedo()}
    <!-- Greyed out while there is nothing to take back or put back. -->
    <button
      type="button"
      class="icon-button on-surface undo"
      title={t('editor.undo')}
      aria-label={t('editor.undo')}
      disabled={!richText?.canUndo()}
      onclick={() => richText?.undo()}
    >
      <Icon name="undo" size={barIcon} />
    </button>
    <button
      type="button"
      class="icon-button on-surface"
      title={t('editor.redo')}
      aria-label={t('editor.redo')}
      disabled={!richText?.canRedo()}
      onclick={() => richText?.redo()}
    >
      <Icon name="redo" size={barIcon} />
    </button>
  {/snippet}

  {#snippet reminderBell()}
      {#if draft.canEdit}
      <!-- Keep puts the reminder's bell at the note's top right, beside the title. -->
      <Popover.Root {...openFor('reminder')}>
        <Popover.Trigger
          class="icon-button on-surface"
          title={currentNote?.reminderAt != null ? t('reminder.clear') : t('reminder.add')}
          aria-label={currentNote?.reminderAt != null ? t('reminder.clear') : t('reminder.add')}
        >
          <!-- The size of the bar it stands in: the phone's top bar draws 24px glyphs, the bottom bar
               18px (measured off the original). -->
          <Icon
            name={currentNote?.reminderAt != null ? 'notifications-active' : 'add-alert'}
            size={barIcon}
          />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content data-overlay='editor-picker' class="reminder-picker" sideOffset={8} align="end" collisionPadding={8}>
            <ReminderPicker
              reminderAt={currentNote?.reminderAt}
              reminderRepeat={currentNote?.reminderRepeat}
              onSave={(at, repeat) => writeReminder(at, repeat)}
              onClear={() => writeReminder(null, null)}
            />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    {/if}
  {/snippet}

    {#if ui.phone}
      <!-- The original's phone editor carries its own bar: a back arrow at the left and the note's
           own actions at the right. Without it a note scrolled past its title had no way back, which
           is what the owner's screenshot showed. -->
      <div class="editor-bar">
        <button
          type="button"
          class="icon-button on-surface"
          title={t('editor.close')}
          aria-label={t('editor.back')}
          onclick={close}
        >
          <Icon name="arrow-back" size={26} />
        </button>
        <div class="editor-bar-actions">
          {#if draft.canEdit}
            <!-- The original's phone bar carries the pin as well, beside the bell and the archive. -->
            <button
              type="button"
              class="icon-button on-surface"
              title={draft.pinned ? t('card.unpin') : t('card.pin')}
              aria-label={draft.pinned ? t('card.unpinNote') : t('card.pinNote')}
              aria-pressed={draft.pinned}
              onclick={togglePin}
            >
              <Icon name={draft.pinned ? 'pin-filled' : 'pin'} size={26} />
            </button>
            {@render reminderBell()}
            <button
              type="button"
              class="icon-button on-surface"
              title={draft.archived ? t('card.unarchive') : t('card.archive')}
              aria-label={draft.archived ? t('card.unarchiveNote') : t('card.archiveNote')}
              onclick={toggleArchive}
            >
              <Icon name={draft.archived ? 'unarchive' : 'archive'} size={26} />
            </button>
          {/if}
        </div>
      </div>
    {/if}

    {#if !draft.canEdit}
      <p class="readonly-note">
        <Icon name="eye" size={16} />
        <span>{t('editor.sharedViewOnly', { name: draft.ownerName })}</span>
      </p>
    {/if}

    <div class="body">
      <!-- The original puts a note's pictures above its title, and the two scroll with the text. -->
      {#if currentNote?.images?.length}
        <NoteImages
          noteId={currentNote.id}
          images={currentNote.images}
          onOpen={(index) => (viewerIndex = index)}
          onRemove={draft.canEdit ? (image) => void removeImage(image) : undefined}
        />
      {/if}
      <div class="head">
        <textarea
          class="title"
          bind:this={titleInput}
          bind:value={draft.title}
          rows="1"
          placeholder={t('editor.titlePlaceholder')}
          readonly={!draft.canEdit}
          aria-label={t('editor.titleLabel')}
          oninput={onTitleInput}
          onkeydown={onTitleKeyDown}
        ></textarea>
        {#if draft.canEdit && ui.phone && draft.kind === 'LIST'}
          <!-- The original's phone puts a list's own actions on a ⋮ beside its title. -->
          <button
            type="button"
            class="icon-button on-surface list-options"
            title={t('list.options')}
            aria-label={t('list.options')}
            onclick={() => (sheet = 'list')}
          >
            <Icon name="more-vert" size={24} />
          </button>
        {/if}
        {#if draft.canEdit && !ui.phone}
          <!-- The original's top right corner of a note: its **pin**. The reminder is one of the
               bottom bar's own actions, where the original keeps its bell. -->
          <button
            type="button"
            class="icon-button on-surface"
            title={draft.pinned ? t('card.unpin') : t('card.pin')}
            aria-label={draft.pinned ? t('card.unpinNote') : t('card.pinNote')}
            aria-pressed={draft.pinned}
            onclick={togglePin}
          >
            <Icon name={draft.pinned ? 'pin-filled' : 'pin'} size={24} />
          </button>
        {/if}
      </div>
      <RichText
        bind:this={richText}
        document={draft.content}
        docVersion={draft.docVersion}
        editable={draft.canEdit}
        label={t('editor.bodyLabel')}
        placeholder={t('composer.placeholder')}
        frame={editorCard}
        labels={draft.canEdit ? labelsState.labels : []}
        onlabel={chooseLabel}
        onupdate={(next) => {
          // Tiptap owns the DOM; this is the only way the draft changes.
          draft.content = next;
          draft.autosave(() => save());
        }}
      />
    </div>

    {#if currentNote}
      <ReminderChip note={currentNote} />
    {/if}

    {#if draft.canEdit && selectedLabels.length > 0}
      <ul class="selected-labels">
        {#each selectedLabels as label (label.id)}
          <li>
            <button type="button" class="chip" onclick={() => toggleLabel(label.id)}>
              <span>{label.name}</span>
              <Icon name="close" size={14} />
            </button>
          </li>
        {/each}
      </ul>
    {/if}

    <!-- The original writes "Edited …" on a line of its own, right-aligned, and the note's link
         previews come under it — then the bar's icons (measured off the owner's screenshots). -->
    <!-- A phone shows it as the heading of the ⋮ sheet instead, where the original's app has it. -->
    {#if !ui.phone && (draft.saving || editedLabel || !draft.canEdit)}
      <div class="edited-row">
        {#if draft.saving}
          <span class="status">{t('editor.saving')}</span>
        {:else if editedLabel}
          <span class="status">{editedLabel}</span>
        {:else}
          <span class="status">{t('editor.readOnly')}</span>
        {/if}
      </div>
    {/if}

    {#if linkPreviews.length > 0}
      <div class="link-previews">
        <LinkCards previews={linkPreviews} />
      </div>
    {/if}

    <div class="toolbar">
      <div class="toolbar-actions">
        <input
          bind:this={imageInput}
          class="visually-hidden"
          type="file"
          multiple
          accept={IMAGE_TYPES}
          onchange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = '';
            void attachImages(files);
          }}
        />
        {#if draft.canEdit && ui.phone && formatBar}
          <!-- Every button keeps the caret where it is: a press must not take the focus off the text
               it formats. -->
          <div class="format-bar" role="toolbar" aria-label={t('editor.format')}>
            {@render formatButton('h1', t('format.heading1'), formatting?.heading === 1, !formatting?.canHeading, () =>
              richText?.setLineKind(1)
            )}
            {@render formatButton('h2', t('format.heading2'), formatting?.heading === 2, !formatting?.canHeading, () =>
              richText?.setLineKind(2)
            )}
            {@render formatButton('plain-text', t('format.normal'), formatting?.heading === 0, false, () =>
              richText?.setLineKind(0)
            )}
            <span class="format-rule" aria-hidden="true"></span>
            {@render formatButton('bold', t('format.bold'), formatting?.bold ?? false, false, () =>
              richText?.toggleMark('bold')
            )}
            {@render formatButton('italic', t('format.italic'), formatting?.italic ?? false, false, () =>
              richText?.toggleMark('italic')
            )}
            {@render formatButton('underline', t('format.underline'), formatting?.underline ?? false, false, () =>
              richText?.toggleMark('underline')
            )}
            <span class="format-rule end" aria-hidden="true"></span>
            <button
              type="button"
              class="icon-button on-surface format-close"
              title={t('format.close')}
              aria-label={t('format.close')}
              onmousedown={(event) => event.preventDefault()}
              onclick={() => (formatBar = false)}
            >
              <Icon name="close" size={barIcon} />
            </button>
          </div>
        {:else if draft.canEdit && ui.phone}
          <!-- The original's phone bar: "add", the colours and the formatting "A" at the left, the
               overflow menu at the right end, each answering with a bottom sheet or a bar of its own.
               Undo and redo stay beside the menu. -->
          <button
            type="button"
            class="icon-button on-surface"
            title={t('editor.add')}
            aria-label={t('editor.add')}
            onclick={() => (sheet = 'add')}
          >
            <Icon name="add-box" size={barIcon} />
          </button>
          <button
            type="button"
            class="icon-button on-surface"
            title={t('card.changeColor')}
            aria-label={t('card.changeColor')}
            onclick={() => (sheet = 'appearance')}
          >
            <Icon name="palette" size={barIcon} />
          </button>
          <button
            type="button"
            class="icon-button on-surface needs-caret"
            title={t('editor.format')}
            aria-label={t('editor.format')}
            onmousedown={(event) => event.preventDefault()}
            onclick={() => (formatBar = true)}
          >
            <Icon name="format" size={barIcon} />
          </button>
          {@render undoRedo()}
          <button
            type="button"
            class="icon-button on-surface"
            title={t('card.more')}
            aria-label={t('card.moreOptions')}
            onclick={() => (sheet = 'menu')}
          >
            <Icon name="more-vert" size={barIcon} />
          </button>
        {:else if draft.canEdit}
          <div class="anchor">
            <Popover.Root {...openFor('label')}>
              <Popover.Trigger
                class="icon-button on-surface"
                title={t('card.addLabel')}
                aria-label={t('card.addLabel')}
              >
                <Icon name="label" size={18} />
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  data-overlay="editor-picker"
                  class="editor-picker"
                  side="top"
                  sideOffset={8}
                  align="start"
                  collisionPadding={8}
                >
                  <LabelPicker
                    labels={labelsState.labels}
                    selectedIds={draft.labelIds}
                    onToggle={(label) => toggleLabel(label.id)}
                    onCreate={(name) => void createLabel(name)}
                  />
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          </div>

          <div class="anchor">
            <Popover.Root {...openFor('appearance')}>
              <Popover.Trigger
                class="icon-button on-surface"
                title={t('card.changeColor')}
                aria-label={t('card.changeColor')}
              >
                <Icon name="palette" size={barIcon} />
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content data-overlay='editor-picker' class="editor-picker" side="top" sideOffset={8} align="start" collisionPadding={8}>
                  <AppearancePicker
                    color={draft.color}
                    background={draft.background}
                    canChange
                    onSelect={selectAppearance}
                  />
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          </div>
          {@render reminderBell()}
          {#if draft.isOwner}
            <button
              type="button"
              class="icon-button on-surface"
              title={t('card.addCollaborator')}
              aria-label={t('card.addCollaborator')}
              onclick={openCollaborators}
            >
              <Icon name="person-add" size={18} />
            </button>
          {/if}
          <button
            type="button"
            class="icon-button on-surface"
            title={t('images.add')}
            aria-label={t('images.add')}
            onclick={() => imageInput?.click()}
          >
            <Icon name="image" size={barIcon} />
          </button>

          <button
            type="button"
            class="icon-button on-surface"
            title={draft.archived ? t('card.unarchive') : t('card.archive')}
            aria-label={draft.archived ? t('card.unarchiveNote') : t('card.archiveNote')}
            onclick={toggleArchive}
          >
            <Icon name={draft.archived ? 'unarchive' : 'archive'} size={18} />
          </button>

          <div class="anchor">
            <DropdownMenu.Root {...openFor('menu')}>
              <DropdownMenu.Trigger
                class="icon-button on-surface"
                title={t('card.more')}
                aria-label={t('card.moreOptions')}
              >
                <Icon name="more-vert" size={barIcon} />
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content preventScroll={false} data-overlay='editor-menu' class="editor-menu" side="top" sideOffset={8} align="end" collisionPadding={8}>
                <DropdownMenu.Item class="editor-menu-item" onSelect={deleteNote}>
                  {t('card.deleteNote')}
                </DropdownMenu.Item>
                <DropdownMenu.Item class="editor-menu-item" onSelect={downloadMarkdown}>
                  {t('card.downloadMarkdown')}
                </DropdownMenu.Item>
                <DropdownMenu.Item class="editor-menu-item" onSelect={copyNote}>
                  {t('card.makeCopy')}
                </DropdownMenu.Item>
                <DropdownMenu.Item class="editor-menu-item" onSelect={toggleCheckboxes}>
                  {draft.kind === 'LIST' ? t('card.hideCheckboxes') : t('card.showCheckboxes')}
                </DropdownMenu.Item>
                {#if draft.noteId !== null}
                  <DropdownMenu.Item
                    class="editor-menu-item"
                    onSelect={() => (historyOpen = true)}
                  >
                    {t('card.versionHistory')}
                  </DropdownMenu.Item>
                {/if}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>

          <!-- After the overflow menu, as in the original. -->
          {@render undoRedo()}
        {/if}
      </div>

      <div class="toolbar-meta">
        {#if !ui.phone}
          <!-- On a phone the way out is the bar's arrow, the way it is in the original; the bottom
               bar keeps the note's own actions. -->
          <button type="button" class="close-button" onclick={close}>{t('editor.close')}</button>
        {/if}
      </div>
    </div>
    </div>
  </section>
{/if}

{#if currentNote?.images?.length}
  <ImageViewer
    noteId={currentNote.id}
    images={currentNote.images}
    index={viewerIndex}
    onIndex={(index) => (viewerIndex = index)}
    onRemove={draft.canEdit ? (image) => void removeImage(image) : undefined}
  />
{/if}

{#snippet sheetItem(icon: IconName, text: string, action: () => void)}
  <button type="button" class="ok-sheet-item" onclick={fromSheet(action)}>
    <Icon name={icon} size={24} />
    <span>{text}</span>
  </button>
{/snippet}

{#if ui.phone && ui.editorOpen}
  <input
    bind:this={cameraInput}
    class="visually-hidden"
    type="file"
    accept="image/*"
    capture="environment"
    onchange={(event) => {
      const files = Array.from(event.currentTarget.files ?? []);
      event.currentTarget.value = '';
      void attachImages(files);
    }}
  />

  <Sheet open={sheet === 'add'} onClose={() => (sheet = null)} title={t('editor.add')} color={draft.color}>
    {@render sheetItem('camera', t('images.takePhoto'), () => cameraInput?.click())}
    {@render sheetItem('image', t('images.add'), () => imageInput?.click())}
  </Sheet>

  <Sheet open={sheet === 'appearance'} onClose={() => (sheet = null)} title={t('card.changeColor')} color={draft.color}>
    <AppearancePicker
      layout="sheet"
      color={draft.color}
      background={draft.background}
      canChange
      onSelect={selectAppearance}
    />
  </Sheet>

  <!-- The original's overflow sheet opens with the note's "Edited …" line as its heading. -->
  <Sheet
    open={sheet === 'menu'}
    onClose={() => (sheet = null)}
    title={editedLabel ?? t('card.moreOptions')}
    heading={editedLabel !== null}
    color={draft.color}
  >
    {@render sheetItem('trash', t('card.deleteNote'), deleteNote)}
    {@render sheetItem('content-copy', t('card.makeCopy'), copyNote)}
    {#if draft.isOwner}
      {@render sheetItem('person-add', t('card.collaborator'), openCollaborators)}
    {/if}
    {@render sheetItem('label', t('card.labels'), () => (sheet = 'label'))}
    {#if draft.kind === 'TEXT'}
      {@render sheetItem('checklist', t('card.showCheckboxes'), toggleCheckboxes)}
    {/if}
    {@render sheetItem('download', t('card.downloadMarkdown'), downloadMarkdown)}
    {#if draft.noteId !== null}
      {@render sheetItem('schedule', t('card.versionHistory'), () => (historyOpen = true))}
    {/if}
  </Sheet>

  <Sheet open={sheet === 'list'} onClose={() => (sheet = null)} title={t('list.options')} color={draft.color}>
    {@render sheetItem('checklist', t('list.uncheckAll'), uncheckAllItems)}
    {@render sheetItem('trash', t('list.deleteChecked'), deleteCheckedItems)}
    {@render sheetItem('list', t('card.hideCheckboxes'), toggleCheckboxes)}
  </Sheet>

  <Sheet open={sheet === 'label'} onClose={() => (sheet = null)} title={t('card.labels')} color={draft.color}>
    <LabelPicker
      labels={labelsState.labels}
      selectedIds={draft.labelIds}
      onToggle={(label) => toggleLabel(label.id)}
      onCreate={(name) => void createLabel(name)}
    />
  </Sheet>
{/if}

<VersionHistoryDialog noteId={historyOpen ? draft.noteId : null} onClose={() => (historyOpen = false)} />

<style>
  /* Composing: the editor simply takes the place of the "Take a note…" box. `flex-start` keeps the
     card's height content-based — as a stretched flex item inside an absolutely positioned host its
     height would depend on the host's, which depends on the card's, and that resolves to zero. */
  .editor-host {
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding-bottom: 20px;
  }

  /*
   * Editing an existing note, as Google Keep presents it: a card floating over the notes with the app
   * dimmed behind it. It is out of the flow on purpose — not one card underneath may move — and the
   * host ignores pointer events, so a click beside the card belongs to whatever is underneath, which
   * is what finishes the note. Only the card itself is interactive.
   *
   * It hangs from the **viewport**, not from the composer: the composer is part of the notes, so
   * anchoring to it put the editor wherever the page happened to be scrolled — clicking a card far
   * down the list opened the note off the bottom of the screen.
   */
  .editor-host.floating {
    position: fixed;
    /* The same place the composer's box leaves: the header, the notes' top padding, the box itself,
       and the gap the box below it carries — the tokens the notes' column is laid out with, not a
       second copy of those numbers. */
    top: calc(
      var(--keep-topbar-height) + var(--keep-notes-top) + var(--keep-composer-height) +
        var(--keep-composer-margin)
    );
    left: 0;
    right: 0;
    /* A tall note scrolls inside itself rather than off the bottom of the window. */
    bottom: 24px;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    z-index: 46;
    pointer-events: none;
  }

  .editor-host.floating .editor {
    max-height: 100%;
  }

  /*
   * Giving the room back while the finished note flies to its card. The height is the composer's own
   * (its box plus the margin the box below it carries), so the grid is in its final arrangement the
   * moment the flight starts — every card is then animated to that arrangement in one motion. The
   * editor overflows the shortened box on purpose: it is still on its way out, unclipped.
   */
  .editor-host.settling {
    position: relative;
    z-index: 46;
    height: var(--keep-composer-height);
    min-height: 0;
    overflow: visible;
  }

  .editor-scrim {
    position: fixed;
    inset: 0;
    z-index: 44;
    background: var(--keep-scrim);
  }

  .editor {
    pointer-events: auto;
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 600px;
    max-height: calc(100vh - 48px);
    border-radius: var(--keep-radius);
    box-shadow: var(--keep-shadow-editor);
    overflow: hidden;
  }

  /*
   * A new note's editor *is* the "Take a note…" box, grown — so it keeps that box's border and its
   * shadow. With a different pair the morph reads as one box being swapped for another, which is what
   * it looked like. A note opened from the grid is a different thing: it floats over the notes and
   * keeps the editor's own lift.
   */
  .editor.from-composer {
    border: 1px solid var(--keep-composer-border);
    box-shadow: var(--keep-shadow-composer);
  }

  /* The original's open composer is as tall as what is in it — measured 137px for an empty note:
     the title, one line of body with 12px under it, and the bar — not a fixed writing area. The 12px
     belong to the editable itself, so a click there still lands in the note (rule 16). */
  .editor.from-composer .body {
    min-height: 0;
  }

  .editor.from-composer .body :global(.note-body) {
    padding-bottom: 12px;
  }

  @media (max-width: 600px) {
    .editor-host,
    .editor-host.floating {
      position: fixed;
      inset: 0;
      z-index: 50;
      display: block;
      padding: 0;
      background: var(--keep-bg);
      overflow-y: auto;
    }

    /* A phone's editor is the whole screen, so the composer's frame has nothing to frame. */
    .editor,
    .editor.from-composer {
      max-width: none;
      min-height: 100%;
      max-height: none;
      border: 0;
      border-radius: 0;
      box-shadow: none;
    }
  }

  /*
   * The phone's bar: the way back to the notes, wearing the note's own colour like the bottom bar.
   * It stands **above** the element the note scrolls in (`.body`, measured: 3144px of text in a 264px
   * box), so it is visible whatever the note does — sticky only makes that true if the structure ever
   * changes to scroll the whole editor instead.
   */
  .editor-bar {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 4px 8px;
    background: var(--note-bg, var(--keep-surface));
  }

  .editor-bar-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  /* The title and the pictures scroll with the text, inside `.body`, and reach past its 16px of
     padding: the pictures to the note's edges, the title to its own measured inset. */
  .head {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin: 0 -16px;
    padding: 12px 8px 0 16px;
  }

  .body > :global(.images) {
    margin: 0 -16px;
    flex: 0 0 auto;
  }

  .title {
    flex: 1 1 auto;
    min-width: 0;
    border: 0;
    outline: none;
    resize: none;
    overflow: hidden;
    background: transparent;
    color: inherit;
    /* Measured off the original's editor: its title is a good deal larger than the one on a card. */
    /* Measured from the original's DOM: 20px Google Sans on a 24px line, regular weight. */
    font-size: 20px;
    font-weight: 400;
    line-height: 24px;
    padding: 8px 0;
  }

  .readonly-note {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    padding: 0 16px 4px;
    font-size: 12px;
    color: var(--note-fg-secondary, var(--keep-text-secondary));
  }

  .body {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    overflow-y: auto;
    padding: 0 16px;
    min-height: 120px;
  }

  .selected-labels {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin: 0;
    padding: 4px 16px 0;
    list-style: none;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 6px 3px 10px;
    border-radius: 12px;
    background: rgba(0, 0, 0, 0.08);
    font-size: 12px;
  }

  :root[data-theme='dark'] .chip {
    background: rgba(255, 255, 255, 0.14);
  }

  .toolbar {
    /* The bar is chrome, not part of the note: as selectable text (the editor opts back in, rule 15) a
       picker that closed left the caret blinking after the icon, as if the bar could be typed in. */
    user-select: none;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0 8px;
    padding: 4px 8px 4px 9px;
    /* Over a background artwork the icons and the "Edited …" line were sitting on the picture. A note
       can carry both an artwork and a colour (rule 5), and the original's bar shows the colour: the
       bar is opaque in the note's own colour, so it reads whatever the note is wearing. */
    background: var(--note-bg);
    border-bottom-left-radius: inherit;
    border-bottom-right-radius: inherit;
  }

  /* Measured from the original's DOM: 34px buttons on a 50px pitch. */
  .toolbar-actions {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .toolbar-actions :global(.icon-button) {
    width: 34px;
    height: 34px;
  }

  .edited-row {
    display: flex;
    justify-content: flex-end;
    padding: 0 17px 8px 0;
    background: var(--note-bg);
  }

  /* Inset like the note's text. Measured: the first row's top is 35px under the middle of the
     "Edited" line, and the bar's icons are centred 36px under the last row. */
  .link-previews {
    padding: 11px 16px 14px;
    background: var(--note-bg);
  }

  .toolbar-meta {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .status {
    font-family: 'Roboto', var(--keep-font);
    font-size: 12px;
    line-height: 16px;
    color: var(--note-fg-secondary, var(--keep-text-secondary));
  }

  /* The original's "Close": 100 by 36. */
  .close-button {
    min-width: 100px;
    height: 36px;
    padding: 0 24px;
    border-radius: 4px;
    font-weight: 500;
    font-size: 14px;
    color: var(--note-fg, var(--keep-text));
  }

  .close-button:hover {
    background: rgba(0, 0, 0, 0.08);
  }

  :root[data-theme='dark'] .close-button:hover {
    background: rgba(255, 255, 255, 0.12);
  }

  .anchor {
    position: relative;
    display: inline-flex;
  }

  /* bits-ui renders these in a portal and positions them above the toolbar; only the look is ours,
     so the class names are global and distinctive enough not to collide with the card's. */
  :global(.editor-picker),
  :global(.reminder-picker),
  :global(.editor-menu) {
    z-index: 80;
  }

  :global(.editor-menu) {
    display: flex;
    flex-direction: column;
    min-width: 190px;
    padding: 8px 0;
    border-radius: var(--keep-radius);
    background: var(--keep-surface);
    color: var(--keep-text);
    box-shadow: var(--keep-shadow-popover);
  }

  :global(.editor-menu-item) {
    padding: 10px 16px;
    text-align: left;
    white-space: nowrap;
  }

  :global(.editor-menu-item[data-highlighted]) {
    background: var(--keep-hover);
  }

  @media (max-width: 600px) {
    .editor {
      max-height: 92vh;
    }

    /*
     * The phone's bars, measured off the original's Android app at 412px (2026-10-14): every action
     * sits on a 43px tonal button — rounded squares (12px radius) in the top bar, circles in the
     * bottom one — 9px apart, its glyph 26px, the top bar's last button 26px from the edge and the
     * bottom bar's first 21px from it. The tone is the note's own colour lifted by 15% white in the
     * dark theme (measured 23→58, 46→78), and darkened in the light one.
     */
    .editor-bar {
      padding: 8px 26px 8px 8px;
    }

    .editor-bar-actions {
      gap: 9px;
    }

    .editor-bar-actions :global(.icon-button),
    .toolbar-actions :global(.icon-button) {
      width: 43px;
      height: 43px;
      background: var(--keep-tonal-button);
    }

    .editor-bar-actions :global(.icon-button) {
      border-radius: 12px;
    }

    .toolbar {
      padding: 8px 16px 16px 21px;
    }

    .toolbar-actions {
      flex: 1 1 auto;
      gap: 9px;
    }

    /*
     * The formatting bar, measured off the owner's screenshot of the original's Android app with the
     * keyboard up: the same 43px places as the bar it replaces, 9px apart, but bare — only the line
     * kind or mark in force sits on a neutral rounded square — with thin rules after the line kinds
     * and before the ✕, which stands where the ⋮ was.
     */
    /* The original greys out the "A" and the formatting while the body has no caret: there is
       nothing for them to format. The focus is the browser's, read here rather than mirrored. */
    .editor:not(:has(:global(.note-body:focus))) :global(.needs-caret) {
      opacity: 0.38;
      pointer-events: none;
    }

    .format-bar {
      display: flex;
      align-items: center;
      flex: 1 1 auto;
      gap: 9px;
    }

    .format-bar :global(.icon-button) {
      background: transparent;
      border-radius: 12px;
    }

    .format-bar :global(.format-button.active) {
      background: var(--keep-format-active);
    }

    .format-rule {
      align-self: center;
      width: 1px;
      height: 32px;
      margin-right: 7px;
      background: var(--note-fg-secondary, var(--keep-divider));
      opacity: 0.4;
    }

    .format-rule.end {
      margin: 0 0 0 auto;
    }

    /* The list's own ⋮ beside the title, centred 33px from the screen's right edge. */
    .head {
      padding-right: 12px;
    }

    .list-options {
      flex: 0 0 auto;
      width: 43px;
      height: 43px;
      color: var(--note-fg-secondary, var(--keep-text-secondary));
    }

    /* Undo and redo stand at the right, and the overflow menu at the bar's very end. */
    .toolbar-actions :global(.undo) {
      margin-left: auto;
    }

    /* The Android app's note text starts 21px from the screen's edge, the title's as well. */
    .body {
      padding: 0 21px;
    }

    .head {
      margin: 0 -21px;
      padding-left: 21px;
    }

    .body > :global(.images) {
      margin: 0 -21px;
    }

    /* The phone's title is larger: its capitals measure 15.6px, a 22px face. */
    .title {
      font-size: 22px;
      line-height: 28px;
    }
  }
</style>
