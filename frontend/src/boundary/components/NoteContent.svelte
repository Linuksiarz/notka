<script lang="ts">
  import type { NoteDocument } from '../../entity/api/types';
  import { listNumbers } from '../../entity/noteDocument';
  import { COMPLETED_SECTION } from '../editor/completedSection';
  import { checklistSections } from '../../entity/checklistSections';
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

  /**
   * A card draws no empty lines at its end: the original's cards do not, and every list note stored
   * before the editor stopped adding one (`noteSchema.ts`, `trailingNode`) carries an empty paragraph
   * after its list.
   */
  const written = $derived.by(() => {
    let end = document.blocks.length;
    while (end > 1) {
      const last = document.blocks[end - 1];
      if (!last || last.type !== 'paragraph' || last.spans.some((span) => span.text.length > 0)) break;
      end -= 1;
    }
    return document.blocks.slice(0, end);
  });
  const all = $derived(maxBlocks ? written.slice(0, maxBlocks) : written);
  const numbers = $derived(listNumbers(document.blocks));
  const truncated = $derived(maxBlocks !== undefined && written.length > maxBlocks);

  /** The two sections a list is drawn in — the editor's own rule (`entity/checklistSections.ts`). */
  const sections = $derived(
    groupCompleted
      ? checklistSections(
          all.map((block) => ({ checked: block.type === 'checklist' && block.checked === true, depth: block.depth ?? 0 }))
        )
      : null
  );
  const blocks = $derived(sections ? sections.active.flatMap((index) => all[index] ?? []) : all);
  const completed = $derived(
    sections
      ? sections.completed.map((group) => ({
          ghost: group.ghost === null ? null : (all[group.ghost] ?? null),
          rows: group.rows.flatMap((index) => all[index] ?? [])
        }))
      : []
  );
  const completedCount = $derived(sections?.completedCount ?? 0);

  const completedLabel = $derived(t('notes.completedItems', { count: completedCount }));

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
  {#if completedCount > 0}
    <!-- A heading, not a control: on a card a click anywhere opens the note, the line and this label
         included. Folding the section is the editor's own (`completedSection.ts`). -->
    <div class={COMPLETED_SECTION.toggle}>
      <Icon name="expand-more" size={18} />
      <span>{completedLabel}</span>
    </div>
    {#each completed as group, groupIndex (groupIndex)}
      {#if group.ghost}
        <!-- The unticked parent of these rows, greyed: it is still in the list above, and drawn again
             here so the rows read as its own (the Android app's "Checked items"). -->
        <div class="line checklist {COMPLETED_SECTION.ghost}" data-type="checklist" style="--depth: {group.ghost.depth ?? 0}">
          <span class="checkbox"></span>
          <span class="text">{group.ghost.spans.map((span) => span.text).join('')}</span>
        </div>
      {/if}
      {#each group.rows as block (block.id)}
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
    {/each}
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
    font-size: 1rem;
    line-height: 1.5rem;
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

  /* A nested line is indented without moving the ones around it. */
  .line[data-type='bulleted'],
  .line[data-type='numbered'],
  .line[data-type='checklist'] {
    padding-left: calc(var(--depth, 0) * 18px);
  }

  /* The same name the editor's heading carries (`boundary/editor/completedSection.ts`); here it is a
     component-scoped class rather than a global one, because a card is not inside an editable.
     Measured from the original's DOM: a 1px line at 10% ink, 5px under the last active row, and the
     heading 15px under the line. */
  .completed-toggle {
    display: flex;
    align-items: center;
    gap: 4px;
    margin: 5px 0 2px;
    padding: 14px 0 2px;
    border-top: 1px solid var(--keep-completed-rule);
    color: var(--note-fg-secondary, var(--keep-text-secondary));
    font-size: 0.8125rem;
    font-weight: 500;
    text-align: left;
  }

  .marker {
    flex: 0 0 auto;
    color: var(--note-fg-secondary, var(--keep-text-secondary));
    font-variant-numeric: tabular-nums;
    min-width: 12px;
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
    background: var(--keep-note-code);
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

  /* The greyed copy of an unticked parent above its ticked rows (`entity/checklistSections.ts`). */
  .completed-ghost {
    opacity: 0.38;
  }

  .more {
    color: var(--note-fg-secondary, var(--keep-text-secondary));
  }

  @media (max-width: 600px) {
    /* On a phone the original's card text is smaller, measured from the owner's own screenshots of
       both apps on the same device: the text's line pitch is 15.1px there against our 20.6px, and the
       same text in the same card, so the ratio is the measurement — 12px on a 15px line. */
    .note-content {
      font-size: 0.75rem;
      line-height: 0.9375rem;
    }

    /* The card's headings take the text's own 0.75 ratio, which rem-based sizes cannot follow:
       20/18/16px and 24/22/20px become 15/13.5/12px and 18/16.5/15px. */
    .line[data-type='heading1'] .text {
      font-size: 0.9375rem;
      line-height: 1.125rem;
    }

    .line[data-type='heading2'] .text {
      font-size: 0.8438rem;
      line-height: 1.0312rem;
    }

    .line[data-type='heading3'] .text {
      font-size: 0.75rem;
      line-height: 0.9375rem;
    }

    /* The checkbox is sized by the text and centred on its first line: measured off the Android app on
       an emulator, the box is 11dp beside 14sp text (0.78 of the font) and its centre is the capitals'
       own, to 0.4dp. A fixed 18px box was taller than the phone's 15px line, so the text sat above it. */
    .checkbox {
      width: 0.78em;
      height: 0.78em;
      margin-top: calc((1lh - 0.78em) / 2);
      border-width: 1px;
      border-radius: 2px;
    }

    .checkbox :global(svg) {
      width: 100%;
      height: 100%;
    }

    /* The Android app's card has no line over its checked items, as its editor has none. */
    .completed-toggle {
      border-top: 0;
    }
  }
</style>
