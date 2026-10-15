import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/**
 * What a drag draws.
 *
 * Measured off the owner's own screenshots of the original (`keep-drag-2-grab.webp`,
 * `keep-drag-3-move.webp`): the carried row is **not** lifted out of the list, not copied and not
 * replaced by a hole. It stays a row of the list, the rows around it make room for it, and it is
 * marked with one opaque, neutral, full-width band — `rgb(31,33,37)` from the note's left edge to its
 * right, with the row's handle, checkbox, text and ✕ **on** it in light ink `rgb(239,241,245)`.
 *
 * The band is the carried row's own box, a whole row tall: the original's band around a three-line
 * row measures 84px, which is exactly that row's own height and not a pixel of its neighbours'
 * (measured in `docs/METRICS.md`).
 *
 * Two things are drawn, and both are positions rather than content, so nothing about them touches the
 * document — which is what makes a drag one undo step and an abandoned drag no step at all:
 *
 * - the **carried row** follows the hand (`transform`), keeping its own box, and is drawn at the
 *   level it will land at;
 * - the rows **making room** slide out of the way in whole rows, animated by the stylesheet.
 *
 * It lives in editor state rather than in the component because ProseMirror owns the rows'
 * attributes and drops anything it did not write — a style written onto the DOM by hand is gone the
 * next time a node is rendered.
 */
export const DRAGGING_ROW = 'draggingRow';

export interface DragGeometry {
  /** Document position of the carried row. */
  row: number;
  /** Where the carried row is drawn, in px below the place it holds in the list. */
  carriedShift: number;
  /** How far its content is drawn out of its own indent, in px: the level it will land at. */
  carriedIndent: number;
  /** The rows giving way, and by how much. */
  shifts: Array<{ pos: number; by: number }>;
}

interface DragState {
  geometry: DragGeometry | null;
}

const draggingRowKey = new PluginKey<DragState>('draggingRow');

/** The transform a row is drawn at, as an inline style: its level, then its place. */
function shift(across: number, down: number): string {
  return `transform: translate(${Math.round(across)}px, ${Math.round(down)}px)`;
}

export const DraggingRow = Extension.create({
  name: 'draggingRow',

  addProseMirrorPlugins() {
    return [
      new Plugin<DragState>({
        key: draggingRowKey,
        state: {
          init: () => ({ geometry: null }),
          apply: (transaction, value) => {
            const geometry = transaction.getMeta(DRAGGING_ROW) as DragGeometry | null | undefined;
            if (geometry === undefined) return value;
            return { geometry };
          }
        },
        props: {
          decorations: (state) => {
            const geometry = draggingRowKey.getState(state)?.geometry;
            if (!geometry) return DecorationSet.empty;

            const decorations: Decoration[] = [];
            const carried = state.doc.nodeAt(geometry.row);
            if (carried?.type.name === 'taskItem') {
              decorations.push(
                Decoration.node(geometry.row, geometry.row + carried.nodeSize, {
                  class: 'dragging-row',
                  // The left reach is written **negative**: a box-shadow's first length is an offset,
                  // and a positive one would paint the band to the right of the row instead of
                  // carrying it out to the note's left edge.
                  style: `${shift(geometry.carriedIndent, geometry.carriedShift)}`
                })
              );
            }

            for (const move of geometry.shifts) {
              const node = state.doc.nodeAt(move.pos);
              if (!node) continue;
              decorations.push(
                Decoration.node(move.pos, move.pos + node.nodeSize, {
                  class: 'drag-shift',
                  style: shift(0, move.by)
                })
              );
            }

            return DecorationSet.create(state.doc, decorations);
          }
        }
      })
    ];
  }
});
