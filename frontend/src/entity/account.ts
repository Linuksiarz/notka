import type { User } from './api/types';

/** How an account is named where its address would stand: the address, or the administrator's username. */
export function accountName(user: Pick<User, 'email'> & Partial<Pick<User, 'username'>>): string {
  return user.email ?? user.username ?? '';
}
