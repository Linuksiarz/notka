<script lang="ts">
  import type { NoteKind } from '../../entity/api/types';
  import { ui } from '../../control/state/ui.svelte';
  import { t } from '../i18n';
  import Icon from './Icon.svelte';
  import { IMAGE_TYPES } from '../../entity/imageLayout';

  interface Props {
    onCompose: (kind: NoteKind) => void;
  }

  let { onCompose }: Props = $props();
  let imageInput = $state<HTMLInputElement | null>(null);

  function compose(kind: NoteKind): void {
    onCompose(kind);
  }
</script>

<div class="composer">
  <button type="button" class="placeholder" onclick={() => compose('TEXT')}>
    {t('composer.placeholder')}
  </button>
  <div class="tools">
    <button
      type="button"
      class="icon-button"
      title={t('composer.newList')}
      aria-label={t('composer.newList')}
      onclick={() => compose('LIST')}
    >
      <Icon name="checklist" size={22} />
    </button>
    <!-- The original's third button: a new note that starts with pictures. -->
    <input
      bind:this={imageInput}
      class="visually-hidden"
      type="file"
      multiple
      accept={IMAGE_TYPES}
      onchange={(event) => {
        const files = Array.from(event.currentTarget.files ?? []);
        event.currentTarget.value = '';
        if (files.length === 0) return;
        ui.pendingImages = files;
        compose('TEXT');
      }}
    />
    <button
      type="button"
      class="icon-button"
      title={t('composer.newImage')}
      aria-label={t('composer.newImage')}
      onclick={() => imageInput?.click()}
    >
      <Icon name="image" size={22} />
    </button>
  </div>
</div>

<style>
  .composer {
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: 600px;
    /* Its frame is a token, not a number: the editor shrinks back into exactly this box. */
    min-height: var(--keep-composer-height);
    margin: 0 auto var(--keep-composer-margin);
    padding: 0 8px 0 16px;
    border: 1px solid var(--keep-border);
    border-radius: var(--keep-radius);
    background: var(--keep-surface);
    box-shadow: var(--keep-shadow-composer);
  }

  .placeholder {
    flex: 1 1 auto;
    text-align: left;
    /* Measured off the original: the box is 46px tall and its text is 16px. */
    padding: 10px 0;
    color: var(--keep-text-secondary);
    font-size: 1rem;
    font-weight: 500;
  }

  .tools {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  @media (max-width: 600px) {
    .composer {
      display: none;
    }
  }
</style>
