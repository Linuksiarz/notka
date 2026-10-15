import { api } from './client';
import type {
  AccountsResponse,
  ServerSettings,
  Theme,
  UpdateServerSettingsRequest
} from '../../entity/api/types';

/** The server settings; every call answers 403 for anybody but the administrator. */
export const adminApi = {
  settings: () => api.get<ServerSettings>('/admin/settings'),
  updateSettings: (changes: UpdateServerSettingsRequest) => api.patch<ServerSettings>('/admin/settings', changes),
  accounts: () => api.get<AccountsResponse>('/admin/users'),
  removeAccount: (id: number) => api.delete<void>(`/admin/users/${id}`),
  resetPassword: (id: number) => api.post<void>(`/admin/users/${id}/password-reset`),
  /** The body is the theme's `.zip` as it was picked. */
  uploadTheme: (archive: Blob) => api.upload<Theme>('/admin/themes', archive),
  removeTheme: (id: string) => api.delete<void>(`/admin/themes/${encodeURIComponent(id)}`)
};
