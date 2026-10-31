<script lang="ts">
  import { session } from '../../control/state/session.svelte';
  import { t, tError } from '../i18n';
  import { submitInPage } from '../submitInPage';
  import AuthLayout from '../components/AuthLayout.svelte';
  import { confirmation } from '../components/confirmation.svelte';

  /**
   * A device that signed in through the identity provider, of an account that encrypts its notes: the
   * provider vouches for who is asking and never opens them (`docs/ENCRYPTION.md`). The account's
   * passphrase does, or its password when it has one; a forgotten one leaves the recovery key.
   */
  const hasPassword = $derived(session.user?.hasPassword ?? false);

  let secret = $state('');
  let recovering = $state(false);
  let recoveryKey = $state('');
  let newPassphrase = $state('');
  let newPassphraseAgain = $state('');
  let error = $state<string | null>(null);
  let busy = $state(false);

  async function attempt(action: () => Promise<void>): Promise<void> {
    error = null;
    busy = true;
    try {
      await action();
    } catch (caught) {
      error = tError(caught as Error);
    } finally {
      busy = false;
    }
  }

  function submit(): void {
    if (!recovering) {
      void attempt(() => session.unlockEncryption(secret));
      return;
    }
    if (!hasPassword && newPassphrase !== newPassphraseAgain) {
      error = t('encryption.passphraseMismatch');
      return;
    }
    void attempt(() => session.recoverEncryption(recoveryKey, hasPassword ? undefined : newPassphrase));
  }

  async function discard(): Promise<void> {
    if (!(await confirmation.ask(t('auth.unlockDiscardConfirm'), t('auth.unlockDiscardAction')))) return;
    await attempt(() => session.discardEncryption());
  }
</script>

<AuthLayout title={t('auth.unlockTitle')}>
  <p class="hint">
    {recovering ? t('auth.unlockRecoveryHint') : hasPassword ? t('auth.unlockHintPassword') : t('auth.unlockHintPassphrase')}
  </p>
  <form
    method="post"
    {@attach submitInPage}
    onsubmit={(event) => {
      event.preventDefault();
      submit();
    }}
  >
    {#if recovering}
      <label>
        <span>{t('auth.recoveryKey')}</span>
        <input type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" required bind:value={recoveryKey} />
      </label>
      {#if !hasPassword}
        <label>
          <span>{t('auth.unlockNewPassphrase')}</span>
          <input type="password" autocomplete="new-password" required bind:value={newPassphrase} />
        </label>
        <label>
          <span>{t('auth.unlockNewPassphraseAgain')}</span>
          <input type="password" autocomplete="new-password" required bind:value={newPassphraseAgain} />
        </label>
      {/if}
    {:else}
      <label>
        <span>{hasPassword ? t('auth.password') : t('auth.unlockPassphrase')}</span>
        <!-- svelte-ignore a11y_autofocus -->
        <input type="password" name="password" autocomplete="current-password" required autofocus bind:value={secret} />
      </label>
    {/if}

    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}

    <button type="submit" class="primary" disabled={busy}>
      {#if recovering}
        {t('auth.unlockRecover')}
      {:else}
        {busy ? t('auth.unlocking') : t('auth.unlockSubmit')}
      {/if}
    </button>
  </form>

  <button type="button" class="link" onclick={() => (recovering = !recovering)}>
    {recovering ? t('auth.unlockRemembered') : t('auth.unlockForgot')}
  </button>
  {#if recovering && !hasPassword}
    <button type="button" class="link danger" disabled={busy} onclick={() => void discard()}>
      {t('auth.unlockDiscard')}
    </button>
  {/if}
  <button type="button" class="link" disabled={busy} onclick={() => void session.logout()}>
    {t('auth.unlockSignOut')}
  </button>
</AuthLayout>

<style>
  .hint {
    margin: 0 0 16px;
    font-size: 0.875rem;
    color: var(--keep-text-secondary);
  }

  .danger {
    color: var(--keep-danger);
  }
</style>
