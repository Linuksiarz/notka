<script lang="ts">
  import type { Label } from '../../entity/api/types';
  import { t } from '../i18n';
  import Icon from './Icon.svelte';

  interface Props {
    labels: Label[];
    selectedIds: number[];
    onToggle: (label: Label) => void;
    onCreate: (name: string) => void;
  }

  let { labels, selectedIds, onToggle, onCreate }: Props = $props();

  let query = $state('');

  const filtered = $derived(
    query.trim()
      ? labels.filter((label) => label.name.toLowerCase().includes(query.trim().toLowerCase()))
      : labels
  );

  const trimmed = $derived(query.trim());
  const canCreate = $derived(
    trimmed.length > 0 &&
      !labels.some((label) => label.name.toLowerCase() === trimmed.toLowerCase())
  );

  function submit(): void {
    if (!canCreate) return;
    onCreate(trimmed);
    query = '';
  }
</script>

<div class="label-picker">
  <div class="search">
    <input
      type="text"
      placeholder={t('labels.searchPlaceholder')}
      aria-label={t('labels.searchPlaceholder')}
      bind:value={query}
      onkeydown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          if (canCreate) submit();
        }
      }}
    />
    <button
      type="button"
      class="icon-button"
      aria-label={t('labels.createLabel')}
      title={t('labels.createLabel')}
      disabled={!canCreate}
      onclick={submit}
    >
      <Icon name="check" size={20} />
    </button>
  </div>

  <ul class="list">
    {#each filtered as label (label.id)}
      {@const selected = selectedIds.includes(label.id)}
      <li>
        <button type="button" class="row" onclick={() => onToggle(label)}>
          <span class="check" class:on={selected}>
            {#if selected}<Icon name="check" size={16} />{/if}
          </span>
          <span class="name">{label.name}</span>
        </button>
      </li>
    {:else}
      <li class="empty">{trimmed ? t('labels.noMatch') : t('labels.none')}</li>
    {/each}
  </ul>

  {#if canCreate}
    <button type="button" class="create" onclick={submit}>
      <Icon name="plus" size={18} />
      <span>{t('labels.createNamed', { name: trimmed })}</span>
    </button>
  {/if}
</div>

<style>
  .label-picker {
    width: 264px;
    max-height: 360px;
    display: flex;
    flex-direction: column;
    padding: 8px 0;
    border-radius: var(--keep-radius);
    background: var(--keep-surface);
    color: var(--keep-text);
    box-shadow: var(--keep-shadow-popover);
  }

  .search {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 8px 8px 16px;
    border-bottom: 1px solid var(--keep-divider);
  }

  .search input {
    flex: 1 1 auto;
    min-width: 0;
    border: 0;
    outline: none;
    background: transparent;
    padding: 8px 0;
  }

  .list {
    margin: 0;
    padding: 4px 0;
    list-style: none;
    overflow-y: auto;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 8px 16px;
    text-align: left;
  }

  .row:hover {
    background: var(--keep-hover);
  }

  .check {
    width: 18px;
    height: 18px;
    flex: 0 0 auto;
    border: 2px solid var(--keep-text-secondary);
    border-radius: 2px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--keep-text);
  }

  .name {
    flex: 1 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .empty {
    padding: 8px 16px;
    color: var(--keep-text-secondary);
  }

  .create {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    border-top: 1px solid var(--keep-divider);
    text-align: left;
  }

  .create:hover {
    background: var(--keep-hover);
  }
</style>
