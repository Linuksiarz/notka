import { api } from './client';
import type {
  ChangePassphraseRequest,
  EnableEncryptionRequest,
  EncryptionEnabledResponse,
  LoginRequest,
  PasswordResetRequest,
  RecoverEncryptionRequest,
  RegisterRequest,
  SsoExchangeResponse,
  SsoStartResponse,
  UpdateProfileRequest,
  UserResponse
} from '../../entity/api/types';

export const authApi = {
  register: (body: RegisterRequest) => api.post<UserResponse>('/auth/register', body),
  login: (body: LoginRequest) => api.post<UserResponse>('/auth/login', body),
  logout: () => api.post<void>('/auth/logout'),
  logoutEverywhere: () => api.post<void>('/auth/logout-all'),
  /** Answers like a sign-in: the reset link's owner is signed in with the new password. */
  completePasswordReset: (body: PasswordResetRequest) => api.post<UserResponse>('/auth/password-reset', body),
  me: () => api.get<UserResponse>('/auth/me'),
  updateProfile: (body: UpdateProfileRequest) => api.patch<UserResponse>('/auth/me', body),
  /** [picture] is already JPEG XL: the server stores it as it is and converts nothing. */
  setAvatar: (picture: Blob) => api.replace<UserResponse>('/auth/me/avatar', picture),
  removeAvatar: () => api.delete<UserResponse>('/auth/me/avatar'),
  /** Answers with the recovery key, the one time it is ever sent. */
  enableEncryption: (body: EnableEncryptionRequest) =>
    api.post<EncryptionEnabledResponse>('/auth/me/encryption', body),
  disableEncryption: () => api.delete<UserResponse>('/auth/me/encryption'),
  /** This device enters the account's passphrase, or its password when it has one. */
  unlockEncryption: (secret: string) => api.post<UserResponse>('/auth/me/encryption/unlock', { secret }),
  recoverEncryption: (body: RecoverEncryptionRequest) => api.post<UserResponse>('/auth/me/encryption/recover', body),
  discardEncryption: () => api.post<UserResponse>('/auth/me/encryption/discard'),
  changePassphrase: (body: ChangePassphraseRequest) => api.post<UserResponse>('/auth/me/encryption/passphrase', body),
  /** Answers with the provider's page to send the browser to. */
  startSso: (link: boolean, appChallenge?: string) => api.post<SsoStartResponse>('/auth/sso/start', { link, appChallenge }),
  /** Android's app, back from the Custom Tab: trades the code it was sent for the session. */
  exchangeSso: (code: string, verifier: string) => api.post<SsoExchangeResponse>('/auth/sso/exchange', { code, verifier }),
  unlinkSso: () => api.delete<UserResponse>('/auth/me/sso')
};
/** Where an account's picture is; the `v` is its `avatarAt`, so a new picture is a new address. */
export function avatarUrl(userId: number, avatarAt: number): string {
  return `/api/users/${userId}/avatar?v=${avatarAt}`;
}
