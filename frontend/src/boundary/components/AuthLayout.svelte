<script lang="ts">
  import type { Snippet } from 'svelte';
  import { t } from '../i18n';
  import BrandMark from './BrandMark.svelte';

  interface Props {
    title: string;
    children: Snippet;
  }

  let { title, children }: Props = $props();
</script>

<main class="auth">
  <div class="card">
    <div class="brand">
      <BrandMark size={40} />
      <span>{t('app.name')}</span>
    </div>
    <h1>{title}</h1>
    <p class="subtitle">{t('auth.subtitle')}</p>

    {@render children()}

    <p class="license">{t('auth.licenseNotice')}</p>
  </div>
</main>

<style>
  .auth {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 24px;
    background: var(--keep-bg);
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
    max-width: 400px;
    padding: 32px;
    border: 1px solid var(--keep-border);
    border-radius: var(--keep-radius);
    background: var(--keep-surface);
    box-shadow: var(--keep-shadow-card);
  }

  .brand {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    font-size: 1.75rem;
    color: var(--keep-text);
  }

  h1 {
    margin: 16px 0 0;
    font-size: 1.25rem;
    font-weight: 500;
    text-align: center;
  }

  .subtitle {
    margin: 0 0 20px;
    text-align: center;
    font-size: 0.8125rem;
    color: var(--keep-text-secondary);
  }

  .license {
    margin: 24px 0 0;
    text-align: center;
    font-size: 0.6875rem;
    color: var(--keep-text-secondary);
  }

  /* The form every view puts on this card (sign-in, sign-up, a new password): one look for all three. */
  .card :global(form) {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .card :global(label) {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.75rem;
    color: var(--keep-text-secondary);
  }

  .card :global(input) {
    padding: 12px 14px;
    border: 1px solid var(--keep-divider);
    border-radius: 4px;
    background: transparent;
    color: var(--keep-text);
    font-size: 0.9375rem;
  }

  .card :global(input:focus) {
    border-color: var(--keep-accent);
    outline: none;
  }

  .card :global(.primary) {
    margin-top: 8px;
    padding: 12px 16px;
    border-radius: 4px;
    background: var(--keep-accent);
    color: #fff;
    font-weight: 500;
    font-size: 0.9375rem;
  }

  .card :global(.primary:disabled) {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .card :global(.link) {
    align-self: center;
    padding: 8px;
    color: var(--keep-accent);
    font-weight: 500;
  }

  .card :global(.error) {
    margin: 0;
    color: var(--keep-danger);
    font-size: 0.8125rem;
  }
</style>
