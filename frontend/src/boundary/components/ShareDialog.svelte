<script lang="ts">
  import { accountName } from '../../entity/account';
  import { notesApi } from '../../control/api/notes';
  import type { SharePermission, User } from '../../entity/api/types';
  import { notes as notesState } from '../../control/state/notes.svelte';
  import { t, tError } from '../i18n';
  import Avatar from './Avatar.svelte';
  import Dialog from './Dialog.svelte';
  import Icon from './Icon.svelte';

  interface Props {
    noteId: number | null;
    onClose: () => void;
  }

  let { noteId, onClose }: Props = $props();

  interface ShareRow {
    user: User;
    permission: SharePermission;
  }

  let shares = $state<ShareRow[]>([]);
  /**
   * The original's collaborators are everyone's to see and every editor's to change; the owner heads
   * the list and is nobody's to remove.
   */
  const note = $derived(noteId === null ? undefined : notesState.byIdAnywhere(noteId));
  const canManage = $derived(note?.canEdit ?? false);
  let email = $state('');
  let permission = $state<SharePermission>('EDIT');
  let loading = $state(false);
  let error = $state<string | null>(null);

  $effect(() => {
    const id = noteId;
    if (id === null) {
      shares = [];
      email = '';
      error = null;
      return;
    }
    void load(id);
  });

  async function load(id: number): Promise<void> {
    loading = true;
    error = null;
    try {
      const response = await notesApi.listShares(id);
      shares = response.shares.map((share) => ({ user: share.user, permission: share.permission }));
    } catch (caught) {
      error = tError(caught as Error);
    } finally {
      loading = false;
    }
  }

  async function invite(): Promise<void> {
    if (noteId === null) return;
    const target = email.trim();
    if (!target) return;
    error = null;
    try {
      const share = await notesApi.addShare(noteId, { email: target, permission });
      shares = [...shares, { user: share.user, permission: share.permission }];
      email = '';
      await notesState.refresh();
    } catch (caught) {
      error = tError(caught as Error);
    }
  }

  async function changePermission(userId: number, next: SharePermission): Promise<void> {
    if (noteId === null) return;
    try {
      const share = await notesApi.updateShare(noteId, userId, next);
      shares = shares.map((row) =>
        row.user.id === userId ? { ...row, permission: share.permission } : row
      );
      await notesState.refresh();
    } catch (caught) {
      error = tError(caught as Error);
    }
  }

  async function remove(userId: number): Promise<void> {
    if (noteId === null) return;
    try {
      await notesApi.removeShare(noteId, userId);
      shares = shares.filter((row) => row.user.id !== userId);
      await notesState.refresh();
    } catch (caught) {
      error = tError(caught as Error);
    }
  }
</script>

<Dialog open={noteId !== null} onClose={onClose} title={t('share.title')} width="520px">
  <div class="share">
    <header>
      <h2>{t('share.title')}</h2>
      <button
        type="button"
        class="icon-button"
        aria-label={t('share.close')}
        title={t('share.close')}
        onclick={onClose}
      >
        <Icon name="close" size={20} />
      </button>
    </header>

    {#if canManage}
      <form
        class="invite"
        onsubmit={(event) => {
          event.preventDefault();
          void invite();
        }}
      >
        <input
          type="email"
          placeholder={t('share.emailPlaceholder')}
          aria-label={t('share.emailLabel')}
          bind:value={email}
        />
        <select bind:value={permission} aria-label={t('share.permissionLabel')}>
          <option value="EDIT">{t('share.canEdit')}</option>
          <option value="VIEW">{t('share.viewOnly')}</option>
        </select>
        <button type="submit" class="submit" disabled={email.trim().length === 0}>
          {t('share.invite')}
        </button>
      </form>
    {/if}

    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}

    {#if loading}
      <p class="muted">{t('share.loading')}</p>
    {:else if shares.length === 0}
      <p class="muted">{t('share.empty')}</p>
    {:else}
      <ul class="list">
        {#if note}
          <li>
            <Avatar --avatar-size="var(--keep-avatar-share)" user={note.owner} />
            <span class="who">
              <strong>{note.owner.displayName} <em>({t('share.owner')})</em></strong>
              <span>{accountName(note.owner)}</span>
            </span>
          </li>
        {/if}
        {#each shares as share (share.user.id)}
          <li>
            <Avatar --avatar-size="var(--keep-avatar-share)" user={share.user} />
            <span class="who">
              <strong>{share.user.displayName}</strong>
              <span>{accountName(share.user)}</span>
            </span>
            {#if canManage}
              <select
                value={share.permission}
                aria-label={t('share.permissionFor', { name: share.user.displayName })}
                onchange={(event) =>
                  void changePermission(
                    share.user.id,
                    (event.currentTarget as HTMLSelectElement).value as SharePermission
                  )}
              >
                <option value="EDIT">{t('share.canEdit')}</option>
                <option value="VIEW">{t('share.viewOnly')}</option>
              </select>
              <button
                type="button"
                class="icon-button"
                aria-label={t('share.remove', { name: share.user.displayName })}
                onclick={() => void remove(share.user.id)}
              >
                <Icon name="close" size={18} />
              </button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</Dialog>

<style>
  .who em {
    font-style: normal;
    font-weight: 400;
  }

  .share {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px 20px 20px;
  }

  .invite {
    display: flex;
    gap: 8px;
  }

  .invite input {
    flex: 1 1 auto;
    min-width: 0;
    padding: 10px 12px;
    border: 1px solid var(--keep-divider);
    border-radius: 4px;
    background: transparent;
  }

  select {
    padding: 8px;
    border: 1px solid var(--keep-divider);
    border-radius: 4px;
    background: var(--keep-surface);
    color: var(--keep-text);
  }

  .submit {
    padding: 0 16px;
    border-radius: 4px;
    color: var(--keep-accent);
    font-weight: 500;
  }

  .submit:hover:not(:disabled) {
    background: var(--keep-hover);
  }

  .submit:disabled {
    color: var(--keep-text-disabled);
    cursor: not-allowed;
  }

  .error {
    margin: 0;
    color: var(--keep-danger);
    font-size: 0.8125rem;
  }

  .muted {
    margin: 0;
    color: var(--keep-text-secondary);
    font-size: 0.8125rem;
    line-height: 1.5;
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .list li {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 0;
  }

  .who {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-width: 0;
  }

  .who span {
    color: var(--keep-text-secondary);
    font-size: 0.75rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
