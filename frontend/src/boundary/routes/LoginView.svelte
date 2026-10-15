<script lang="ts">
  import { instance } from '../../control/state/instance.svelte';
  import { session } from '../../control/state/session.svelte';
  import { t, tError } from '../i18n';
  import AuthLayout from '../components/AuthLayout.svelte';

  interface Props {
    onNavigate: (path: string) => void;
  }

  let { onNavigate }: Props = $props();

  // Asked again on every visit: the administrator may have opened or closed sign-up since.
  $effect(() => {
    void instance.load();
  });

  let login = $state('');
  let password = $state('');
  let error = $state<string | null>(null);
  let busy = $state(false);

  function submit(): void {
    error = null;
    busy = true;
    void session
      .login({ login: login.trim(), password })
      .then(() => onNavigate('/'))
      .catch((caught: unknown) => {
        error = tError(caught as Error);
      })
      .finally(() => {
        busy = false;
      });
  }
</script>

<AuthLayout title={t('auth.signInTitle')}>
  <form
    onsubmit={(event) => {
      event.preventDefault();
      submit();
    }}
  >
    <label>
      <span>{t('auth.login')}</span>
      <input type="text" autocomplete="username" autocapitalize="none" spellcheck="false" required bind:value={login} />
    </label>

    <label>
      <span>{t('auth.password')}</span>
      <input type="password" autocomplete="current-password" required bind:value={password} />
    </label>

    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}

    <button type="submit" class="primary" disabled={busy}>
      {busy ? t('auth.signingIn') : t('auth.signIn')}
    </button>
  </form>

  {#if instance.info.demo && instance.info.demoAccounts.length > 0}
    <!-- A demo instance has nothing to hide: the accounts are sample data, and offering them beats
         making somebody read the README. Choosing one fills the form rather than signing in. -->
    <aside class="demo">
      <h2>{t('auth.demoTitle')}</h2>
      <p>{t('auth.demoHint')}</p>
      <ul>
        {#each instance.info.demoAccounts as account (account.email)}
          <li>
            <button
              type="button"
              onclick={() => {
                login = account.email;
                password = account.password;
                error = null;
              }}
            >
              {t('auth.demoAccount', { email: account.email, password: account.password })}
            </button>
          </li>
        {/each}
      </ul>
    </aside>
  {/if}

  {#if instance.info.registrationOpen}
    <button type="button" class="link" onclick={() => onNavigate('/register')}>
      {t('auth.noAccount')}
    </button>
  {/if}
</AuthLayout>

<style>
  .demo {
    margin-top: 24px;
    padding: 12px 14px;
    border: 1px solid var(--keep-divider);
    border-radius: var(--keep-radius);
  }

  .demo h2 {
    margin: 0 0 4px;
    font-size: 13px;
    font-weight: 500;
  }

  .demo p {
    margin: 0 0 8px;
    font-size: 12px;
    color: var(--keep-text-secondary);
  }

  .demo ul {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .demo button {
    padding: 4px 0;
    font: inherit;
    font-size: 13px;
    color: inherit;
    text-align: left;
    text-decoration: underline;
  }

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
