import { api } from './client';
import type {
  LoginRequest,
  PasswordResetRequest,
  RegisterRequest,
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
  updateProfile: (body: UpdateProfileRequest) => api.patch<UserResponse>('/auth/me', body)
};