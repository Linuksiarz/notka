<script lang="ts">
  import { confirmation } from './confirmation.svelte';
  import type { Label } from '../../entity/api/types';
  import { labels as labelsState } from '../../control/state/labels.svelte';
  import { notes as notesState } from '../../control/state/notes.svelte';
  import { ui } from '../../control/state/ui.svelte';
  import { t, tError } from '../i18n';
  import Dialog from './Dialog.svelte';
  import Icon from './Icon.svelte';

  interface Props {
    open: boolean;
    onClose: () => void;
  }

  let { open, onClose }: Props = $props();

  let drafts = $state<Record<number, string>>({});
  let newName = $state('');
  let error = $state<string | null>(null);

  function draftFor(label: Label): string {
    return drafts[label.id] ?? label.name;
  }

  async function guard(action: () => Promise<void>): Promise<void> {
    error = null;
    try {
      await action();
    } catch (caught) {
      error = tError(caught as Error);
    }
  }

  function create(): void {
    const name = newName.trim();
    if (!name) return;
    void guard(async () => {
      await labelsState.create(name);
      newName = '';
    });
  }

  function commit(label: Label): void {
    const next = draftFor(label).trim();
    if (!next || next === label.name) {
      drafts = { ...drafts, [label.id]: label.name };
      return;
    }
    void guard(async () => {
      await labelsState.rename(label.id, next);
      await notesState.refresh();
    });
  }

  async function remove(label: Label): Promise<void> {
    if (!(await confirmation.ask(t('labels.confirmDelete', { name: label.name }), t('confirm.delete')))) return;
    void guard(async () => {
      await labelsState.remove(label.id);
      await notesState.refresh();
    });
  }
</script>

<!-- While the confirmation is up, a click in it is outside this dialog and must not close it. -->
<Dialog
  {open}
  {onClose}
  title={t('labels.dialogTitle')}
  width="440px"
  closeOnOutsideClick={confirmation.request === null}
>
  <div class="labels">
    <header>
      <h2>{t('labels.dialogTitle')}</h2>
      <button
        type="button"
        class="icon-button"
        aria-label={t('labels.close')}
        title={t('labels.close')}
        onclick={onClose}
      >
        <Icon name="close" size={20} />
      </button>
    </header>

    <form
      class="create"
      onsubmit={(event) => {
        event.preventDefault();
        create();
      }}
    >
      <Icon name="plus" size={22} />
      <input
        type="text"
        placeholder={t('labels.newPlaceholder')}
        aria-label={t('labels.newLabelName')}
        bind:value={newName}
      />
      <button
        type="submit"
        class="icon-button"
        aria-label={t('labels.createLabel')}
        title={t('labels.createLabel')}
        disabled={!newName.trim()}
      >
        <Icon name="check" size={20} />
      </button>
    </form>

    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}

    {#if labelsState.labels.length === 0}
      <p class="muted">{t('labels.privateHint')}</p>
    {:else}
      <ul class="list">
        {#each labelsState.labels as label (label.id)}
          <li>
            <Icon name="label" size={22} />
            <input
              type="text"
              value={draftFor(label)}
              aria-label={t('labels.rename', { name: label.name })}
              oninput={(event) =>
                (drafts = { ...drafts, [label.id]: (event.currentTarget as HTMLInputElement).value })}
              onblur={() => commit(label)}
              onkeydown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  (event.currentTarget as HTMLInputElement).blur();
                }
              }}
            />
            <button
              type="button"
              class="icon-button"
              aria-label={t('labels.delete', { name: label.name })}
              onclick={() => remove(label)}
            >
              <Icon name="trash" size={20} />
            </button>
          </li>
        {/each}
      </ul>
    {/if}

    <button type="button" class="done" onclick={onClose}>{t('labels.close')}</button>
  </div>
</Dialog>

<style>
  .labels {
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

  .create,
  li {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  input {
    flex: 1 1 auto;
    min-width: 0;
    padding: 8px 4px;
    border: 0;
    border-bottom: 1px solid transparent;
    background: transparent;
    outline: none;
    color: var(--keep-text);
  }

  input:focus {
    border-bottom-color: var(--keep-accent);
  }

  .list {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
    max-height: 40vh;
    overflow-y: auto;
  }

  .error {
    margin: 0;
    color: var(--keep-danger);
    font-size: 0.8125rem;
  }

  .muted,

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
