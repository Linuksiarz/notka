import { authApi } from '../api/auth';
import { ApiError, onUnauthorized } from '../api/client';
import { localStore } from '../api/localStore';
import { PENDING_WRITES_KEY } from './pendingWrites.svelte';
import type { Account, EnableEncryptionRequest, LoginRequest, PasswordResetRequest, RegisterRequest, UpdateProfileRequest } from '../../entity/api/types';

/** `locked`: signed in through the identity provider, and this device has not opened the notes yet. */
type SessionStatus = 'loading' | 'anonymous' | 'locked' | 'authenticated';

const USER_KEY = 'user';
/** The secret behind a sign-in Android's app has under way. In storage: the system may end the app while the provider's page is open. */
const APP_SSO_VERIFIER_KEY = 'notka.ssoVerifier';

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function statusOf(user: Account): SessionStatus {
  return user.encryptionLocked ? 'locked' : 'authenticated';
}

class SessionState {
  user = $state<Account | null>(null);
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
    const known = await localStore.get<Account>(USER_KEY);
    if (known) {
      this.user = known;
      this.status = statusOf(known);
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
  private async signedIn(user: Account): Promise<void> {
    const known = await localStore.get<Account>(USER_KEY);
    // Another account's copy — its notes and its unsent writes — is not this account's business.
    if (known && known.id !== user.id) await localStore.clear();
    await localStore.set(USER_KEY, user);
    this.user = user;
    this.status = statusOf(user);
  }

  async login(credentials: LoginRequest): Promise<void> {
    const { user } = await authApi.login(credentials);
    await this.signedIn(user);
  }

  /** An account that encrypts its notes also needs its recovery key, or to say it gives them up. */
  async completePasswordReset(reset: PasswordResetRequest): Promise<void> {
    const { user } = await authApi.completePasswordReset(reset);
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

  /**
   * Turns encryption of the account's private notes on (`docs/ENCRYPTION.md`) and answers with the
   * recovery key, which the server never sends again. The account's other devices are signed out.
   */
  async enableEncryption(secret: EnableEncryptionRequest): Promise<string> {
    const { user, recoveryKey } = await authApi.enableEncryption(secret);
    this.updated(user);
    return recoveryKey;
  }

  async disableEncryption(): Promise<void> {
    this.updated((await authApi.disableEncryption()).user);
  }

  /** Opens the account's notes on this device (`docs/ENCRYPTION.md`, SSO). */
  async unlockEncryption(secret: string): Promise<void> {
    this.updated((await authApi.unlockEncryption(secret)).user);
  }

  async recoverEncryption(recoveryKey: string, newPassphrase?: string): Promise<void> {
    this.updated((await authApi.recoverEncryption({ recoveryKey, newPassphrase })).user);
  }

  /** Gives up the sealed notes for good: neither the passphrase nor the recovery key is left. */
  async discardEncryption(): Promise<void> {
    this.updated((await authApi.discardEncryption()).user);
  }

  async changePassphrase(currentPassphrase: string, newPassphrase: string): Promise<void> {
    this.updated((await authApi.changePassphrase({ currentPassphrase, newPassphrase })).user);
  }

  /**
   * Off to the identity provider, to sign in or — [link] — to connect this account. The server ends
   * the trip at `/`, with `?ssoError=` when it failed, and the page starts again from there.
   */
  async startSso(link = false): Promise<void> {
    window.location.assign((await authApi.startSso(link)).url);
  }

  /**
   * The same trip from Android's app: [open] shows the provider's page in a Custom Tab, and the answer
   * comes back to the app as `?ssoCode=`, which only this secret can redeem ([finishSsoInApp]).
   */
  async startSsoInApp(link: boolean, open: (url: string) => Promise<void>): Promise<void> {
    const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
    const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    const { url } = await authApi.startSso(link, challenge);
    localStorage.setItem(APP_SSO_VERIFIER_KEY, verifier);
    await open(url);
  }

  /** Whether the account was connected rather than signed in. */
  async finishSsoInApp(code: string): Promise<boolean> {
    const verifier = localStorage.getItem(APP_SSO_VERIFIER_KEY) ?? '';
    localStorage.removeItem(APP_SSO_VERIFIER_KEY);
    const { user, linked } = await authApi.exchangeSso(code, verifier);
    await this.signedIn(user);
    return linked;
  }

  async unlinkSso(): Promise<void> {
    this.updated((await authApi.unlinkSso()).user);
  }

  async setLinkPreviews(linkPreviews: boolean): Promise<void> {
    this.updated((await authApi.updateProfile({ linkPreviews })).user);
  }

  private updated(user: Account): void {
    void localStore.set(USER_KEY, user);
    this.user = user;
    this.status = statusOf(user);
  }

  /** Signed out: this device keeps nothing of the account but what [keep] names. */
  clear(...keep: string[]): void {
    this.user = null;
    this.status = 'anonymous';
    void localStore.clear(keep);
  }
}

export const session = new SessionState();
