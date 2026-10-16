<script lang="ts">
  import type { Note } from '../../entity/api/types';
  import { ui } from '../../control/state/ui.svelte';
  import { formatReminder } from '../i18n/format';
  import Icon from './Icon.svelte';

  interface Props {
    note: Note;
    /** The card's chip is the compact one; the editor has the room the editable gives it. */
    compact?: boolean;
  }

  let { note, compact = false }: Props = $props();

  const label = $derived(
    note.reminderAt === undefined || note.reminderAt === null
      ? null
      : formatReminder(note.reminderAt, ui.locale)
  );
</script>

{#if label}
  <!-- Keep shows the reminder under the note's text, in the same pill it uses for labels: a clock and
       the moment. The repeat rule is not repeated here — it is a property of the reminder, and the
       picker is where it is read. -->
  <span class="reminder" class:compact title={label}>
    <Icon name="schedule" size={compact ? 14 : 16} />
    <span>{label}</span>
  </span>
{/if}

<style>
  .reminder {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    align-self: flex-start;
    max-width: 100%;
    margin-top: 6px;
    padding: 4px 10px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--note-fg, var(--keep-text)) 9%, transparent);
    color: var(--note-fg, var(--keep-text));
    font-size: 0.75rem;
    line-height: 1rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .reminder.compact {
    margin-top: 4px;
    padding: 3px 8px;
  }
</style>
