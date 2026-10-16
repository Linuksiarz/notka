/**
 * How a checklist is shown: what is left to do, then what is done — the original's own model.
 *
 * The note keeps its rows in their logical order: a nested row stays under its parent whether it is
 * ticked or not, because "sits under the row above" is the only link a flat row has to its parent
 * (`docs/DATA-MODEL.md`). The two sections are a way of *drawing* that order, the way Google Keep's own
 * data has no "checked items" section either, only items with a parent and a checked flag:
 *
 * - a top-level row and the rows nested under it are one **group**;
 * - a group whose top row is ticked is done as a whole and is drawn in the completed section;
 * - otherwise the top row and its unticked rows are drawn in the active section, and its ticked rows
 *   in the completed section **under a greyed copy of their parent** (measured on the Android app:
 *   ticking "Mleko" under "Chleb" leaves "Chleb" where it was and draws it again, greyed and unticked,
 *   above "Mleko" in "Checked items" — and the greyed copy is not counted);
 * - rows nested before any top-level row have no parent to show and are drawn on their own.
 *
 * Unticking a row puts it back where it always was, since it never left.
 */
export interface ChecklistRowShape {
  checked: boolean;
  depth: number;
}

export interface CompletedGroup {
  /** The parent drawn greyed above these rows, by its index — `null` when it is not drawn. */
  ghost: number | null;
  /** The rows of the group drawn in the completed section, by index, in their own order. */
  rows: number[];
}

export interface ChecklistSections {
  /** The rows drawn in the active section, by index, in their own order. */
  active: number[];
  completed: CompletedGroup[];
  /** How many rows the completed section holds — the greyed parents are not rows of it. */
  completedCount: number;
}

export function checklistSections(rows: readonly ChecklistRowShape[]): ChecklistSections {
  const active: number[] = [];
  const completed: CompletedGroup[] = [];

  let index = 0;
  while (index < rows.length) {
    const top = rows[index];
    const parent = top && top.depth === 0 ? index : null;
    const start = parent === null ? index : index + 1;
    let end = start;
    while (end < rows.length && (rows[end]?.depth ?? 0) > 0) end += 1;
    const children = Array.from({ length: end - start }, (_, offset) => start + offset);

    if (parent !== null && rows[parent]?.checked) {
      completed.push({ ghost: null, rows: [parent, ...children] });
    } else {
      if (parent !== null) active.push(parent);
      const ticked: number[] = [];
      for (const child of children) {
        if (rows[child]?.checked) ticked.push(child);
        else active.push(child);
      }
      if (ticked.length > 0) completed.push({ ghost: parent, rows: ticked });
    }
    index = Math.max(end, index + 1);
  }

  const completedCount = completed.reduce((sum, group) => sum + group.rows.length, 0);
  return { active, completed, completedCount };
}
