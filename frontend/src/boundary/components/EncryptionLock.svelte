<script lang="ts" module>
  import type { NoteEncryption } from '../../entity/api/types';
  import { t } from '../i18n';

  /** Why the note is, or is not, stored encrypted — the tooltip, and a phone's ⋮ sheet. */
  export function encryptionExplanation(encryption: NoteEncryption): string {
    return {
      ENCRYPTED: t('encryption.lock.encrypted'),
      SHARED: t('encryption.lock.shared'),
      LINK_PREVIEWS: t('encryption.lock.linkPreviews'),
      DISABLED: t('encryption.lock.disabled')
    }[encryption];
  }
</script>

<script lang="ts">
  import { Tooltip } from 'bits-ui';
  import Icon from './Icon.svelte';

  /**
   * The editor's lock (`docs/ENCRYPTION.md`): closed while the note is stored encrypted with its
   * owner's key, crossed out while it is not — and the tooltip says why, because each reason has its
   * own remedy (or none). The text is the explanation, so a tap opens it too, where there is no hover.
   */
  interface Props {
    encryption: NoteEncryption;
  }

  let { encryption }: Props = $props();

  let open = $state(false);

  const explanation = $derived(encryptionExplanation(encryption));
</script>

<Tooltip.Provider delayDuration={300}>
  <Tooltip.Root bind:open disableCloseOnTriggerClick>
    <Tooltip.Trigger
      type="button"
      class="encryption-lock"
      aria-label={encryption === 'ENCRYPTED' ? t('encryption.lock.encryptedLabel') : t('encryption.lock.notEncryptedLabel')}
      onclick={() => (open = !open)}
    >
      <Icon name={encryption === 'ENCRYPTED' ? 'lock' : 'no-encryption'} size={16} />
    </Tooltip.Trigger>
    <Tooltip.Portal>
      <Tooltip.Content data-overlay="encryption-tooltip" class="encryption-tooltip" side="top" sideOffset={6} collisionPadding={8}>
        {explanation}
      </Tooltip.Content>
    </Tooltip.Portal>
  </Tooltip.Root>
</Tooltip.Provider>

<style>
  /* The size of the "Edited" line's own glyph room, in its ink. */
  :global(.encryption-lock) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: none;
    color: var(--keep-edited-ink, var(--note-fg-secondary, var(--keep-text-secondary)));
    cursor: default;
  }

  :global(.encryption-lock:hover) {
    background: var(--keep-hover);
  }

  /* Material's plain tooltip, as the rest of Google's apps draw it: a dark grey bubble with light
     12px text; this one carries a sentence or two, so it wraps. */
  :global(.encryption-tooltip) {
    z-index: 90;
    max-width: 280px;
    padding: 6px 8px;
    border-radius: 4px;
    background: var(--keep-tooltip-bg);
    color: var(--keep-tooltip-ink);
    font-family: 'Roboto', var(--keep-font);
    font-size: 0.75rem;
    line-height: 1rem;
    letter-spacing: 0.3px;
  }
</style>
