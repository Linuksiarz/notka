<script lang="ts">
  import { AlertDialog } from 'bits-ui';
  import { t } from '../i18n';
  import { confirmation } from './confirmation.svelte';

  // Keep's own confirmation: the question, then "Cancel" and the action as text buttons on the right.
</script>

<AlertDialog.Root
  open={confirmation.request !== null}
  onOpenChange={(open) => {
    if (!open) confirmation.settle(false);
  }}
>
  <AlertDialog.Portal>
    <AlertDialog.Overlay class="ok-backdrop confirm-backdrop" />
    <AlertDialog.Content preventScroll={false} class="ok-dialog confirm-dialog" data-overlay="dialog" style="--dialog-width: 432px">
      <AlertDialog.Description class="confirm-message">
        {confirmation.request?.message ?? ''}
      </AlertDialog.Description>
      <div class="confirm-actions">
        <AlertDialog.Cancel class="confirm-button" onclick={() => confirmation.settle(false)}>
          {t('confirm.cancel')}
        </AlertDialog.Cancel>
        <AlertDialog.Action class="confirm-button" onclick={() => confirmation.settle(true)}>
          {confirmation.request?.action ?? ''}
        </AlertDialog.Action>
      </div>
    </AlertDialog.Content>
  </AlertDialog.Portal>
</AlertDialog.Root>

<style>
  /* bits-ui renders these elements, so the classes are global and namespaced. */
  /* Above everything a confirmation can be asked from — the editor, an open card menu, a dialog —
     and below the toaster. */
  :global(.ok-backdrop.confirm-backdrop) {
    z-index: 95;
  }

  :global(.ok-dialog.confirm-dialog) {
    padding: 24px 24px 8px;
    z-index: 96;
  }

  :global(.confirm-message) {
    margin: 0 0 24px;
    font-size: 0.9375rem;
    line-height: 1.375rem;
    color: var(--keep-text);
  }

  .confirm-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin: 0 -8px 0 0;
  }

  :global(.confirm-button) {
    padding: 8px 16px;
    border-radius: 4px;
    color: var(--keep-accent);
    font-size: 0.875rem;
    font-weight: 500;
  }

  :global(.confirm-button:hover),
  :global(.confirm-button:focus-visible) {
    background: var(--keep-hover);
  }
</style>
