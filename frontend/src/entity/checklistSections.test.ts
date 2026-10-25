import { describe, expect, it } from 'vitest';
import { CARD_LIST_ROWS, cardCompleted, checklistSections } from './checklistSections';

const row = (checked: boolean, depth = 0) => ({ checked, depth });

describe('checklistSections', () => {
  it('draws unticked rows first and ticked ones after them, each in its own order', () => {
    // given
    const rows = [row(false), row(true), row(false), row(true)];

    // when
    const sections = checklistSections(rows);

    // then
    expect(sections.active).toEqual([0, 2]);
    expect(sections.completed).toEqual([
      { ghost: null, rows: [1] },
      { ghost: null, rows: [3] }
    ]);
    expect(sections.completedCount).toBe(2);
  });

  it('draws a ticked child under a greyed copy of its unticked parent, and leaves the parent active', () => {
    // given: Chleb, with Mleko under it ticked — the Android app's own example
    const rows = [row(false), row(true, 1), row(false)];

    // when
    const sections = checklistSections(rows);

    // then
    expect(sections.active).toEqual([0, 2]);
    expect(sections.completed).toEqual([{ ghost: 0, rows: [1] }]);
    expect(sections.completedCount).toBe(1);
  });

  it('keeps a parent’s unticked children with it in the active section', () => {
    // given
    const rows = [row(false), row(false, 1), row(true, 1), row(false, 1)];

    // when
    const sections = checklistSections(rows);

    // then
    expect(sections.active).toEqual([0, 1, 3]);
    expect(sections.completed).toEqual([{ ghost: 0, rows: [2] }]);
  });

  it('moves a ticked parent with everything under it, and draws no greyed copy', () => {
    // given
    const rows = [row(true), row(true, 1), row(false)];

    // when
    const sections = checklistSections(rows);

    // then
    expect(sections.active).toEqual([2]);
    expect(sections.completed).toEqual([{ ghost: null, rows: [0, 1] }]);
    expect(sections.completedCount).toBe(2);
  });

  it('draws nested rows that have no parent above them on their own', () => {
    // given
    const rows = [row(true, 1), row(false, 1), row(false)];

    // when
    const sections = checklistSections(rows);

    // then
    expect(sections.active).toEqual([1, 2]);
    expect(sections.completed).toEqual([{ ghost: null, rows: [0] }]);
  });

  it('has nothing to draw for an empty list', () => {
    // given / when
    const sections = checklistSections([]);

    // then
    expect(sections).toEqual({ active: [], completed: [], completedCount: 0 });
  });
});

describe('cardCompleted', () => {
  it('draws the completed rows that fit in the card’s ten, then marks the rest as cut', () => {
    // given: three active rows and twelve ticked ones, as measured on the original
    const sections = checklistSections([...Array(3).fill(row(false)), ...Array(12).fill(row(true))]);

    // when
    const card = cardCompleted(sections);

    // then
    expect(card.groups.flatMap((group) => group.rows)).toHaveLength(CARD_LIST_ROWS - 3);
    expect(card.truncated).toBe(true);
    expect(card.full).toBe(false);
  });

  it('draws every completed row when they fit', () => {
    // given
    const sections = checklistSections([row(false), row(true), row(true)]);

    // when
    const card = cardCompleted(sections);

    // then
    expect(card.groups).toEqual([
      { ghost: null, rows: [1] },
      { ghost: null, rows: [2] }
    ]);
    expect(card.truncated).toBe(false);
  });

  it('leaves no room for completed rows once the active ones fill the card', () => {
    // given
    const sections = checklistSections([...Array(CARD_LIST_ROWS).fill(row(false)), row(true)]);

    // when
    const card = cardCompleted(sections);

    // then
    expect(card).toEqual({ groups: [], truncated: false, full: true });
  });

  it('counts a greyed parent as a row, and never draws one without a row under it', () => {
    // given: eight active rows, then a parent whose two ticked children are completed
    const sections = checklistSections([...Array(7).fill(row(false)), row(false), row(true, 1), row(true, 1)]);

    // when
    const card = cardCompleted(sections, 9);

    // then: room for one row only, which the parent would take alone
    expect(card.groups).toEqual([]);
    expect(card.truncated).toBe(true);
  });
});
