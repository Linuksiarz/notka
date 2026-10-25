<script lang="ts">
  import { accountName } from '../../entity/account';
  import type { FriendGroup } from '../../entity/api/types';
  import { friends } from '../../control/state/friends.svelte';
  import { t, tError } from '../i18n';
  import Avatar from './Avatar.svelte';
  import Dialog from './Dialog.svelte';
  import Icon from './Icon.svelte';

  /**
   * The reader's friends and groups, both the account's own and seen by nobody else. A group opens
   * like a `<details>` — the platform's own disclosure — onto its name and a tick for every friend.
   */
  interface Props {
    open: boolean;
    onClose: () => void;
  }

  let { open, onClose }: Props = $props();

  let login = $state('');
  let groupName = $state('');
  let loading = $state(false);
  let error = $state<string | null>(null);
  let message = $state<string | null>(null);

  $effect(() => {
    if (!open) {
      login = '';
      groupName = '';
      error = null;
      message = null;
      return;
    }
    void load();
  });

  async function load(): Promise<void> {
    loading = !friends.loaded;
    try {
      await friends.load();
    } catch (caught) {
      error = tError(caught as Error);
    } finally {
      loading = false;
    }
  }

  async function attempt(action: () => Promise<void>): Promise<void> {
    error = null;
    message = null;
    try {
      await action();
    } catch (caught) {
      error = tError(caught as Error);
    }
  }

  const addFriend = () =>
    attempt(async () => {
      const added = await friends.add(login.trim());
      login = '';
      message = t('friends.added', { name: added.displayName });
    });

  const createGroup = () =>
    attempt(async () => {
      await friends.createGroup(groupName.trim());
      groupName = '';
    });

  function rename(group: FriendGroup, next: string): void {
    const name = next.trim();
    if (name && name !== group.name) void attempt(() => friends.updateGroup(group.id, { name }));
  }

  function toggleMember(group: FriendGroup, userId: number, member: boolean): void {
    const memberIds = member ? [...group.memberIds, userId] : group.memberIds.filter((id) => id !== userId);
    void attempt(() => friends.updateGroup(group.id, { memberIds }));
  }
</script>

<Dialog {open} {onClose} title={t('friends.title')} width="520px">
  <div class="friends" data-testid="friends-dialog">
    <header>
      <h2>{t('friends.title')}</h2>
      <button type="button" class="icon-button" aria-label={t('friends.close')} title={t('friends.close')} onclick={onClose}>
        <Icon name="close" size={20} />
      </button>
    </header>
    <p class="muted">{t('friends.hint')}</p>

    <form
      class="row-form"
      onsubmit={(event) => {
        event.preventDefault();
        if (login.trim()) void addFriend();
      }}
    >
      <input
        type="text"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        placeholder={t('friends.addPlaceholder')}
        aria-label={t('friends.addLabel')}
        bind:value={login}
      />
      <button type="submit" class="submit" disabled={login.trim().length === 0}>{t('friends.add')}</button>
    </form>

    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}
    {#if message}
      <p class="ok" role="status">{message}</p>
    {/if}

    {#if loading}
      <p class="muted">{t('friends.loading')}</p>
    {:else}
      <h3>{t('friends.friendsHeading')}</h3>
      {#if friends.friends.length === 0}
        <p class="muted">{t('friends.empty')}</p>
      {:else}
        <ul class="list" data-testid="friends-list">
          {#each friends.friends as friend (friend.id)}
            <li>
              <Avatar --avatar-size="var(--keep-avatar-share)" --avatar-ring="var(--keep-avatar-dialog-ring)" --avatar-ring-shadow="var(--keep-avatar-dialog-shadow)" user={friend} />
              <span class="who">
                <strong>{friend.displayName}</strong>
                <span>{accountName(friend)}</span>
              </span>
              <button
                type="button"
                class="icon-button"
                aria-label={t('friends.remove', { name: friend.displayName })}
                title={t('friends.remove', { name: friend.displayName })}
                onclick={() => void attempt(() => friends.remove(friend.id))}
              >
                <Icon name="person-remove" size={20} />
              </button>
            </li>
          {/each}
        </ul>
      {/if}

      <h3>{t('friends.groupsHeading')}</h3>
      <form
        class="row-form"
        onsubmit={(event) => {
          event.preventDefault();
          if (groupName.trim()) void createGroup();
        }}
      >
        <input
          type="text"
          autocomplete="off"
          placeholder={t('friends.newGroupPlaceholder')}
          aria-label={t('friends.newGroupLabel')}
          bind:value={groupName}
        />
        <button type="submit" class="submit" disabled={groupName.trim().length === 0}>
          {t('friends.createGroup')}
        </button>
      </form>
      {#if friends.groups.length === 0}
        <p class="muted">{t('friends.groupsEmpty')}</p>
      {:else}
        <ul class="list groups" data-testid="groups-list">
          {#each friends.groups as group (group.id)}
            <li>
              <details>
                <summary>
                  <Icon name="group" size={20} />
                  <span class="who">
                    <strong>{group.name}</strong>
                    <span>{t('friends.members', { count: group.memberIds.length })}</span>
                  </span>
                  <Icon name="expand-more" size={20} />
                </summary>
                <div class="group-body">
                  <div class="row-form">
                    <input
                      type="text"
                      value={group.name}
                      aria-label={t('friends.groupName', { name: group.name })}
                      onchange={(event) => rename(group, event.currentTarget.value)}
                    />
                    <button
                      type="button"
                      class="icon-button"
                      aria-label={t('friends.deleteGroup', { name: group.name })}
                      title={t('friends.deleteGroup', { name: group.name })}
                      onclick={() => void attempt(() => friends.removeGroup(group.id))}
                    >
                      <Icon name="trash" size={20} />
                    </button>
                  </div>
                  {#if friends.friends.length === 0}
                    <p class="muted">{t('friends.noFriendsForGroup')}</p>
                  {:else}
                    {#each friends.friends as friend (friend.id)}
                      <label class="member">
                        <input
                          type="checkbox"
                          checked={group.memberIds.includes(friend.id)}
                          onchange={(event) => toggleMember(group, friend.id, event.currentTarget.checked)}
                        />
                        <Avatar --avatar-size="24px" user={friend} />
                        <span>{friend.displayName}</span>
                      </label>
                    {/each}
                  {/if}
                </div>
              </details>
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
  </div>
</Dialog>

<style>
  .friends {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px 20px 20px;
  }

  h3 {
    margin: 8px 0 0;
    color: var(--keep-text-secondary);
    font-size: 0.6875rem;
    font-weight: 500;
    letter-spacing: 0.8px;
    text-transform: uppercase;
  }

  .row-form {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .row-form input {
    flex: 1 1 auto;
    min-width: 0;
    padding: 10px 12px;
    border: 1px solid var(--keep-divider);
    border-radius: 4px;
    background: transparent;
  }

  .submit {
    padding: 10px 16px;
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

  .ok {
    margin: 0;
    color: var(--keep-success);
    font-size: 0.8125rem;
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .list li,
  summary {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 0;
  }

  summary {
    cursor: pointer;
    list-style: none;
  }

  summary::-webkit-details-marker {
    display: none;
  }

  details[open] summary :global(svg:last-child) {
    transform: rotate(180deg);
  }

  .groups li {
    display: block;
    padding: 0;
  }

  .group-body {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 4px 0 12px 32px;
  }

  .member {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.875rem;
    cursor: pointer;
  }

  .member input {
    accent-color: var(--keep-accent);
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
