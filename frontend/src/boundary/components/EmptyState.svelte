<script lang="ts">
  import type { IconName } from './Icon.svelte';
  import Icon from './Icon.svelte';

  interface Props {
    icon: IconName;
    title: string;
    description?: string;
    /** The illustration's size; the original's bell is 80px, its other empty states 64px. */
    size?: number;
  }

  let { icon, title, description, size = 64 }: Props = $props();
</script>

<div class="empty">
  <Icon name={icon} size={size} />
  <h2>{title}</h2>
  {#if description}
    <p>{description}</p>
  {/if}
</div>

<style>
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 64px 24px;
    color: var(--keep-text-secondary);
    text-align: center;
  }

  h2 {
    margin: 8px 0 0;
    font-size: 1.375rem;
    font-weight: 400;
  }

  p {
    margin: 0;
    max-width: 420px;
    font-size: 0.875rem;
  }
</style>
