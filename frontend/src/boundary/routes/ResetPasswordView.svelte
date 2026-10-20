<script lang="ts">
  import { session } from '../../control/state/session.svelte';
  import { t, tError } from '../i18n';
  import { submitInPage } from '../submitInPage';
  import AuthLayout from '../components/AuthLayout.svelte';

  interface Props {
    onNavigate: (path: string) => void;
  }

  let { onNavigate }: Props = $props();

  /**
   * The link in a reset e-mail is `/reset-password#<token>`. The token rides in the fragment, which a
   * browser never sends to a server, so it stays out of every access log between the mail and here.
   */
  const token = window.location.hash.slice(1);

  let password = $state('');
  let confirmation = $state('');
  let error = $state<string | null>(token ? null : t('auth.resetMissing'));
  let busy = $state(false);

  function submit(): void {
    error = null;
    if (password.length < 8) {
      error = t('auth.passwordTooShort');
      return;
    }
    if (password !== confirmation) {
      error = t('auth.passwordMismatch');
      return;
    }

    busy = true;
    void session
      .completePasswordReset(token, password)
      .then(() => onNavigate('/'))
      .catch((caught: unknown) => {
        error = tError(caught as Error);
      })
      .finally(() => {
        busy = false;
      });
  }
</script>

<AuthLayout title={t('auth.resetTitle')}>
  <p class="hint">{t('auth.resetHint')}</p>
  <form
    method="post"
    {@attach submitInPage}
    onsubmit={(event) => {
      event.preventDefault();
      submit();
    }}
  >
    <label>
      <span>{t('auth.password')}</span>
      <input type="password" autocomplete="new-password" required disabled={!token} bind:value={password} />
    </label>

    <label>
      <span>{t('auth.confirmPassword')}</span>
      <input type="password" autocomplete="new-password" required disabled={!token} bind:value={confirmation} />
    </label>

    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}

    <button type="submit" class="primary" disabled={busy || !token}>
      {busy ? t('auth.resetting') : t('auth.resetSubmit')}
    </button>
  </form>

  <button type="button" class="link" onclick={() => onNavigate('/login')}>
    {t('auth.backToSignIn')}
  </button>
</AuthLayout>

<style>
  .hint {
    margin: 0 0 16px;
    font-size: 0.875rem;
    color: var(--keep-text-secondary);
  }
</style>
