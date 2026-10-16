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
      <Icon name="no-color" size={20} />
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
    border-radius: 8px;
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
   * The phone's sheet, measured off the owner's screenshots of the original's Android app at 412px
   * (2026-10-15): each row under its own heading 26px in, the colours 51px circles 23px apart and the
   * backgrounds 68px ones 14px apart, both rows scrolling sideways past the screen's edge. A picked
   * swatch is ringed in the blue of the app's accent; the "none" colour is a dark disc.
   */
  .appearance-picker.sheet {
    gap: 0;
    width: auto;
    max-width: none;
    padding: 0 0 21px;
    border-radius: 0;
    background: transparent;
    color: inherit;
    box-shadow: none;
  }

  .sheet .heading {
    margin: 20px 26px 13px;
    font-size: 1rem;
    font-weight: 500;
    line-height: 1.5rem;
  }

  .sheet .row {
    flex-wrap: nowrap;
    gap: 23px;
    padding: 0 26px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .sheet .row::-webkit-scrollbar {
    display: none;
  }

  .sheet .row.backgrounds {
    gap: 14px;
    padding-top: 0;
    border-top: 0;
  }

  .sheet .row + .heading {
    margin-top: 23px;
  }

  .sheet .swatch {
    flex: 0 0 auto;
    width: 51px;
    height: 51px;
  }

  .sheet .swatch.background,
  .sheet .swatch.background-none {
    width: 68px;
    height: 68px;
  }

  .sheet .swatch.none:not(.background-none) {
    background-color: rgba(0, 0, 0, 0.85);
    color: #ffffff;
  }

  .sheet .swatch.selected {
    box-shadow: inset 0 0 0 3px var(--keep-fab-close);
    border-color: var(--keep-fab-close);
  }

  /* The colour row marks its pick with a tick in the middle of the ring; the backgrounds keep the
     corner badge, as the original's do. */
  .sheet .row:not(.backgrounds) .badge {
    top: 50%;
    left: 50%;
    right: auto;
    background: transparent;
    color: var(--keep-fab-close);
    transform: translate(-50%, -50%) scale(2.4);
  }

  .sheet .swatch:hover:not(:disabled) {
    transform: none;
  }

  .swatch:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
