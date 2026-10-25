<script lang="ts">
  import { tick } from 'svelte';
  import type { NoteDocument } from '../../entity/api/types';
  import {
    PHONE_CARD_TEXT_LINES,
    cardTextLines,
    excerpt,
    excerptLength
  } from '../../entity/cardExcerpt';
  import { ui } from '../../control/state/ui.svelte';
  import NoteContent from './NoteContent.svelte';

  /**
   * A text note's body on a card, cut the originals' way when it is long (docs/METRICS.md, "Long
   * notes"): the last whole word that fits and "…". What fits is measured, not counted, because a
   * line's length depends on the words and the card's width — so the cut is found by trying excerpts
   * of the document, longest that stays within the lines the card has.
   */
  interface Props {
    document: NoteDocument;
    /** The card's title as drawn, in px; 0 without one. On the web it takes lines from the text. */
    titleHeight: number;
  }

  let { document, titleHeight }: Props = $props();

  let host = $state<HTMLElement | null>(null);
  /** How many characters the card shows; `null` is the whole note. */
  let chars = $state<number | null>(null);
  let width = $state(0);
  const shown = $derived(chars === null ? document : excerpt(document, chars, !ui.phone));

  let run = 0;

  $effect(() => {
    // Everything the cut depends on: the text, the layout, the title's room and the card's width.
    void [document, ui.phone, titleHeight, width];
    void fit();
  });

  $effect(() => {
    if (!host) return;
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.round(entry?.contentRect.width ?? 0);
      if (next !== width) width = next;
    });
    observer.observe(host);
    // The fonts arriving re-wraps every line.
    void window.document.fonts?.ready.then(() => void fit());
    return () => observer.disconnect();
  });

  async function fit(): Promise<void> {
    const token = ++run;
    chars = null;
    await tick();
    const element = host;
    if (token !== run || !element) return;
    const lineHeight = parseFloat(getComputedStyle(element.firstElementChild ?? element).lineHeight) || 24;
    const lines = ui.phone ? PHONE_CARD_TEXT_LINES : cardTextLines(titleHeight, lineHeight);
    // Lines are counted, not pixels: the 2px between our blocks must not cost a line the original shows.
    const fits = () => drawnLines(element) <= lines;
    if (fits()) return;
    let low = 0;
    let high = excerptLength(document);
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      chars = middle;
      await tick();
      if (token !== run) return;
      if (fits()) low = middle;
      else high = middle - 1;
    }
    chars = low;
  }
  /** How many lines the text is drawn on: the distinct tops of its line boxes. */
  function drawnLines(element: HTMLElement): number {
    const tops = new Set<number>();
    const range = window.document.createRange();
    for (const line of element.querySelectorAll<HTMLElement>('.line')) {
      const text = line.querySelector('.text');
      let drawn = false;
      if (text) {
        range.selectNodeContents(text);
        for (const rect of range.getClientRects()) {
          if (rect.width === 0) continue;
          tops.add(Math.round(rect.top));
          drawn = true;
        }
      }
      // An empty line still takes a line.
      if (!drawn) tops.add(Math.round(line.getBoundingClientRect().top));
    }
    return tops.size;
  }
</script>

<div class="card-excerpt" bind:this={host}>
  <NoteContent document={shown} />
</div>
