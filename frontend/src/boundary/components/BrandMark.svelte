<script lang="ts">
  /**
   * Notka's own mark: a note with a folded corner whose last line ends in dots, one of the eDuwe.pl
   * family. It is deliberately not a light bulb — the look of the app follows
   * Google Keep, the identity must not (a yellow bulb beside Keep's layout reads as Keep's logo). The
   * same drawing is in `public/favicon.svg` and the PWA icons. The sheet fills the box's height less
   * a sixth, which keeps its ink the size the header was measured for (`docs/METRICS.md`).
   *
   * A background theme may carry a logo of its own (`docs/THEMES.md`), which then takes the mark's place.
   */
  import { backgroundThemes } from '../../control/state/backgroundThemes.svelte';

  interface Props {
    size?: number;
  }

  let { size = 24 }: Props = $props();
</script>

{#if backgroundThemes.logo}
  <img class="logo" src={backgroundThemes.logo} alt="" width={size} height={size} draggable="false" />
{:else}
  <svg width={size} height={size} viewBox="-12 -12 144 144" aria-hidden="true" focusable="false">
    <path class="sheet" d="M22 0H74L108 34V110A10 10 0 0 1 98 120H22A10 10 0 0 1 12 110V10A10 10 0 0 1 22 0Z" />
    <path class="fold" d="M74 0V28A6 6 0 0 0 80 34H108Z" />
    <path class="lines" d="M32 56H88M32 74H88M32 92H52" />
    <circle class="dot" cx="64" cy="92" r="4.5" />
    <circle class="dot" cx="75" cy="92" r="3.5" />
  </svg>
{/if}

<style>
  svg,
  .logo {
    display: block;
    flex: none;
  }

  .logo {
    object-fit: contain;
  }

  .sheet {
    fill: var(--keep-brand);
  }

  .fold {
    fill: var(--keep-brand-fold);
  }

  .lines {
    fill: none;
    stroke: var(--keep-brand-ink);
    stroke-width: 8;
    stroke-linecap: round;
  }

  .dot {
    fill: var(--keep-brand-dot);
  }
</style>
