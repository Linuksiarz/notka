<script lang="ts">
  import { Dialog as BitsDialog } from 'bits-ui';
  import type { NoteImage } from '../../entity/api/types';
  import { noteImageUrl } from '../../control/api/notes';
  import { t } from '../i18n';
  import Icon from './Icon.svelte';

  /**
   * A note's picture full size, over everything, the way the original opens one: dark, the picture in
   * the middle, a bar with the way back and the picture's own actions, and arrows between pictures.
   */
  interface Props {
    noteId: number;
    images: readonly NoteImage[];
    /** Which picture is open, or `null` when the viewer is closed. */
    index: number | null;
    onIndex: (index: number | null) => void;
    onRemove?: (image: NoteImage) => void;
  }

  let { noteId, images, index, onIndex, onRemove }: Props = $props();

  const current = $derived(index === null ? null : (images[index] ?? null));
  const fileName = $derived(
    current ? `image-${current.id}.${current.contentType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'img'}` : ''
  );

  function step(delta: number): void {
    if (index === null || images.length === 0) return;
    onIndex((index + delta + images.length) % images.length);
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowLeft') step(-1);
    if (event.key === 'ArrowRight') step(1);
  }
</script>

<BitsDialog.Root
  open={current !== null}
  onOpenChange={(open) => {
    if (!open) onIndex(null);
  }}
>
  <BitsDialog.Portal>
    <BitsDialog.Overlay class="image-viewer-backdrop" />
    <BitsDialog.Content preventScroll={false} class="image-viewer" data-overlay="image-viewer" onkeydown={onKeydown}>
      <BitsDialog.Title class="visually-hidden">{t('images.viewer')}</BitsDialog.Title>
      {#if current}
        <header class="bar">
          <button type="button" class="icon-button" aria-label={t('images.back')} title={t('images.back')} onclick={() => onIndex(null)}>
            <Icon name="arrow-back" size={24} />
          </button>
          <span class="spacer"></span>
          <a class="icon-button" href={noteImageUrl(noteId, current.id)} download={fileName} aria-label={t('images.download')} title={t('images.download')}>
            <Icon name="download" size={24} />
          </a>
          {#if onRemove}
            <button
              type="button"
              class="icon-button"
              aria-label={t('images.remove')}
              title={t('images.remove')}
              onclick={() => onRemove(current)}
            >
              <Icon name="trash" size={24} />
            </button>
          {/if}
        </header>
        <div class="stage">
          {#if images.length > 1}
            <button type="button" class="icon-button nav" aria-label={t('images.previous')} onclick={() => step(-1)}>
              <Icon name="chevron-left" size={32} />
            </button>
          {/if}
          <img src={noteImageUrl(noteId, current.id)} alt="" />
          {#if images.length > 1}
            <button type="button" class="icon-button nav" aria-label={t('images.next')} onclick={() => step(1)}>
              <Icon name="chevron-right" size={32} />
            </button>
          {/if}
        </div>
      {/if}
    </BitsDialog.Content>
  </BitsDialog.Portal>
</BitsDialog.Root>

<style>
  :global(.image-viewer-backdrop) {
    position: fixed;
    inset: 0;
    z-index: 97;
    background: rgba(0, 0, 0, 0.9);
  }

  :global(.image-viewer) {
    position: fixed;
    inset: 0;
    z-index: 98;
    display: flex;
    flex-direction: column;
    color: #fff;
    outline: none;
  }

  .bar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px 12px;
  }

  .spacer {
    flex: 1 1 auto;
  }

  .bar :global(.icon-button),
  .nav {
    color: #fff;
  }

  .bar :global(.icon-button:hover),
  .nav:hover {
    background: rgba(255, 255, 255, 0.12);
  }

  .stage {
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 0;
    padding: 0 8px 24px;
  }

  img {
    max-width: calc(100% - 112px);
    max-height: 100%;
    object-fit: contain;
  }

  @media (max-width: 600px) {
    img {
      max-width: 100%;
    }

    .nav {
      display: none;
    }
  }
</style>
