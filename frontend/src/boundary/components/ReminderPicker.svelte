<script lang="ts">
  import { untrack } from 'svelte';
  import type { ReminderRepeat } from '../../entity/api/types';
  import { t } from '../i18n';

  /**
   * The reminder panel's body — title, date, time, repeat, Save — shared by the editor's bell and the
   * card's. It holds a working copy: nothing is written until Save, so a reminder can be picked over
   * and abandoned the way the original's own panel allows. Rendered inside a popover, so it is
   * created afresh each time the panel opens and starts from the note's current reminder.
   */
  interface Props {
    reminderAt?: number | null;
    reminderRepeat?: ReminderRepeat | null;
    onSave: (at: number, repeat: ReminderRepeat | null) => void;
    onClear: () => void;
  }

  let { reminderAt = null, reminderRepeat = null, onSave, onClear }: Props = $props();

  /** Tomorrow at 8:00 AM — the original's own suggestion, and what its chip reads first. */
  function suggestedMoment(): number {
    const next = new Date();
    next.setDate(next.getDate() + 1);
    next.setHours(8, 0, 0, 0);
    return next.getTime();
  }

  const pad = (value: number) => String(value).padStart(2, '0');
  // Read once, on purpose: the panel is a working copy of the reminder it was opened on.
  const start = new Date(untrack(() => reminderAt) ?? suggestedMoment());

  let pickDate = $state(`${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`);
  let pickTime = $state(`${pad(start.getHours())}:${pad(start.getMinutes())}`);
  let pickRepeat = $state<ReminderRepeat | 'none'>(untrack(() => reminderRepeat) ?? 'none');

  /** The moment the picker is showing, in the reader's own time zone. */
  function pickedMoment(): number | null {
    if (!pickDate || !pickTime) return null;
    const [year = NaN, month = NaN, day = NaN] = pickDate.split('-').map(Number);
    const [hour = NaN, minute = NaN] = pickTime.split(':').map(Number);
    if ([year, month, day, hour, minute].some(Number.isNaN)) return null;
    return new Date(year, month - 1, day, hour, minute, 0, 0).getTime();
  }

  function save(): void {
    const moment = pickedMoment();
    if (moment === null) return;
    onSave(moment, pickRepeat === 'none' ? null : pickRepeat);
  }
</script>

<h2 class="reminder-title">{t('reminder.pick')}</h2>
<label class="reminder-row">
  <span>{t('reminder.date')}</span>
  <input type="date" bind:value={pickDate} />
</label>
<label class="reminder-row">
  <span>{t('reminder.time')}</span>
  <input type="time" bind:value={pickTime} />
</label>
<label class="reminder-row">
  <span>{t('reminder.repeat')}</span>
  <select bind:value={pickRepeat}>
    <option value="none">{t('reminder.repeatNone')}</option>
    <option value="daily">{t('reminder.repeatDaily')}</option>
    <option value="weekly">{t('reminder.repeatWeekly')}</option>
    <option value="monthly">{t('reminder.repeatMonthly')}</option>
    <option value="yearly">{t('reminder.repeatYearly')}</option>
  </select>
</label>
<footer class="reminder-actions">
  {#if reminderAt != null}
    <button type="button" class="reminder-delete" onclick={onClear}>
      {t('reminder.clear')}
    </button>
  {/if}
  <button type="button" class="reminder-save" onclick={save}>
    {t('reminder.save')}
  </button>
</footer>

<style>
  /* The reminder picker, measured off the original's own panel: the title's rule sits 32px under its
     top, its rows are 56px tall, and Save is the accent's own button at the bottom right. */
  :global(.reminder-picker) {
    display: flex;
    flex-direction: column;
    min-width: 300px;
    padding: 0 0 8px;
    border: 1px solid var(--keep-border);
    border-radius: var(--keep-radius);
    background: var(--keep-surface);
    box-shadow: var(--keep-shadow-card);
  }

  :global(.reminder-title) {
    margin: 0;
    padding: 14px 20px 12px;
    border-bottom: 1px solid var(--keep-border);
    font-size: 1rem;
    font-weight: 400;
  }

  :global(.reminder-row) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    height: 56px;
    padding: 0 20px;
    border-bottom: 1px solid var(--keep-border);
    font-size: 0.875rem;
    color: var(--keep-text);
    cursor: pointer;
  }

  :global(.reminder-row input),
  :global(.reminder-row select) {
    min-width: 150px;
    padding: 6px 8px;
    border: 1px solid var(--keep-border);
    border-radius: 4px;
    background: var(--keep-surface);
    color: var(--keep-text);
    font: inherit;
    font-size: 0.875rem;
  }

  :global(.reminder-actions) {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    padding: 8px 12px 0;
  }

  :global(.reminder-save) {
    padding: 8px 16px;
    border-radius: 4px;
    color: var(--keep-accent);
    font-weight: 500;
    font-size: 0.875rem;
  }

  :global(.reminder-save:hover) {
    background: var(--keep-hover);
  }

  :global(.reminder-delete) {
    margin-right: auto;
    padding: 8px 12px;
    border-radius: 4px;
    color: var(--keep-text-secondary);
    font-size: 0.875rem;
  }

  :global(.reminder-delete:hover) {
    background: var(--keep-hover);
  }
</style>
