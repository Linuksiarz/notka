<script lang="ts">
  import { session } from '../../control/state/session.svelte';
  import { t, tError } from '../i18n';
  import AuthLayout from '../components/AuthLayout.svelte';

  interface Props {
    onNavigate: (path: string) => void;
  }

  let { onNavigate }: Props = $props();

  let email = $state('');
  let displayName = $state('');
  let password = $state('');
  let confirmation = $state('');
  let error = $state<string | null>(null);
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
      .register({ email: email.trim(), displayName: displayName.trim(), password })
      .then(() => onNavigate('/'))
      .catch((caught: unknown) => {
        error = tError(caught as Error);
      })
      .finally(() => {
        busy = false;
      });
  }
</script>

<AuthLayout title={t('auth.createAccountTitle')}>
  <form
    onsubmit={(event) => {
      event.preventDefault();
      submit();
    }}
  >
    <label>
      <span>{t('auth.email')}</span>
      <input type="email" autocomplete="email" required bind:value={email} />
    </label>

    <label>
      <span>{t('auth.displayName')}</span>
      <input type="text" autocomplete="name" required bind:value={displayName} />
    </label>

    <label>
      <span>{t('auth.password')}</span>
      <input type="password" autocomplete="new-password" required bind:value={password} />
    </label>

    <label>
      <span>{t('auth.confirmPassword')}</span>
      <input type="password" autocomplete="new-password" required bind:value={confirmation} />
    </label>

    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}

    <button type="submit" class="primary" disabled={busy}>
      {busy ? t('auth.creatingAccount') : t('auth.createAccount')}
    </button>
  </form>

  <button type="button" class="link" onclick={() => onNavigate('/login')}>
    {t('auth.haveAccount')}
  </button>
</AuthLayout>

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
    color: var(--keep-text-secondary);
  }

  input {
    padding: 12px 14px;
    border: 1px solid var(--keep-divider);
    border-radius: 4px;
    background: transparent;
    color: var(--keep-text);
    font-size: 15px;
  }

  input:focus {
    border-color: var(--keep-accent);
    outline: none;
  }

  .primary {
    margin-top: 8px;
    padding: 12px 16px;
    border-radius: 4px;
    background: var(--keep-accent);
    color: #fff;
    font-weight: 500;
    font-size: 15px;
  }

  .primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .link {
    align-self: center;
    padding: 8px;
    color: var(--keep-accent);
    font-weight: 500;
  }

  .error {
    margin: 0;
    color: var(--keep-danger);
    font-size: 13px;
  }
</style>
