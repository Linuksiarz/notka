<script lang="ts">
  import { avatarUrl } from '../../control/api/auth';
  import { accountName } from '../../entity/account';
  import type { User } from '../../entity/api/types';

  interface Props {
    user: Pick<User, 'id' | 'displayName' | 'email'> & Partial<Pick<User, 'avatarAt'>>;
    title?: string;
  }

  let { user, title }: Props = $props();

  const AVATAR_COLORS = [
    '#1a73e8',
    '#188038',
    '#d93025',
    '#e37400',
    '#9334e6',
    '#007b83',
    '#c5221f',
    '#3f51b5'
  ];

  const initials = $derived(computeInitials(user.displayName || accountName(user)));
  const background = $derived(AVATAR_COLORS[user.id % AVATAR_COLORS.length] ?? AVATAR_COLORS[0]);

  /**
   * The account's own picture, a JPEG XL the browser draws itself. A browser that cannot — or a
   * picture that cannot be fetched, offline say — shows the initials instead.
   */
  const picture = $derived(user.avatarAt == null ? null : avatarUrl(user.id, user.avatarAt));
  let failed = $state<string | null>(null);
  const shown = $derived(picture !== null && failed !== picture ? picture : null);

  function computeInitials(value: string): string {
    const parts = value.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return (parts[0] ?? '').slice(0, 2).toUpperCase();
    return `${parts[0]?.[0] ?? ''}${parts[parts.length - 1]?.[0] ?? ''}`.toUpperCase();
  }
</script>

<span
  class="avatar"
  class:picture={shown !== null}
  style="--avatar-bg: {background}"
  title={title ?? `${user.displayName} (${accountName(user)})`}
  aria-hidden="true"
  >{#if shown}<img src={shown} alt="" draggable="false" onerror={() => (failed = shown)} />{:else}{initials}{/if}</span
>

<style>
  .avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    /* The size is the caller's token (`--avatar-size`), so it is a dp the platform scales, never a number here. */
    width: var(--avatar-size, var(--keep-avatar-account));
    height: var(--avatar-size, var(--keep-avatar-account));
    box-sizing: border-box;
    border-radius: 50%;
    /* A ring is the caller's (`--avatar-ring`, `--avatar-ring-shadow`): it lies inside the circle's
       size, as the original's border-box ring does, so a ringed avatar takes no more room. */
    border: var(--avatar-ring, 0px) solid var(--keep-avatar-ring-color);
    box-shadow: var(--avatar-ring-shadow, none);
    background: var(--avatar-bg);
    color: #fff;
    /* The initials are part of the circle, so they scale with it rather than with the reader's text size. */
    font-size: calc(var(--avatar-size, var(--keep-avatar-account)) * 0.42);
    font-weight: 500;
    letter-spacing: 0.4px;
    flex: 0 0 auto;
    overflow: hidden;
    user-select: none;
  }

  .avatar.picture {
    background: var(--keep-avatar-ring-color);
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
</style>
