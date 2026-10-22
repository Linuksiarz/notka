<script lang="ts">
  import { labels } from '../../control/state/labels.svelte';
  import { ui } from '../../control/state/ui.svelte';
  import type { NoteBackground, NoteColor, ReminderRepeat } from '../../entity/api/types';
  import { t } from '../i18n';
  import AppearancePicker from './AppearancePicker.svelte';
  import Icon from './Icon.svelte';
  import type { IconName } from './Icon.svelte';
  import LabelPicker from './LabelPicker.svelte';
  import ReminderPicker from './ReminderPicker.svelte';
  import Sheet from './Sheet.svelte';
  import { SelectionActions } from './selectionActions.svelte';

  /**
   * The Android app's selection bar, which takes the whole header over once a note is held: ✕, the
   * count as a bare number, then pin, reminder, colour, labels and ⋮ (measured on an emulator, 48dp
   * apart). The actions themselves are `SelectionActions`, shared with the desktop's bar; the
   * overflow sheet holds what the desktop's bar shows as buttons.
   */
  interface Props {
    onArchive: () => void;
    onTrash: () => void;
    onSelectAll: () => void;
    onDownload: () => void;
  }

  let { onArchive, onTrash, onSelectAll, onDownload }: Props = $props();

  let sheet = $state<'reminder' | 'appearance' | 'labels' | 'more' | null>(null);

  const selection = new SelectionActions();

  function remind(at: number | null, repeat: ReminderRepeat | null): void {
    sheet = null;
    selection.remind(at, repeat);
  }

  function fromMore(action: () => void): () => void {
    return () => {
      sheet = null;
      action();
    };
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
      title={selection.allPinned ? t('card.unpin') : t('card.pin')}
      aria-label={selection.allPinned ? t('card.unpin') : t('card.pin')}
      aria-pressed={selection.allPinned}
      onclick={() => selection.togglePin()}
    >
      <Icon name={selection.allPinned ? 'pin-filled' : 'pin'} size={24} />
    </button>
    <button type="button" class="icon-button" title={t('reminder.add')} aria-label={t('reminder.add')} disabled={!selection.canEdit} onclick={() => (sheet = 'reminder')}>
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
    reminderAt={selection.shared((note) => note.reminderAt ?? null, null)}
    reminderRepeat={selection.shared((note) => note.reminderRepeat ?? null, null)}
    onSave={(at, repeat) => remind(at, repeat)}
    onClear={() => remind(null, null)}
  />
</Sheet>

<Sheet open={sheet === 'appearance'} onClose={() => (sheet = null)} title={t('card.changeColor')}>
  <AppearancePicker
    layout="sheet"
    color={selection.shared<NoteColor>((note) => note.color, 'default')}
    background={selection.shared<NoteBackground | null>((note) => note.background ?? null, null)}
    canChange={selection.canChangeAppearance}
    onSelect={(color, background) => selection.paint(color, background)}
  />
</Sheet>

<Sheet open={sheet === 'labels'} onClose={() => (sheet = null)} title={t('card.labels')}>
  <LabelPicker
    labels={labels.labels}
    selectedIds={selection.sharedLabelIds}
    onToggle={(label) => selection.toggleLabel(label)}
    onCreate={(name) => void selection.createLabel(name)}
  />
</Sheet>

<Sheet open={sheet === 'more'} onClose={() => (sheet = null)} title={t('selection.more')}>
  {@render sheetItem('archive', t('selection.archive'), onArchive)}
  {@render sheetItem('trash', t('selection.trash'), onTrash)}
  {@render sheetItem('content-copy', t('card.makeCopy'), () => selection.copy())}
  {@render sheetItem('checklist', t('selection.selectAll'), onSelectAll)}
  {@render sheetItem('download', t('selection.downloadMarkdown'), onDownload)}
</Sheet>

<style>
  /*
   * Measured on the Android app (emulator, 412dp): the bar is 72dp tall and spans the screen, in the
   * dark theme a darker surface (`--keep-selection-bar`) straight on the page, in the light one the
   * header's surface with its shadow; ✕ centred 28dp in, the count at 65dp, the actions 48dp apart,
   * ⋮ centred 26dp from the right edge.
   *
   * It hangs from the top of the 64px header and reaches over its padding to both edges of the
   * window; the 8px it is taller than the header lie over the notes' own top margin. Growing the
   * header instead would push every card down the moment a note is picked (rule 20).
   */
  .phone-selection {
    display: flex;
    align-items: center;
    flex: 1 1 auto;
    align-self: flex-start;
    /* …and up over the status bar's room, so that the bar is the selection's colour as well. */
    height: calc(72px + var(--keep-inset-top));
    margin: calc(-1 * var(--keep-inset-top)) calc(-1 * var(--keep-topbar-padding)) 0;
    padding: var(--keep-inset-top) 6px 0 4px;
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
