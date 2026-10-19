<script lang="ts">
  import { toast } from 'svelte-sonner';
  import { accountName } from '../../entity/account';
  import { notes } from '../../control/state/notes.svelte';
  import { labels } from '../../control/state/labels.svelte';
  import { session } from '../../control/state/session.svelte';
  import { ui } from '../../control/state/ui.svelte';
  import { connection } from '../../control/state/connection.svelte';
  import type { NoteView } from '../../entity/api/types';
  import { t } from '../i18n';
  import Avatar from './Avatar.svelte';
  import { noteFileName, noteToFile } from '../../entity/noteFile';
  import { saveMarkdownFile, saveMarkdownZip } from '../download';
  import { confirmation } from './confirmation.svelte';
  import BrandMark from './BrandMark.svelte';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';
  import PhoneSelectionBar from './PhoneSelectionBar.svelte';
  import { NOTE_SORTS } from '../../entity/noteOrder';
  import { DropdownMenu, Popover } from 'bits-ui';
  import AppearancePicker from './AppearancePicker.svelte';
  import LabelPicker from './LabelPicker.svelte';
  import ReminderPicker from './ReminderPicker.svelte';
  import { SelectionActions } from './selectionActions.svelte';
  import type { NoteBackground, NoteColor } from '../../entity/api/types';

  interface Props {
    onNavigate: (path: string) => void;
    onRefresh: () => void;
    onOpenSettings: () => void;
    searchActive: boolean;
    /** Which list is on screen; the trash answers a selection with restore instead of archive. */
    view?: NoteView;
    /**
     * What the view is called, when it has a name of its own — a label's view shows the label there,
     * where the app's own name otherwise stands. The original does exactly this.
     */
    heading?: string;
  }

  let {
    onNavigate,
    onRefresh,
    onOpenSettings,
    searchActive,
    heading = '',
    view = 'active'
  }: Props = $props();

  /**
   * The bar's glyphs: 24px on the desktop (Keep's own `background-size`), and on a phone the size the
   * original's Android app draws them at — measured off the owner's screenshots at 412px, the ink of
   * its menu and layout icons is ~19.6px, which is a 26px Material icon.
   */
  const barIcon = $derived(ui.phone ? 26 : 24);

  let searchInput = $state<HTMLInputElement | null>(null);
  let sortOpen = $state(false);
  const searching = $derived(searchActive || notes.searchQuery.length > 0);

  /**
   * The header is flat while the page is at the top and lifts into a shadow once it scrolls, the way
   * the original does: its 1px line gives way to a shadow rather than staying under it.
   */
  let scrolled = $state(false);

  $effect(() => {
    const sync = () => (scrolled = window.scrollY > 1);
    sync();
    window.addEventListener('scroll', sync, { passive: true });
    return () => window.removeEventListener('scroll', sync);
  });

  /**
   * The original opens its search page the moment the field is entered — the filters are what it
   * shows before anything is typed — and stays there until the field's close button is pressed.
   */
  function enterSearch(): void {
    if (!searchActive) onNavigate('/search');
  }

  function onSearchInput(event: Event): void {
    notes.searchQuery = (event.currentTarget as HTMLInputElement).value;
    enterSearch();
  }

  /** What the field invites: plain "Search", or "Search within …" once a filter is picked. */
  const searchPlaceholder = $derived.by(() => {
    const filter = notes.searchFilter;
    if (filter === null) return t('topbar.searchPlaceholder');
    const name =
      filter.kind === 'type'
        ? t(`search.type.${filter.type}`)
        : filter.kind === 'color'
          ? t(`color.${filter.color}`)
          : (labels.labels.find((label) => label.id === filter.labelId)?.name ?? '');
    return t('search.within', { name });
  });

  function clearSearch(): void {
    notes.searchQuery = '';
    if (searchActive) onNavigate('/');
    searchInput?.blur();
  }

  /**
   * Bulk actions over the picked notes. Each note goes through the same REST path a single one
   * does, so nothing here is a second write path.
   */
  async function archiveSelected(): Promise<void> {
    const ids = [...ui.selectedNoteIds];
    ui.clearSelection();
    await Promise.all(ids.map((id) => notes.patch(id, { archived: true })));
    toast(t('selection.archived', { count: ids.length }), {
      action: {
        label: t('card.undo'),
        onClick: () => void Promise.all(ids.map((id) => notes.patch(id, { archived: false })))
      }
    });
  }

  async function trashSelected(): Promise<void> {
    const ids = [...ui.selectedNoteIds];
    ui.clearSelection();
    await Promise.all(ids.map((id) => notes.trash(id)));
    toast(t('selection.trashed', { count: ids.length }));
  }

  async function restoreSelected(): Promise<void> {
    const ids = [...ui.selectedNoteIds];
    ui.clearSelection();
    await Promise.all(ids.map((id) => notes.restore(id)));
    toast(t('selection.restored', { count: ids.length }));
  }

  async function deleteSelectedForever(): Promise<void> {
    const question = t('selection.confirmDeleteForever', { count: ui.selectedNoteIds.length });
    if (!(await confirmation.ask(question, t('confirm.delete')))) return;
    const ids = [...ui.selectedNoteIds];
    ui.clearSelection();
    await Promise.all(ids.map((id) => notes.destroy(id)));
    toast(t('selection.deletedForever', { count: ids.length }));
  }

  /**
   * The picked notes as Notka Markdown files: one `.md` for one note, a `.zip` with a file per note
   * for several — one download, because a browser asks before letting a page start several at once.
   */
  function downloadSelected(): void {
    const picked = new Set(ui.selectedNoteIds);
    const shown = [...notes.visibleNotes, ...notes.visibleArchived].filter((note) => picked.has(note.id));
    const files = shown.map((note) => ({
      name: noteFileName(note.title, t('card.note')),
      markdown: noteToFile(note, note.labels.map((label) => label.name))
    }));
    const only = files.length === 1 ? files[0] : undefined;
    if (only) saveMarkdownFile(only.name, only.markdown);
    else if (files.length > 1) void saveMarkdownZip(t('selection.markdownFileName', { count: files.length }), files);
  }

  /** Pin, reminder, colour, labels and copy, the same actions the phone's bar has. */
  const selection = new SelectionActions();
  let selectionPanel = $state<'reminder' | 'appearance' | 'labels' | 'menu' | null>(null);
  let moreAnchor = $state<HTMLElement | null>(null);

  const panelFor = (panel: 'reminder' | 'appearance' | 'labels' | 'menu') => ({
    open: selectionPanel === panel,
    onOpenChange: (next: boolean) => {
      if (next) selectionPanel = panel;
      else if (selectionPanel === panel) selectionPanel = null;
    }
  });

  /** Keep's own `Select all` lives in the overflow menu of the selection bar. */
  function selectAll(): void {
    ui.selectAll(notes.visibleNotes.map((note) => note.id));
  }

  function onWindowKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !ui.selecting) return;
    if (event.defaultPrevented || ui.editorOpen) return;
    ui.clearSelection();
  }

  async function signOut(): Promise<void> {
    await session.logout();
    onNavigate('/login');
  }

  async function signOutEverywhere(): Promise<void> {
    await session.logoutEverywhere();
    onNavigate('/login');
  }
</script>

<svelte:window onkeydown={onWindowKeyDown} />

{#snippet layoutButton()}
  <button
    type="button"
    class="icon-button"
    title={ui.layout === 'grid' ? t('topbar.listView') : t('topbar.gridView')}
    aria-label={ui.layout === 'grid' ? t('topbar.switchToList') : t('topbar.switchToGrid')}
    onclick={() => ui.setLayout(ui.layout === 'grid' ? 'list' : 'grid')}
  >
    <Icon name={ui.layout === 'grid' ? 'rows' : 'grid'} size={barIcon} />
  </button>
{/snippet}

<Sheet open={sortOpen} onClose={() => (sortOpen = false)} title={t('sort.title')} heading>
  <div class="sort-options" role="radiogroup" aria-label={t('sort.title')}>
    {#each NOTE_SORTS as option (option)}
      <button
        type="button"
        class="ok-sheet-item sort-option"
        class:picked={notes.sort === option}
        role="radio"
        aria-checked={notes.sort === option}
        onclick={() => {
          notes.setSort(option);
          sortOpen = false;
        }}
      >
        <span class="sort-check">
          {#if notes.sort === option}<Icon name="check" size={24} />{/if}
        </span>
        <span>{t(`sort.${option}`)}</span>
      </button>
    {/each}
  </div>
</Sheet>

<header class="topbar" data-scrolled={scrolled} class:phone-selecting={ui.phone && ui.selecting}>
  {#if ui.phone && ui.selecting}
    <PhoneSelectionBar
      onArchive={() => void archiveSelected()}
      onTrash={() => void trashSelected()}
      onSelectAll={selectAll}
      onDownload={downloadSelected}
    />
  {:else}
  <div class="brand-block">
    <button
      type="button"
      class="icon-button menu-button"
      aria-label={t('nav.open')}
      title={t('nav.open')}
      onclick={() => ui.toggleSidebar()}
    >
      <Icon name="menu" size={barIcon} />
    </button>

    {#if heading}
      <span class="view-heading">{heading}</span>
    {:else}
      <span class="wordmark">
        <span class="brand-icon"><BrandMark size={36} /></span>
        <span>{t('app.name')}</span>
      </span>
    {/if}
  </div>

  {#if ui.selecting && !ui.phone}
    <!-- The selection bar takes the header over, the way Keep swaps the search field for it. -->
    <div class="selection" role="toolbar" aria-label={t('selection.count', { count: ui.selectedNoteIds.length })}>
      <button
        type="button"
        class="icon-button"
        title={t('selection.clear')}
        aria-label={t('selection.clear')}
        onclick={() => ui.clearSelection()}
      >
        <Icon name="close" size={barIcon} />
      </button>
      <span class="selection-count">{t('selection.count', { count: ui.selectedNoteIds.length })}</span>

      <!-- Keep pushes the actions to the far right of the bar. -->
      <div class="selection-actions">
        {#if view === 'trash'}
          <button
            type="button"
            class="icon-button"
            title={t('selection.restore')}
            aria-label={t('selection.restore')}
            onclick={() => void restoreSelected()}
          >
            <Icon name="restore" size={barIcon} />
          </button>
          <button
            type="button"
            class="icon-button"
            title={t('selection.deleteForever')}
            aria-label={t('selection.deleteForever')}
            onclick={() => void deleteSelectedForever()}
          >
            <Icon name="delete-forever" size={barIcon} />
          </button>
        {:else}
          <button
            type="button"
            class="icon-button"
            title={selection.allPinned ? t('card.unpin') : t('card.pin')}
            aria-label={selection.allPinned ? t('card.unpin') : t('card.pin')}
            aria-pressed={selection.allPinned}
            onclick={() => selection.togglePin()}
          >
            <Icon name={selection.allPinned ? 'pin-filled' : 'pin'} size={barIcon} />
          </button>
          <Popover.Root {...panelFor('reminder')}>
            <Popover.Trigger
              class="icon-button"
              title={t('reminder.add')}
              aria-label={t('reminder.add')}
              disabled={!selection.canEdit}
            >
              <Icon name="add-alert" size={barIcon} />
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                data-overlay="selection-picker"
                class="reminder-picker selection-picker"
                sideOffset={8}
                align="end"
                collisionPadding={8}
              >
                <ReminderPicker
                  reminderAt={selection.shared((note) => note.reminderAt ?? null, null)}
                  reminderRepeat={selection.shared((note) => note.reminderRepeat ?? null, null)}
                  onSave={(at, repeat) => {
                    selectionPanel = null;
                    selection.remind(at, repeat);
                  }}
                  onClear={() => {
                    selectionPanel = null;
                    selection.remind(null, null);
                  }}
                />
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
          <Popover.Root {...panelFor('appearance')}>
            <Popover.Trigger
              class="icon-button"
              title={t('card.changeColor')}
              aria-label={t('card.changeColor')}
              disabled={!selection.canChangeAppearance}
            >
              <Icon name="palette" size={barIcon} />
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                data-overlay="selection-picker"
                class="selection-picker"
                sideOffset={8}
                align="end"
                collisionPadding={8}
              >
                <AppearancePicker
                  color={selection.shared<NoteColor>((note) => note.color, 'default')}
                  background={selection.shared<NoteBackground | null>((note) => note.background ?? null, null)}
                  canChange={selection.canChangeAppearance}
                  onSelect={(color, background) => selection.paint(color, background)}
                />
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
          <button
            type="button"
            class="icon-button"
            title={t('selection.archive')}
            aria-label={t('selection.archive')}
            onclick={() => void archiveSelected()}
          >
            <Icon name="archive" size={barIcon} />
          </button>
          <button
            type="button"
            class="icon-button"
            title={t('selection.trash')}
            aria-label={t('selection.trash')}
            onclick={() => void trashSelected()}
          >
            <Icon name="trash" size={barIcon} />
          </button>
        {/if}

        <span class="more-anchor" bind:this={moreAnchor}>
        <DropdownMenu.Root {...panelFor('menu')}>
          <DropdownMenu.Trigger
            class="icon-button"
            title={t('selection.more')}
            aria-label={t('selection.more')}
          >
            <Icon name="more-vert" size={barIcon} />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <!-- "Add label" hands the open panel to the label picker, so the menu must not hand the
                 focus back to its trigger, which is outside the picker and would close it. -->
            <DropdownMenu.Content
              preventScroll={false}
              data-overlay="selection-menu"
              class="menu"
              sideOffset={8}
              align="end"
              onCloseAutoFocus={(event) => {
                if (selectionPanel === 'labels') event.preventDefault();
              }}
            >
              {#if view !== 'trash'}
                <DropdownMenu.Item class="menu-item" onSelect={() => (selectionPanel = 'labels')}>
                  {t('card.addLabel')}
                </DropdownMenu.Item>
                <DropdownMenu.Item class="menu-item" onSelect={() => selection.copy()}>
                  {t('card.makeCopy')}
                </DropdownMenu.Item>
              {/if}
              <DropdownMenu.Item class="menu-item" onSelect={selectAll}>
                {t('selection.selectAll')}
              </DropdownMenu.Item>
              <DropdownMenu.Item class="menu-item" onSelect={downloadSelected}>
                {t('selection.downloadMarkdown')}
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
        </span>
        <Popover.Root {...panelFor('labels')}>
          <Popover.Portal>
            <Popover.Content
              data-overlay="selection-picker"
              class="selection-picker"
              customAnchor={moreAnchor}
              sideOffset={8}
              align="end"
              collisionPadding={8}
            >
              <LabelPicker
                labels={labels.labels}
                selectedIds={selection.sharedLabelIds}
                onToggle={(label) => selection.toggleLabel(label)}
                onCreate={(name) => void selection.createLabel(name)}
              />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
    </div>
  {:else}
  <div class="search" class:active={searching}>
    {#if !ui.phone}
      <Icon name="search" size={barIcon} />
    {/if}
    <input
      bind:this={searchInput}
      type="search"
      placeholder={searchPlaceholder}
      aria-label={t('topbar.searchLabel')}
      value={notes.searchQuery}
      oninput={onSearchInput}
      onfocus={enterSearch}
    />
    {#if searching}
      <button
        type="button"
        class="icon-button"
        aria-label={t('topbar.clearSearch')}
        title={t('topbar.clearSearch')}
        onclick={clearSearch}
      >
        <Icon name="close" size={20} />
      </button>
    {:else if ui.phone}
      <!-- The original's phone keeps the view's two switches inside the search pill. -->
      {@render layoutButton()}
      <button
        type="button"
        class="icon-button"
        title={t('topbar.sort')}
        aria-label={t('topbar.sort')}
        onclick={() => (sortOpen = true)}
      >
        <Icon name="sort" size={barIcon} />
      </button>
    {/if}
  </div>

  <div class="actions">
    {#if connection.reachable}
      <button
        type="button"
        class="icon-button refresh"
        title={t('topbar.refresh')}
        aria-label={t('topbar.refreshNotes')}
        onclick={onRefresh}
      >
        <Icon name="refresh" size={barIcon} />
      </button>
    {:else}
      <!-- Where the original shows its own "offline" cloud: in place of the refresh button, which
           has nothing to refresh from. Pressing it tries again. -->
      <button
        type="button"
        class="icon-button"
        title={t('topbar.offline')}
        aria-label={t('topbar.offline')}
        onclick={onRefresh}
      >
        <Icon name="cloud-off" size={barIcon} />
      </button>
    {/if}

    {#if !ui.phone}
    {@render layoutButton()}

    <!-- The original's gear opens a menu, not the settings themselves: "Settings" and the dark
         theme's switch are its first two entries. On a phone the settings are in the drawer. -->
    <DropdownMenu.Root>
      <DropdownMenu.Trigger class="icon-button" title={t('topbar.settings')} aria-label={t('topbar.settings')}>
        <Icon name="settings" size={barIcon} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content preventScroll={false} class="settings-menu" sideOffset={0} align="start">
          <DropdownMenu.Item class="settings-menu-item" onSelect={onOpenSettings}>
            {t('topbar.settingsItem')}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            class="settings-menu-item"
            onSelect={() => ui.setTheme(ui.theme === 'dark' ? 'light' : 'dark')}
          >
            {ui.theme === 'dark' ? t('topbar.darkThemeOff') : t('topbar.darkThemeOn')}
          </DropdownMenu.Item>
          {#if session.user?.admin}
            <DropdownMenu.Item class="settings-menu-item" onSelect={() => (ui.serverSettingsOpen = true)}>
              {t('topbar.serverSettings')}
            </DropdownMenu.Item>
          {/if}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
    {/if}

    {#if session.user}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          class="avatar-button"
          aria-label={t('topbar.accountMenu')}
        >
          <Avatar user={session.user} size={32} />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content preventScroll={false} class="menu" sideOffset={8} align="end">
            <div class="identity">
              <strong>{session.user.displayName}</strong>
              <span>{accountName(session.user)}</span>
            </div>
            <DropdownMenu.Item class="menu-item" onSelect={signOut}>
              <Icon name="logout" size={20} />
              <span>{t('topbar.signOut')}</span>
            </DropdownMenu.Item>
            <DropdownMenu.Item class="menu-item" onSelect={signOutEverywhere}>
              <Icon name="logout" size={20} />
              <span>{t('topbar.signOutEverywhere')}</span>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    {/if}
  </div>
  {/if}
  {/if}
</header>

<style>
  /* Keep lines the menu button up with the icon column of the rail, folded or not. The rail puts
     its icons at 24px with a 22px glyph, so their centre is at 35px; this button is 40px wide, so
     it starts at 15px. */
  /* Measured from the original's DOM: the bar's buttons are 48px, and the hamburger sits in the
     same column as the navigation's icons. */
  .menu-button,
  .actions .icon-button {
    width: 48px;
    height: 48px;
  }

  .menu-button {
    margin-left: calc(var(--keep-icon-column) - var(--keep-topbar-padding) - 24px);
  }

  .topbar {
    display: flex;
    align-items: center;
    height: var(--keep-topbar-height);
    padding: 0 var(--keep-topbar-padding);
    position: sticky;
    top: 0;
    z-index: 30;
    background: var(--keep-bg);
    border-bottom: 1px solid var(--keep-divider);
    transition: box-shadow var(--keep-duration) var(--keep-ease);
  }

  /* Measured behaviour from the original: once the notes scroll, the line is gone and a shadow
     separates the bar from what slides under it. The value is Material's raised app bar. */
  .topbar[data-scrolled='true'] {
    border-bottom-color: transparent;
    box-shadow: var(--keep-shadow-topbar);
  }

  /* The bar's icons are the lighter measured grey, not the secondary text colour. */
  .topbar :global(.icon-button) {
    color: var(--keep-icon);
  }

  /* Takes the place of the search field while notes are picked. */
  .selection {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1 1 auto;
    height: var(--keep-topbar-height);
    padding-left: 12px;
  }

  .selection-actions {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-left: auto;
    padding-right: 8px;
  }

  .more-anchor {
    display: inline-flex;
  }

  /* bits-ui renders the pickers in a portal; they hang over the notes, above the header. */
  :global(.selection-picker) {
    z-index: 90;
  }

  .selection-count {
    font-size: 1rem;
    font-weight: 500;
  }

  .search {
    display: flex;
    align-items: center;
    /* Measured off the original: the box's 16px of padding, a 24px magnifier, 17px, then the text —
       which is where its 57px inset comes from. */
    gap: 17px;
    flex: 1 1 auto;
    /* Measured from the original's DOM: 722 wide (a 1px transparent border each side) and 48px
       tall, centred in its 64px bar. */
    max-width: 722px;
    height: 48px;
    padding: 0 8px 0 16px;
    border-radius: var(--keep-radius);
    /* Measured off the original: darker than the surface variant we used. */
    background: var(--keep-search-bg);
    /* Measured off the original: the magnifier and the hint are the same light grey as the bar's
       icons (198,200,201), not the darker secondary text we used. */
    color: var(--keep-icon);
  }

  .search input {
    flex: 1 1 auto;
    min-width: 0;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--keep-text);
    font-size: 1rem;
  }

  .search input::placeholder {
    color: var(--keep-icon);
  }

  .search input::-webkit-search-cancel-button {
    display: none;
  }

  /* Keep pushes the buttons to the far right; without this they sit against the search box and
     leave a stretch of empty header beside them. */
  .actions {
    display: flex;
    align-items: center;
    margin-left: auto;
    gap: 0;
  }

  /* The original's account button: a 40px target, 14px from the window's edge. */
  :global(.avatar-button) {
    display: inline-flex;
    margin: 0 6px 0 8px;
    padding: 4px;
    border-radius: 50%;
  }

  :global(.avatar-button:hover) {
    background: var(--keep-hover);
  }

  /* Positioned and dismissed by bits-ui; only the look is ours. */
  :global(.menu) {
    z-index: 80;
    min-width: 260px;
    padding: 8px 0;
    border-radius: var(--keep-radius);
    background: var(--keep-surface);
    box-shadow: var(--keep-shadow-popover);
  }

  /* Measured from the original's DOM: a 4px-radius panel with 6px above and below its rows, each row
     32px of 14px text, 17px in from the left. */
  :global(.settings-menu) {
    z-index: 80;
    min-width: 174px;
    padding: 6px 0;
    border-radius: 4px;
    background: var(--keep-surface);
    box-shadow: var(--keep-shadow-composer);
  }

  :global(.settings-menu-item) {
    display: flex;
    align-items: center;
    min-height: 32px;
    padding: 5px 10px 5px 17px;
    font-size: 0.875rem;
    line-height: 1.25rem;
    color: var(--keep-text);
    cursor: pointer;
    outline: none;
  }

  :global(.settings-menu-item[data-highlighted]) {
    background: var(--keep-hover);
  }

  :global(.menu-item) {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 10px 16px;
    color: var(--keep-text);
  }

  :global(.menu-item:hover),
  :global(.menu-item[data-highlighted]) {
    background: var(--keep-hover);
  }

  /* The sort sheet's rows: the picked one on the original's tonal pill, its tick centred 47px in. */
  .sort-options {
    padding-top: 10px;
    border-top: 1px solid var(--keep-sheet-divider);
  }

  .sort-option {
    padding-left: 26px;
  }

  .sort-option.picked {
    background: var(--keep-sheet-selected);
  }

  .sort-check {
    display: inline-flex;
    width: 24px;
  }

  .identity {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 16px 12px;
    border-bottom: 1px solid var(--keep-divider);
  }

  .identity span {
    color: var(--keep-text-secondary);
    font-size: 0.75rem;
  }

  /* The sidebar owns the menu button on wide screens; the top bar only needs one when the
     sidebar becomes an overlay. */
  /* The original's logo is a 44×40 picture right after the menu button (x=64), and the name follows
     it at x=108. Our mark is our own (`BrandMark`), drawn 36px tall in that 44px place. */
  .brand-icon {
    display: inline-flex;
    justify-content: center;
    width: 44px;
    margin: 0 -8px 0 -4px;
  }

  /*
   * The menu button and the wordmark are one block, and the block is exactly as wide as the room the
   * search field leaves it: that is where the measured 253px comes from, so the wordmark can be any
   * width without moving the search field. A longer name is clipped rather than pushing it along.
   *
   * Not `.identity`: that name belongs to the account menu's own header block above, and two rules
   * with one name in a component quietly stack.
   */
  .brand-block {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 0 0 calc(var(--keep-search-left) - var(--keep-topbar-padding));
    min-width: 0;
  }

  /* The name of the view the header is showing, in the place the app's own name stands. */
  .view-heading {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 1.375rem;
    font-weight: 500;
    letter-spacing: 0.2px;
    color: var(--keep-text);
  }

  .wordmark {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    font-size: 1.375rem;
    font-weight: 500;
    letter-spacing: 0.2px;
    color: var(--keep-text);
  }

  @media (max-width: 600px) {
    /* The original's phone bar is a hamburger and the search pill, with the actions at the right —
       there is no wordmark to fit, and reserving 253px for one is what pushed the actions 183px off
       a 412px screen. */
    .brand-block {
      flex: 0 0 auto;
    }

    .wordmark,
    .view-heading {
      display: none;
    }

    .search {
      flex: 1 1 auto;
      max-width: none;
      /* An `input` carries an intrinsic width of about twenty characters (191px here), and a flex
         item is never narrower than its content unless it is told it may be: without this the search
         kept that 256px and the bar overflowed the phone sideways. */
      min-width: 0;
    }

    .search input {
      width: 0;
    }

    /* The original's phone bar is the page's own background with the pill on it: no line under it,
       and no shadow once the notes scroll under it. */
    .topbar,
    .topbar[data-scrolled='true'] {
      border-bottom-color: transparent;
      box-shadow: none;
    }

    /* Measured off the original's Android app at 412px: the search is a full pill, 60px tall, with
       no magnifier — its hint starts 25px in — and the view's two switches inside it, centred 90px
       and 34px from its right end. */
    .search {
      height: 60px;
      gap: 8px;
      border-radius: 30px;
      padding: 0 10px 0 25px;
    }

    .search .icon-button {
      flex: 0 0 auto;
      width: 48px;
      height: 48px;
    }

    /* A phone has no refresh button (the original's phone bar has none); the offline cloud that
       stands in its place stays, because being offline is worth saying on any screen. */
    .refresh {
      display: none;
    }

    /* The 48px desktop buttons were measured on a desktop window; a phone keeps the 40px ones so
       the search pill keeps its room. */
    .menu-button,
    .actions .icon-button {
      width: 40px;
      height: 40px;
    }

    .menu-button {
      margin-left: calc(var(--keep-icon-column) - var(--keep-topbar-padding) - 20px);
    }

    :global(.avatar-button) {
      margin: 0;
    }
  }
</style>
