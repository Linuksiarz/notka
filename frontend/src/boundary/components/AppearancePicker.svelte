<script lang="ts">
  import { NOTE_BACKGROUNDS, PICKABLE_COLORS } from '../../entity/api/types';
  import type { NoteBackground, NoteColor } from '../../entity/api/types';
  import { t } from '../i18n';
  import Icon from './Icon.svelte';

  /**
   * The Keep appearance chooser: colors on the first row, the note backgrounds below the divider.
   *
   * **A color and a background are two independent choices**, the way the original has them: picking
   * one keeps the other, and each row shows its own selection. Forcing them apart — which this did,
   * "picking either clears the other" — is what the owner hit: on a note with a background the color
   * was silently reset to none, and there was no way to have both. A background's artwork is opaque,
   * so it paints over the color; the color is still the note's own and comes back the moment the
   * background is taken away.
   *
   * Each row's first swatch is that row's "none" option. Backgrounds are round thumbnails of the real
   * artwork, cropped by `background-size: cover` in `palette.css`, which is also what makes both theme
   * variants come out right without this component knowing about them.
   */
  interface Props {
    color: NoteColor;
    background: NoteBackground | null;
    canChange: boolean;
    onSelect: (color: NoteColor, background: NoteBackground | null) => void;
    /**
     * `sheet` is the phone's: the original's Android app shows the two rows in a bottom sheet, each
     * under a heading of its own and scrolling sideways, with larger round swatches.
     */
    layout?: 'popover' | 'sheet';
  }

  let { color, background, canChange, onSelect, layout = 'popover' }: Props = $props();

  /** Each row answers for itself: the color row for the note's color, the other for its background. */
  const plainColor = $derived(color === 'default');
  const plainBackground = $derived(background === null);
</script>

<div class="appearance-picker" class:sheet={layout === 'sheet'} role="group" aria-label={t('appearance.group')}>
  {#if layout === 'sheet'}<p class="heading">{t('appearance.colour')}</p>{/if}
  <div class="row">
    <button
      type="button"
      class="swatch none"
      class:selected={plainColor}
      data-color="default"
      title={t('color.default')}
      aria-label={t('color.default')}
      aria-pressed={plainColor}
      disabled={!canChange}
      onclick={() => onSelect('default', background)}
    >
      {#if !(plainColor && layout === 'sheet')}<Icon name="no-color" size={20} />{/if}
      {#if plainColor}<span class="badge"><Icon name="check" size={12} /></span>{/if}
    </button>

    {#each PICKABLE_COLORS as option (option)}
      <button
        type="button"
        class="swatch"
        class:selected={color === option}
        data-color={option}
        title={t(`color.${option}`)}
        aria-label={t(`color.${option}`)}
        aria-pressed={color === option}
        disabled={!canChange}
        onclick={() => onSelect(option, background)}
      >
        {#if color === option}
          <span class="badge"><Icon name="check" size={12} /></span>
        {/if}
      </button>
    {/each}
  </div>

  {#if layout === 'sheet'}<p class="heading">{t('appearance.background')}</p>{/if}
  <div class="row backgrounds">
    <button
      type="button"
      class="swatch none background-none"
      class:selected={plainBackground}
      data-none-background
      title={t('appearance.noBackground')}
      aria-label={t('appearance.noBackground')}
      aria-pressed={plainBackground}
      disabled={!canChange}
      onclick={() => onSelect(color, null)}
    >
      <Icon name="no-image" size={24} />
      {#if plainBackground}<span class="badge"><Icon name="check" size={12} /></span>{/if}
    </button>

    {#each NOTE_BACKGROUNDS as option (option)}
      <button
        type="button"
        class="swatch background"
        class:selected={background === option}
        data-background={option}
        title={t(`background.${option}`)}
        aria-label={t(`background.${option}`)}
        aria-pressed={background === option}
        disabled={!canChange}
        onclick={() => onSelect(color, option)}
      >
        {#if background === option}
          <span class="badge"><Icon name="check" size={12} /></span>
        {/if}
      </button>
    {/each}
  </div>
</div>

<style>
  /* Measured off the original's picker (rule 19): the box is sized by its content, its rows are
     12px apart and its swatches are 32px (colour) and 40px (background) with a 4px gap. The line
     between the two groups is the original's own divider — the owner's "brakuje linii dzielącej
     kolory tła od teł" — and it is the theme's border token, one pixel. */
  .appearance-picker {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: fit-content;
    max-width: calc(100vw - 32px);
    padding: 8px 12px;
    border-radius: var(--keep-radius);
    background: var(--keep-surface);
    color: var(--keep-text);
    box-shadow: var(--keep-shadow-popover);
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .row.backgrounds {
    padding-top: 12px;
    border-top: 1px solid var(--keep-border);
  }

  .swatch {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    /* `palette.css` sets the artwork and the fallback tint through these two. */
    background-color: var(--note-swatch, var(--keep-surface));
    background-size: cover;
    background-position: center;
    border: 1px solid var(--note-swatch-border, var(--keep-border));
    transition: transform var(--keep-duration) var(--keep-ease);
  }

  .swatch.background,
  /* **The "no background" tile is the same size as the tiles beside it.** It was 32px, the colour
     row's size, which the owner read off the picker at once: "ikona na No Background jest wyraźnie
     mniejsza od pozostałych elementów w tej linii". */
  .swatch.background-none {
    width: 40px;
    height: 40px;
  }

  /* Neither "none" option is a colour: the colour row's is an outlined circle with the
     droplet glyph, the background row's one with the picture glyph. */
  .swatch.none {
    background-color: transparent;
    color: var(--keep-icon);
  }

  .swatch.none.selected {
    color: var(--keep-accent);
  }

  .swatch:hover:not(:disabled) {
    transform: scale(1.06);
  }

  .swatch.selected {
    box-shadow: 0 0 0 2px var(--keep-accent);
  }

  .badge {
    position: absolute;
    top: -4px;
    right: -4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--keep-accent);
    color: #fff;
  }

  /*
   * The phone's sheet, the Android app's own (measured on the emulator at 412dp, both themes,
   * 2026-10-22, docs/METRICS.md): each row under a 24dp heading 24dp in; the colours 48dp circles
   * (`color_swatch_small`) 14dp apart, the backgrounds 64dp circles 12dp apart starting 30dp in; a
   * resting swatch has a 1dp outline and a picked one a 2dp ring in the scheme's primary — the colour
   * with a tick in its middle, a background with a 24dp badge on its top right. The "none" colour is
   * the plain note's own surface. The 51/68px and 23/14px gaps this replaced came off a phone with
   * its display scaled up.
   */
  .appearance-picker.sheet {
    gap: 0;
    width: auto;
    max-width: none;
    /* With the sheet's own 16px, the tiles end 34dp above the sheet's edge, as the app's do. */
    padding: 0 0 18px;
    border-radius: 0;
    background: transparent;
    color: inherit;
    box-shadow: none;
  }

  .sheet .heading {
    margin: 12px 24px 12px;
    font-size: 1rem;
    font-weight: 500;
    line-height: 1.5rem;
  }

  .sheet .row {
    flex-wrap: nowrap;
    gap: 14px;
    padding: 0 24px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .sheet .row::-webkit-scrollbar {
    display: none;
  }

  /* The badge hangs 2dp over a tile's top and 4dp past its side, inside the scrolling row's box. */
  .sheet .row.backgrounds {
    gap: 12px;
    padding: 4px 24px 0 30px;
    border-top: 0;
  }

  .sheet .row + .heading {
    margin-top: 24px;
    margin-bottom: 6px;
  }

  .sheet .swatch {
    flex: 0 0 auto;
    width: 48px;
    height: 48px;
    border-color: var(--keep-phone-outline);
  }

  .sheet .swatch.background,
  .sheet .swatch.background-none {
    width: 64px;
    height: 64px;
  }

  .sheet .swatch.none {
    background-color: var(--keep-surface);
    color: var(--keep-phone-glyph);
  }

  .sheet .swatch.selected {
    box-shadow: none;
    border: 2px solid var(--keep-phone-primary);
  }

  .sheet .badge {
    top: -2px;
    right: -4px;
    width: 24px;
    height: 24px;
    background: var(--keep-phone-primary);
    color: var(--keep-surface);
  }

  /* The colour row marks its pick with a tick in the middle of the ring; the backgrounds keep the
     corner badge, as the original's do. A picked "none" shows the tick alone (the markup drops its glyph). */
  .sheet .row:not(.backgrounds) .badge {
    top: 50%;
    left: 50%;
    right: auto;
    background: transparent;
    color: var(--keep-phone-primary);
    transform: translate(-50%, -50%) scale(2);
  }

  .sheet .swatch:hover:not(:disabled) {
    transform: none;
  }

  .swatch:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
