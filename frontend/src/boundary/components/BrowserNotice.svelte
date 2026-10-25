<script lang="ts">
  import { RECOMMENDED_BROWSERS } from '../../entity/recommendedBrowsers';
  import { t } from '../i18n';
  import { drawsJpegXl } from '../jpegXl';
  import Dialog from './Dialog.svelte';
  import Icon from './Icon.svelte';

  /**
   * Shown when the app starts in a browser that cannot draw JPEG XL: Notka has no fallback for it, so
   * it says which browsers it is tested on rather than quietly showing initials where pictures should
   * be. It comes back on every start until the reader asks it not to on this device.
   */
  const DISMISSED_KEY = 'notka.browserNotice';

  let open = $state(false);
  let remember = $state(false);

  $effect(() => {
    if (readDismissed()) return;
    void drawsJpegXl().then((supported) => {
      open = !supported;
    });
  });

  function close(): void {
    open = false;
    if (!remember) return;
    try {
      localStorage.setItem(DISMISSED_KEY, 'dismissed');
    } catch {
      /* private mode: the notice simply comes back next time */
    }
  }

  function readDismissed(): boolean {
    try {
      return localStorage.getItem(DISMISSED_KEY) === 'dismissed';
    } catch {
      return false;
    }
  }
</script>

<Dialog {open} onClose={close} title={t('browserNotice.title')} width="460px">
  <div class="notice" data-testid="browser-notice">
    <header>
      <h2>{t('browserNotice.title')}</h2>
      <button type="button" class="icon-button" aria-label={t('browserNotice.close')} title={t('browserNotice.close')} onclick={close}>
        <Icon name="close" size={20} />
      </button>
    </header>
    <p>{t('browserNotice.body')}</p>
    <ul>
      {#each RECOMMENDED_BROWSERS as browser (browser.minVersion + browser.names[0]?.name)}
        <li>
          <span class="names">
            {#each browser.names as { name, url }, index (name)}
              {#if index > 0}<span class="slash">/</span>{/if}
              <a href={url} target="_blank" rel="noopener noreferrer">{name}</a>
            {/each}
          </span>
          <span class="version">{t('browserNotice.minVersion', { version: browser.minVersion })}</span>
        </li>
      {/each}
    </ul>
    <footer>
      <label>
        <input type="checkbox" bind:checked={remember} />
        <span>{t('browserNotice.dontShowAgain')}</span>
      </label>
      <button type="button" class="confirm" onclick={close}>{t('browserNotice.understood')}</button>
    </footer>
  </div>
</Dialog>

<style>
  .notice {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px 20px 12px;
  }

  p {
    margin: 0;
    font-size: 0.875rem;
    line-height: 1.5;
  }


  ul {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
    border: 1px solid var(--keep-divider);
    border-radius: 8px;
  }

  li {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 14px;
    font-size: 0.875rem;
  }

  li + li {
    border-top: 1px solid var(--keep-divider);
  }

  a {
    color: var(--keep-accent);
    font-weight: 500;
    text-decoration: none;
  }

  a:hover {
    text-decoration: underline;
  }

  .version,
  .slash {
    color: var(--keep-text-secondary);
  }

  .slash {
    margin: 0 6px;
  }

  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.8125rem;
    color: var(--keep-text-secondary);
    cursor: pointer;
  }

  label input {
    accent-color: var(--keep-accent);
  }

  .confirm {
    margin-left: auto;
    padding: 8px 12px;
    border-radius: 4px;
    color: var(--keep-accent);
    font-weight: 500;
    font-size: 0.875rem;
  }

  .confirm:hover {
    background: var(--keep-hover);
  }
</style>
