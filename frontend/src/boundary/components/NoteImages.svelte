<script lang="ts">
  import type { NoteImage } from '../../entity/api/types';
  import { noteImageUrl } from '../../control/api/notes';
  import { imageRows } from '../../entity/imageLayout';
  import { t } from '../i18n';
  import Icon from './Icon.svelte';

  /**
   * A note's pictures at the top of the note, edge to edge, in the original's rows (`imageRows`):
   * each picture keeps its own proportions, and a row's pictures share its height.
   */
  interface Props {
    noteId: number;
    images: readonly NoteImage[];
    /** Opens the picture full size. */
    onOpen?: (index: number) => void;
    /** When given, hovering a picture offers to take it off the note. */
    onRemove?: (image: NoteImage) => void;
  }

  let { noteId, images, onOpen, onRemove }: Props = $props();

  const rows = $derived(imageRows(images.map((image, index) => ({ image, index }))));
</script>

{#if images.length > 0}
  <div class="images">
    {#each rows as row, rowIndex (rowIndex)}
      <div class="row">
        {#each row as { image, index } (image.id)}
          <div class="cell" style="flex: {image.width / image.height} 1 0; aspect-ratio: {image.width} / {image.height}">
            <button
              type="button"
              class="open"
              aria-label={t('images.open')}
              onclick={(event) => {
                event.stopPropagation();
                onOpen?.(index);
              }}
            >
              <img src={noteImageUrl(noteId, image.id)} alt="" loading="lazy" decoding="async" draggable="false" />
            </button>
            {#if onRemove}
              <button
                type="button"
                class="remove"
                title={t('images.remove')}
                aria-label={t('images.remove')}
                onclick={(event) => {
                  event.stopPropagation();
                  onRemove(image);
                }}
              >
                <Icon name="trash" size={20} />
              </button>
            {/if}
          </div>
        {/each}
      </div>
    {/each}
  </div>
{/if}

<style>
  /* Edge to edge: the card's own corners crop the first row, and nothing pads it. */
  .images {
    display: flex;
    flex-direction: column;
  }

  .row {
    display: flex;
  }

  .cell {
    position: relative;
    min-width: 0;
    overflow: hidden;
  }

  .open {
    display: block;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    background: var(--keep-hover);
    cursor: pointer;
  }

  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  /* The original's bin sits in the picture's bottom right, on a dark disc, under the pointer only. */
  .remove {
    position: absolute;
    right: 6px;
    bottom: 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.6);
    color: #fff;
    opacity: 0;
    transition: opacity var(--keep-duration-short) var(--keep-ease-standard);
  }

  .cell:hover .remove,
  .remove:focus-visible {
    opacity: 1;
  }

  @media (hover: none) {
    .remove {
      opacity: 1;
    }
  }
</style>
