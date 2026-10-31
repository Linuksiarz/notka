<script lang="ts">
  import { accountName } from '../../entity/account';
  import { session } from '../../control/state/session.svelte';
  import { ui } from '../../control/state/ui.svelte';
  import { LOCALES } from '../../entity/locales';
  import { t, tError, localeLabel } from '../i18n';
  import { importNoteFiles } from '../../control/importNotes';
  import { readPickedFiles } from '../download';
  import { backgroundThemes } from '../../control/state/backgroundThemes.svelte';
  import { serverAdmin } from '../../control/state/serverAdmin.svelte';
  import { NOTE_BACKGROUNDS } from '../../entity/api/types';
  import { changeServer, inAndroidApp, openInCustomTab } from '../androidApp';
  import Avatar from './Avatar.svelte';
  import Dialog from './Dialog.svelte';
  import EncryptionDialog from './EncryptionDialog.svelte';
  import Icon from './Icon.svelte';
  import { confirmation } from './confirmation.svelte';
  import { notes } from '../../control/state/notes.svelte';
  import { instance } from '../../control/state/instance.svelte';

  interface Props {
    open: boolean;
    onClose: () => void;
  }

  let { open, onClose }: Props = $props();

  let displayName = $state(session.user?.displayName ?? '');
  let currentPassword = $state('');
  let newPassword = $state('');
  let message = $state<string | null>(null);
  let error = $state<string | null>(null);
  let busy = $state(false);

  async function saveProfile(): Promise<void> {
    error = null;
    message = null;
    busy = true;
    try {
      await session.updateProfile({ displayName: displayName.trim() });
      message = t('settings.profileUpdated');
    } catch (caught) {
      error = tError(caught as Error);
    } finally {
      busy = false;
    }
  }

  let importInput = $state<HTMLInputElement | null>(null);
  let importing = $state(false);

  /** Markdown files, or `.zip`s of them, become notes: see `docs/MARKDOWN.md` for the format. */
  async function importFiles(picked: FileList | null): Promise<void> {
    if (!picked || picked.length === 0) return;
    error = null;
    message = null;
    importing = true;
    try {
      const { texts, skipped } = await readPickedFiles(Array.from(picked));
      const { imported, failed } = await importNoteFiles(texts);
      const parts = [t('settings.importDone', { count: imported })];
      if (skipped.length > 0) parts.push(t('settings.importSkipped', { names: skipped.join(', ') }));
      if (failed.length > 0) {
        parts.push(t('settings.importFailed', { count: failed.length }));
        error = tError(failed[0]?.error as Error);
      }
      message = parts.join(' ');
    } catch (caught) {
      error = tError(caught as Error);
    } finally {
      importing = false;
      if (importInput) importInput.value = '';
    }
  }

  let themeInput = $state<HTMLInputElement | null>(null);
  let uploading = $state(false);

  /** The administrator adds themes here too; the server settings are where they are managed. */
  async function uploadTheme(picked: FileList | null): Promise<void> {
    const file = picked?.[0];
    if (!file) return;
    error = null;
    message = null;
    uploading = true;
    try {
      message = t('themes.uploaded', { name: await serverAdmin.uploadTheme(file) });
    } catch (caught) {
      error = tError(caught as Error);
    } finally {
      uploading = false;
      if (themeInput) themeInput.value = '';
    }
  }

  /** Picking the instance's default follows it, so a later change of the default reaches this account. */
  async function selectTheme(id: string | null): Promise<void> {
    error = null;
    try {
      await backgroundThemes.select(id);
    } catch (caught) {
      error = tError(caught as Error);
    }
  }

  let encryptionDialogOpen = $state(false);

  /** On asks for the password and shows the recovery key (`EncryptionDialog`); off asks first. */
  async function toggleEncryption(on: boolean, box: HTMLInputElement): Promise<void> {
    // The box shows the account's setting, not the click: it changes once the server has.
    box.checked = session.user?.encryption ?? false;
    if (on) {
      encryptionDialogOpen = true;
      return;
    }
    if (!(await confirmation.ask(t('settings.encryptionOffConfirm'), t('settings.encryptionOffAction')))) return;
    error = null;
    try {
      await session.disableEncryption();
      void notes.refresh();
    } catch (caught) {
      error = tError(caught as Error);
    }
  }

  async function toggleLinkPreviews(on: boolean): Promise<void> {
    error = null;
    try {
      await session.setLinkPreviews(on);
      void notes.refresh();
    } catch (caught) {
      error = tError(caught as Error);
    }
  }

  let currentPassphrase = $state('');
  let newPassphrase = $state('');

  async function savePassphrase(): Promise<void> {
    error = null;
    message = null;
    if (newPassphrase.length < 8) {
      error = t('errors.auth.passphrase_too_short');
      return;
    }
    busy = true;
    try {
      await session.changePassphrase(currentPassphrase, newPassphrase);
      currentPassphrase = '';
      newPassphrase = '';
      message = t('settings.passphraseChanged');
    } catch (caught) {
      error = tError(caught as Error);
    } finally {
      busy = false;
    }
  }

  async function connectSso(): Promise<void> {
    error = null;
    busy = true;
    try {
      await (inAndroidApp ? session.startSsoInApp(true, openInCustomTab) : session.startSso(true));
    } catch (caught) {
      error = tError(caught as Error);
    } finally {
      busy = false;
    }
  }

  async function disconnectSso(): Promise<void> {
    error = null;
    message = null;
    busy = true;
    try {
      await session.unlinkSso();
    } catch (caught) {
      error = tError(caught as Error);
    } finally {
      busy = false;
    }
  }

  async function savePassword(): Promise<void> {
    error = null;
    message = null;
    if (newPassword.length < 8) {
      error = t('settings.passwordTooShort');
      return;
    }
    busy = true;
    try {
      await session.updateProfile({ currentPassword, newPassword });
      currentPassword = '';
      newPassword = '';
      message = t('settings.passwordChanged');
    } catch (caught) {
      error = tError(caught as Error);
    } finally {
      busy = false;
    }
  }
</script>

<Dialog
  {open}
  {onClose}
  title={t('settings.title')}
  width="520px"
  closeOnOutsideClick={!ui.avatarDialogOpen && !ui.friendsDialogOpen && !encryptionDialogOpen && confirmation.request === null}
>
  <div class="settings">
    <header>
      <h2>{t('settings.title')}</h2>
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

    <section>
      <h3>{t('settings.appearance')}</h3>
      <div class="choices">
        <button
          type="button"
          class="choice"
          class:active={ui.theme === 'light'}
          aria-pressed={ui.theme === 'light'}
          onclick={() => ui.setTheme('light')}
        >
          <Icon name="sun" size={22} />
          <span>{t('settings.light')}</span>
        </button>
        <button
          type="button"
          class="choice"
          class:active={ui.theme === 'dark'}
          aria-pressed={ui.theme === 'dark'}
          onclick={() => ui.setTheme('dark')}
        >
          <Icon name="moon" size={22} />
          <span>{t('settings.dark')}</span>
        </button>
      </div>

      <label class="toggle">
        <input
          type="checkbox"
          checked={ui.animationsAllowed}
          onchange={(event) => ui.setAnimations(event.currentTarget.checked)}
        />
        <span>{t('settings.animations')}</span>
      </label>
      <!-- Says which of the two reasons is in play: the system asked for less motion, or the box
           above was unticked on purpose. -->
      {#if ui.systemPrefersReducedMotion}
        <p class="hint" role="status">
          {ui.animationsAllowed ? t('settings.motionOverridden') : t('settings.motionReduced')}
        </p>
      {:else if !ui.animationsAllowed}
        <p class="hint" role="status">{t('settings.motionOff')}</p>
      {/if}
    </section>

    <section>
      <h3>{t('themes.title')}</h3>
      <p class="hint">{t('themes.hint')}</p>
      <div class="choices column" role="radiogroup" aria-label={t('themes.title')}>
        {#each backgroundThemes.themes as theme (theme.id)}
          <button
            type="button"
            class="choice theme"
            class:active={backgroundThemes.activeId === theme.id}
            role="radio"
            aria-checked={backgroundThemes.activeId === theme.id}
            onclick={() => void selectTheme(theme.id === backgroundThemes.defaultId ? null : theme.id)}
          >
            <span class="theme-text">
              <span class="theme-name">
                {theme.builtIn ? t('themes.builtIn') : theme.name}
                {#if theme.id === backgroundThemes.defaultId}
                  <span class="theme-default">{t('themes.default')}</span>
                {/if}
              </span>
              {#if theme.author || theme.license}
                <span class="theme-meta">{[theme.author, theme.license].filter(Boolean).join(' · ')}</span>
              {/if}
            </span>
            <span class="theme-previews" aria-hidden="true">
              {#each NOTE_BACKGROUNDS as id (id)}
                {#if theme.previews[id]}
                  <span class="theme-preview" style="background-image: url('{theme.previews[id]}')"></span>
                {/if}
              {/each}
            </span>
          </button>
        {/each}
      </div>
      {#if session.user?.admin}
        <input
          bind:this={themeInput}
          class="visually-hidden"
          type="file"
          accept=".zip,application/zip"
          onchange={(event) => void uploadTheme(event.currentTarget.files)}
        />
        <button type="button" class="primary theme-upload" disabled={uploading} onclick={() => themeInput?.click()}>
          <Icon name="upload" size={18} />
          <span>{uploading ? t('themes.uploading') : t('themes.upload')}</span>
        </button>
      {:else}
        <p class="hint">{t('themes.addedByAdmin')}</p>
      {/if}
    </section>

    <section>
      <h3>{t('settings.language')}</h3>
      <p class="hint">{t('settings.languageHint')}</p>

      <div class="choices column" role="radiogroup" aria-label={t('settings.language')}>
        {#each LOCALES as locale (locale)}
          <button
            type="button"
            class="choice"
            class:active={ui.locale === locale}
            role="radio"
            aria-checked={ui.locale === locale}
            onclick={() => ui.setLocale(locale)}
          >
            <span class="code">{locale}</span>
            <span>{localeLabel(locale)}</span>
            {#if ui.locale === locale}
              <Icon name="check" size={18} />
            {/if}
          </button>
        {/each}
      </div>
    </section>

    {#if session.user}
      <section>
        <h3>{t('settings.profile')}</h3>
        <div class="identity">
          <Avatar --avatar-size="var(--keep-avatar-settings)" user={session.user} />
          <span>{accountName(session.user)}</span>
          <button type="button" class="link" onclick={() => (ui.avatarDialogOpen = true)}>
            {t('settings.changePicture')}
          </button>
        </div>
        <label>
          <span>{t('settings.displayName')}</span>
          <input type="text" bind:value={displayName} />
        </label>
        <button type="button" class="primary" disabled={busy} onclick={saveProfile}>
          {t('settings.saveProfile')}
        </button>
      </section>

      <section>
        <h3>{t('settings.friends')}</h3>
        <p class="hint">{t('settings.friendsHint')}</p>
        <button type="button" class="primary" onclick={() => (ui.friendsDialogOpen = true)}>
          {t('settings.manageFriends')}
        </button>
      </section>

      {#if session.user.hasPassword}
        <section>
          <h3>{t('settings.password')}</h3>
          <label>
            <span>{t('settings.currentPassword')}</span>
            <input type="password" autocomplete="current-password" bind:value={currentPassword} />
          </label>
          <label>
            <span>{t('settings.newPassword')}</span>
            <input type="password" autocomplete="new-password" bind:value={newPassword} />
          </label>
          <button type="button" class="primary" disabled={busy} onclick={savePassword}>
            {t('settings.changePassword')}
          </button>
        </section>
      {/if}

      {#if instance.info.ssoProvider}
        <section>
          <h3>{t('settings.sso')}</h3>
          {#if session.user.ssoLinked}
            <p class="hint">{t('settings.ssoConnected', { provider: instance.info.ssoProvider })}</p>
            {#if session.user.hasPassword}
              <button type="button" class="primary" disabled={busy} onclick={disconnectSso}>
                {t('settings.ssoDisconnect')}
              </button>
            {/if}
          {:else}
            <p class="hint">{t('settings.ssoHint', { provider: instance.info.ssoProvider })}</p>
            <button type="button" class="primary" disabled={busy} onclick={connectSso}>
              {t('settings.ssoConnect', { provider: instance.info.ssoProvider })}
            </button>
          {/if}
        </section>
      {/if}

      {#if !session.user.hasPassword && session.user.encryption}
        <section>
          <h3>{t('settings.passphrase')}</h3>
          <label>
            <span>{t('settings.currentPassphrase')}</span>
            <input type="password" autocomplete="off" bind:value={currentPassphrase} />
          </label>
          <label>
            <span>{t('settings.newPassphrase')}</span>
            <input type="password" autocomplete="new-password" bind:value={newPassphrase} />
          </label>
          <p class="hint">{t('settings.passphraseHint')}</p>
          <button type="button" class="primary" disabled={busy} onclick={savePassphrase}>
            {t('settings.changePassphrase')}
          </button>
        </section>
      {/if}

      <section>
        <h3>{t('settings.encryption')}</h3>
        <label class="toggle">
          <input
            type="checkbox"
            checked={session.user.encryption}
            onchange={(event) => void toggleEncryption(event.currentTarget.checked, event.currentTarget)}
          />
          <span>{t('settings.encryptionToggle')}</span>
        </label>
        <p class="hint">{t('settings.encryptionHint')}</p>
        <label class="toggle">
          <input
            type="checkbox"
            checked={session.user.linkPreviews}
            onchange={(event) => void toggleLinkPreviews(event.currentTarget.checked)}
          />
          <span>{t('settings.linkPreviews')}</span>
        </label>
        <p class="hint">{t('settings.linkPreviewsHint')}</p>
      </section>
    {/if}

    {#if message}
      <p class="ok" role="status">{message}</p>
    {/if}
    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}

    {#if session.user}
      <section>
        <h3>{t('settings.import')}</h3>
        <p class="hint">{t('settings.importHint')}</p>
        <input
          bind:this={importInput}
          class="visually-hidden"
          type="file"
          multiple
          accept=".md,.markdown,.txt,.zip,text/markdown,text/plain,application/zip"
          onchange={(event) => void importFiles(event.currentTarget.files)}
        />
        <button type="button" class="primary" disabled={importing} onclick={() => importInput?.click()}>
          {importing ? t('settings.importing') : t('settings.importChoose')}
        </button>
      </section>
    {/if}

    <section>
      <h3>{t('settings.experimental')}</h3>
      <label class="toggle">
        <input
          type="checkbox"
          checked={ui.glass}
          onchange={(event) => ui.setGlass(event.currentTarget.checked)}
        />
        <span>{t('settings.glass')}</span>
      </label>
      <p class="hint">{t('settings.glassHint')}</p>
    </section>

    {#if inAndroidApp}
      <section>
        <h3>{t('settings.server')}</h3>
        <p class="hint">{t('settings.serverHint', { server: location.host })}</p>
        <button type="button" class="primary" onclick={() => void changeServer()}>{t('settings.changeServer')}</button>
      </section>
    {/if}

    <section class="about">
      <h3>{t('settings.about')}</h3>
      <p>{t('settings.aboutText')}</p>
    </section>
  </div>
</Dialog>

<EncryptionDialog open={encryptionDialogOpen} onClose={() => (encryptionDialogOpen = false)} />

<style>
  .settings {
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

  .choices {
    display: flex;
    gap: 8px;
  }

  .choices.column {
    flex-direction: column;
  }

  .choice {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    border: 1px solid var(--keep-divider);
    border-radius: 4px;
    text-align: left;
  }

  .choice.active {
    border-color: var(--keep-accent);
    color: var(--keep-accent);
  }

  .choice .code {
    font-size: 0.75rem;
    color: var(--keep-text-secondary);
    min-width: 48px;
  }

  .choice > span:nth-of-type(2) {
    flex: 1 1 auto;
  }

  .choice.theme > .theme-previews {
    flex: 0 1 auto;
    flex-wrap: wrap;
  }

  .choice.theme {
    flex: 1 1 auto;
    flex-wrap: wrap;
  }

  .theme-default {
    margin-left: 6px;
    padding: 1px 8px;
    border-radius: var(--keep-radius-pill);
    background: var(--keep-hover);
    color: var(--keep-text-secondary);
    font-size: 0.75rem;
    font-weight: 500;
  }

  .theme-upload {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
  }

  .theme-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .theme-meta {
    font-size: 0.75rem;
    color: var(--keep-text-secondary);
  }

  .theme-previews {
    display: flex;
    gap: 4px;
    margin-left: auto;
  }

  .theme-preview {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 1px solid var(--keep-divider);
    background-size: cover;
    background-position: center;
  }

  .hint {
    margin: 0;
    font-size: 0.75rem;
    color: var(--keep-text-secondary);
  }

  .identity {
    display: flex;
    align-items: center;
    gap: 12px;
    color: var(--keep-text-secondary);
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.75rem;
    color: var(--keep-text-secondary);
  }

  /* Only the text fields: the checkbox below is a checkbox, and the generic rule used to give it a
     field's padding and border, which is what made the motion toggle look like an empty input. */
  input:not([type='checkbox']) {
    padding: 10px 12px;
    border: 1px solid var(--keep-divider);
    border-radius: 4px;
    background: transparent;
    color: var(--keep-text);
  }

  /* A row, not the column `label` gives: box, then its text. */
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

  .primary {
    align-self: flex-start;
    padding: 8px 16px;
    border-radius: 4px;
    background: var(--keep-accent);
    color: #fff;
    font-weight: 500;
  }

  .link {
    margin-left: auto;
    padding: 6px 8px;
    border-radius: 4px;
    color: var(--keep-accent);
    font-weight: 500;
    font-size: 0.875rem;
  }

  .link:hover {
    background: var(--keep-hover);
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

  .about p {
    margin: 0;
    font-size: 0.75rem;
    line-height: 1.6;
    color: var(--keep-text-secondary);
  }
</style>
