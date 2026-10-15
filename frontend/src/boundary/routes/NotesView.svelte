<script lang="ts">
  import type { Note, NoteView } from '../../entity/api/types';
  import { notes } from '../../control/state/notes.svelte';
  import { instance } from '../../control/state/instance.svelte';
  import { confirmation } from '../components/confirmation.svelte';
  import { t, tError } from '../i18n';
  import NoteGrid from '../components/NoteGrid.svelte';
  import SearchFacets from '../components/SearchFacets.svelte';
  import { searchFacets, type SearchFilter } from '../../entity/search';
  import type { IconName } from '../components/Icon.svelte';

  interface Props {
    view: NoteView;
    /** When true the grid filters the already-loaded collection instead of loading a view. */
    searchMode?: boolean;
    /** The label this view is filtered by, when the route is one of the sidebar's labels. */
    labelId?: number | null;
    /** The reminders view: the notes carrying a reminder, soonest first. */
    reminders?: boolean;
    /** The search page's type, label or colour filter, from the address. */
    filter?: SearchFilter | null;
    onNavigate?: (path: string) => void;
  }

  let {
    view,
    searchMode = false,
    labelId = null,
    reminders = false,
    filter = null,
    onNavigate = () => {}
  }: Props = $props();

  $effect(() => {
    notes.searchFilter = searchMode ? filter : null;
  });

  /** Nothing typed and nothing picked: the search page offers its filters instead of a grid. */
  const offeringFilters = $derived(searchMode && filter === null && notes.searchQuery.trim() === '');

  const visible: Note[] = $derived(notes.visibleNotes);

  $effect(() => {
    // Search narrows the notes view's own collection, so it needs that collection — also when the
    // page was opened at a /search address directly.
    if (searchMode) {
      if (!notes.loaded || notes.view !== 'active' || notes.labelId !== null || notes.remindersOnly) {
        void notes.load('active', null);
      }
      return;
    }
    // The reminders view loads from its own request — the server is what orders it — so it is asked
    // for by name rather than through the notes view's `view`/`labelId` pair.
    if (reminders) {
      if (!notes.remindersOnly || !notes.loaded) void notes.loadReminders();
      return;
    }
    if (notes.view !== view || notes.labelId !== labelId || !notes.loaded) {
      void notes.load(view, labelId);
    }
  });

  const emptyTitle = $derived(
    reminders
      ? t('reminders.empty')
      : searchMode
        ? t('notes.emptySearch')
      : view === 'archived'
        ? t('notes.emptyArchive')
        : view === 'trash'
          ? t('notes.emptyTrash')
          : t('notes.emptyNotes')
  );

  const emptyIcon: IconName = $derived(
    reminders
      ? 'bell'
      : view === 'archived'
        ? 'archive'
        : view === 'trash'
          ? 'trash'
          : searchMode
            ? 'search'
            : 'lightbulb'
  );

  async function emptyTrash(): Promise<void> {
    if (!(await confirmation.ask(t('notes.confirmEmptyTrash'), t('notes.emptyTrashAction')))) return;
    await notes.emptyTrash();
  }
</script>

<section class="view">
  <!-- The view's name is in the header, where the app's own name otherwise stands (the original
       does this for the archive and the trash as it does for a label); the trash keeps its notice
       and its action, centred above the notes. -->
  {#if view === 'trash' && notes.notes.length > 0}
    <div class="trash-bar">
      <span class="trash-notice">
        {t('notes.trashNotice', { days: instance.info.trashRetentionDays })}
      </span>
      <button type="button" class="empty-trash" onclick={emptyTrash}>
        {t('notes.emptyTrashAction')}
      </button>
    </div>
  {/if}

  {#if notes.error}
    <p class="error" role="alert">{tError(notes.error as unknown as Error)}</p>
  {/if}

  {#if offeringFilters}
    <SearchFacets facets={searchFacets(notes.notes)} {onNavigate} />
  {:else}
  <NoteGrid
    notes={visible}
    archived={reminders ? [] : notes.visibleArchived}
    {emptyTitle}
    {emptyIcon}
    size={reminders ? 80 : 64}
    flat={reminders}
    variant={view === 'trash' ? 'trash' : 'default'}
    reorderable={!searchMode && !reminders && view !== 'trash' && notes.sort === 'custom' && notes.searchQuery.trim() === ''}
  />
  {/if}
</section>

<style>
  .view {
    padding: 0 0 96px;
  }

  /* The original's notice: italic, centred above the notes, with its action beside it. */
  .trash-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin: 0 0 24px;
  }

  .trash-notice {
    font-style: italic;
    font-size: 17px;
    color: var(--keep-text);
  }

  .empty-trash {
    padding: 8px 24px;
    border-radius: 4px;
    color: var(--keep-accent);
    font-weight: 500;
  }

  .empty-trash:hover {
    background: var(--keep-hover);
  }

  .error {
    margin: 0 0 16px;
    color: var(--keep-danger);
  }
</style>
