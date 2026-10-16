<script lang="ts">
  import { labels } from '../../control/state/labels.svelte';
  import type { SearchFacets, SearchFilter, SearchType } from '../../entity/search';
  import { searchFilterPath } from '../../entity/search';
  import { t } from '../i18n';
  import type { IconName } from './Icon.svelte';
  import Icon from './Icon.svelte';

  /**
   * The original's search page before anything is typed: what the notes can be narrowed by, as
   * panels of tiles — "Types", "Labels", "Colors". Its fourth panel, "Things", is the original's own
   * image recognition and has no counterpart here.
   */
  interface Props {
    facets: SearchFacets;
    onNavigate: (path: string) => void;
  }

  let { facets, onNavigate }: Props = $props();

  const TYPE_ICONS: Record<SearchType, IconName> = { reminders: 'bell', lists: 'list', images: 'image', urls: 'link' };

  const shownLabels = $derived(
    labels.labels.filter((label) => facets.labelIds.includes(label.id))
  );

  function pick(filter: SearchFilter): void {
    onNavigate(searchFilterPath(filter));
  }
</script>

<div class="facets">
  {#if facets.types.length > 0}
    <section class="panel">
      <h2>{t('search.types')}</h2>
      <div class="tiles">
        {#each facets.types as type (type)}
          <button type="button" class="tile type" onclick={() => pick({ kind: 'type', type })}>
            <span class="glyph"><Icon name={TYPE_ICONS[type]} size={28} /></span>
            <span class="name">{t(`search.type.${type}`)}</span>
          </button>
        {/each}
      </div>
    </section>
  {/if}

  {#if shownLabels.length > 0}
    <section class="panel">
      <h2>{t('search.labels')}</h2>
      <div class="tiles">
        {#each shownLabels as label (label.id)}
          <button type="button" class="tile" onclick={() => pick({ kind: 'label', labelId: label.id })}>
            <span class="glyph"><Icon name="label-filled" size={28} /></span>
            <span class="name">{label.name}</span>
          </button>
        {/each}
      </div>
    </section>
  {/if}

  {#if facets.colors.length > 0}
    <section class="panel">
      <h2>{t('search.colors')}</h2>
      <div class="swatches">
        {#each facets.colors as color (color)}
          <button
            type="button"
            class="swatch-cell"
            aria-label={t(`color.${color}`)}
            title={t(`color.${color}`)}
            onclick={() => pick({ kind: 'color', color })}
          >
            <span class="swatch" data-color={color}></span>
          </button>
        {/each}
      </div>
    </section>
  {/if}
</div>

<style>
  /* Measured off the original: the panels share an 800px column, 80px in from each side and 16px
     apart, so a panel is 640px wide on a desktop window and narrows with the window below that. */
  .facets {
    max-width: 800px;
    margin: 0 auto;
    padding-top: 16px;
  }

  .panel {
    margin: 0 80px 16px;
    background: var(--keep-surface);
    box-shadow: var(--keep-shadow-panel);
    overflow: hidden;
  }

  h2 {
    margin: 0;
    height: 40px;
    padding: 10px;
    font-family: 'Roboto', var(--keep-font);
    font-size: 0.9375rem;
    font-weight: 500;
    line-height: 1.25rem;
    color: var(--keep-text);
  }

  /* Four square tiles to a row, 4px of the panel between them. */
  .tiles {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
  }

  .tile {
    position: relative;
    aspect-ratio: 1;
    container-type: inline-size;
    background: var(--keep-search-tile);
    color: var(--keep-text-secondary);
    font-family: 'Roboto', var(--keep-font);
  }

  .tile.type {
    background: var(--keep-search-type-tile);
    color: #fff;
  }

  .tile:hover {
    filter: brightness(0.95);
  }

  /* The glyph is a quarter of the tile's width, in its middle. */
  .glyph {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .glyph :global(svg) {
    width: 25cqw;
    height: 25cqw;
  }

  .name {
    position: absolute;
    left: 0;
    right: 0;
    top: 80%;
    padding: 0 5px;
    overflow: hidden;
    font-size: 0.8125rem;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--keep-text);
  }

  .tile.type .name {
    color: #fff;
  }

  /* Eight cells to a row, each holding a 36px circle in its middle. */
  .swatches {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
  }

  /* The colour panel's body is 51px tall in the original, whatever the panel's width. */
  .swatch-cell {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 51px;
  }

  .swatch {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 1px solid var(--keep-search-swatch-border);
    background: var(--note-swatch);
  }

  .swatch-cell:hover .swatch {
    border-color: var(--keep-text);
  }

  @media (max-width: 600px) {
    .panel {
      margin: 0 8px 16px;
    }
  }
</style>
