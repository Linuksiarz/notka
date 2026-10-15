<script lang="ts">
  import { toast } from 'svelte-sonner';
  import { confirmation } from './confirmation.svelte';
  import type { Note, NoteBackground, NoteColor, NoteKind } from '../../entity/api/types';
  import { notes as notesState } from '../../control/state/notes.svelte';
  import { labels as labelsState } from '../../control/state/labels.svelte';
  import { router } from '../../control/router.svelte';
  import { ui } from '../../control/state/ui.svelte';
  import { fade, scale } from 'svelte/transition';
  import { ENTER_EASING, EXIT_EASING, MOTION } from '../editor/motion';
  import { withKind } from '../../entity/noteDocument';
  import { t, tError } from '../i18n';
  import { formatDaysLeft, formatDeletedAt } from '../i18n/format';
  import { instance } from '../../control/state/instance.svelte';
  import { DropdownMenu, Popover } from 'bits-ui';
  import ReminderPicker from './ReminderPicker.svelte';
  import NoteImages from './NoteImages.svelte';
  import { IMAGE_TYPES } from '../../entity/imageLayout';
  import { noteFileName, noteToFile } from '../../entity/noteFile';
  import { saveMarkdownFile } from '../download';
  import type { ReminderRepeat } from '../../entity/api/types';
  import AppearancePicker from './AppearancePicker.svelte';
  import Avatar from './Avatar.svelte';
  import Icon from './Icon.svelte';
  import LabelPicker from './LabelPicker.svelte';
  import LinkCards from './LinkCards.svelte';
  import NoteContent from './NoteContent.svelte';
  import ReminderChip from './ReminderChip.svelte';

  interface Props {
    note: Note;
    /** `trash` swaps the archive action for restore / delete-forever. */
    variant?: 'default' | 'trash';
    /**
     * The note is open in the editor above the grid. It keeps its box so the other cards do not
     * move, but it fades out of the grid while it is being edited.
     */
    beingEdited?: boolean;
  }

  let { note, variant = 'default', beingEdited = false }: Props = $props();

  /** bits-ui owns each panel's open state; this only makes sure one is open at a time. */
  let openPanel = $state<'label' | 'appearance' | 'reminder' | 'menu' | null>(null);

  /** The appearance picker is positioned against the card, not against the button that opens it. */
  let cardElement = $state<HTMLDivElement | null>(null);

  /**
   * A touch held on a card picks it, the way the original's Android app starts a selection — its
   * cards carry no action bar, so this is how a phone reaches the bulk actions. The hold is the
   * platform's own: Android's `ViewConfiguration` long-press timeout (400ms) and touch slop (8px).
   */
  const LONG_PRESS_MS = 400;
  const LONG_PRESS_SLOP = 8;
  let press: { x: number; y: number; timer: ReturnType<typeof setTimeout> } | null = null;
  /**
   * The click a finished hold may produce belongs to the hold, not to opening the note. It belongs to
   * that gesture only: some browsers send no click after a hold, so every new press starts clear.
   */
  let heldOpen = false;

  function startPress(event: PointerEvent): void {
    heldOpen = false;
    if (event.pointerType === 'mouse') return;
    cancelPress();
    press = {
      x: event.clientX,
      y: event.clientY,
      timer: setTimeout(() => {
        press = null;
        heldOpen = true;
        ui.toggleSelected(note.id);
      }, LONG_PRESS_MS)
    };
  }

  function movePress(event: PointerEvent): void {
    if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > LONG_PRESS_SLOP) cancelPress();
  }

  function cancelPress(): void {
    if (press) clearTimeout(press.timer);
    press = null;
  }
  const openFor = (panel: 'label' | 'appearance' | 'reminder' | 'menu') => ({
    open: openPanel === panel,
    // A panel closing only clears the state while it is still the open one: the menu closes *after*
    // its "Add label" item has handed the open panel to the label picker.
    onOpenChange: (next: boolean) => {
      if (next) openPanel = panel;
      else if (openPanel === panel) openPanel = null;
    }
  });

  const collaborators = $derived(note.shares?.map((share) => share.user) ?? []);

  function openEditor(): void {
    ui.openEditor(note.id, note.kind);
  }

  /** `0` is the API's own way of saying "take it away"; `null` would mean "leave it alone". */
  function writeReminder(at: number | null, repeat: ReminderRepeat | null): void {
    openPanel = null;
    void run(async () => {
      await notesState.patch(note.id, { reminderAt: at ?? 0, reminderRepeat: at === null ? null : repeat });
    });
  }

  /** The note as an Notka Markdown file, carrying the labels this reader sees on it. */
  let imageInput = $state<HTMLInputElement | null>(null);

  /** Pictures from the file picker, attached in the order they were picked. */
  async function attachImages(picked: FileList | null): Promise<void> {
    const files = Array.from(picked ?? []);
    if (imageInput) imageInput.value = '';
    if (files.length === 0) return;
    try {
      await notesState.addImages(note.id, files);
    } catch (error) {
      toast.error(tError(error as Error));
    }
  }

  function downloadMarkdown(): void {
    openPanel = null;
    saveMarkdownFile(
      noteFileName(note.title, t('card.note')),
      noteToFile(note, note.labels.map((label) => label.name))
    );
  }

  async function run(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      toast.error(tError(error as Error));
    }
  }

  function selectAppearance(color: NoteColor, background: NoteBackground | null): void {
    openPanel = null;
    void run(() => notesState.setAppearance(note.id, color, background).then(() => undefined));
  }

  function toggleLabel(labelId: number): void {
    const selected = note.labels.some((label) => label.id === labelId);
    const next = selected
      ? note.labels.filter((label) => label.id !== labelId).map((label) => label.id)
      : [...note.labels.map((label) => label.id), labelId];
    void run(() => notesState.setLabels(note.id, next));
  }

  async function createLabel(name: string): Promise<void> {
    await run(async () => {
      const label = await labelsState.create(name);
      await notesState.setLabels(note.id, [...note.labels.map((item) => item.id), label.id]);
    });
  }

  function togglePin(): void {
    openPanel = null;
    void run(async () => {
      await notesState.patch(note.id, { pinned: !note.pinned });
      toast(note.pinned ? t('card.noteUnpinned') : t('card.notePinned'));
    });
  }

  function archive(): void {
    openPanel = null;
    void run(async () => {
      const archiving = !note.archived;
      await notesState.patch(note.id, { archived: archiving });
      toast(
        archiving ? t('card.noteArchived') : t('card.noteUnarchived'),
        archiving ? { action: { label: t('card.undo'), onClick: () => void undoArchive() } } : undefined
      );
    });
  }

  function undoArchive(): void {
    void run(async () => {
      await notesState.patch(note.id, { archived: false });
    });
  }

  function trash(): void {
    openPanel = null;
    void run(async () => {
      await notesState.trash(note.id);
      toast(t('card.noteMovedToTrash'), {
        action: { label: t('card.restore'), onClick: () => void restore() }
      });
    });
  }

  function restore(): void {
    void run(async () => {
      await notesState.restore(note.id);
      toast(t('card.noteRestored'));
    });
  }

  async function destroy(): Promise<void> {
    openPanel = null;
    if (!(await confirmation.ask(t('card.confirmDeleteForever'), t('confirm.delete')))) return;
    void run(async () => {
      await notesState.destroy(note.id);
      toast(t('card.noteDeletedForever'));
    });
  }

  function copy(): void {
    openPanel = null;
    void run(async () => {
      await notesState.copy(note.id);
      toast(t('card.copyCreated'));
    });
  }

  function toggleCheckboxes(): void {
    openPanel = null;
    const kind: NoteKind = note.kind === 'LIST' ? 'TEXT' : 'LIST';
    // The same format change the editor makes, from the same place: a line that stops being a list
    // line loses its indent and its tick (`withKind`), or the server refuses the document.
    void run(() =>
      notesState
        .patch(note.id, { kind, content: withKind(note.content, kind) })
        .then(() => undefined)
    );
  }
</script>

<!-- A card arrives a touch smaller and fades out, so notes appearing in and leaving a view move
     rather than blink. Keep does the same when a note is archived or deleted. -->
<div
  bind:this={cardElement}
  in:scale={{ duration: MOTION.medium, start: 0.94, easing: ENTER_EASING }}
  out:fade={{ duration: MOTION.short, easing: EXIT_EASING }}
  class="card note-surface"
  class:trash={variant === 'trash'}
  class:being-edited={beingEdited}
  class:selected={ui.isSelected(note.id)}
  data-note-id={note.id}
  data-color={note.color}
  data-background={note.background ?? undefined}
  onpointerdown={startPress}
  onpointermove={movePress}
  onpointerup={cancelPress}
  onpointercancel={cancelPress}
  oncontextmenu={(event) => {
    // A held finger also asks the browser for its context menu; the hold is ours.
    if (press || heldOpen) event.preventDefault();
  }}
  onclick={(event) => {
    if (heldOpen) {
      heldOpen = false;
      return;
    }
    // `Element`, not `HTMLElement`: a click can land on the `<svg>`/`<path>` inside an icon, and
    // SVG elements are not HTMLElements — that mismatch used to open the note by accident.
    // **While notes are picked, a click anywhere on a card picks it** — before anything inside the
    // card gets to act, because the point of picking is to pick: the pin, the menu and a link
    // preview's own row would otherwise do their own thing under the reader's finger.
    if (ui.selecting) {
      ui.toggleSelected(note.id);
      return;
    }
    // Anything interactive inside the card acts on its own: the action row, but also the pin in
    // the corner, which is outside it and used to open the note as well.
    if (event.target instanceof Element && event.target.closest('button, a, .actions')) return;
    openEditor();
  }}
  onkeydown={(event) => {
    if (event.target instanceof Element && event.target.closest('button, a, .actions')) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openEditor();
    }
  }}
  role="button"
  tabindex="0"
  aria-label={note.title || t('card.note')}
>
  <!-- The original's phone cards carry neither the pin nor the action bar: a tap opens the note,
       and a held finger picks it for the bulk actions. -->
  {#if variant !== 'trash' && note.canEdit && !ui.phone}

    <!-- Keep keeps the pin in the corner of the card rather than in the action row. It stays
         visible once the note is pinned, so a pinned card is recognisable at a glance. -->
    <button
      type="button"
      class="pin-button"
      class:pinned={note.pinned}
      title={note.pinned ? t('card.unpin') : t('card.pin')}
      aria-label={note.pinned ? t('card.unpinNote') : t('card.pinNote')}
      aria-pressed={note.pinned}
      onclick={togglePin}
    >
      <Icon name={note.pinned ? 'pin-filled' : 'pin'} size={24} />
    </button>
  {/if}

  {#if note.images?.length}
    <NoteImages noteId={note.id} images={note.images} onOpen={() => openEditor()} />
  {/if}

  <div class="body">
    {#if note.title}
      <h3 class="title">{note.title}</h3>
    {/if}
    <NoteContent document={note.content} groupCompleted={note.kind === 'LIST'} />
    <ReminderChip {note} compact />
    {#if variant === 'trash' && note.trashedAt !== null}
      <p class="purge">
        {formatDeletedAt(note.trashedAt, ui.locale)} &middot; {formatDaysLeft(note.trashedAt, instance.info.trashRetentionDays)}
      </p>
    {/if}
  </div>

  <div class="meta">
    {#if note.labels.length > 0}
      <ul class="chips">
        {#each note.labels as label (label.id)}
          <li class="chip">
            <button
              type="button"
              onclick={(event) => {
                // The card opens the note; the chip goes to the label instead.
                event.stopPropagation();
                router.go({ name: 'label', labelId: label.id });
              }}
            >
              {label.name}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
    {#if collaborators.length > 0}
      <div class="collaborators">
        {#each collaborators.slice(0, 3) as collaborator (collaborator.id)}
          <Avatar user={collaborator} size={24} />
        {/each}
        {#if collaborators.length > 3}
          <span class="more-collaborators">+{collaborators.length - 3}</span>
        {/if}
      </div>
    {/if}
  </div>

  {#if ui.phone}
    <!-- no action bar on a phone -->
  {:else if variant === 'trash'}
    <div class="actions trash-actions">
      <button
        type="button"
        class="icon-button on-surface"
        title={t('card.restore')}
        aria-label={t('card.restoreNote')}
        onclick={restore}
      >
        <Icon name="restore" size={20} />
      </button>
      <button
        type="button"
        class="icon-button on-surface"
        title={t('card.deleteForever')}
        aria-label={t('card.deleteNoteForever')}
        onclick={destroy}
      >
        <Icon name="delete-forever" size={20} />
      </button>
    </div>
  {:else}
    <div class="actions">
      <!-- The original's order: colour first, then the collaborator, then the rest. -->
      <div class="picker-anchor">
        <Popover.Root {...openFor('appearance')}>
          <Popover.Trigger
            class="icon-button on-surface"
            title={t('card.changeColor')}
            aria-label={t('card.changeColor')}
            disabled={!note.canChangeAppearance}
          >
            <Icon name="palette" size={18} />
          </Popover.Trigger>
          <Popover.Portal>
            <!-- Measured from the original: the picker is centred on the card and sits 2px under its
                 bottom edge, not aligned to the button that opened it. -->
            <Popover.Content
              collisionPadding={8}
              data-overlay='note-picker'
              class="note-picker"
              customAnchor={cardElement}
              side="bottom"
              sideOffset={2}
              align="center"
            >
              <AppearancePicker
                color={note.color}
                background={note.background}
                canChange={note.canChangeAppearance}
                onSelect={selectAppearance}
              />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>

      {#if note.canEdit}
        <div class="picker-anchor">
          <Popover.Root {...openFor('reminder')}>
            <Popover.Trigger
              class="icon-button on-surface"
              title={note.reminderAt != null ? t('reminder.clear') : t('reminder.add')}
              aria-label={note.reminderAt != null ? t('reminder.clear') : t('reminder.add')}
            >
              <Icon name={note.reminderAt != null ? 'notifications-active' : 'add-alert'} size={18} />
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                data-overlay="note-picker"
                class="reminder-picker note-reminder"
                sideOffset={8}
                align="start"
                collisionPadding={8}
              >
                <ReminderPicker
                  reminderAt={note.reminderAt}
                  reminderRepeat={note.reminderRepeat}
                  onSave={(at, repeat) => writeReminder(at, repeat)}
                  onClear={() => writeReminder(null, null)}
                />
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>
      {/if}

      {#if note.access === 'OWNER'}
        <button
          type="button"
          class="icon-button on-surface"
          title={t('card.addCollaborator')}
          aria-label={t('card.addCollaborator')}
          onclick={() => ui.openShare(note.id)}
        >
          <Icon name="person-add" size={18} />
        </button>
      {/if}

      <!-- The original's sixth button is the picture; labels are in its "More" menu, and their
           picker hangs under the card like the palette's. -->
      <input
        bind:this={imageInput}
        class="visually-hidden"
        type="file"
        multiple
        accept={IMAGE_TYPES}
        onchange={(event) => void attachImages(event.currentTarget.files)}
      />
      <button
        type="button"
        class="icon-button on-surface"
        title={t('images.add')}
        aria-label={t('images.add')}
        onclick={() => imageInput?.click()}
      >
        <Icon name="image" size={18} />
      </button>
      <Popover.Root {...openFor('label')}>
          <Popover.Portal>
            <Popover.Content
              data-overlay="note-picker"
              class="note-picker"
              customAnchor={cardElement}
              side="bottom"
              sideOffset={2}
              align="start"
              collisionPadding={8}
            >
              <LabelPicker
                labels={labelsState.labels}
                selectedIds={note.labels.map((label) => label.id)}
                onToggle={(label) => toggleLabel(label.id)}
                onCreate={(name) => void createLabel(name)}
              />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>

      <button
        type="button"
        class="icon-button on-surface"
        title={note.archived ? t('card.unarchive') : t('card.archive')}
        aria-label={note.archived ? t('card.unarchiveNote') : t('card.archiveNote')}
        onclick={archive}
      >
        <Icon name={note.archived ? 'unarchive' : 'archive'} size={18} />
      </button>

      <div class="picker-anchor">
        <DropdownMenu.Root {...openFor('menu')}>
          <DropdownMenu.Trigger
            class="icon-button on-surface"
            title={t('card.more')}
            aria-label={t('card.moreOptions')}
          >
            <Icon name="more-vert" size={18} />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <!-- Picking "Add label" hands the open panel to the label picker: the menu must not then hand the
                 focus back to its trigger, which is outside the picker and closes it. -->
            <DropdownMenu.Content
              preventScroll={false}
              data-overlay="note-menu"
              class="note-menu"
              sideOffset={8}
              align="end"
              collisionPadding={8}
              onCloseAutoFocus={(event) => {
                if (openPanel === 'label') event.preventDefault();
              }}
            >
              <!-- Keep moves a note to the trash from the card menu; permanent deletion lives in
                   the trash view only. -->
              <DropdownMenu.Item class="note-menu-item" onSelect={trash}>
                {t('card.deleteNote')}
              </DropdownMenu.Item>
              <DropdownMenu.Item class="note-menu-item" onSelect={() => (openPanel = 'label')}>
                {t('card.addLabel')}
              </DropdownMenu.Item>
              <DropdownMenu.Item class="note-menu-item" onSelect={copy}>
                {t('card.makeCopy')}
              </DropdownMenu.Item>
              <DropdownMenu.Item class="note-menu-item" onSelect={toggleCheckboxes}>
                {note.kind === 'LIST' ? t('card.hideCheckboxes') : t('card.showCheckboxes')}
              </DropdownMenu.Item>
              <DropdownMenu.Item class="note-menu-item" onSelect={downloadMarkdown}>
                {t('card.downloadMarkdown')}
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </div>
  {/if}

  <!-- The previews are the last thing on a card, under the room the action bar takes: measured from
       the original, the last row's hairline *is* the card's bottom edge, and the gap above the block
       is where the action bar lives. **They are drawn whether or not notes are being picked**: a
       card's own box must not depend on the selection, because every card's height decides where
       the notes after it go — so hiding the previews while picking made
       every card shorter, re-dealt the whole grid and moved the note the reader had just ticked to
       another column ("why did 'Books to lend' change place when it was selected, and go back when
       it was unticked?"). A click on a preview while picking belongs to the card, which is what the
       card's own click handler does first. -->
  <LinkCards previews={note.linkPreviews ?? []} compact />
</div>

<style>
  .card {
    position: relative;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--note-border, var(--keep-border));
    border-radius: var(--keep-radius);
    /* The artwork and the pictures end at the rounded corners. Nothing is drawn outside a card from
       inside it; the selection tick box lives on the grid instead. */
    overflow: hidden;
    cursor: pointer;
    /* A held finger picks the note; the platform's own callout must not answer it first. */
    -webkit-touch-callout: none;
    /* Keep's notes are flat; a card lifts only under the pointer. */
    box-shadow: var(--keep-shadow-card);
    transition:
      opacity 160ms ease,
      visibility 0s linear 0s,
      box-shadow var(--keep-duration) var(--keep-ease),
      border-color var(--keep-duration) var(--keep-ease);
  }

  /* The note is open in the editor above the grid. It keeps its box, so the cards around it do not
     move, and fades out of the grid for as long as it is being edited. */
  .card.being-edited {
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition:
      opacity 160ms ease,
      visibility 0s linear 160ms,
      box-shadow var(--keep-duration) var(--keep-ease),
      border-color var(--keep-duration) var(--keep-ease);
  }

  /* Keep answers the pointer with a deeper shadow and nothing else. A card that lifts would also
     make its measured position depend on where the pointer happens to be. */
  .card:hover,
  .card:focus-within {
    box-shadow: var(--keep-shadow-card-hover);
  }

  /*
   * Picked for a bulk action. Measured off the original: the picked card carries a **second** light
   * line outside its own border — the border turns light and a ring adds the second pixel. A wider
   * border would change the card's box and move the notes beside it, which is why this is a ring.
   */
  .card.selected {
    border-color: var(--keep-select-border);
    box-shadow: 0 0 0 1px var(--keep-select-border);
  }

  /* Centred on the card's corner, as in the original. Absolute offsets count from the padding box, so
     one extra pixel lands the centre on the actual corner. */
  /* Measured from the original's DOM: a 34px button 6px under the card's top and 8px in from its
     right edge. */
  .pin-button {
    position: absolute;
    top: 6px;
    right: 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    color: var(--note-fg-secondary, var(--keep-text-secondary));
    opacity: 0;
    transition: opacity var(--keep-duration-short) var(--keep-ease-standard);
  }

  .card:hover .pin-button,
  .card:focus-within .pin-button,
  .pin-button.pinned,
  .pin-button:focus-visible {
    opacity: 1;
  }

  .pin-button:hover {
    background: var(--keep-hover);
  }

  .pin-button.pinned {
    color: var(--note-fg, var(--keep-text));
  }

  /* Tooltips on touch devices are useless, so the pin is simply always visible there. */
  @media (hover: none) {
    .pin-button {
      opacity: 1;
    }
  }

  .body {
    flex: 1 1 auto;
    /* Measured off the original: the title's ink starts 21px below the card's top and 18px from its
       left, which is a 16px padding in both directions. */
    padding: 16px;
    display: flex;
    flex-direction: column;
    /* Measured off the original: its title's baseline sits 25px above the first body line. */
    gap: 16px;
  }

  .title {
    margin: 0;
    /* Measured off the original: a card's title is about half again the size of its body text, and
       regular weight rather than medium. */
    font-size: 20px;
    font-weight: 400;
    /* 20px on a 25px line, from the original's DOM. */
    line-height: 25px;
    word-break: break-word;
  }

  /*
   * On a phone the original's card type is smaller, measured from the owner's own screenshots of both
   * apps on the same device (412 CSS px at 3.375x): the title's ink is 13.3px against our 15.7px, and
   * the body's line pitch 15.1px against our 20.6px — the same text, so the ratio is the measurement:
   * the title goes to 16px on a 20px line and the body to 12px on 15px.
   */
  @media (max-width: 600px) {
    .title {
      font-size: 16px;
      line-height: 20px;
    }
  }

  .purge {
    margin: 6px 0 0;
    font-size: 12px;
    color: var(--note-fg-secondary, var(--keep-text-secondary));
  }

  .meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 0 16px 8px;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
    min-width: 0;
  }

  .chip {
    max-width: 140px;
    border-radius: 12px;
    background: rgba(0, 0, 0, 0.08);
    overflow: hidden;
  }

  /* The chip is a button — it is a way into that label's view — wearing the chip's own look. */
  .chip button {
    display: block;
    max-width: 140px;
    padding: 1px 8px;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }

  .chip button:hover {
    text-decoration: underline;
  }

  :root[data-theme='dark'] .chip {
    background: rgba(255, 255, 255, 0.14);
  }

  .collaborators {
    display: flex;
    align-items: center;
    flex: 0 0 auto;
  }

  .collaborators :global(.avatar) + :global(.avatar) {
    margin-left: -8px;
  }

  .more-collaborators {
    margin-left: 4px;
    font-size: 11px;
    color: var(--note-fg-secondary, var(--keep-text-secondary));
  }

  .actions {
    display: flex;
    align-items: center;
    /* Keep spreads the icons across the whole footer and lines the outer ones up with the card's
       padding, instead of stacking them against the right edge. */
    justify-content: space-between;
    gap: 0;
    min-height: 48px;
    /* Measured from the original's DOM: 34px buttons, 4px in from the card's edges and 5px above its
       bottom, carrying 18px glyphs. */
    padding: 0 4px 5px;
    opacity: 0;
    transition: opacity var(--keep-duration) var(--keep-ease);
  }

  /* Semi-transparent at rest, brighter under the pointer — the way Keep's own icons read. */
  /* The note's own ink at 71% — the original's opacity, measured — not a secondary colour on top of
     an opacity, which read far paler than the original. */
  /* 34px where the card has room (a desktop card's 240px fits all six); on a phone's narrower card
     the buttons give way evenly rather than pushing the last one off the card. */
  .actions > :global(*) {
    flex: 0 1 34px;
    min-width: 0;
  }

  .actions :global(.icon-button) {
    width: 100%;
    max-width: 34px;
    height: 34px;
    color: var(--note-fg, var(--keep-text));
    opacity: 0.71;
    transition:
      opacity var(--keep-duration-short) var(--keep-ease-standard),
      background-color var(--keep-duration-short) var(--keep-ease-standard);
  }

  .actions :global(.icon-button:hover) {
    opacity: 1;
    color: var(--note-fg, var(--keep-text));
  }

  .card:hover .actions,
  .card:focus-within .actions,
  /* bits-ui marks the trigger while its panel is open, which is what keeps the actions visible. */
  .actions:has(:global([data-state='open'])) {
    opacity: 1;
  }

  .trash-actions {
    opacity: 1;
  }

  .picker-anchor {
    position: relative;
    display: inline-flex;
  }

  /* bits-ui renders these in a portal and positions them; only the look is ours, so the class
     names are global and distinctive enough not to collide with the editor's. */
  :global(.note-picker),
  :global(.note-reminder),
  :global(.note-menu) {
    z-index: 90;
  }

  :global(.note-menu) {
    display: flex;
    flex-direction: column;
    min-width: 180px;
    padding: 8px 0;
    border-radius: var(--keep-radius);
    background: var(--keep-surface);
    color: var(--keep-text);
    box-shadow: var(--keep-shadow-popover);
  }

  :global(.note-menu-item) {
    padding: 10px 16px;
    text-align: left;
    white-space: nowrap;
  }

  :global(.note-menu-item[data-highlighted]) {
    background: var(--keep-hover);
  }

  @media (hover: none) {
    .actions {
      opacity: 1;
    }
  }
</style>
