import chevronRight from '@iconify-icons/material-symbols/chevron-right';
import expandMore from '@iconify-icons/material-symbols/expand-more';
import { describe, expect, it } from 'vitest';
import {
  COMPLETED_CHEVRON_SIZE,
  COMPLETED_SECTION,
  COMPLETED_SECTION_STYLED,
  completedChevron
} from './completedSection';

/**
 * A stylesheet cannot import TypeScript, so the class names are also spelled out in the components'
 * `<style>` blocks. These tests read those files as text and fail when the two spellings drift apart —
 * a rename that only lands on one side would otherwise leave an unstyled widget behind, silently.
 *
 * The sources come in as raw text through Vite, not through `node:fs`: the app has no Node types, and
 * a component is not something a browser build should be reading off disk anyway.
 */
const COMPONENTS = import.meta.glob('../components/{RichText,NoteContent}.svelte', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>;

function readComponent(name: 'RichText' | 'NoteContent'): string {
  const source = COMPONENTS[`../components/${name}.svelte`];
  expect(source, `${name}.svelte is readable as text`).toBeTypeOf('string');
  return source ?? '';
}

function styleBlockOf(source: string, component: string): string {
  const match = source.match(/<style>([\s\S]*?)<\/style>/);
  expect(match, `${component} has a <style> block`).not.toBeNull();
  return match?.[1] ?? '';
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The declarations of the rule that styles `selector`, or `''` when no rule does.
 *
 * The class name has to end there: matching a bare substring would accept `.completed-chevronx` as
 * `.completed-chevron`, which is exactly the drift this file is here to catch.
 */
function ruleFor(style: string, selector: string): string {
  const pattern = new RegExp(`${escapeRegExp(selector)}(?![\\w-])[^{}]*\\{([^}]*)\\}`);
  return pattern.exec(style)?.[1] ?? '';
}

describe('the completed-items section', () => {
  it('is styled by the editor for every class it is built with', () => {
    // given
    const style = styleBlockOf(readComponent('RichText'), 'RichText.svelte');

    // when / then
    for (const name of COMPLETED_SECTION_STYLED) {
      expect(ruleFor(style, `.${name}`), `no rule for .${name} in RichText.svelte`).not.toBe('');
    }
  });

  it('hides the folded rows with a selector the decoration can actually match', () => {
    // given
    const style = styleBlockOf(readComponent('RichText'), 'RichText.svelte');
    const selector = `li.${COMPLETED_SECTION.hidden}`;

    // when
    const rule = ruleFor(style, selector);

    // then
    expect(rule, `no rule for ${selector} in RichText.svelte`).not.toBe('');
    expect(rule).toContain('display: none');
  });

  it('is styled by a card as well, where the same heading is drawn by a component', () => {
    // given
    const style = styleBlockOf(readComponent('NoteContent'), 'NoteContent.svelte');

    // when / then
    expect(
      ruleFor(style, `.${COMPLETED_SECTION.toggle}`),
      'the card does not style the toggle it renders'
    ).not.toBe('');
  });

  it('draws the chevron the icons module draws, at the size its box reserves', () => {
    // given
    const style = styleBlockOf(readComponent('RichText'), 'RichText.svelte');

    // when
    const open = completedChevron(true);
    const folded = completedChevron(false);

    // then
    expect(open).toContain(expandMore.body);
    expect(folded).toContain(chevronRight.body);
    expect(open).toContain(`width="${COMPLETED_CHEVRON_SIZE}"`);
    expect(open).toContain(`height="${COMPLETED_CHEVRON_SIZE}"`);
    expect(open).toContain(`viewBox="0 0 ${expandMore.width} ${expandMore.height}"`);
    expect(folded).not.toBe(open);
    expect(
      ruleFor(style, `.${COMPLETED_SECTION.chevron}`),
      'the chevron box no longer matches the size the decoration draws'
    ).toContain(`width: ${COMPLETED_CHEVRON_SIZE}px`);
  });
});
