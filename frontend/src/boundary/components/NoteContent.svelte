<script lang="ts">
  import type { NoteDocument } from '../../entity/api/types';
  import { listNumbers } from '../../entity/noteDocument';
  import { COMPLETED_SECTION } from '../editor/completedSection';
  import { t } from '../i18n';
  import Icon from './Icon.svelte';

  interface Props {
    document: NoteDocument;
    /** Renders only the first N blocks, used by compact card previews. */
    maxBlocks?: number;
    /**
     * Collects the ticked items under a collapsible heading, the way the original shows a list: what
     * is left to do first, then "N completed items". Off for compact previews, which show a note's
     * opening lines as they are.
     */
    groupCompleted?: boolean;
  }

  let { document, maxBlocks, groupCompleted = false }: Props = $props();

  let completedOpen = $state(true);

  const all = $derived(maxBlocks ? document.blocks.slice(0, maxBlocks) : document.blocks);
  const numbers = $derived(listNumbers(document.blocks));
  const truncated = $derived(maxBlocks !== undefined && document.blocks.length > maxBlocks);

  const done = $derived(groupCompleted ? all.filter((block) => block.checked === true) : []);
  const blocks = $derived(
    done.length > 0 ? all.filter((block) => block.checked !== true) : all
  );

  const completedLabel = $derived(t('notes.completedItems', { count: done.length }));

  function safeHref(href: string | undefined): string | null {
    if (!href) return null;
    try {
      const url = new URL(href, window.location.origin);
      return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.toString() : null;
    } catch {
      return null;
    }
  }

  function linkTarget(span: { link?: string }): string | null {
    return safeHref(span.link);
  }

  /**
   * An address written plainly in the text reads as a link too, the way it does in the original —
   * the card is a *reader*, and what it shows must not depend on whether the writer's editor happened
   * to mark the text. The stored document is untouched: this only decides how it is drawn.
   */
  function textParts(text: string): { text: string; href: string | null }[] {
    const parts: { text: string; href: string | null }[] = [];
    let last = 0;
    for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
      const start = match.index ?? 0;
      // The sentence's own punctuation is not part of the address.
      const address = match[0].replace(/[.,;:!?)\]}"']+$/, '');
      if (start > last) parts.push({ text: text.slice(last, start), href: null });
      parts.push({ text: address, href: safeHref(address) });
      last = start + address.length;
    }
    if (last < text.length) parts.push({ text: text.slice(last), href: null });
    return parts.length > 0 ? parts : [{ text, href: null }];
  }
</script>

<div class="note-content">
  {#each blocks as block (block.id)}
    <div
      class="line"
      class:checklist={block.type === 'checklist'}
      class:checked={block.checked === true}
      data-type={block.type}
      style="--depth: {block.depth ?? 0}"
    >
      {#if block.type === 'checklist'}
        <span class="checkbox" class:on={block.checked === true}>
          {#if block.checked}<Icon name="check" size={14} />{/if}
        </span>
      {:else if block.type === 'bulleted'}
        <span class="marker bullet">&bull;</span>
      {:else if block.type === 'numbered'}
        <span class="marker">{numbers.get(block.id) ?? 1}.</span>
      {/if}

      <span class="text">
        {#each block.spans as span, spanIndex (spanIndex)}
          {#if linkTarget(span)}
            <a
              draggable="false"
              class="s"
              class:bold={span.bold}
              class:italic={span.italic}
              class:underline={span.underline}
              class:strike={span.strikethrough}
              class:code={span.code}
              href={linkTarget(span)}
              target="_blank"
              rel="noopener noreferrer"
              onclick={(event) => event.stopPropagation()}>{span.text}</a
            >
          {:else}
            {#each textParts(span.text) as part, partIndex (partIndex)}
              {#if part.href}
                <a
                  draggable="false"
                  class="s"
                  class:bold={span.bold}
                  class:italic={span.italic}
                  class:underline={span.underline}
                  class:strike={span.strikethrough}
                  class:code={span.code}
                  href={part.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onclick={(event) => event.stopPropagation()}>{part.text}</a
                >
              {:else}
                <span
                  class="s"
                  class:bold={span.bold}
                  class:italic={span.italic}
                  class:underline={span.underline}
                  class:strike={span.strikethrough}
                  class:code={span.code}>{part.text}</span
                >
              {/if}
            {/each}
          {/if}
        {/each}
      </span>
    </div>
  {/each}
  {#if done.length > 0}
    <button
      type="button"
      class={COMPLETED_SECTION.toggle}
      aria-expanded={completedOpen}
      onclick={() => (completedOpen = !completedOpen)}
    >
      <Icon name={completedOpen ? 'expand-more' : 'chevron-right'} size={18} />
      <span>{completedLabel}</span>
    </button>
    {#if completedOpen}
      {#each done as block (block.id)}
        <div class="line checklist checked" data-type={block.type} style="--depth: {block.depth ?? 0}">
          <span class="checkbox on"><Icon name="check" size={14} /></span>
          <span class="text">
            {#each block.spans as span, spanIndex (spanIndex)}
              <span
                class="s"
                class:bold={span.bold}
                class:italic={span.italic}
                class:underline={span.underline}
                class:strike={span.strikethrough}
                class:code={span.code}>{span.text}</span
              >
            {/each}
          </span>
        </div>
      {/each}
    {/if}
  {/if}

  {#if truncated}
    <div class="more">{t('card.truncated')}</div>
  {/if}
</div>

<style>
  .note-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
    word-break: break-word;
    white-space: pre-wrap;
    /* Measured off the original's own card: the note text is 16px on a 24px line. Ours inherited the
       app's 14px, which is why the same address wrapped into three lines there and four here. */
    font-size: 16px;
    line-height: 24px;
  }


  /*
   * On a phone the original's card text is smaller, measured from the owner's own screenshots of both
   * apps on the same device: the text's line pitch is 15.1px there against our 20.6px, and the same
   * text in the same card, so the ratio is the measurement — 12px on a 15px line.
   */
  @media (max-width: 600px) {
    .note-content {
      font-size: 12px;
      line-height: 15px;
    }

  }

  .line {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    min-height: 20px;
  }

  .line[data-type='heading1'] .text {
    font-size: 1.25rem;
    font-weight: 600;
    line-height: 1.5rem;
  }

  .line[data-type='heading2'] .text {
    font-size: 1.125rem;
    font-weight: 600;
    line-height: 1.375rem;
  }

  .line[data-type='heading3'] .text {
    font-size: 1rem;
    font-weight: 600;
    line-height: 1.25rem;
  }

  /* On a phone the card's headings take the text's own 0.75 ratio, which rem-based sizes cannot
     follow: 20/18/16px and 24/22/20px become 15/13.5/12px and 18/16.5/15px. */
  @media (max-width: 600px) {
    .line[data-type='heading1'] .text {
      font-size: 15px;
      line-height: 18px;
    }

    .line[data-type='heading2'] .text {
      font-size: 13.5px;
      line-height: 16.5px;
    }

    .line[data-type='heading3'] .text {
      font-size: 12px;
      line-height: 15px;
    }
  }

  /* A nested line is indented without moving the ones around it. */
  .line[data-type='bulleted'],
  .line[data-type='numbered'],
  .line[data-type='checklist'] {
    padding-left: calc(var(--depth, 0) * 18px);
  }

  :global(:root[data-theme='dark']) .completed-toggle {
    border-top-color: rgba(255, 255, 255, 0.1);
  }

  /* The same name the editor's heading carries (`boundary/editor/completedSection.ts`); here it is a
     component-scoped class rather than a global one, because a card is not inside an editable. */
  /* Measured from the original's DOM: a 1px line at 10% ink, 5px under the last active row, and the
     heading 15px under the line. */
  .completed-toggle {
    display: flex;
    align-items: center;
    gap: 4px;
    margin: 5px 0 2px;
    padding: 14px 0 2px;
    border-top: 1px solid rgba(0, 0, 0, 0.1);
    color: var(--note-fg-secondary, var(--keep-text-secondary));
    font-size: 13px;
    font-weight: 500;
    text-align: left;
  }

  .marker {
    flex: 0 0 auto;
    color: var(--note-fg-secondary, var(--keep-text-secondary));
    font-variant-numeric: tabular-nums;
    min-width: 12px;
  }

  .line[data-type='bulleted'] .text,
  .line[data-type='numbered'] .text {
    flex: 1 1 auto;
  }

  .text {
    flex: 1 1 auto;
    min-width: 0;
  }

  .checkbox {
    flex: 0 0 auto;
    width: 18px;
    height: 18px;
    margin-top: 2px;
    border: 2px solid var(--note-fg-secondary, var(--keep-text-secondary));
    border-radius: 3px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .checkbox.on {
    color: var(--note-fg-secondary, var(--keep-text-secondary));
  }

  .line.checked .text {
    text-decoration: line-through;
    opacity: 0.65;
  }

  .s.bold {
    font-weight: 700;
  }
  .s.italic {
    font-style: italic;
  }
  .s.underline {
    text-decoration: underline;
  }
  .s.strike {
    text-decoration: line-through;
  }
  .s.code {
    font-family: 'Roboto Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.9em;
    background: rgba(0, 0, 0, 0.08);
    border-radius: 3px;
    padding: 0 3px;
  }
  .s.underline.strike {
    text-decoration: underline line-through;
  }

  a.s {
    /* The original paints an address in its link colour in the light theme, and in the note's own ink
       in the dark one, underlined in both (`--keep-note-link`, measured). */
    color: var(--keep-note-link, var(--note-fg, var(--keep-text)));
    text-decoration: underline;
  }

  .more {
    color: var(--note-fg-secondary, var(--keep-text-secondary));
  }
</style>
