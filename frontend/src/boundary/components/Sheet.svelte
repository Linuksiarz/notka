<script lang="ts">
  import { Dialog as BitsDialog } from 'bits-ui';
  import type { Snippet } from 'svelte';
  import type { NoteBackground, NoteColor } from '../../entity/api/types';

  /**
   * A phone's bottom sheet: the original's Android app answers its overflow menu, its colour picker,
   * its "add" button and its sort button with a panel that rises from the bottom edge, rather than a
   * menu hanging off the button. It is a modal dialog in every other respect, so bits-ui's Dialog
   * owns the focus, Escape and the click outside it.
   *
   * Measured off the owner's screenshots (412px, 2026-10-15): a 28px top radius, a 64px heading row
   * whose text starts 26px in, and 52px rows with a 24px glyph centred 38px in and the label at 77px.
   * A sheet opened from a note wears the note's own colour (`color`), as the original's does, and, when
   * the note has a background picture, the picture's own tint (`background`) instead — a flat colour,
   * never the artwork itself, which the original's sheet does not draw either.
   */
  interface Props {
    open: boolean;
    onClose: () => void;
    /** Accessible name; shown as the heading when `heading` is set. */
    title: string;
    heading?: boolean;
    color?: NoteColor;
    background?: NoteBackground | null;
    children: Snippet;
  }

  let { open, onClose, title, heading = false, color, background = null, children }: Props = $props();
</script>

<BitsDialog.Root
  {open}
  onOpenChange={(next) => {
    if (!next) onClose();
  }}
>
  <BitsDialog.Portal>
    <!-- An overlay of the editor's too: a tap on the veil closes the sheet, not the note under it. -->
    <BitsDialog.Overlay class="ok-sheet-scrim" data-overlay="sheet-scrim" />
    <BitsDialog.Content
      preventScroll={false}
      class={heading ? 'ok-sheet' : 'ok-sheet headless'}
      data-overlay="sheet"
      data-color={color}
      data-background={background ?? undefined}
    >
      <BitsDialog.Title class={heading ? 'ok-sheet-heading' : 'visually-hidden'}>{title}</BitsDialog.Title>
      {@render children()}
    </BitsDialog.Content>
  </BitsDialog.Portal>
</BitsDialog.Root>

<style>
  :global(.ok-sheet-scrim) {
    position: fixed;
    inset: 0;
    z-index: 95;
    background: var(--keep-sheet-scrim);
    animation: ok-sheet-fade var(--keep-duration) var(--keep-ease-standard);
  }

  :global(.ok-sheet) {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 96;
    max-height: 85vh;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0 0 calc(16px + env(safe-area-inset-bottom, 0px));
    border-radius: 28px 28px 0 0;
    background: var(--keep-sheet);
    color: var(--keep-text);
    outline: none;
    animation: ok-sheet-rise var(--keep-duration-long) var(--keep-ease-standard);
  }

  /* Opened from a note: the note's own colour and ink; a picture's tint, never its artwork. */
  :global(.ok-sheet[data-color]:not([data-color='default'])) {
    background: var(--note-bg);
    color: var(--note-fg);
  }

  /* The specificity beats the palette's own `[data-background]` rules, which also set the artwork. */
  :global(:root[data-theme] .ok-sheet[data-background]) {
    background: var(--note-bg);
    background-image: none;
    color: var(--note-fg);
  }

  /* A sheet without a heading starts its first row 8px under its edge. */
  :global(.ok-sheet.headless) {
    padding-top: 8px;
  }

  :global(.ok-sheet-heading) {
    display: flex;
    align-items: center;
    height: 64px;
    margin: 0;
    padding: 0 26px;
    font-size: 1rem;
    font-weight: 500;
  }

  :global(.ok-sheet-item) {
    display: flex;
    align-items: center;
    gap: 27px;
    width: calc(100% - 18px);
    height: 52px;
    margin: 0 9px;
    padding: 0 17px;
    border-radius: 26px;
    color: inherit;
    font-size: 1rem;
    text-align: left;
  }

  :global(.ok-sheet-item:focus-visible) {
    background: var(--keep-hover);
    outline: none;
  }

  @media (hover: hover) {
    :global(.ok-sheet-item:hover) {
      background: var(--keep-hover);
    }
  }

  :global(:root[data-motion='reduced'] .ok-sheet),
  :global(:root[data-motion='reduced'] .ok-sheet-scrim) {
    animation: none;
  }

  @keyframes -global-ok-sheet-rise {
    from {
      transform: translateY(100%);
    }
  }

  @keyframes -global-ok-sheet-fade {
    from {
      opacity: 0;
    }
  }
</style>
