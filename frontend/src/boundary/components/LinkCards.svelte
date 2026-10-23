<script lang="ts">
  import { toast } from 'svelte-sonner';
  import type { LinkPreview } from '../../entity/api/types';
  import { DropdownMenu } from 'bits-ui';
  import { t } from '../i18n';
  import Icon from './Icon.svelte';

  interface Props {
    previews: LinkPreview[];
    /**
     * The grid's card is a summary: a 48px thumbnail and a single line of title, in a block that
     * bleeds to the card's edges. The editor has the room the editable gives it, so its rows are
     * 56px in a bordered block with its own rounded corners. Both are measured off the original.
     */
    compact?: boolean;
  }

  let { previews, compact = false }: Props = $props();

  async function copy(url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      toast(t('link.copied'));
    } catch {
      // A browser that refuses the clipboard is not worth a message of its own: the address is on
      // screen, and selecting it by hand still works.
    }
  }

  /**
   * The address under the title is the **host** the note links to — `chipolo.net`, the way the
   * original shows it — not the page's own `og:site_name`, which would read "Chipolo".
   */
  function hostOf(url: string): string {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  }

  /** A click on a link is not a click on the note underneath it. */
  function stop(event: MouseEvent): void {
    event.stopPropagation();
  }
</script>

{#if previews.length > 0}
  <div class="links" class:compact>
    {#each previews as preview (preview.url)}
      <div class="row">
        <a
          draggable="false"
          class="main"
          href={preview.url}
          target="_blank"
          rel="noopener noreferrer"
          title={preview.title}
          onclick={stop}
        >
          <!-- A page without a picture leaves its cell empty, as the original does. -->
          <span class="thumb">
            {#if preview.imageUrl}
              <img src={preview.imageUrl} alt="" loading="lazy" referrerpolicy="no-referrer" draggable="false" />
            {/if}
          </span>
          <span class="text">
            <span class="title">{preview.title}</span>
            <span class="site">{hostOf(preview.url)}</span>
          </span>
        </a>

        {#if compact}
          <a
            draggable="false"
            class="action"
            href={preview.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('link.open')}
            title={t('link.open')}
            onclick={stop}
          >
            <Icon name="open-in-new" size={14} />
          </a>
        {:else}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger
              class="action"
              aria-label={t('link.actions')}
              title={t('link.actions')}
              onclick={stop}
            >
              <Icon name="more-vert" size={20} />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content strategy="fixed" preventScroll={false} class="menu" data-overlay="menu" sideOffset={4} align="end">
                <DropdownMenu.Item class="menu-item" onSelect={() => window.open(preview.url, '_blank', 'noopener')}>
                  <Icon name="open-in-new" size={18} />
                  <span>{t('link.open')}</span>
                </DropdownMenu.Item>
                <DropdownMenu.Item class="menu-item" onSelect={() => void copy(preview.url)}>
                  <Icon name="content-copy" size={18} />
                  <span>{t('link.copy')}</span>
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        {/if}
      </div>
    {/each}
  </div>
{/if}

<style>
  /*
   * Measured off the owner's screenshots of the original (2026-10-14, light and dark, card and editor;
   * see `docs/METRICS.md`). Both treatments share the row: a **56×56 thumbnail cell** at its left edge,
   * filled by the picture and keeping the note's own surface, and the text beside it on a lighter fill
   * (`--keep-link-row`) that runs to the row's right edge.
   * - On a **card** the rows form one block that bleeds to the card's edges: its last hairline is the
   *   card's bottom edge, and the hairlines between rows are `--keep-link-divider`.
   * - In the **editor** every row is a card of its own: rounded, raised, 15px apart.
   */
  .links {
    --thumb-cell: 56px;
    display: flex;
    flex-direction: column;
    gap: 15px;
    margin-top: 8px;
  }

  .links.compact {
    gap: 0;
    margin: 0;
    border-top: 1px solid var(--keep-link-divider);
  }

  .row {
    position: relative;
    display: flex;
    align-items: center;
    min-height: var(--thumb-cell);
    background: linear-gradient(
      to right,
      transparent var(--thumb-cell),
      var(--keep-link-row) var(--thumb-cell)
    );
  }

  .links:not(.compact) .row {
    border-radius: 8px;
    overflow: hidden;
    box-shadow: var(--keep-shadow-panel);
  }

  .compact .row + .row {
    border-top: 1px solid var(--keep-link-divider);
  }

  .main {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1 1 auto;
    min-width: 0;
    align-self: stretch;
    color: inherit;
    text-decoration: none;
  }

  .thumb {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    align-self: stretch;
    width: var(--thumb-cell);
    min-height: var(--thumb-cell);
    overflow: hidden;
    color: var(--keep-icon);
  }

  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    padding: 8px 0;
  }

  /* One line on both surfaces: the editor's 56px row has room for the title and the site, no more. */
  .title {
    font-size: 0.875rem;
    font-weight: 500;
    line-height: 1.125rem;
    color: var(--keep-note-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .site {
    font-size: 0.75rem;
    line-height: 1rem;
    color: var(--note-fg-secondary, var(--keep-text-secondary));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* The editor's ⋮, its centre 24px in from the row's right edge. */
  :global(.links .action) {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    align-self: stretch;
    border: 0;
    background: transparent;
    color: var(--keep-icon);
    cursor: pointer;
  }

  /* The card's "open" glyph is small and sits in the row's top right corner, 8px from both edges. */
  .compact .action {
    width: auto;
    align-self: flex-start;
    padding: 6px;
  }

  :global(.links .action:hover) {
    color: var(--keep-text);
  }
</style>
