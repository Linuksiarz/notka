import type { User } from './api/types';

/** How an account is named where its address would stand: the address, or the administrator's username. */
export function accountName(user: Pick<User, 'email'> & Partial<Pick<User, 'username'>>): string {
  return user.email ?? user.username ?? '';
}

/** The other people a note is shared with — the owner included, the reader left out — the same for a card and the editor. */
export function otherPeople(
  note: { owner: User; shares?: { user: User }[] | null },
  readerId: number | undefined
): User[] {
  return [note.owner, ...(note.shares ?? []).map((share) => share.user)].filter((person) => person.id !== readerId);
}
