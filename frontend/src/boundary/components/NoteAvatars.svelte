<script lang="ts">
  import type { User } from '../../entity/api/types';
  import Avatar from './Avatar.svelte';

  interface Props {
    people: User[];
    /** A card's circles or the editor's: their sizes and spacing are tokens (docs/METRICS.md, "Collaborators"). */
    place: 'card' | 'editor';
    /** How many circles a card draws before the "+N" one; the editor draws everyone. */
    limit?: number;
  }

  let { people, place, limit = Infinity }: Props = $props();

  const shown = $derived(people.slice(0, limit));
  const hidden = $derived(people.length - shown.length);
</script>

<!-- The place is an attribute, not a class: `.card` and `.editor` are the note card's and the editor's
     own classes, and a row of avatars wearing them was taken for one (the screenshots picked it as a card). -->
<span class="note-avatars" data-place={place}>
  {#each shown as person (person.id)}
    <Avatar user={person} />
  {/each}
  {#if hidden > 0}<span class="more">+{hidden}</span>{/if}
</span>

<style>
  /* Spacing and the overflow circle are the Android app's own (docs/METRICS.md, "Collaborators"). */
  .note-avatars {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--note-avatar-gap);
    min-width: 0;
  }

  .note-avatars {
    --avatar-ring: var(--keep-avatar-collaborator-ring);
    --avatar-ring-shadow: var(--keep-avatar-collaborator-shadow);
  }

  [data-place='card'] {
    --avatar-size: var(--keep-avatar-card);
    --note-avatar-gap: var(--keep-avatar-card-gap);
  }

  [data-place='editor'] {
    --avatar-size: var(--keep-avatar-editor);
    --note-avatar-gap: var(--keep-avatar-editor-gap);
  }

  .more {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--avatar-size);
    height: var(--avatar-size);
    border-radius: 50%;
    background: var(--keep-avatar-overflow-bg);
    color: var(--keep-surface);
    font-size: 0.6875rem;
    font-weight: 500;
  }
</style>
