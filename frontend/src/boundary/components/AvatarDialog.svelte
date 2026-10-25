<script lang="ts">
  import Cropper, { type OnCropCompleteEvent } from 'svelte-easy-crop';
  import { toast } from 'svelte-sonner';
  import { session } from '../../control/state/session.svelte';
  import { t, tError } from '../i18n';
  import { encodeAvatar, type PixelArea } from '../jpegXl';
  import Avatar from './Avatar.svelte';
  import Dialog from './Dialog.svelte';
  import Icon from './Icon.svelte';

  /**
   * Choosing the account's picture: a file from the device, cropped to a circle with
   * `svelte-easy-crop` (drag, pinch and wheel come with it), encoded as JPEG XL in the page and sent
   * as it is (`boundary/jpegXl.ts` says why the browser does the encoding).
   */
  interface Props {
    open: boolean;
    onClose: () => void;
  }

  let { open, onClose }: Props = $props();

  const MAX_ZOOM = 4;

  let fileInput = $state<HTMLInputElement | null>(null);
  /** The picked file, as an address the cropper's `<img>` can show, and as pixels to crop from. */
  let source = $state<{ url: string; bitmap: ImageBitmap } | null>(null);
  let crop = $state({ x: 0, y: 0 });
  let zoom = $state(1);
  let area = $state<PixelArea | null>(null);
  let busy = $state(false);
  let error = $state<string | null>(null);

  $effect(() => {
    if (!open) discard();
  });

  function discard(): void {
    if (source) {
      URL.revokeObjectURL(source.url);
      source.bitmap.close();
    }
    source = null;
    crop = { x: 0, y: 0 };
    zoom = 1;
    area = null;
    error = null;
    if (fileInput) fileInput.value = '';
  }

  async function pick(files: FileList | null): Promise<void> {
    const file = files?.[0];
    if (!file) return;
    discard();
    try {
      // The bitmap follows the file's own orientation, as the cropper's `<img>` does, so the area the
      // cropper reports is an area of these pixels.
      const bitmap = await createImageBitmap(file);
      source = { url: URL.createObjectURL(file), bitmap };
    } catch {
      error = t('avatar.unreadable');
    }
  }

  async function save(): Promise<void> {
    if (!source || !area) return;
    busy = true;
    error = null;
    try {
      await session.setAvatar(await encodeAvatar(source.bitmap, area));
      toast.success(t('avatar.updated'));
      onClose();
    } catch (caught) {
      error = tError(caught as Error);
    } finally {
      busy = false;
    }
  }

  async function remove(): Promise<void> {
    busy = true;
    error = null;
    try {
      await session.removeAvatar();
      toast.success(t('avatar.removed'));
    } catch (caught) {
      error = tError(caught as Error);
    } finally {
      busy = false;
    }
  }
</script>

<Dialog {open} {onClose} title={t('avatar.title')} width="440px">
  <div class="avatar-dialog" data-testid="avatar-dialog">
    <header>
      <h2>{t('avatar.title')}</h2>
      <button type="button" class="icon-button" aria-label={t('avatar.close')} title={t('avatar.close')} onclick={onClose}>
        <Icon name="close" size={20} />
      </button>
    </header>

    <input
      bind:this={fileInput}
      class="visually-hidden"
      type="file"
      accept="image/*"
      data-testid="avatar-file"
      onchange={(event) => void pick(event.currentTarget.files)}
    />

    {#if source}
      <div class="stage">
        <Cropper
          image={source.url}
          bind:crop
          bind:zoom
          maxZoom={MAX_ZOOM}
          aspect={1}
          cropShape="round"
          showGrid={false}
          oncropcomplete={(event: OnCropCompleteEvent) => (area = event.pixels)}
        />
      </div>
      <label class="zoom">
        <Icon name="zoom-out" size={20} />
        <input type="range" min="1" max={MAX_ZOOM} step="0.01" bind:value={zoom} aria-label={t('avatar.zoom')} />
        <Icon name="zoom-in" size={20} />
      </label>
      <p class="hint">{t('avatar.cropHint')}</p>
    {:else if session.user}
      <div class="current">
        <Avatar --avatar-size="128px" user={session.user} />
      </div>
      <p class="hint">{t('avatar.hint')}</p>
    {/if}

    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}

    <footer>
      {#if source}
        <button type="button" class="text" disabled={busy} onclick={() => fileInput?.click()}>
          {t('avatar.chooseAnother')}
        </button>
        <span class="spacer"></span>
        <button type="button" class="text" disabled={busy} onclick={discard}>{t('avatar.cancel')}</button>
        <button type="button" class="text strong" disabled={busy || !area} onclick={() => void save()}>
          {busy ? t('avatar.saving') : t('avatar.save')}
        </button>
      {:else}
        {#if session.user?.avatarAt != null}
          <button type="button" class="text" disabled={busy} onclick={() => void remove()}>{t('avatar.remove')}</button>
        {/if}
        <span class="spacer"></span>
        <button type="button" class="text strong" disabled={busy} onclick={() => fileInput?.click()}>
          {t('avatar.choose')}
        </button>
      {/if}
    </footer>
  </div>
</Dialog>

<style>
  .avatar-dialog {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px 20px 12px;
  }

  /* The cropper fills a positioned box of its own; it is square so the circle is as large as it can be. */
  .stage {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    max-height: 60vh;
    border-radius: 4px;
    overflow: hidden;
    background: #000;
  }

  .current {
    display: flex;
    justify-content: center;
    padding: 16px 0 4px;
  }

  .zoom {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--keep-text-secondary);
  }

  .zoom input {
    flex: 1 1 auto;
    accent-color: var(--keep-accent);
  }

  .hint {
    margin: 0;
    color: var(--keep-text-secondary);
    font-size: 0.8125rem;
    line-height: 1.5;
    text-align: center;
  }

  .error {
    margin: 0;
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
