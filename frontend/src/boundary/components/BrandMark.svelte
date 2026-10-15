<script lang="ts">
  /**
   * Notka's own mark: a note with a folded corner and an "N". It is deliberately not a light bulb —
   * the look of the app follows Google Keep, the identity must not (a yellow bulb beside Keep's
   * layout reads as Keep's logo). The same drawing is in `public/favicon.svg` and the PWA icons.
   */
  interface Props {
    size?: number;
  }

  let { size = 24 }: Props = $props();
</script>

<svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
  <path class="sheet" d="M12 4H30L42 16V40A4 4 0 0 1 38 44H12A4 4 0 0 1 8 40V8A4 4 0 0 1 12 4Z" />
  <path class="fold" d="M30 4V13A3 3 0 0 0 33 16H42Z" />
  <polyline class="letter" points="17,35 17,22 31,35 31,22" />
</svg>

<style>
  svg {
    display: block;
    flex: none;
  }

  .sheet {
    fill: var(--keep-brand);
  }

  .fold {
    fill: var(--keep-brand-fold);
  }

  .letter {
    fill: none;
    stroke: #fff;
    stroke-width: 4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
