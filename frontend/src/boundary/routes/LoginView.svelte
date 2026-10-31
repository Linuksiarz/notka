<script lang="ts">
  import { instance } from '../../control/state/instance.svelte';
  import { session } from '../../control/state/session.svelte';
  import { t, tError } from '../i18n';
  import { submitInPage } from '../submitInPage';
  import AuthLayout from '../components/AuthLayout.svelte';
  import { inAndroidApp, openInCustomTab } from '../androidApp';

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

  function signInThroughProvider(): void {
    error = null;
    busy = true;
    // In the app the answer arrives as a new page load; a closed Custom Tab just comes back to this one.
    const trip = inAndroidApp ? session.startSsoInApp(false, openInCustomTab) : session.startSso();
    void trip
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
    method="post"
    {@attach submitInPage}
    onsubmit={(event) => {
      event.preventDefault();
      submit();
    }}
  >
    <label>
      <span>{t('auth.login')}</span>
      <input type="text" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required bind:value={login} />
    </label>

    <label>
      <span>{t('auth.password')}</span>
      <input type="password" name="password" autocomplete="current-password" required bind:value={password} />
    </label>

    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}

    <button type="submit" class="primary" disabled={busy}>
      {busy ? t('auth.signingIn') : t('auth.signIn')}
    </button>
  </form>

  {#if instance.info.ssoProvider}
    <div class="sso">
      <button type="button" class="provider" disabled={busy} onclick={signInThroughProvider}>
        {t('auth.signInWith', { provider: instance.info.ssoProvider })}
      </button>
    </div>
  {/if}

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
  .sso {
    display: flex;
    flex-direction: column;
    margin-top: 12px;
  }

  .provider {
    padding: 12px 16px;
    border: 1px solid var(--keep-divider);
    border-radius: 4px;
    color: var(--keep-text);
    font-weight: 500;
    font-size: 0.9375rem;
  }

  .provider:hover:not(:disabled) {
    background: var(--keep-hover);
  }

  .provider:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .demo {
    margin-top: 24px;
    padding: 12px 14px;
    border: 1px solid var(--keep-divider);
    border-radius: var(--keep-radius);
  }

  .demo h2 {
    margin: 0 0 4px;
    font-size: 0.8125rem;
    font-weight: 500;
  }

  .demo p {
    margin: 0 0 8px;
    font-size: 0.75rem;
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
    font-size: 0.8125rem;
    text-align: left;
    text-decoration: underline;
  }
</style>
