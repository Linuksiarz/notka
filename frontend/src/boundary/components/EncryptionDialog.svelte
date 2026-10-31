<script lang="ts">
  import { toast } from 'svelte-sonner';
  import { notes } from '../../control/state/notes.svelte';
  import { session } from '../../control/state/session.svelte';
  import { t, tError } from '../i18n';
  import Dialog from './Dialog.svelte';
  import Icon from './Icon.svelte';

  /**
   * Turning encryption on (`docs/ENCRYPTION.md`): the password first — it is what the account's key
   * is wrapped with, or a passphrase chosen here for an account that signs in through the identity
   * provider and has none — and then, once, the recovery key, with what it is for and the choice that
   * decides whether notes with links are encrypted too.
   */
  interface Props {
    open: boolean;
    onClose: () => void;
  }

  let { open, onClose }: Props = $props();

  let password = $state('');
  let passphraseAgain = $state('');
  const choosesPassphrase = $derived(session.user?.hasPassword === false);
  let recoveryKey = $state<string | null>(null);
  let busy = $state(false);
  let error = $state<string | null>(null);

  // Every opening starts again from the password; the recovery key is never shown a second time.
  $effect(() => {
    if (!open) return;
    password = '';
    passphraseAgain = '';
    recoveryKey = null;
    error = null;
  });

  async function enable(): Promise<void> {
    error = null;
    if (choosesPassphrase && password !== passphraseAgain) {
      error = t('encryption.passphraseMismatch');
      return;
    }
    busy = true;
    try {
      recoveryKey = await session.enableEncryption(choosesPassphrase ? { passphrase: password } : { password });
      password = '';
      passphraseAgain = '';
      void notes.refresh();
    } catch (caught) {
      error = tError(caught as Error);
    } finally {
      busy = false;
    }
  }

  async function copy(): Promise<void> {
    if (!recoveryKey) return;
    try {
      await navigator.clipboard.writeText(recoveryKey);
      toast.success(t('encryption.recoveryCopied'));
    } catch {
      toast.error(t('common.somethingWentWrong'));
    }
  }

  /** Applied as it is ticked, so closing the dialog any way at all keeps the choice. */
  async function setLinkPreviews(enabled: boolean): Promise<void> {
    error = null;
    try {
      await session.setLinkPreviews(enabled);
      void notes.refresh();
    } catch (caught) {
      error = tError(caught as Error);
    }
  }
</script>

<Dialog {open} {onClose} title={recoveryKey ? t('encryption.recoveryTitle') : t('encryption.enableTitle')} width="480px">
  <div class="encryption-dialog">
    <header>
      <h2>{recoveryKey ? t('encryption.recoveryTitle') : t('encryption.enableTitle')}</h2>
      <button type="button" class="icon-button" aria-label={t('settings.close')} title={t('settings.close')} onclick={onClose}>
        <Icon name="close" size={20} />
      </button>
    </header>

    {#if recoveryKey === null}
      <p>{t('encryption.enableText')}</p>
      <p>{t('encryption.enableShared')}</p>
      <form
        onsubmit={(event) => {
          event.preventDefault();
          void enable();
        }}
      >
        {#if choosesPassphrase}
          <p class="hint">{t('encryption.passphraseText')}</p>
          <label>
            <span>{t('encryption.passphrase')}</span>
            <!-- svelte-ignore a11y_autofocus -->
            <input type="password" autocomplete="new-password" required autofocus bind:value={password} />
          </label>
          <label>
            <span>{t('encryption.passphraseAgain')}</span>
            <input type="password" autocomplete="new-password" required bind:value={passphraseAgain} />
          </label>
        {:else}
          <label>
            <span>{t('settings.currentPassword')}</span>
            <!-- svelte-ignore a11y_autofocus -->
            <input type="password" autocomplete="current-password" required autofocus bind:value={password} />
          </label>
        {/if}
        <p class="hint">{t('encryption.enableSignOut')}</p>

        {#if error}
          <p class="error" role="alert">{error}</p>
        {/if}

        <footer>
          <span class="spacer"></span>
          <button type="button" class="text" disabled={busy} onclick={onClose}>{t('encryption.cancel')}</button>
          <button type="submit" class="text strong" disabled={busy || password === ''}>
            {busy ? t('encryption.enabling') : t('encryption.enable')}
          </button>
        </footer>
      </form>
    {:else}
      <p>{t('encryption.recoveryText')}</p>
      <div class="recovery-key">
        <code data-testid="recovery-key">{recoveryKey}</code>
        <button type="button" class="icon-button" aria-label={t('encryption.recoveryCopy')} title={t('encryption.recoveryCopy')} onclick={() => void copy()}>
          <Icon name="content-copy" size={20} />
        </button>
      </div>
      <p class="warning">{t('encryption.recoveryWarning')}</p>

      <label class="toggle">
        <input
          type="checkbox"
          checked={!(session.user?.linkPreviews ?? true)}
          onchange={(event) => void setLinkPreviews(!event.currentTarget.checked)}
        />
        <span>{t('encryption.disableLinkPreviews')}</span>
      </label>
      <p class="hint">{t('encryption.disableLinkPreviewsHint')}</p>

      {#if error}
        <p class="error" role="alert">{error}</p>
      {/if}

      <footer>
        <span class="spacer"></span>
        <button type="button" class="text strong" onclick={onClose}>{t('encryption.recoveryDone')}</button>
      </footer>
    {/if}
  </div>
</Dialog>

<style>
  .encryption-dialog {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px 20px 12px;
    font-size: 0.875rem;
    line-height: 1.25rem;
  }

  p {
    margin: 0;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.75rem;
    color: var(--keep-text-secondary);
  }

  input:not([type='checkbox']) {
    padding: 10px 12px;
    border: 1px solid var(--keep-divider);
    border-radius: 4px;
    background: transparent;
    color: var(--keep-text);
    font-size: 0.875rem;
  }

  .toggle {
    flex-direction: row;
    align-items: center;
    gap: 10px;
    font-size: 0.875rem;
    color: var(--keep-text);
  }

  .toggle input {
    width: 18px;
    height: 18px;
    margin: 0;
    accent-color: var(--keep-accent);
  }

  /* Written down by hand: monospace, large enough to copy letter by letter, and on one line in the
     dialog's width; a narrower screen wraps it between groups. */
  .recovery-key {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px;
    border: 1px solid var(--keep-divider);
    border-radius: 4px;
  }

  .recovery-key code {
    flex: 1 1 auto;
    font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
    font-size: 0.9375rem;
    line-height: 1.5rem;
    user-select: all;
  }

  .hint {
    font-size: 0.75rem;
    color: var(--keep-text-secondary);
  }

  .warning {
    color: var(--keep-danger);
  }

  .error {
    color: var(--keep-danger);
    font-size: 0.8125rem;
  }

  footer {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .spacer {
    flex: 1 1 auto;
  }

  /* The original's dialog actions: flat text buttons, the confirming one in the accent. */
  .text {
    padding: 8px 12px;
    border-radius: 4px;
    font-weight: 500;
    font-size: 0.875rem;
  }

  .text:hover:not(:disabled) {
    background: var(--keep-hover);
  }

  .text.strong {
    color: var(--keep-accent);
  }

  .text:disabled {
    color: var(--keep-text-disabled);
    cursor: not-allowed;
  }
</style>
