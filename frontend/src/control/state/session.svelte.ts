import { authApi } from '../api/auth';
import { ApiError, onUnauthorized } from '../api/client';
import { localStore } from '../api/localStore';
import { PENDING_WRITES_KEY } from './pendingWrites.svelte';
import type { LoginRequest, RegisterRequest, UpdateProfileRequest, User } from '../../entity/api/types';

type SessionStatus = 'loading' | 'anonymous' | 'authenticated';

const USER_KEY = 'user';

class SessionState {
  user = $state<User | null>(null);
  status = $state<SessionStatus>('loading');

  constructor() {
    // An expired session is not a sign-out: what was typed and not sent yet waits for the same
    // account to sign in again.
    onUnauthorized(() => this.clear(PENDING_WRITES_KEY));
  }

  get isAuthenticated(): boolean {
    return this.status === 'authenticated' && this.user !== null;
  }

  async restore(): Promise<void> {
    // The account this device last saw opens at once; the server confirms it behind the scenes, and
    // an expired session ends in the sign-in screen the way it does anywhere else.
    const known = await localStore.get<User>(USER_KEY);
    if (known) {
      this.user = known;
      this.status = 'authenticated';
      void this.confirm().catch(() => undefined);
      return;
    }
    await this.confirm();
  }

  private async confirm(): Promise<void> {
    try {
      const { user } = await authApi.me();
      await this.signedIn(user);
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      // Not knowing who is signed in is not being signed out: without a connection the account this
      // device last saw opens with what it last saw.
      if (error.transient && this.user) return;
      this.clear(PENDING_WRITES_KEY);
    }
  }

  /** Remembers the account on this device — after wiping another account's copy, if there was one. */
  private async signedIn(user: User): Promise<void> {
    const known = await localStore.get<User>(USER_KEY);
    // Another account's copy — its notes and its unsent writes — is not this account's business.
    if (known && known.id !== user.id) await localStore.clear();
    await localStore.set(USER_KEY, user);
    this.user = user;
    this.status = 'authenticated';
  }

  async login(credentials: LoginRequest): Promise<void> {
    const { user } = await authApi.login(credentials);
    await this.signedIn(user);
  }

  async completePasswordReset(token: string, password: string): Promise<void> {
    const { user } = await authApi.completePasswordReset({ token, password });
    await this.signedIn(user);
  }

  async register(details: RegisterRequest): Promise<void> {
    const { user } = await authApi.register(details);
    await this.signedIn(user);
  }

  async logout(): Promise<void> {
    try {
      await authApi.logout();
    } finally {
      this.clear();
    }
  }

  /** Ends every session of the account, this one included. */
  async logoutEverywhere(): Promise<void> {
    try {
      await authApi.logoutEverywhere();
    } finally {
      this.clear();
    }
  }

  async updateProfile(changes: UpdateProfileRequest): Promise<void> {
    this.updated((await authApi.updateProfile(changes)).user);
  }

  /** [picture] is the cropped avatar, encoded as JPEG XL by the page (`boundary/jpegXl.ts`). */
  async setAvatar(picture: Blob): Promise<void> {
    this.updated((await authApi.setAvatar(picture)).user);
  }

  async removeAvatar(): Promise<void> {
    this.updated((await authApi.removeAvatar()).user);
  }

  private updated(user: User): void {
    void localStore.set(USER_KEY, user);
    this.user = user;
  }

  /** Signed out: this device keeps nothing of the account but what [keep] names. */
  clear(...keep: string[]): void {
    this.user = null;
    this.status = 'anonymous';
    void localStore.clear(keep);
  }
}

export const session = new SessionState();
