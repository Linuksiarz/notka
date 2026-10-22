<script lang="ts">
  import { accountName } from '../../entity/account';
  import type { User } from '../../entity/api/types';

  interface Props {
    user: Pick<User, 'id' | 'displayName' | 'email'>;
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

  function computeInitials(value: string): string {
    const parts = value.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return (parts[0] ?? '').slice(0, 2).toUpperCase();
    return `${parts[0]?.[0] ?? ''}${parts[parts.length - 1]?.[0] ?? ''}`.toUpperCase();
  }
</script>

<span
  class="avatar"
  style="--avatar-bg: {background}"
  title={title ?? `${user.displayName} (${accountName(user)})`}
  aria-hidden="true">{initials}</span
>

<style>
  .avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    /* The size is the caller's token (`--avatar-size`), so it is a dp the platform scales, never a number here. */
    width: var(--avatar-size, var(--keep-avatar-account));
    height: var(--avatar-size, var(--keep-avatar-account));
    border-radius: 50%;
    background: var(--avatar-bg);
    color: #fff;
    /* The initials are part of the circle, so they scale with it rather than with the reader's text size. */
    font-size: calc(var(--avatar-size, var(--keep-avatar-account)) * 0.42);
    font-weight: 500;
    letter-spacing: 0.4px;
    flex: 0 0 auto;
    user-select: none;
  }
</style>
