<script lang="ts">
  import { Combobox } from 'bits-ui';
  import { toast } from 'svelte-sonner';
  import { accountName } from '../../entity/account';
  import { ApiError } from '../../control/api/client';
  import { notesApi } from '../../control/api/notes';
  import { friends } from '../../control/state/friends.svelte';
  import { ui } from '../../control/state/ui.svelte';
  import { friendSuggestions, type FriendSuggestion } from '../../entity/friendSuggestions';
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
    // The suggestions are a convenience: without them the address can still be typed.
    void friends.load().catch(() => undefined);
  });

  /** Who already has the note: nobody is offered twice. */
  const present = $derived(new Set([...(note ? [note.owner.id] : []), ...shares.map((share) => share.user.id)]));
  const suggestions = $derived(friendSuggestions(email, friends.friends, friends.groups, present));
  let suggesting = $state(false);

  function suggestionValue(suggestion: FriendSuggestion): string {
    return suggestion.kind === 'group' ? `group:${suggestion.group.id}` : `friend:${suggestion.user.id}`;
  }

  /** Picking a friend shares with them; picking a group shares with each member, one share at a time. */
  async function pickSuggestion(value: string): Promise<void> {
    const picked = suggestions.find((suggestion) => suggestionValue(suggestion) === value);
    suggesting = false;
    if (!picked) return;
    email = '';
    const people = picked.kind === 'group' ? picked.members : [picked.user];
    const added = await shareWith(people.flatMap((person) => (person.email ? [person.email] : [])));
    if (picked.kind === 'group' && added > 0) toast.success(t('share.groupShared', { count: added }));
  }

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
    const target = email.trim();
    if (!target) return;
    if ((await shareWith([target])) > 0) email = '';
  }

  /**
   * Shares the note with every address, through the ordinary share call each time — a group is not a
   * second write path. Somebody who has the note already is passed over; the first other failure is
   * shown and stops the rest. Answers how many shares were made.
   */
  async function shareWith(addresses: string[]): Promise<number> {
    if (noteId === null) return 0;
    error = null;
    let added = 0;
    try {
      for (const address of addresses) {
        try {
          const share = await notesApi.addShare(noteId, { email: address, permission });
          shares = [...shares, { user: share.user, permission: share.permission }];
          added += 1;
        } catch (caught) {
          if (!(caught instanceof ApiError && caught.key === 'share.already_shared' && addresses.length > 1)) throw caught;
        }
      }
    } catch (caught) {
      error = tError(caught as Error);
    }
    if (added > 0) await notesState.refresh();
    return added;
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

<Dialog
  open={noteId !== null}
  {onClose}
  title={t('share.title')}
  width="520px"
  closeOnOutsideClick={!ui.friendsDialogOpen}
>
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
        <Combobox.Root
          type="single"
          value=""
          inputValue={email}
          open={suggesting && suggestions.length > 0}
          onOpenChange={(next) => (suggesting = next)}
          onValueChange={(value) => void pickSuggestion(value)}
          items={suggestions.map((suggestion) => ({ value: suggestionValue(suggestion), label: '' }))}
        >
          <Combobox.Input
            type="email"
            autocomplete="off"
            placeholder={t('share.emailPlaceholder')}
            aria-label={t('share.emailLabel')}
            class="share-input"
            oninput={(event) => {
              email = event.currentTarget.value;
              suggesting = true;
            }}
          />
          <Combobox.Portal>
            <Combobox.Content
              class="share-suggestions"
              data-overlay="share-suggestions"
              sideOffset={4}
              align="start"
              aria-label={t('share.suggestionsLabel')}
            >
              {#each suggestions as suggestion (suggestionValue(suggestion))}
                <Combobox.Item class="share-suggestion" value={suggestionValue(suggestion)} label={email}>
                  {#if suggestion.kind === 'group'}
                    <span class="group-icon"><Icon name="group" size={20} /></span>
                    <span class="who">
                      <strong>{suggestion.group.name}</strong>
                      <span>{t('share.groupMembers', { count: suggestion.members.length })}</span>
                    </span>
                  {:else}
                    <Avatar --avatar-size="var(--keep-avatar-share)" --avatar-ring="var(--keep-avatar-dialog-ring)" --avatar-ring-shadow="var(--keep-avatar-dialog-shadow)" user={suggestion.user} />
                    <span class="who">
                      <strong>{suggestion.user.displayName}</strong>
                      <span>{accountName(suggestion.user)}</span>
                    </span>
                  {/if}
                </Combobox.Item>
              {/each}
            </Combobox.Content>
          </Combobox.Portal>
        </Combobox.Root>
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

    {#if canManage}
      <button type="button" class="manage" onclick={() => (ui.friendsDialogOpen = true)}>
        <Icon name="group" size={18} />
        <span>{t('share.manageFriends')}</span>
      </button>
    {/if}

    {#if loading}
      <p class="muted">{t('share.loading')}</p>
    {:else if shares.length === 0}
      <p class="muted">{t('share.empty')}</p>
    {:else}
      <ul class="list">
        {#if note}
          <li>
            <Avatar --avatar-size="var(--keep-avatar-share)" --avatar-ring="var(--keep-avatar-dialog-ring)" --avatar-ring-shadow="var(--keep-avatar-dialog-shadow)" user={note.owner} />
            <span class="who">
              <strong>{note.owner.displayName} <em>({t('share.owner')})</em></strong>
              <span>{accountName(note.owner)}</span>
            </span>
          </li>
        {/if}
        {#each shares as share (share.user.id)}
          <li>
            <Avatar --avatar-size="var(--keep-avatar-share)" --avatar-ring="var(--keep-avatar-dialog-ring)" --avatar-ring-shadow="var(--keep-avatar-dialog-shadow)" user={share.user} />
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

  /* bits-ui renders the input and the list, so their classes are global and namespaced. */
  :global(.share-input) {
    flex: 1 1 auto;
    min-width: 0;
    padding: 10px 12px;
    border: 1px solid var(--keep-divider);
    border-radius: 4px;
    background: transparent;
  }

  :global(.share-suggestions) {
    z-index: 70;
    width: var(--bits-combobox-anchor-width);
    min-width: 240px;
    max-height: var(--bits-combobox-content-available-height);
    overflow-y: auto;
    padding: 6px 0;
    border-radius: 4px;
    background: var(--keep-surface);
    color: var(--keep-text);
    box-shadow: var(--keep-shadow-popover);
  }

  :global(.share-suggestion) {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 12px;
    cursor: pointer;
  }

  :global(.share-suggestion[data-highlighted]) {
    background: var(--keep-hover);
  }

  .group-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--keep-avatar-share);
    height: var(--keep-avatar-share);
    border-radius: 50%;
    background: var(--keep-hover);
    color: var(--keep-text-secondary);
    flex: 0 0 auto;
  }

  .manage {
    display: inline-flex;
    align-self: flex-start;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border-radius: 4px;
    color: var(--keep-accent);
    font-size: 0.875rem;
    font-weight: 500;
  }

  .manage:hover {
    background: var(--keep-hover);
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
