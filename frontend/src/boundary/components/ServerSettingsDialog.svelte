<script lang="ts">
  import { backgroundThemes } from '../../control/state/backgroundThemes.svelte';
  import { serverAdmin } from '../../control/state/serverAdmin.svelte';
  import { ui } from '../../control/state/ui.svelte';
  import { accountName } from '../../entity/account';
  import { NOTE_BACKGROUNDS } from '../../entity/api/types';
  import type { AccountUsage } from '../../entity/api/types';
  import { formatBytes, formatFullTimestamp } from '../i18n/format';
  import { t, tError } from '../i18n';
  import { confirmation } from './confirmation.svelte';
  import Avatar from './Avatar.svelte';
  import Dialog from './Dialog.svelte';
  import Icon from './Icon.svelte';

  /**
   * The administrator's own corner of the gear menu: sign-up, the instance's background themes, and
   * the accounts with the room each one takes. Everything here goes through `/api/admin`, which
   * refuses anybody else, so the menu entry is a convenience and not the guard.
   */
  interface Props {
    open: boolean;
    onClose: () => void;
  }

  let { open, onClose }: Props = $props();

  let message = $state<string | null>(null);
  let error = $state<string | null>(null);
  let busy = $state(false);
  let themeInput = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (!open) return;
    message = null;
    error = null;
    void run(() => serverAdmin.load());
  });

  /** Runs one action, showing its failure in the dialog rather than losing it. */
  async function run(action: () => Promise<string | void>): Promise<void> {
    error = null;
    message = null;
    busy = true;
    try {
      message = (await action()) ?? null;
    } catch (caught) {
      error = tError(caught as Error);
    } finally {
      busy = false;
    }
  }

  function uploadTheme(picked: FileList | null): void {
    const file = picked?.[0];
    if (!file) return;
    void run(async () => {
      try {
        const name = await serverAdmin.uploadTheme(file);
        return t('themes.uploaded', { name });
      } finally {
        if (themeInput) themeInput.value = '';
      }
    });
  }

  async function removeTheme(id: string, name: string): Promise<void> {
    if (!(await confirmation.ask(t('themes.confirmRemove', { name }), t('confirm.delete')))) return;
    await run(() => serverAdmin.removeTheme(id));
  }

  async function resetPassword(account: AccountUsage): Promise<void> {
    const name = account.user.displayName;
    if (!(await confirmation.ask(t('admin.confirmReset', { name }), t('admin.confirmResetAction')))) return;
    await run(async () => {
      await serverAdmin.resetPassword(account.user.id);
      return t('admin.resetSent', { email: account.user.email ?? '' });
    });
  }

  async function removeAccount(account: AccountUsage): Promise<void> {
    const name = account.user.displayName;
    if (!(await confirmation.ask(t('admin.confirmRemove', { name }), t('confirm.delete')))) return;
    await run(async () => {
      await serverAdmin.removeAccount(account.user.id);
      return t('admin.removed', { name });
    });
  }

  const size = (bytes: number) => formatBytes(bytes, ui.locale);
  const settings = $derived(serverAdmin.settings);
  const accounts = $derived(serverAdmin.accounts);
</script>

<Dialog {open} {onClose} title={t('admin.title')} width="640px">
  <div class="server-settings">
    <header>
      <h2>{t('admin.title')}</h2>
      <button
        type="button"
        class="icon-button"
        aria-label={t('settings.close')}
        title={t('settings.close')}
        onclick={onClose}
      >
        <Icon name="close" size={20} />
      </button>
    </header>

    {#if message}
      <p class="ok" role="status">{message}</p>
    {/if}
    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}

    {#if settings}
      <section>
        <h3>{t('admin.registration')}</h3>
        <label class="toggle">
          <input
            type="checkbox"
            checked={settings.registrationOpen}
            disabled={busy}
            onchange={(event) => {
              const next = event.currentTarget.checked;
              void run(() => serverAdmin.setRegistrationOpen(next));
            }}
          />
          <span>{t('admin.registrationOpen')}</span>
        </label>
        <p class="hint">{t('admin.registrationHint')}</p>
      </section>

      <section>
        <h3>{t('admin.themes')}</h3>
        <p class="hint">{t('admin.themesHint')}</p>
        <ul class="rows">
          {#each backgroundThemes.themes as theme (theme.id)}
            <li class="row">
              <span class="row-text">
                <span class="row-name">{theme.builtIn ? t('themes.builtIn') : theme.name}</span>
                {#if theme.author || theme.license}
                  <span class="row-meta">{[theme.author, theme.license].filter(Boolean).join(' · ')}</span>
                {/if}
              </span>
              <span class="previews" aria-hidden="true">
                {#each NOTE_BACKGROUNDS as id (id)}
                  {#if theme.previews[id]}
                    <span class="preview" style="background-image: url('{theme.previews[id]}')"></span>
                  {/if}
                {/each}
              </span>
              {#if settings.defaultThemeId === theme.id}
                <span class="badge">{t('themes.default')}</span>
              {:else}
                <button
                  type="button"
                  class="text-button"
                  disabled={busy}
                  onclick={() => void run(() => serverAdmin.setDefaultTheme(theme.id))}
                >
                  {t('themes.makeDefault')}
                </button>
              {/if}
              {#if !theme.builtIn}
                <button
                  type="button"
                  class="icon-button"
                  disabled={busy}
                  title={t('themes.remove')}
                  aria-label={t('themes.removeNamed', { name: theme.name })}
                  onclick={() => void removeTheme(theme.id, theme.name)}
                >
                  <Icon name="trash" size={20} />
                </button>
              {/if}
            </li>
          {/each}
        </ul>
        <input
          bind:this={themeInput}
          class="visually-hidden"
          type="file"
          accept=".zip,application/zip"
          onchange={(event) => uploadTheme(event.currentTarget.files)}
        />
        <button type="button" class="primary" disabled={busy} onclick={() => themeInput?.click()}>
          <Icon name="upload" size={18} />
          <span>{busy ? t('themes.uploading') : t('themes.upload')}</span>
        </button>
      </section>
    {/if}

    {#if accounts && settings}
      <section>
        <h3>{t('admin.accounts')}</h3>
        <p class="hint">
          {t('admin.storage', { size: size(accounts.databaseBytes), quota: size(accounts.imageQuotaBytes) })}
        </p>
        {#if !settings.mailConfigured}
          <p class="hint">{t('admin.mailMissing')}</p>
        {/if}
        <ul class="rows">
          {#each accounts.accounts as account (account.user.id)}
            <li class="row account">
              <Avatar --avatar-size="var(--keep-avatar-admin)" user={account.user} />
              <span class="row-text">
                <span class="row-name">
                  {account.user.displayName}
                  {#if account.user.admin}<span class="badge">{t('admin.administrator')}</span>{/if}
                </span>
                <span class="row-meta">{accountName(account.user)}</span>
                <span class="row-meta">
                  {t('admin.notes', { count: account.notes })} · {t('admin.total', { size: size(account.totalBytes) })}
                </span>
                <span class="row-meta">
                  {t('admin.usage', {
                    text: size(account.noteBytes),
                    history: size(account.historyBytes),
                    images: size(account.imageBytes)
                  })}
                </span>
                <span class="row-meta">
                  {account.lastSeenAt === null
                    ? t('admin.neverSeen')
                    : t('admin.lastSeen', { date: formatFullTimestamp(account.lastSeenAt, ui.locale) })}
                </span>
              </span>
              {#if !account.user.admin}
                <span class="actions">
                  <button
                    type="button"
                    class="icon-button"
                    disabled={busy || !settings.mailConfigured || account.user.email === null}
                    title={account.user.email === null
                      ? t('admin.noEmail')
                      : settings.mailConfigured
                        ? t('admin.resetPassword')
                        : t('admin.mailMissing')}
                    aria-label={`${t('admin.resetPassword')}: ${account.user.displayName}`}
                    onclick={() => void resetPassword(account)}
                  >
                    <Icon name="lock-reset" size={20} />
                  </button>
                  <button
                    type="button"
                    class="icon-button"
                    disabled={busy}
                    title={t('admin.removeAccount')}
                    aria-label={`${t('admin.removeAccount')}: ${account.user.displayName}`}
                    onclick={() => void removeAccount(account)}
                  >
                    <Icon name="person-remove" size={20} />
                  </button>
                </span>
              {/if}
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  </div>
</Dialog>

<style>
  .server-settings {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 16px 20px 24px;
  }

  h3 {
    margin: 0 0 8px;
    font-size: 0.8125rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--keep-text-secondary);
  }

  section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .hint {
    margin: 0;
    font-size: 0.75rem;
    color: var(--keep-text-secondary);
  }

  .toggle {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.875rem;
  }

  .toggle input {
    width: 18px;
    height: 18px;
    margin: 0;
    accent-color: var(--keep-accent);
  }

  .rows {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
    padding: 8px 8px 8px 12px;
    border: 1px solid var(--keep-divider);
    border-radius: 4px;
  }

  .row.account {
    flex-wrap: nowrap;
    align-items: flex-start;
  }

  .row-text {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .row-name {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    font-size: 0.875rem;
  }

  .row-meta {
    font-size: 0.75rem;
    color: var(--keep-text-secondary);
  }

  .previews {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .preview {
    width: 22px;
    height: 22px;
    border: 1px solid var(--keep-divider);
    border-radius: 50%;
    background-position: center;
    background-size: cover;
  }

  .badge {
    padding: 2px 8px;
    border-radius: 12px;
    background: var(--keep-hover);
    font-size: 0.6875rem;
    font-weight: 500;
    color: var(--keep-text);
  }

  .text-button {
    padding: 4px 8px;
    border-radius: 4px;
    color: var(--keep-accent);
    font-size: 0.8125rem;
    font-weight: 500;
  }

  .actions {
    display: flex;
    flex: 0 0 auto;
  }

  .icon-button:disabled,
  .text-button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .primary {
    display: inline-flex;
    align-self: flex-start;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    border-radius: 4px;
    background: var(--keep-accent);
    color: #fff;
    font-weight: 500;
  }

  .primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .ok {
    margin: 0;
    color: var(--keep-success);
    font-size: 0.8125rem;
  }

  .error {
    margin: 0;
    color: var(--keep-danger);
    font-size: 0.8125rem;
  }
</style>
