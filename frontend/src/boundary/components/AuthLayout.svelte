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
    font-size: 28px;
    color: var(--keep-text);
  }

  h1 {
    margin: 16px 0 0;
    font-size: 20px;
    font-weight: 500;
    text-align: center;
  }

  .subtitle {
    margin: 0 0 20px;
    text-align: center;
    font-size: 13px;
    color: var(--keep-text-secondary);
  }

  .license {
    margin: 24px 0 0;
    text-align: center;
    font-size: 11px;
    color: var(--keep-text-secondary);
  }
</style>
