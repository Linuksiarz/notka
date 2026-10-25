import expandLess from '@iconify-icons/material-symbols/expand-less';
import expandMore from '@iconify-icons/material-symbols/expand-more';
import { buildIcon } from '@iconify/svelte';

/**
 * The completed-items section, named in one place.
 *
 * Ticking a checklist row collects it under an "N completed items" heading, and that heading is drawn
 * from two different worlds: as a ProseMirror widget in `checklistCompletion.ts` (a decoration is a
 * DOM node, not a component) and as part of a card in `NoteContent.svelte`. Both draw the same thing,
 * so they agree on the class names here rather than each carrying their own copy.
 *
 * A stylesheet cannot import TypeScript, so the names still have to appear literally in
 * `RichText.svelte`'s `<style>` and in `NoteContent.svelte`'s. `completedSection.test.ts` reads both
 * files and fails if one drifts, which is the only thing keeping those two spellings in step.
 */
export const COMPLETED_SECTION = {
  /** The heading's own row, sitting where the ticked rows used to be. */
  row: 'completed-row',
  /** The button that folds the section away; it carries the chevron and the label. */
  toggle: 'completed-toggle',
  /** The box the chevron is drawn in. */
  chevron: 'completed-chevron',
  /** The "N completed items" text. Styled by the button, so it needs no rule of its own. */
  label: 'completed-label',
  /** Put on every ticked row while the section is folded, so `display: none` can take them away. */
  hidden: 'completed-hidden',
  /** The greyed copy of an unticked parent, drawn above its ticked rows in the section. */
  ghost: 'completed-ghost'
} as const;

/**
 * The classes the editor's stylesheet has to style. `completed-label` is not among them: it inherits
 * from the button, which is why the test below checks these and not the whole object.
 */
export const COMPLETED_SECTION_STYLED = [
  COMPLETED_SECTION.row,
  COMPLETED_SECTION.toggle,
  COMPLETED_SECTION.chevron,
  COMPLETED_SECTION.hidden,
  COMPLETED_SECTION.ghost
] as const;

/** The box the chevron is drawn in, in the editor. A card's heading uses the same glyph at 18px. */
export const COMPLETED_CHEVRON_SIZE = 20;

/**
 * The chevron for an open (`expand-more`, pointing down) or a folded (`expand-less`, pointing up)
 * section — the original's editor turns one glyph between those two (measured, 2026-10-23). A card's
 * chevron points down in both states.
 *
 * Built from the same icon data and by the same Iconify code path that `Icon.svelte` renders, so the
 * widget's chevron is the card's chevron: one glyph, two sizes. Hand-written paths were what put a
 * third, subtly different chevron in the app.
 */
export function completedChevron(open: boolean): string {
  const { attributes, body } = buildIcon(open ? expandMore : expandLess, {
    width: COMPLETED_CHEVRON_SIZE,
    height: COMPLETED_CHEVRON_SIZE
  });

  const rendered = Object.entries(attributes)
    .map(([name, value]) => `${name}="${value}"`)
    .join(' ');

  return `<svg ${rendered}>${body}</svg>`;
}
