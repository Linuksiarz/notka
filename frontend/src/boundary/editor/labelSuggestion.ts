import { Extension } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import { Suggestion } from '@tiptap/suggestion';
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';
import type { Label } from '../../entity/api/types';

/** What a `#` offers: an existing label of the reader's, or a new one by the name typed. */
export type LabelChoice = { kind: 'label'; label: Label } | { kind: 'create'; name: string };

/** The open list, as the editor draws it. */
export interface LabelSuggestionState {
  choices: LabelChoice[];
  active: number;
  /** Where the typed `#…` is on screen, so the list can stand under it. */
  rect: DOMRect | null;
  pick: (choice: LabelChoice) => void;
}

export interface LabelSuggestionOptions {
  /** The reader's labels, read whenever the list is drawn. */
  labels: () => Label[];
  /** The note takes the label (and a new one is created first). */
  onChoose: (choice: LabelChoice) => void;
  /** The list to draw, or `null` when there is none. */
  onChange: (state: LabelSuggestionState | null) => void;
}

/** How many labels the list shows at most, like the original's. */
const MAX_CHOICES = 6;

export const LABEL_SUGGESTION = new PluginKey('labelSuggestion');

/**
 * The original's `#` in a note: typing `#` and the start of a label's name offers the reader's
 * matching labels — and a new one by that name — and picking one gives the note that label and takes
 * the `#…` out of the text. Tiptap's own suggestion utility (`@tiptap/suggestion`, the one its mentions
 * are built on) owns the trigger, the query, the arrow keys, Enter and Escape; this only says what to
 * offer and what picking does.
 */
export const LabelSuggestion = Extension.create<LabelSuggestionOptions>({
  name: 'labelSuggestion',

  addOptions() {
    return { labels: () => [], onChoose: () => undefined, onChange: () => undefined };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    let state: LabelSuggestionState | null = null;
    let latest: SuggestionProps<LabelChoice, LabelChoice> | null = null;

    const show = (props: SuggestionProps<LabelChoice, LabelChoice>, active = 0): void => {
      latest = props;
      state =
        props.items.length === 0
          ? null
          : { choices: props.items, active, rect: props.clientRect?.() ?? null, pick: (choice) => props.command(choice) };
      options.onChange(state);
    };

    return [
      Suggestion<LabelChoice, LabelChoice>({
        editor: this.editor,
        pluginKey: LABEL_SUGGESTION,
        char: '#',
        items: ({ query }) => choicesFor(query, options.labels()),
        command: ({ editor, range, props }) => {
          editor.chain().focus().deleteRange(range).run();
          options.onChoose(props);
        },
        render: () => ({
          onStart: (props) => show(props),
          onUpdate: (props) => show(props),
          onExit: () => {
            latest = null;
            state = null;
            options.onChange(null);
          },
          onKeyDown: ({ event }: SuggestionKeyDownProps) => {
            const current = state;
            if (!current || !latest) return false;
            const count = current.choices.length;
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              show(latest, (current.active + (event.key === 'ArrowDown' ? 1 : count - 1)) % count);
              return true;
            }
            if (event.key === 'Enter' || event.key === 'Tab') {
              const choice = current.choices[current.active];
              if (choice) current.pick(choice);
              return true;
            }
            return false;
          }
        })
      })
    ];
  }
});

/**
 * The labels whose name contains what was typed after `#`, those starting with it first, and — when
 * something was typed and no label is called exactly that — a new label by that name.
 */
export function choicesFor(query: string, labels: readonly Label[]): LabelChoice[] {
  const typed = query.trim().toLocaleLowerCase();
  const matching = labels
    .filter((label) => label.name.toLocaleLowerCase().includes(typed))
    .sort((a, b) => {
      const aStarts = a.name.toLocaleLowerCase().startsWith(typed);
      const bStarts = b.name.toLocaleLowerCase().startsWith(typed);
      return aStarts === bStarts ? a.name.localeCompare(b.name) : aStarts ? -1 : 1;
    })
    .slice(0, MAX_CHOICES)
    .map((label): LabelChoice => ({ kind: 'label', label }));
  const exact = labels.some((label) => label.name.toLocaleLowerCase() === typed);
  return typed && !exact ? [...matching, { kind: 'create', name: query.trim() }] : matching;
}
