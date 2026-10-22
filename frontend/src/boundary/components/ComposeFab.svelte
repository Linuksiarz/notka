<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import type { NoteKind } from '../../entity/api/types';
  import { IMAGE_TYPES } from '../../entity/imageLayout';
  import { ui } from '../../control/state/ui.svelte';
  import { ENTER_EASING, EXIT_EASING, MOTION } from '../editor/motion';
  import { t } from '../i18n';
  import type { IconName } from './Icon.svelte';
  import Icon from './Icon.svelte';

  interface Props {
    onCompose: (kind: NoteKind) => void;
  }

  let { onCompose }: Props = $props();

  /**
   * The original's phone has one button, and pressing it opens a menu of the kinds of note it can
   * start rather than starting one: the square "+" becomes a round "×" and the kinds rise above it
   * as pills. Its drawing and recording kinds are left out — Notka has neither (rule 8).
   */
  let open = $state(false);
  let imageInput = $state<HTMLInputElement | null>(null);

  interface Kind {
    key: 'fab.image' | 'fab.list' | 'fab.text';
    icon: IconName;
    start: () => void;
  }

  /** Top to bottom, the original's order. */
  const kinds: Kind[] = [
    { key: 'fab.image', icon: 'image', start: () => imageInput?.click() },
    { key: 'fab.list', icon: 'checklist-filled', start: () => onCompose('LIST') },
    { key: 'fab.text', icon: 'text', start: () => onCompose('TEXT') }
  ];

  const duration = (ms: number) => (ui.animationsAllowed ? ms : 0);
  /** How far a pill rises as it fades in: the app's `speed_dial_item_translation_y`. */
  const SPEED_DIAL_RISE = 16;

  function pick(kind: Kind): void {
    open = false;
    kind.start();
  }

  function onWindowKeyDown(event: KeyboardEvent): void {
    if (open && event.key === 'Escape') open = false;
  }
</script>

<svelte:window onkeydown={onWindowKeyDown} />

<input
  bind:this={imageInput}
  class="visually-hidden"
  type="file"
  multiple
  accept={IMAGE_TYPES}
  onchange={(event) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    if (files.length === 0) return;
    ui.pendingImages = files;
    onCompose('TEXT');
  }}
/>

{#if open}
  <button
    type="button"
    class="fab-scrim"
    aria-label={t('fab.close')}
    tabindex="-1"
    onclick={() => (open = false)}
    transition:fade={{ duration: duration(MOTION.medium) }}
  ></button>
{/if}

<div class="fab-slot">
  {#if open}
    <ul class="fab-menu">
      {#each kinds as kind, index (kind.key)}
        <!-- The pill nearest the button comes first, and the others follow it up: the Android app's
             speed dial rises 16dp and fades in over 200ms, each pill 35ms after the one below it, and
             fades out over 200ms (`speed_dial_*` in its resources, docs/METRICS.md). -->
        <li
          in:fly={{
            y: SPEED_DIAL_RISE,
            duration: duration(MOTION.medium),
            delay: duration((kinds.length - 1 - index) * MOTION.speedDialStagger),
            easing: ENTER_EASING
          }}
          out:fade={{ duration: duration(MOTION.medium), easing: EXIT_EASING }}
        >
          <button type="button" class="fab-kind" onclick={() => pick(kind)}>
            <Icon name={kind.icon} size={26} />
            <span>{t(kind.key)}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  <button
    type="button"
    class="fab"
    class:open
    title={open ? t('fab.close') : t('fab.open')}
    aria-label={open ? t('fab.close') : t('fab.open')}
    aria-expanded={open}
    onclick={() => (open = !open)}
  >
    <span class="glyph plus"><Icon name="plus" size={36} /></span>
    <span class="glyph cross"><Icon name="close" size={36} /></span>
  </button>
</div>

<style>
  .fab-slot,
  .fab-scrim {
    display: none;
  }

  /*
   * Measured off the original's Android app at 412px (2026-10-14/15): one button, 86px with a 20px
   * radius and a 36px "+", 17px from the right edge, in Material's primary container. Open, it is a
   * 60px circle sharing the square's top right corner, rgb(55,122,255) with a white "×"; the page
   * under it dims to 40% of itself, and the kinds stand above it as 59px pills 5px apart, the lowest
   * 9px over the circle, each a 26px glyph centred 38px in and its label 9px after it.
   */
  @media (max-width: 600px) {
    .fab-scrim {
      display: block;
      position: fixed;
      inset: 0;
      z-index: 39;
      background: var(--keep-fab-scrim);
    }

    .fab-slot {
      display: block;
      position: fixed;
      right: 17px;
      bottom: calc(24px + var(--keep-inset-bottom));
      z-index: 40;
      width: 86px;
      height: 86px;
    }

    .fab {
      position: absolute;
      top: 0;
      right: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 86px;
      height: 86px;
      border-radius: 20px;
      background: var(--keep-fab-container);
      color: var(--keep-fab-on-container);
      box-shadow: var(--keep-shadow-card-hover);
      transition:
        width var(--keep-duration-long) var(--keep-ease-standard),
        height var(--keep-duration-long) var(--keep-ease-standard),
        border-radius var(--keep-duration-long) var(--keep-ease-standard),
        background-color var(--keep-duration-long) var(--keep-ease-standard),
        color var(--keep-duration-long) var(--keep-ease-standard);
    }

    .fab.open {
      width: 60px;
      height: 60px;
      border-radius: 30px;
      background: var(--keep-fab-close);
      color: #ffffff;
    }

    /* The "+" turns into the "×": one rotates out as the other rotates in. */
    .glyph {
      position: absolute;
      display: inline-flex;
      transition:
        transform var(--keep-duration-long) var(--keep-ease-standard),
        opacity var(--keep-duration-long) var(--keep-ease-standard);
    }

    .cross {
      opacity: 0;
      transform: rotate(-90deg);
    }

    .fab.open .plus {
      opacity: 0;
      transform: rotate(90deg);
    }

    .fab.open .cross {
      opacity: 1;
      transform: rotate(0);
    }

    :global(:root[data-motion='reduced']) .fab,
    :global(:root[data-motion='reduced']) .glyph {
      transition: none;
    }

    .fab-menu {
      position: absolute;
      right: 0;
      bottom: calc(100% + 9px);
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 5px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .fab-kind {
      display: inline-flex;
      align-items: center;
      gap: 9px;
      height: 59px;
      padding: 0 26px 0 25px;
      border-radius: 30px;
      background: var(--keep-fab-container);
      color: var(--keep-fab-on-container);
      font-size: 1.125rem;
      white-space: nowrap;
      box-shadow: var(--keep-shadow-card-hover);
    }
  }
</style>
