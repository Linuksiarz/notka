<script lang="ts">
  import { toast } from 'svelte-sonner';
  import { labels } from '../../control/state/labels.svelte';
  import { notes } from '../../control/state/notes.svelte';
  import { ui } from '../../control/state/ui.svelte';
  import type { Label, Note, NoteBackground, NoteColor, ReminderRepeat } from '../../entity/api/types';
  import { t, tError } from '../i18n';
  import AppearancePicker from './AppearancePicker.svelte';
  import Icon from './Icon.svelte';
  import type { IconName } from './Icon.svelte';
  import LabelPicker from './LabelPicker.svelte';
  import ReminderPicker from './ReminderPicker.svelte';
  import Sheet from './Sheet.svelte';

  /**
   * The Android app's selection bar, which takes the whole header over once a note is held: ✕, the
   * count as a bare number, then pin, reminder, colour, labels and ⋮ (measured on an emulator, 48dp
   * apart). Every action is the same REST call a single note makes (rule 20), once per picked note;
   * the overflow sheet holds what the desktop's bar shows as buttons.
   */
  interface Props {
    onArchive: () => void;
    onTrash: () => void;
    onSelectAll: () => void;
    onDownload: () => void;
  }

  let { onArchive, onTrash, onSelectAll, onDownload }: Props = $props();

  let sheet = $state<'reminder' | 'appearance' | 'labels' | 'more' | null>(null);

  const picked = $derived.by(() => {
    const ids = new Set(ui.selectedNoteIds);
    return [...notes.visibleNotes, ...notes.visibleArchived].filter((note) => ids.has(note.id));
  });

  /** What the picked notes share — shown in a picker as its current choice. */
  function shared<T>(read: (note: Note) => T, otherwise: T): T {
    const first = picked[0];
    if (!first) return otherwise;
    const value = read(first);
    return picked.every((note) => read(note) === value) ? value : otherwise;
  }

  const allPinned = $derived(picked.length > 0 && picked.every((note) => note.pinned));
  const sharedLabelIds = $derived(
    labels.labels
      .filter((label) => picked.length > 0 && picked.every((note) => note.labels.some((own) => own.id === label.id)))
      .map((label) => label.id)
  );

  async function each(action: (note: Note) => Promise<unknown>): Promise<void> {
    try {
      await Promise.all(picked.map(action));
    } catch (error) {
      toast.error(tError(error as Error));
    }
  }

  function togglePin(): void {
    const pinned = !allPinned;
    void each((note) => notes.setPinned(note.id, pinned));
  }

  function paint(color: NoteColor, background: NoteBackground | null): void {
    void each((note) => notes.setAppearance(note.id, color, background));
  }

  function remind(at: number | null, repeat: ReminderRepeat | null): void {
    sheet = null;
    void each((note) =>
      notes.patch(note.id, { reminderAt: at === null ? 0 : at, reminderRepeat: at === null ? null : repeat })
    );
  }

  /** The original's label list for a selection: a label every picked note has is taken off them all. */
  function toggleLabel(label: Label): void {
    const remove = sharedLabelIds.includes(label.id);
    void each((note) => {
      const own = note.labels.map((entry) => entry.id).filter((id) => id !== label.id);
      return notes.setLabels(note.id, remove ? own : [...own, label.id]);
    });
  }

  async function createLabel(name: string): Promise<void> {
    try {
      const label = await labels.create(name);
      toggleLabel(label);
    } catch (error) {
      toast.error(tError(error as Error));
    }
  }

  function fromMore(action: () => void): () => void {
    return () => {
      sheet = null;
      action();
    };
  }

  function copySelected(): void {
    void each((note) => notes.copy(note.id));
  }
</script>

{#snippet sheetItem(icon: IconName, text: string, action: () => void)}
  <button type="button" class="ok-sheet-item" onclick={fromMore(action)}>
    <Icon name={icon} size={24} />
    <span>{text}</span>
  </button>
{/snippet}

<div class="phone-selection" role="toolbar" aria-label={t('selection.count', { count: ui.selectedNoteIds.length })}>
  <button
    type="button"
    class="icon-button"
    title={t('selection.clear')}
    aria-label={t('selection.clear')}
    onclick={() => ui.clearSelection()}
  >
    <Icon name="close" size={24} />
  </button>
  <span class="count">{ui.selectedNoteIds.length}</span>

  <div class="actions">
    <button
      type="button"
      class="icon-button"
      title={allPinned ? t('card.unpin') : t('card.pin')}
      aria-label={allPinned ? t('card.unpin') : t('card.pin')}
      aria-pressed={allPinned}
      onclick={togglePin}
    >
      <Icon name={allPinned ? 'pin-filled' : 'pin'} size={24} />
    </button>
    <button type="button" class="icon-button" title={t('reminder.add')} aria-label={t('reminder.add')} onclick={() => (sheet = 'reminder')}>
      <Icon name="add-alert" size={24} />
    </button>
    <button type="button" class="icon-button" title={t('card.changeColor')} aria-label={t('card.changeColor')} onclick={() => (sheet = 'appearance')}>
      <Icon name="palette" size={24} />
    </button>
    <button type="button" class="icon-button" title={t('card.labels')} aria-label={t('card.labels')} onclick={() => (sheet = 'labels')}>
      <Icon name="label" size={24} />
    </button>
    <button type="button" class="icon-button" title={t('selection.more')} aria-label={t('selection.more')} onclick={() => (sheet = 'more')}>
      <Icon name="more-vert" size={24} />
    </button>
  </div>
</div>

<Sheet open={sheet === 'reminder'} onClose={() => (sheet = null)} title={t('reminder.add')}>
  <ReminderPicker
    reminderAt={shared((note) => note.reminderAt ?? null, null)}
    reminderRepeat={shared((note) => note.reminderRepeat ?? null, null)}
    onSave={(at, repeat) => remind(at, repeat)}
    onClear={() => remind(null, null)}
  />
</Sheet>

<Sheet open={sheet === 'appearance'} onClose={() => (sheet = null)} title={t('card.changeColor')}>
  <AppearancePicker
    layout="sheet"
    color={shared<NoteColor>((note) => note.color, 'default')}
    background={shared<NoteBackground | null>((note) => note.background ?? null, null)}
    canChange={picked.every((note) => note.canChangeAppearance)}
    onSelect={paint}
  />
</Sheet>

<Sheet open={sheet === 'labels'} onClose={() => (sheet = null)} title={t('card.labels')}>
  <LabelPicker
    labels={labels.labels}
    selectedIds={sharedLabelIds}
    onToggle={toggleLabel}
    onCreate={(name) => void createLabel(name)}
  />
</Sheet>

<Sheet open={sheet === 'more'} onClose={() => (sheet = null)} title={t('selection.more')}>
  {@render sheetItem('archive', t('selection.archive'), onArchive)}
  {@render sheetItem('trash', t('selection.trash'), onTrash)}
  {@render sheetItem('content-copy', t('card.makeCopy'), copySelected)}
  {@render sheetItem('checklist', t('selection.selectAll'), onSelectAll)}
  {@render sheetItem('download', t('selection.downloadMarkdown'), onDownload)}
</Sheet>

<style>
  /*
   * Measured on the Android app (emulator, 412dp): the bar is 72dp tall, in the dark theme a darker
   * surface (`--keep-selection-bar`) over a 12dp strip of the header's own grey under it, in the light
   * one the header's surface with its shadow; ✕ centred 28dp in, the count at 65dp, the actions 48dp
   * apart, ⋮ centred 26dp from the right edge.
   */
  .phone-selection {
    display: flex;
    align-items: center;
    flex: 1 1 auto;
    height: 72px;
    margin: 0 -12px 0 calc(-1 * var(--keep-topbar-inset, 0px));
    padding: 0 6px 0 4px;
    background: var(--keep-selection-bar);
    color: var(--keep-phone-ink);
    box-shadow: var(--keep-selection-edge);
  }

  .phone-selection .icon-button {
    width: 48px;
    height: 48px;
    color: inherit;
  }

  .count {
    margin-left: 13px;
    font-size: 1.375rem;
    line-height: 1.75rem;
  }

  .actions {
    display: flex;
    align-items: center;
    margin-left: auto;
  }
</style>
