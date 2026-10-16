<script lang="ts">
  import { notesApi } from '../../control/api/notes';
  import type { NoteVersionSummary } from '../../entity/api/types';
  import { noteToMarkdown } from '../../entity/markdown';
  import { safeFileName, saveMarkdownFile } from '../download';
  import { ui } from '../../control/state/ui.svelte';
  import { t, tError } from '../i18n';
  import { formatFullTimestamp } from '../i18n/format';
  import Dialog from './Dialog.svelte';
  import Icon from './Icon.svelte';

  /**
   * Previous states of a note, as Google Keep lists them, with the difference that a download is
   * Markdown rather than plain text — the conversion already exists and is tested.
   *
   * The list endpoint carries no documents, so each download fetches the version it needs.
   */
  interface Props {
    noteId: number | null;
    onClose: () => void;
  }

  let { noteId, onClose }: Props = $props();

  let versions = $state<NoteVersionSummary[]>([]);
  let loading = $state(false);
  let busyVersion = $state<number | null>(null);
  let error = $state<string | null>(null);

  $effect(() => {
    const id = noteId;
    if (id === null) {
      versions = [];
      error = null;
      return;
    }
    void load(id);
  });

  async function load(id: number): Promise<void> {
    loading = true;
    error = null;
    try {
      versions = await notesApi.listVersions(id);
    } catch (caught) {
      error = tError(caught as Error);
    } finally {
      loading = false;
    }
  }

  async function download(entry: NoteVersionSummary): Promise<void> {
    if (noteId === null) return;
    busyVersion = entry.version;
    error = null;
    try {
      const full = await notesApi.getVersion(noteId, entry.version);
      saveAsFile(noteToMarkdown({ title: full.title, content: full.content }), entry);
    } catch (caught) {
      error = tError(caught as Error);
    } finally {
      busyVersion = null;
    }
  }

  function saveAsFile(markdown: string, entry: NoteVersionSummary): void {
    const name = entry.title.trim() || t('card.note');
    saveMarkdownFile(`${safeFileName(name)} (v${entry.version})`, markdown);
  }
</script>

<Dialog open={noteId !== null} onClose={onClose} title={t('history.title')} width="520px">
  <div class="history">
    <header>
      <h2>{t('history.title')}</h2>
      <button
        type="button"
        class="icon-button"
        aria-label={t('history.close')}
        title={t('history.close')}
        onclick={onClose}
      >
        <Icon name="close" size={20} />
      </button>
    </header>

    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}

    {#if loading}
      <p class="muted">{t('history.loading')}</p>
    {:else if versions.length === 0}
      <p class="muted">{t('history.empty')}</p>
    {:else}
      <p class="heading">{t('history.previous')}</p>
      <ul class="list">
        {#each versions as entry (entry.version)}
          <li>
            <span class="what">
              <strong>{t('history.entry', { version: entry.version })}</strong>
              <span>{entry.title || t('card.note')}</span>
              <small>
                {t('history.savedAt', { date: formatFullTimestamp(entry.createdAt, ui.locale) })}
                &middot;
                {t('history.by', { name: entry.author.displayName })}
              </small>
            </span>
            <button
              type="button"
              class="icon-button"
              title={t('history.download')}
              aria-label={t('history.download')}
              disabled={busyVersion === entry.version}
              onclick={() => void download(entry)}
            >
              <Icon name="download" size={20} />
            </button>
          </li>
        {/each}
      </ul>
    {/if}

    <button type="button" class="done" onclick={onClose}>{t('history.close')}</button>
  </div>
</Dialog>

<style>
  .history {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px 20px 20px;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  h2 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 500;
  }

  .heading {
    margin: 8px 0 0;
    font-size: 0.6875rem;
    font-weight: 500;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    color: var(--keep-text-secondary);
  }

  .list {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
    max-height: 46vh;
    overflow-y: auto;
  }

  .list li {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 0;
    border-bottom: 1px solid var(--keep-divider);
  }

  .what {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1 1 auto;
    min-width: 0;
  }

  .what span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .what small {
    color: var(--keep-text-secondary);
    font-size: 0.6875rem;
  }

  .muted {
    margin: 0;
    color: var(--keep-text-secondary);
    font-size: 0.8125rem;
    line-height: 1.5;
  }

  .error {
    margin: 0;
    color: var(--keep-danger);
    font-size: 0.8125rem;
  }

  .done {
    align-self: flex-end;
    padding: 8px 16px;
    border-radius: 4px;
    color: var(--keep-accent);
    font-weight: 500;
  }

  .done:hover {
    background: var(--keep-hover);
  }
</style>
