<script lang="ts" module>
  /** How many dialogs are open; each one that opens is drawn above the ones open before it. */
  let openDialogs = 0;
</script>

<script lang="ts">
  import { Dialog as BitsDialog } from 'bits-ui';
  import type { Snippet } from 'svelte';
  import { claimBack } from '../../control/backStack';

  /**
   * Modal shell used by every dialog in the app.
   *
   * bits-ui owns the hard parts — focus trap, Escape, outside click, scroll lock, ARIA wiring — and
   * this wrapper keeps the props API the call sites already use (`open`, `onClose`, `title`, `width`).
   */
  interface Props {
    open: boolean;
    onClose: () => void;
    /** Accessible name; rendered as a visually hidden heading. */
    title: string;
    width?: string;
    /**
     * Set to false while another dialog is stacked on top: that dialog is outside this one as far
     * as the browser is concerned, and a click in it must not tear this one down.
     */
    closeOnOutsideClick?: boolean;
    children: Snippet;
  }

  let { open, onClose, title, width = '600px', closeOnOutsideClick = true, children }: Props = $props();

  // The system's Back closes an open dialog, as it does on Android and with iOS's edge swipe.
  $effect(() => {
    if (open) return claimBack(() => onClose());
  });

  /**
   * A dialog opened from another one (the profile picture from Settings, the friends from the share
   * dialog) goes on top of it. Both used the same z-index, so the one bits-ui happened to portal last
   * won — on a phone that was Settings, and the picture dialog opened invisibly underneath it.
   */
  let layer = $state(0);
  $effect(() => {
    if (!open) return;
    layer = openDialogs++;
    return () => {
      openDialogs--;
    };
  });
</script>

<BitsDialog.Root
  {open}
  onOpenChange={(next) => {
    if (!next) onClose();
  }}
>
  <BitsDialog.Portal>
    <BitsDialog.Overlay class="ok-backdrop" style="--dialog-layer: {layer}" />
    <!-- No scroll lock: it pads the body for a scrollbar it expects to hide, and ours is always there
         (`html { overflow-y: scroll }`), so the padding only narrowed the notes behind the dialog. -->
    <BitsDialog.Content
      preventScroll={false}
      class="ok-dialog"
      data-overlay="dialog"
      style="--dialog-width: {width}; --dialog-layer: {layer}"
      onInteractOutside={(event) => {
        if (!closeOnOutsideClick) {
          event.preventDefault();
          return;
        }
        // The toaster is rendered outside the dialog, so an interaction with a toast would count as
        // "clicked away" and close the dialog under the user. Toasts are part of our own UI, so a
        // click on one must not dismiss the dialog behind it.
        if (event.target instanceof Element && event.target.closest('[data-sonner-toaster]')) {
          event.preventDefault();
        }
      }}
    >
      <BitsDialog.Title class="visually-hidden">{title}</BitsDialog.Title>
      <!-- One scroll container for every dialog. Without it a dialog taller than the window had its
           lower half clipped by `.ok-dialog`'s own `overflow: hidden` and nothing could reach it —
           which is what happened to Settings, whose last section started below the box. The wrapper
           carries no padding of its own: each dialog brings its own. -->
      <div class="ok-dialog-body">
        {@render children()}
      </div>
    </BitsDialog.Content>
  </BitsDialog.Portal>
</BitsDialog.Root>

<style>
  /* `:global` is required: bits-ui renders these elements, not this component, so Svelte's scoping
     attribute never reaches them. The class names are namespaced to compensate. */
  :global(.ok-backdrop) {
    position: fixed;
    inset: 0;
    z-index: calc(60 + 2 * var(--dialog-layer, 0));
    background: rgba(0, 0, 0, 0.32);
  }

  :global(.ok-dialog) {
    position: fixed;
    top: 50%;
    left: 50%;
    z-index: calc(61 + 2 * var(--dialog-layer, 0));
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    width: calc(100% - 48px);
    max-width: var(--dialog-width, 600px);
    max-height: calc(100vh - 48px);
    border-radius: var(--keep-radius);
    background: var(--keep-surface);
    color: var(--keep-text);
    box-shadow: var(--keep-shadow-dialog);
    overflow: hidden;
  }

  :global(.ok-dialog-body) {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  /* Every dialog opens on the same header: its title, and the button that closes it at the right. */
  :global(.ok-dialog-body > * > header) {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  :global(.ok-dialog-body > * > header > h2) {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 500;
  }

  @media (max-width: 600px) {
    :global(.ok-dialog) {
      top: auto;
      bottom: 0;
      transform: translateX(-50%);
      width: 100%;
      max-width: none;
      max-height: 92vh;
      border-radius: var(--keep-radius) var(--keep-radius) 0 0;
    }
  }
</style>
